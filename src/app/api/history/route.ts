import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

const isNetworkError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|network/i.test(message);
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (err) {
      lastError = err;
      if (!isNetworkError(err) || attempt === maxAttempts) throw err;
      const backoff = Math.min(500 * Math.pow(2, attempt - 1), 3000);
      console.warn(`[Retry] ${label} attempt ${attempt} failed. Retry in ${backoff}ms.`);
      await sleep(backoff);
    }
  }
  throw lastError;
}

const toCamel = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(toCamel);
  if (obj === null || typeof obj !== 'object') return obj;
  const n: any = {};
  Object.keys(obj).forEach((k) => {
    const ck = k.replace(/(_\w)/g, (m) => m[1].toUpperCase());
    n[ck] = obj[k]; // do NOT recurse into oldData/newData JSON payloads
  });
  return n;
};

export async function GET(request: Request) {
  try {
    if (!supabase) return NextResponse.json({ error: 'Supabase not initialized' }, { status: 500 });

    const url = new URL(request.url);
    const sp = url.searchParams;

    // Defense-in-depth role check (client AuthGuard is primary). Strict server-side session check is a follow-up.
    const role = sp.get('userRole');
    if (role && !['super_admin', 'ceo'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const table = sp.get('table');
    const recordId = sp.get('recordId');
    const userId = sp.get('userId');
    const from = sp.get('from');
    const to = sp.get('to');
    const limit = Math.min(parseInt(sp.get('limit') || '100', 10), 500);
    const offset = parseInt(sp.get('offset') || '0', 10);

    let query = supabase.from('record_history').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (table) query = query.eq('table_name', table);
    if (recordId) query = query.eq('record_id', recordId);
    if (userId) query = query.eq('user_id', userId);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await withRetry(async () => await query, 'select record_history');

    if (error) {
      if (/could not find the table|schema cache/i.test(error.message)) {
        return NextResponse.json({ rows: [], total: 0, missingTable: true });
      }
      console.error('record_history GET error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      rows: toCamel(data || []),
      total: count ?? (data?.length ?? 0),
      limit,
      offset,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('API /history GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}

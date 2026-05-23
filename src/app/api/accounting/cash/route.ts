import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const toCamel = (obj: unknown): unknown => {
  if (Array.isArray(obj)) return obj.map(toCamel);
  if (!isRecord(obj)) return obj;
  const next: Record<string, unknown> = {};
  Object.keys(obj).forEach((key) => {
    const camelKey = key.replace(/(_\w)/g, (match) => match[1].toUpperCase());
    next[camelKey] = toCamel(obj[key]);
  });
  return next;
};

const readString = (value: unknown, field: string) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} is required`);
  }
  return value.trim();
};

const validateTransaction = (value: unknown) => {
  if (!isRecord(value)) {
    throw new Error('transaction must be an object');
  }

  readString(value.id, 'transaction.id');
  readString(value.date, 'transaction.date');
  const type = readString(value.type, 'transaction.type');
  if (type !== 'In' && type !== 'Out') {
    throw new Error('transaction.type must be In or Out');
  }
  readString(value.bankAccountId ?? value.bank_account_id, 'transaction.bankAccountId');
  readString(value.category, 'transaction.category');
  readString(value.description, 'transaction.description');

  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('transaction.amount must be positive');
  }

  return value;
};

export async function POST(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase Admin not initialized' }, { status: 500 });
    }

    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const transaction = validateTransaction(body.transaction ?? body.tx ?? body);
    const { data, error } = await supabaseAdmin.rpc('post_cash_transaction', {
      p_transaction: transaction,
    });

    if (error) {
      console.error('[Accounting Cash API] post_cash_transaction failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(toCamel(data), {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to post cash transaction';
    console.error('[Accounting Cash API] POST error:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

// Draft rencana belanja Admin PO. Satu baris global — lihat
// supabase/migrations/20260804000001_shopping_draft.sql.
const DRAFT_ID = 'current';

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return String(error || '');
};

const isMissingTableError = (error: unknown) => /could not find the table/i.test(errorMessage(error));

export async function GET() {
  try {
    if (!supabase) return NextResponse.json({ error: 'Supabase not initialized' }, { status: 500 });

    const { data, error } = await supabase
      .from('shopping_draft')
      .select('data, updated_at, updated_by')
      .eq('id', DRAFT_ID)
      .maybeSingle();

    // Belum dimigrasi = belum ada draft tersimpan, bukan kegagalan: halaman
    // tetap jalan dengan salinan localStorage-nya.
    if (error && isMissingTableError(error)) return NextResponse.json({ draft: null });
    if (error) throw new Error(error.message);

    return NextResponse.json({
      draft: data?.data ?? null,
      updatedAt: data?.updated_at ?? null,
      updatedBy: data?.updated_by ?? null,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (e) {
    console.error('[shopping-draft] GET failed:', e);
    return NextResponse.json({ error: errorMessage(e) || 'Gagal memuat draft belanja' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!supabase) return NextResponse.json({ error: 'Supabase not initialized' }, { status: 500 });

    const body = await request.json().catch(() => null);
    if (!body || typeof body.draft !== 'object' || body.draft === null || Array.isArray(body.draft)) {
      return NextResponse.json({ error: 'Payload draft tidak valid' }, { status: 400 });
    }

    const { error } = await supabase
      .from('shopping_draft')
      .upsert({
        id: DRAFT_ID,
        data: body.draft,
        updated_at: new Date().toISOString(),
        updated_by: typeof body.updatedBy === 'string' ? body.updatedBy : null,
      });

    if (error && isMissingTableError(error)) {
      return NextResponse.json({ error: 'Tabel shopping_draft belum dibuat di database' }, { status: 503 });
    }
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[shopping-draft] POST failed:', e);
    return NextResponse.json({ error: errorMessage(e) || 'Gagal menyimpan draft belanja' }, { status: 500 });
  }
}

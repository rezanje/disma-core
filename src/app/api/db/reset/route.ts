import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireApiUser, apiAuthResponse } from '@/lib/api-auth';
import { assertResetAllowed, BackupValidationError } from '@/lib/backup-safety';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const actor = await requireApiUser(request, ['super_admin']);
    const body = await request.json().catch(() => null);
    const mode = assertResetAllowed(body, process.env);
    const { data, error } = await supabaseAdmin.rpc('reset_business_data', { p_actor: actor.id, p_mode: mode, p_confirmation: body.confirmation });
    if (error || !data || data.success !== true) throw new Error(error?.message || 'Server tidak mengonfirmasi reset.');
    return NextResponse.json({ success: true, mode });
  } catch (error) {
    return apiAuthResponse(error) || NextResponse.json({ error: error instanceof Error ? error.message : 'Reset gagal.' }, { status: error instanceof BackupValidationError ? 400 : 500 });
  }
}

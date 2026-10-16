import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireApiUser, apiAuthResponse } from '@/lib/api-auth';
import { BackupValidationError, readCompleteBackup, restoreCompleteBackup, validateBackup } from '@/lib/backup-safety';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const BUCKET = 'checkpoints';
const FILES = { checkpoint: 'checkpoint.json', preRestore: 'pre-restore.json', preWipe: 'pre-wipe.json' };

async function writeCheckpoint(file: string, backup: unknown) {
  const snapshot = validateBackup(backup);
  const bucket = await supabaseAdmin.storage.getBucket(BUCKET);
  if (bucket.error || !bucket.data) throw new Error('Bucket checkpoint privat belum tersedia. Buat bucket privat sebelum menyimpan cadangan.');
  if (bucket.data.public) throw new Error('Bucket checkpoint wajib privat.');
  const body = JSON.stringify(snapshot);
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(file, body, { contentType: 'application/json', upsert: true });
  if (error) throw new Error(error.message);
  return { bytes: Buffer.byteLength(body, 'utf8'), rows: Object.values(snapshot.manifest.counts).reduce((sum, count) => sum + count, 0) };
}
async function readCheckpoint(file: string) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(file);
  if (error || !data) throw new Error(error?.message || 'Checkpoint belum tersedia.');
  return validateBackup(JSON.parse(await data.text()));
}
function failure(error: unknown) {
  return apiAuthResponse(error) || NextResponse.json({ error: error instanceof Error ? error.message : 'Operasi cadangan gagal.' }, { status: error instanceof BackupValidationError ? 400 : 500 });
}
export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['super_admin']);
    if (new URL(request.url).searchParams.get('info') === 'checkpoint') {
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).list('', { limit: 100 });
      if (error) throw new Error(error.message);
      const meta = (name: string) => { const file = data?.find(row => row.name === name); return file ? { savedAt: file.updated_at || file.created_at, bytes: file.metadata?.size ?? null } : null; };
      return NextResponse.json({ checkpoint: meta(FILES.checkpoint), preRestore: meta(FILES.preRestore), preWipe: meta(FILES.preWipe) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const backup = await readCompleteBackup(supabaseAdmin);
    return NextResponse.json(backup, { headers: { 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="disma_backup_${Date.now()}.json"` } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await requireApiUser(request, ['super_admin']);
    const body = await request.json();
    const { action } = body;
    if (['lock', 'checkpoint_save', 'prewipe_save'].includes(action)) {
      const stats = await writeCheckpoint(action === 'prewipe_save' ? FILES.preWipe : FILES.checkpoint, await readCompleteBackup(supabaseAdmin));
      return NextResponse.json({ success: true, ...stats, savedAt: new Date().toISOString() });
    }
    let snapshot: unknown;
    if (action === 'restore_upload') snapshot = body.backupData;
    else if (action === 'restore' || action === 'checkpoint_restore') snapshot = await readCheckpoint(FILES.checkpoint);
    else if (action === 'checkpoint_undo') snapshot = await readCheckpoint(FILES.preRestore);
    else if (action === 'prewipe_restore') snapshot = await readCheckpoint(FILES.preWipe);
    else throw new BackupValidationError('Aksi cadangan tidak valid.');
    validateBackup(snapshot);
    // The safety copy completes before a single transactional restore command.
    if (action !== 'checkpoint_undo') await writeCheckpoint(FILES.preRestore, await readCompleteBackup(supabaseAdmin));
    await restoreCompleteBackup(supabaseAdmin, snapshot, actor.id);
    return NextResponse.json({ success: true, message: 'Restore atomik selesai. Masuk kembali untuk memuat data.' });
  } catch (error) { return failure(error); }
}

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // A full dump/restore of ~30k rows outruns the old 60s

const BACKUP_FILE_PATH = path.join(process.cwd(), 'data', 'safety_lock_backup.json');

// Checkpoints live in Supabase Storage, not on disk: the serverless filesystem is
// read-only in production and wiped on every deploy, so the old safety-lock file
// silently saved nothing there.
const CHECKPOINT_BUCKET = 'checkpoints';
const CHECKPOINT_FILE = 'checkpoint.json';
const PRE_RESTORE_FILE = 'pre-restore.json';   // one-step undo for a mistaken restore
// Taken automatically right before a transaction wipe. Its own slot on purpose:
// writing the wipe's safety net into CHECKPOINT_FILE would destroy whatever
// checkpoint someone had deliberately saved.
const PRE_WIPE_FILE = 'pre-wipe.json';

const TABLES_IN_WIPE_ORDER = [
  'sales_order_items', 'purchase_items', 'journal_lines', 'okr_key_results',
  'deliveries', 'invoices', 'tukar_faktur', 'sales_orders', 'vendor_bills', 'purchases', 'purchase_requests', 'journal_entries',
  'stock_movements', 'rejected_items', 'okr_objectives', 'reimbursements', 
  'expenses', 'cash_transactions', 'pending_returns', 'vendor_returns', 'fixed_assets',
  'notifications', 'disma_tasks', 'leads', 'employees', 'kpis', 'record_history', 'shopping_draft',
  'vendor_prices', 'client_prices', 'bank_accounts', 'coas', 'products', 'vendors', 'clients', 'users'
];

const TABLES_IN_INSERT_ORDER = [...TABLES_IN_WIPE_ORDER].reverse();

const isMissingTableError = (message: string) => 
  /could not find the table|schema cache/i.test(message);

async function fetchTable(table: string) {
  try {
    const PAGE_SIZE = 1000;
    let allData: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select('*')
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        if (isMissingTableError(error.message)) return [];
        throw error;
      }

      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return allData;
  } catch (e: any) {
    console.error(`Backup error fetching table ${table}:`, e.message);
    return [];
  }
}

async function dumpAllTables() {
  const backupData: Record<string, any> = {};
  for (const table of TABLES_IN_INSERT_ORDER) {
    backupData[table] = await fetchTable(table);
  }
  return backupData;
}

/** Create the private checkpoint bucket on first use so nothing has to be set up by hand. */
async function ensureCheckpointBucket() {
  const { data } = await supabaseAdmin.storage.getBucket(CHECKPOINT_BUCKET);
  if (!data) await supabaseAdmin.storage.createBucket(CHECKPOINT_BUCKET, { public: false });
}

async function writeCheckpoint(file: string, payload: Record<string, any>) {
  await ensureCheckpointBucket();
  const body = JSON.stringify(payload);
  const { error } = await supabaseAdmin.storage
    .from(CHECKPOINT_BUCKET)
    .upload(file, body, { contentType: 'application/json', upsert: true });
  if (error) throw new Error(error.message);
  return { bytes: body.length, rows: Object.values(payload).reduce((n: number, r: any) => n + (r?.length || 0), 0) };
}

/** Wipe every table child-first, then re-insert parent-first. Throws on the first failure. */
async function restoreFromData(dataToRestore: Record<string, any>) {
  console.log('[Restore] Starting restore of database...');

  for (const table of TABLES_IN_WIPE_ORDER) {
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .neq('id', '99999999-9999-9999-9999-999999999999'); // Avoid wiping system seed placeholders if any

    if (error) {
      if (isMissingTableError(error.message)) {
        console.warn(`[Restore] Skipping missing table wipe: ${table}`);
        continue;
      }
      throw new Error(`Failed to wipe ${table}: ${error.message}`);
    }
  }

  for (const table of TABLES_IN_INSERT_ORDER) {
    const rows = dataToRestore[table];
    if (!rows || !Array.isArray(rows) || rows.length === 0) continue;

    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin.from(table).upsert(chunk, { onConflict: 'id' });

      if (error) {
        if (isMissingTableError(error.message)) {
          console.warn(`[Restore] Skipping missing table seed: ${table}`);
          break;
        }
        throw new Error(`Failed to restore table ${table}: ${error.message}`);
      }
    }
    console.log(`[Restore] Restored table: ${table} (${rows.length} rows)`);
  }
  console.log('[Restore] ✅ Database restore completed successfully.');
}

async function readCheckpoint(file: string) {
  const { data, error } = await supabaseAdmin.storage.from(CHECKPOINT_BUCKET).download(file);
  if (error || !data) return null;
  return JSON.parse(await data.text());
}

export async function GET(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase Admin not initialized' }, { status: 500 });
    }

    // ?info=checkpoint — what the maintenance page shows next to the button
    if (new URL(request.url).searchParams.get('info') === 'checkpoint') {
      await ensureCheckpointBucket();
      const { data } = await supabaseAdmin.storage.from(CHECKPOINT_BUCKET).list('', { limit: 10 });
      const find = (n: string) => (data || []).find((f: any) => f.name === n);
      const meta = (f: any) => f ? {
        savedAt: f.updated_at || f.created_at,
        bytes: f.metadata?.size ?? null,
      } : null;
      return NextResponse.json({
        checkpoint: meta(find(CHECKPOINT_FILE)),
        preRestore: meta(find(PRE_RESTORE_FILE)),
        preWipe: meta(find(PRE_WIPE_FILE)),
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const backupData = await dumpAllTables();

    return NextResponse.json(backupData, {
      headers: {
        'Content-Disposition': `attachment; filename="disma_backup_${Date.now()}.json"`,
        'Content-Type': 'application/json'
      }
    });
  } catch (error: any) {
    console.error('Backup GET error:', error);
    return NextResponse.json({ error: 'Failed to generate backup: ' + error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase Admin not initialized' }, { status: 500 });
    }

    const { action, backupData: uploadedData } = await request.json().catch(() => ({}));

    if (action === 'lock') {
      // 1. Fetch current database state
      const backupData: Record<string, any> = {};
      for (const table of TABLES_IN_INSERT_ORDER) {
        backupData[table] = await fetchTable(table);
      }

      // Ensure data directory exists
      const dataDir = path.dirname(BACKUP_FILE_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Write to data/safety_lock_backup.json
      fs.writeFileSync(BACKUP_FILE_PATH, JSON.stringify(backupData, null, 2), 'utf8');
      console.log(`[Backup] ✅ Created safety lock backup at ${BACKUP_FILE_PATH}`);

      return NextResponse.json({ success: true, message: 'Current data locked successfully as safety point.' });
    }

    // --- Checkpoint: one saved slot, overwritten on every save ----------------
    if (action === 'checkpoint_save') {
      const stats = await writeCheckpoint(CHECKPOINT_FILE, await dumpAllTables());
      console.log(`[Checkpoint] saved ${stats.rows} rows / ${stats.bytes} bytes`);
      return NextResponse.json({ success: true, ...stats, savedAt: new Date().toISOString() });
    }

    // --- Pre-wipe net: taken automatically before a transaction wipe ----------
    // The wipe's in-app undo lives in browser memory and the wipe reloads the
    // page, so it never survived. This one does.
    if (action === 'prewipe_save') {
      const stats = await writeCheckpoint(PRE_WIPE_FILE, await dumpAllTables());
      console.log(`[Pre-wipe] saved ${stats.rows} rows / ${stats.bytes} bytes`);
      return NextResponse.json({ success: true, ...stats, savedAt: new Date().toISOString() });
    }

    if (action === 'prewipe_restore') {
      const snapshot = await readCheckpoint(PRE_WIPE_FILE);
      if (!snapshot) {
        return NextResponse.json({ error: 'Belum ada cadangan sebelum-hapus.' }, { status: 404 });
      }
      await restoreFromData(snapshot);
      return NextResponse.json({ success: true, message: 'Data dikembalikan ke kondisi sebelum dihapus.' });
    }

    if (action === 'checkpoint_restore' || action === 'checkpoint_undo') {
      const file = action === 'checkpoint_undo' ? PRE_RESTORE_FILE : CHECKPOINT_FILE;
      const snapshot = await readCheckpoint(file);
      if (!snapshot) {
        return NextResponse.json({ error: 'Checkpoint belum ada. Simpan checkpoint dulu.' }, { status: 404 });
      }
      // Keep the pre-restore copy so one wrong press is still reversible. Skipped when
      // undoing, otherwise the undo slot would overwrite the state being undone.
      if (action === 'checkpoint_restore') await writeCheckpoint(PRE_RESTORE_FILE, await dumpAllTables());
      await restoreFromData(snapshot);
      return NextResponse.json({ success: true, message: 'Database dikembalikan ke checkpoint.' });
    }

    if (action === 'restore' || action === 'restore_upload') {
      let dataToRestore = uploadedData;

      if (action === 'restore') {
        if (!fs.existsSync(BACKUP_FILE_PATH)) {
          return NextResponse.json({ error: 'Safety lock point does not exist yet. Please lock current data first.' }, { status: 404 });
        }
        const fileContent = fs.readFileSync(BACKUP_FILE_PATH, 'utf8');
        dataToRestore = JSON.parse(fileContent);
      }

      if (!dataToRestore || typeof dataToRestore !== 'object') {
        return NextResponse.json({ error: 'Invalid backup data provided.' }, { status: 400 });
      }

      await restoreFromData(dataToRestore);
      return NextResponse.json({ success: true, message: 'Database restored successfully to locked safety point.' });
    }

    return NextResponse.json({ error: 'Invalid action specified' }, { status: 400 });

  } catch (error: any) {
    console.error('Backup/Restore POST error:', error);
    return NextResponse.json({ error: 'Failed to process operation: ' + error.message }, { status: 500 });
  }
}

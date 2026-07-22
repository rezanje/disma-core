import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Heavy operations

const BACKUP_FILE_PATH = path.join(process.cwd(), 'data', 'safety_lock_backup.json');

const TABLES_IN_WIPE_ORDER = [
  'sales_order_items', 'purchase_items', 'journal_lines', 'okr_key_results',
  'deliveries', 'invoices', 'tukar_faktur', 'sales_orders', 'vendor_bills', 'purchases', 'purchase_requests', 'journal_entries',
  'stock_movements', 'rejected_items', 'okr_objectives', 'reimbursements', 
  'expenses', 'cash_transactions', 'pending_returns', 'vendor_returns', 'fixed_assets',
  'notifications', 'disma_tasks', 'leads', 'employees', 'kpis', 'record_history',
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

export async function GET() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase Admin not initialized' }, { status: 500 });
    }

    const backupData: Record<string, any> = {};
    for (const table of TABLES_IN_INSERT_ORDER) {
      backupData[table] = await fetchTable(table);
    }

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

      console.log(`[Restore] Starting restore of database...`);

      // 1. WIPE Phase (Child to Parent order to avoid FK violation)
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
          console.error(`[Restore] Error wiping ${table}:`, error.message);
          return NextResponse.json({ error: `Failed to wipe ${table}: ${error.message}` }, { status: 500 });
        }
        console.log(`[Restore] Wiped table: ${table}`);
      }

      // 2. SEED Phase (Parent to Child order)
      for (const table of TABLES_IN_INSERT_ORDER) {
        const rows = dataToRestore[table];
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
          console.log(`[Restore] No data to insert for table: ${table}`);
          continue;
        }

        const CHUNK = 200;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const chunk = rows.slice(i, i + CHUNK);
          const { error } = await supabaseAdmin.from(table).upsert(chunk, { onConflict: 'id' });

          if (error) {
            if (isMissingTableError(error.message)) {
              console.warn(`[Restore] Skipping missing table seed: ${table}`);
              break;
            }
            console.error(`[Restore] Error seeding ${table}:`, error.message);
            return NextResponse.json({ error: `Failed to restore table ${table}: ${error.message}` }, { status: 500 });
          }
        }
        console.log(`[Restore] Restored table: ${table} (${rows.length} rows)`);
      }

      console.log('[Restore] ✅ Database restore completed successfully.');
      return NextResponse.json({ success: true, message: 'Database restored successfully to locked safety point.' });
    }

    return NextResponse.json({ error: 'Invalid action specified' }, { status: 400 });

  } catch (error: any) {
    console.error('Backup/Restore POST error:', error);
    return NextResponse.json({ error: 'Failed to process operation: ' + error.message }, { status: 500 });
  }
}

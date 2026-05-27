const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const suffix = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase() === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dbUrl || !dbKey) {
  console.error("Missing Supabase configuration in env variables.");
  process.exit(1);
}

const supabase = createClient(dbUrl, dbKey);
const BACKUP_FILE_PATH = path.join(__dirname, '..', 'data', 'safety_lock_backup.json');

const TABLES_IN_WIPE_ORDER = [
  'sales_order_items', 'purchase_items', 'journal_lines', 'okr_key_results',
  'deliveries', 'invoices', 'sales_orders', 'purchases', 'journal_entries', 
  'stock_movements', 'rejected_items', 'okr_objectives', 'reimbursements', 
  'expenses', 'cash_transactions', 'pending_returns', 'fixed_assets', 
  'notifications', 'disma_tasks', 'leads', 'employees', 'kpis', 'record_history',
  'client_prices', 'bank_accounts', 'coas', 'products', 'vendors', 'clients', 'users'
];

const TABLES_IN_INSERT_ORDER = [...TABLES_IN_WIPE_ORDER].reverse();

const isMissingTableError = (message) => 
  /could not find the table|schema cache/i.test(message);

async function main() {
  if (!fs.existsSync(BACKUP_FILE_PATH)) {
    console.error(`[ERROR] Safety lock backup file not found at: ${BACKUP_FILE_PATH}`);
    console.error("Please run the backup/lock script first: node scratch/lock-current-db.js");
    process.exit(1);
  }

  console.log(`\n⚠️  WARNING: This will completely wipe the current database at ${dbUrl} and restore the safety lock backup data.`);
  console.log("Starting restore process in 3 seconds... Press Ctrl+C to abort.");
  await new Promise(resolve => setTimeout(resolve, 3000));

  const fileContent = fs.readFileSync(BACKUP_FILE_PATH, 'utf8');
  const dataToRestore = JSON.parse(fileContent);

  // 1. WIPE Phase
  console.log("\n[1/2] Wiping existing data...");
  for (const table of TABLES_IN_WIPE_ORDER) {
    const { error } = await supabase
      .from(table)
      .delete()
      .neq('id', '99999999-9999-9999-9999-999999999999');

    if (error) {
      if (isMissingTableError(error.message)) {
        console.warn(`[Skip] Missing table: ${table}`);
        continue;
      }
      throw new Error(`Failed to wipe ${table}: ${error.message}`);
    }
    console.log(`- Wiped: ${table}`);
  }

  // 2. SEED Phase
  console.log("\n[2/2] Restoring locked data...");
  for (const table of TABLES_IN_INSERT_ORDER) {
    const rows = dataToRestore[table];
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      console.log(`- No data for: ${table}`);
      continue;
    }

    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' });

      if (error) {
        if (isMissingTableError(error.message)) {
          console.warn(`[Skip] Missing table seed: ${table}`);
          break;
        }
        throw new Error(`Failed to restore table ${table}: ${error.message}`);
      }
    }
    console.log(`- Restored: ${table} (${rows.length} rows)`);
  }

  console.log("\n✅ [SUCCESS] Database restored successfully to safety lock state!");
}

main().catch(err => {
  console.error("\n❌ Restore failed:", err.message);
  process.exit(1);
});

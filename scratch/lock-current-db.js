const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const suffix = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase() === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(dbUrl, dbKey);

const BACKUP_FILE_PATH = path.join(__dirname, '..', 'data', 'safety_lock_backup.json');

const TABLES = [
  'sales_order_items', 'purchase_items', 'journal_lines', 'okr_key_results',
  'deliveries', 'invoices', 'sales_orders', 'purchases', 'journal_entries', 
  'stock_movements', 'rejected_items', 'okr_objectives', 'reimbursements', 
  'expenses', 'cash_transactions', 'pending_returns', 'fixed_assets', 
  'notifications', 'disma_tasks', 'leads', 'employees', 'kpis', 'record_history',
  'client_prices', 'bank_accounts', 'coas', 'products', 'vendors', 'clients', 'users'
];

async function fetchTable(table) {
  const PAGE_SIZE = 1000;
  let allData = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      if (/could not find the table|schema cache/i.test(error.message)) return [];
      throw error;
    }

    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allData;
}

async function main() {
  console.log(`Locking current production data from ${dbUrl}...`);
  const backupData = {};
  
  for (const table of TABLES) {
    console.log(`Fetching ${table}...`);
    backupData[table] = await fetchTable(table);
  }

  const dataDir = path.dirname(BACKUP_FILE_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(BACKUP_FILE_PATH, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`\n[SUCCESS] Safety Lock created at: ${BACKUP_FILE_PATH}`);
  
  // Print record counts
  console.log("\nRecord counts locked:");
  Object.entries(backupData).forEach(([table, rows]) => {
    if (rows.length > 0) {
      console.log(`- ${table}: ${rows.length} rows`);
    }
  });
}

main().catch(err => {
  console.error("Lock error:", err);
  process.exit(1);
});

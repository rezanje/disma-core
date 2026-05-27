const fs = require('fs');
const path = require('path');

const BACKUP_FILE_PATH = path.join(__dirname, '..', 'data', 'safety_lock_backup.json');

const TABLES = [
  'sales_order_items', 'purchase_items', 'journal_lines', 'okr_key_results',
  'deliveries', 'invoices', 'sales_orders', 'purchases', 'journal_entries', 
  'stock_movements', 'rejected_items', 'okr_objectives', 'reimbursements', 
  'expenses', 'cash_transactions', 'pending_returns', 'fixed_assets', 
  'notifications', 'disma_tasks', 'leads', 'employees', 'kpis', 'record_history',
  'client_prices', 'bank_accounts', 'coas', 'products', 'vendors', 'clients', 'users'
];

function verifyBackup() {
  console.log(`Analyzing backup file: ${BACKUP_FILE_PATH}`);
  if (!fs.existsSync(BACKUP_FILE_PATH)) {
    console.error("Backup file does not exist.");
    process.exit(1);
  }

  const fileStats = fs.statSync(BACKUP_FILE_PATH);
  console.log(`File size: ${(fileStats.size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Last modified: ${fileStats.mtime}\n`);

  let data;
  try {
    const raw = fs.readFileSync(BACKUP_FILE_PATH, 'utf8');
    data = JSON.parse(raw);
    console.log("✅ JSON syntax is valid.");
  } catch (err) {
    console.error("❌ Invalid JSON syntax:", err.message);
    process.exit(1);
  }

  let missingTables = [];
  let populatedTablesCount = 0;
  let emptyTablesCount = 0;
  let totalRows = 0;

  TABLES.forEach(table => {
    if (!(table in data)) {
      missingTables.push(table);
    } else {
      const rows = data[table];
      if (!Array.isArray(rows)) {
        console.error(`❌ Table ${table} is not an array.`);
      } else {
        totalRows += rows.length;
        if (rows.length > 0) {
          populatedTablesCount++;
          console.log(`- ${table}: ${rows.length} rows (Sample ID of first row: ${rows[0].id || 'No ID'})`);
        } else {
          emptyTablesCount++;
        }
      }
    }
  });

  console.log("\nSummary of Verification:");
  console.log(`- Total tables checked: ${TABLES.length}`);
  console.log(`- Populated tables: ${populatedTablesCount}`);
  console.log(`- Empty tables: ${emptyTablesCount}`);
  console.log(`- Total rows across all tables: ${totalRows}`);

  if (missingTables.length > 0) {
    console.error(`❌ Missing tables in backup: ${missingTables.join(', ')}`);
  } else {
    console.log("✅ All tables are present in the backup (some may be empty, which is normal if no data exists yet).");
  }
}

verifyBackup();

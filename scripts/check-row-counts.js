const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

const tables = [
  'bank_accounts',
  'cash_transactions',
  'coas',
  'journal_entries',
  'journal_lines',
  'sales_orders',
  'sales_order_items',
  'purchases',
  'purchase_items',
  'invoices',
  'vendor_bills',
  'operational_expenses',
  'reimbursements',
  'fixed_assets'
];

async function main() {
  console.log("=== DATABASE ROW COUNTS ===");
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`${table}: Error - ${error.message}`);
    } else {
      console.log(`${table}: ${count} rows`);
    }
  }
}

main();

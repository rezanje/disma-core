/**
 * Wipe simulation/operational data before fresh import seed.
 *
 * Keeps:
 *  - users, coas, products, employees, app_settings, role permissions
 *
 * Wipes (full table delete):
 *  - clients, vendors, invoices, vendor_bills, cash_transactions,
 *    journal_entries, journal_lines, sales_orders, sales_order_items,
 *    deliveries, purchases, purchase_requests, purchase_items, expenses, reimbursements,
 *    stock_movements, leads, pending_returns, rejected_items,
 *    bank_accounts (will be re-seeded with real balances)
 *
 * Run:
 *   NEXT_PUBLIC_SUPABASE_PROFILE=local node scripts/wipe-for-import.js
 *   NEXT_PUBLIC_SUPABASE_PROFILE=production node scripts/wipe-for-import.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const profile = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase();
const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
const url = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(`❌ Missing Supabase env for profile=${profile}`);
  process.exit(1);
}

console.log(`▶ Wipe target: ${url}`);
console.log(`▶ Profile: ${profile}\n`);

const supabase = createClient(url, key);

const TABLES_TO_WIPE = [
  'journal_lines',
  'journal_entries',
  'cash_transactions',
  'invoices',
  'vendor_bills',
  'deliveries',
  'sales_order_items',
  'sales_orders',
  'purchase_items',
  'purchases',
  'purchase_requests',
  'stock_movements',
  'expenses',
  'reimbursements',
  'rejected_items',
  'pending_returns',
  'leads',
  'bank_accounts',
  'clients',
  'vendors',
];

async function wipe(table) {
  // Delete all rows. PostgREST requires a filter — use neq on id with impossible value, or use `not.is.null`.
  const { error, count } = await supabase.from(table).delete({ count: 'exact' }).not('id', 'is', null);
  if (error) {
    if (/could not find the table|schema cache/i.test(error.message)) {
      console.log(`  ⏭  ${table}: missing (skip)`);
      return;
    }
    console.error(`  ❌ ${table}: ${error.message}`);
    return;
  }
  console.log(`  ✅ ${table}: deleted ${count ?? '?'} rows`);
}

(async () => {
  console.log('=== WIPING ===');
  for (const t of TABLES_TO_WIPE) {
    await wipe(t);
  }
  console.log('\n=== DONE ===');
})();

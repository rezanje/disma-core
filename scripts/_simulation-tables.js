// Shared table inventory for simulation backup/clear/restore scripts.
// Master tables: never touched. Transactional tables: dumped & cleared.

const TRANSACTIONAL_TABLES = [
  'sales_orders',
  'sales_order_items',
  'purchases',
  'purchase_requests',
  'purchase_items',
  'deliveries',
  'invoices',
  'tukar_faktur',
  'expenses',
  'reimbursements',
  'cash_transactions',
  'journal_entries',
  'journal_lines',
  'stock_movements',
  'rejected_items',
  'pending_returns',
  'vendor_bills',
  'record_history',
  'notifications',
];

// Tables that hold master/config data — they survive the simulation.
const PRESERVED_TABLES = [
  'users',
  'products',
  'clients',
  'vendors',
  'coas',
  'bank_accounts',
  'client_prices',
  'app_settings',
  'fixed_assets',
  'employees',
  'kpis',
  'okr_objectives',
  'okr_key_results',
  'leads',
  'disma_tasks',
];

// Side effects: reset numeric columns on master tables so the new run starts
// from a clean ledger position (without deleting the master rows themselves).
const MASTER_RESETS = [
  { table: 'products', column: 'current_stock', value: 0 },
  { table: 'bank_accounts', column: 'balance', value: 0 },
];

function resolveProfile(argv) {
  const flagIdx = argv.findIndex((a) => a === '--profile' || a === '-p');
  const explicit = flagIdx >= 0 ? argv[flagIdx + 1] : null;
  const fromEnv = process.env.SIM_PROFILE;
  const value = (explicit || fromEnv || 'local').toLowerCase();
  if (value !== 'local' && value !== 'production') {
    throw new Error(`Invalid profile "${value}" — expected "local" or "production".`);
  }
  return value;
}

function loadEnv() {
  try {
    require('dotenv').config({ path: '.env.local' });
  } catch (_) { /* dotenv optional */ }
}

function getSupabaseCreds(profile) {
  const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
  const url = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(`Missing Supabase credentials for profile=${profile}. Need NEXT_PUBLIC_SUPABASE_URL${suffix} and SUPABASE_SERVICE_ROLE_KEY${suffix}.`);
  }
  return { url, serviceRoleKey };
}

function ask(question) {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

module.exports = {
  TRANSACTIONAL_TABLES,
  PRESERVED_TABLES,
  MASTER_RESETS,
  resolveProfile,
  loadEnv,
  getSupabaseCreds,
  ask,
};

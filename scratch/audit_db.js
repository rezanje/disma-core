const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_LOCAL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY_LOCAL;

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase keys not found in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCounts() {
  const tables = [
    'sales_orders', 'purchases', 'cash_transactions', 'journal_entries', 'clients', 'products'
  ];
  
  console.log("--- Supabase Data Audit ---");
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
      
    if (error) {
      console.log(`${table}: ERROR - ${error.message}`);
    } else {
      console.log(`${table}: ${count} rows`);
    }
  }
}

checkCounts();

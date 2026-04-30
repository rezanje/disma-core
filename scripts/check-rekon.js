const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  console.log("=== All Purchases ===");
  const { data: purchases, error } = await supabase.from('purchases').select('id, status, reconciliation_status, budget_amount, actual_spent, change_returned');
  if (error) return console.error(error);
  
  for (const p of purchases) {
    console.log(`ID: ${p.id.slice(0,8)} | Status: ${p.status} | RekonStatus: ${p.reconciliation_status} | Budget: ${p.budget_amount} | Spent: ${p.actual_spent} | Returns: ${p.change_returned}`);
  }
}

main();

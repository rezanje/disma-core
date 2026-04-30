const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const { data: purchases, error } = await supabase
    .from('purchases')
    .select('id, status, reconciliation_status, budget_amount, actual_spent')
    .like('id', '8edbd070%');
  
  if (error) return console.error(error);
  console.log("Purchases found:", purchases);
}

main();

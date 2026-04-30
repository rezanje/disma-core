const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const bankIds = ['bank-advance-courier', 'bank-advance-sourcing'];
  for (const bankId of bankIds) {
    const { data: txs } = await supabase.from('cash_transactions').select('*').eq('bank_account_id', bankId);
    console.log(`\n=== CASH TRANSACTIONS FOR ${bankId} ===`);
    console.log(JSON.stringify(txs, null, 2));
  }
}

main();

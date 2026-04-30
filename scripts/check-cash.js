const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const { data: accounts } = await supabase.from('coas').select('*');
  const kasKurirAccount = accounts.find(a => a.account_code === '1-1510');
  const uangMukaAccount = accounts.find(a => a.account_code === '1-1500');

  console.log('--- KAS KURIR TRANSACTIONS ---');
  if (kasKurirAccount) {
    const { data: lines } = await supabase.from('journal_lines').select('*, journal_entries(description)').eq('account_id', kasKurirAccount.id);
    lines?.forEach(l => {
      console.log(`${l.journal_entries?.description} | Debit: ${l.debit_amount} | Credit: ${l.credit_amount}`);
    });
  }

  console.log('\n--- UANG MUKA TRANSACTIONS ---');
  if (uangMukaAccount) {
    const { data: lines } = await supabase.from('journal_lines').select('*, journal_entries(description)').eq('account_id', uangMukaAccount.id);
    lines?.forEach(l => {
      console.log(`${l.journal_entries?.description} | Debit: ${l.debit_amount} | Credit: ${l.credit_amount}`);
    });
  }
}

main();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const { data: accounts } = await supabase.from('coas').select('*');
  const returAccount = accounts.find(a => a.account_name.includes('Kerusakan') || a.account_name.includes('Retur'));
  const hppAccount = accounts.find(a => a.account_code === '5-1000' || a.account_name.includes('Pokok'));

  console.log(`Retur Account: ${returAccount?.account_name}`);
  if (returAccount) {
    const { data: lines } = await supabase.from('journal_lines').select('*, journal_entries(description, date)').eq('account_id', returAccount.id);
    console.log("=== KERUSAKAN/RETUR ===");
    lines?.forEach(l => console.log(`${l.journal_entries?.date} | ${l.journal_entries?.description} | D: ${l.debit_amount} | C: ${l.credit_amount}`));
  }

  console.log(`\nHPP Account: ${hppAccount?.account_name}`);
  if (hppAccount) {
    const { data: lines } = await supabase.from('journal_lines').select('*, journal_entries(description, date)').eq('account_id', hppAccount.id);
    console.log("=== HPP ===");
    lines?.forEach(l => console.log(`${l.journal_entries?.date} | ${l.journal_entries?.description} | D: ${l.debit_amount} | C: ${l.credit_amount}`));
  }
}

main();

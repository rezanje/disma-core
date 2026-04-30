const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const { data: accounts } = await supabase.from('coas').select('*');
  const ids = {
    hpp: accounts.find(a => a.account_code === '5-1000')?.id,
    inventory: accounts.find(a => a.account_code === '1-3000')?.id,
    reject: accounts.find(a => a.account_code === '5-2000')?.id,
    revenue: accounts.find(a => a.account_code === '4-1000')?.id
  };

  const { data: lines } = await supabase.from('journal_lines').select('account_id, debit_amount, credit_amount, journal_entries(description, date)');

  const printAccount = (name, id) => {
    let totalD = 0;
    let totalC = 0;
    console.log(`\n=== ${name} ===`);
    lines.filter(l => l.account_id === id).forEach(l => {
      console.log(`${l.journal_entries?.date} | ${l.journal_entries?.description} | D: ${l.debit_amount} | C: ${l.credit_amount}`);
      totalD += l.debit_amount;
      totalC += l.credit_amount;
    });
    console.log(`TOTAL -> Debit: ${totalD} | Credit: ${totalC} | Net: ${totalD - totalC}`);
  };

  printAccount('HPP (5-1000)', ids.hpp);
  printAccount('Persediaan (1-3000)', ids.inventory);
  printAccount('Kerusakan (5-2000)', ids.reject);
  printAccount('Revenue (4-1000)', ids.revenue);
}

main();

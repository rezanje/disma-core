const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const { data: lines, error } = await supabase.from('journal_lines').select('account_id, debit_amount, credit_amount');
  if (error) return console.error(error);

  const balances = {};

  for (const line of lines) {
    const { data: coa } = await supabase.from('coas').select('account_code, account_name').eq('id', line.account_id).single();
    if (!balances[coa.account_code]) {
      balances[coa.account_code] = { name: coa.account_name, debit: 0, credit: 0 };
    }
    balances[coa.account_code].debit += Number(line.debit_amount || 0);
    balances[coa.account_code].credit += Number(line.credit_amount || 0);
  }

  console.log("=== Trial Balance ===");
  for (const [code, data] of Object.entries(balances)) {
    console.log(`${code} | ${data.name} | Debit: Rp ${data.debit} | Credit: Rp ${data.credit}`);
  }
}

main();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const suffix = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase() === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(dbUrl, dbKey);

async function main() {
  console.log(`Running fast trial balance against ${dbUrl}...`);

  // 1. Fetch COAs
  const { data: coas, error: coaError } = await supabase.from('coas').select('id, account_code, account_name, account_type');
  if (coaError) return console.error('COA Error:', coaError);

  const coaMap = new Map();
  coas.forEach(c => coaMap.set(c.id, c));

  // 2. Fetch Journal Lines in chunks to bypass Supabase's max-rows limit (1000)
  const lines = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('journal_lines')
      .select('account_id, debit_amount, credit_amount')
      .range(from, from + PAGE_SIZE - 1);
    if (error) return console.error('Line Error:', error);
    if (!data || data.length === 0) break;
    lines.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  console.log(`Fetched ${lines.length} journal lines in total.`);

  const balances = {};

  for (const line of lines) {
    const coa = coaMap.get(line.account_id);
    if (!coa) {
      console.warn(`Warning: COA not found for account ID: ${line.account_id}`);
      continue;
    }
    if (!balances[coa.account_code]) {
      balances[coa.account_code] = { name: coa.account_name, type: coa.account_type, debit: 0, credit: 0 };
    }
    balances[coa.account_code].debit += Number(line.debit_amount || 0);
    balances[coa.account_code].credit += Number(line.credit_amount || 0);
  }

  console.log("\n=== TRIAL BALANCE ===");
  console.log("Code | Name | Type | Debit | Credit | Net Balance");
  console.log("-----------------------------------------------------------------");
  let totalDebit = 0;
  let totalCredit = 0;

  // Sort by account code
  const sortedCodes = Object.keys(balances).sort();
  for (const code of sortedCodes) {
    const data = balances[code];
    let net = 0;
    if (['Asset', 'Expense'].includes(data.type)) {
      net = data.debit - data.credit;
    } else {
      net = data.credit - data.debit;
    }
    console.log(`${code} | ${data.name} | ${data.type} | Rp ${data.debit.toLocaleString()} | Rp ${data.credit.toLocaleString()} | Net: Rp ${net.toLocaleString()}`);
    totalDebit += data.debit;
    totalCredit += data.credit;
  }
  console.log("-----------------------------------------------------------------");
  console.log(`TOTAL DEBIT: Rp ${totalDebit.toLocaleString()} | TOTAL CREDIT: Rp ${totalCredit.toLocaleString()}`);
  console.log(`DIFFERENCE (Debit - Credit): Rp ${(totalDebit - totalCredit).toLocaleString()}`);
}

main();

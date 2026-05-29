const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  console.log("Fetching journal lines...");
  const { data: lines, error } = await supabase.from('journal_lines').select('account_id, debit_amount, credit_amount');
  if (error) return console.error(error);

  console.log("Fetching COAs...");
  const { data: coas, error: coaErr } = await supabase.from('coas').select('id, account_code, account_name');
  if (coaErr) return console.error(coaErr);

  const coaMap = new Map(coas.map(c => [c.id, c]));
  const balances = {};

  for (const line of lines) {
    const coa = coaMap.get(line.account_id);
    if (!coa) continue;
    if (!balances[coa.account_code]) {
      balances[coa.account_code] = { name: coa.account_name, debit: 0, credit: 0 };
    }
    balances[coa.account_code].debit += Number(line.debit_amount || 0);
    balances[coa.account_code].credit += Number(line.credit_amount || 0);
  }

  console.log("=== Trial Balance ===");
  const sorted = Object.entries(balances).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [code, data] of sorted) {
    const balance = code.startsWith('1') || code.startsWith('5') || code.startsWith('6')
      ? data.debit - data.credit
      : data.credit - data.debit;
    console.log(`${code} | ${data.name.padEnd(35)} | Debit: ${String(data.debit).padStart(12)} | Credit: ${String(data.credit).padStart(12)} | Net Balance: ${balance}`);
  }
}

main();

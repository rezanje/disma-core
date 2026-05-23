const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const profile = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase();
const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
const SUPABASE_URL = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(`❌ Missing Supabase env for profile=${profile}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // Fetch all journal lines with pagination
  let lines = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('journal_lines')
      .select('account_id, debit_amount, credit_amount')
      .range(from, from + pageSize - 1);
    
    if (error) {
      console.error('Error fetching journal lines:', error);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    lines = lines.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // Fetch all COAs in one query to avoid N+1 query performance bottleneck
  const { data: coas, error: coaErr } = await supabase
    .from('coas')
    .select('id, account_code, account_name');
  
  if (coaErr) {
    console.error('Error fetching COAs:', coaErr);
    process.exit(1);
  }

  const coaMap = {};
  for (const coa of coas) {
    coaMap[coa.id] = coa;
  }

  const balances = {};
  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    const coa = coaMap[line.account_id];
    if (!coa) {
      console.warn(`Warning: COA not found for id ${line.account_id}`);
      continue;
    }

    const code = coa.account_code;
    if (!balances[code]) {
      balances[code] = { name: coa.account_name, debit: 0, credit: 0 };
    }
    
    const db = Number(line.debit_amount || 0);
    const cr = Number(line.credit_amount || 0);
    
    balances[code].debit += db;
    balances[code].credit += cr;
    totalDebit += db;
    totalCredit += cr;
  }

  console.log(`\n=== Trial Balance (${profile.toUpperCase()}) ===`);
  for (const [code, data] of Object.entries(balances).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${code.padEnd(8)} | ${data.name.padEnd(45)} | Debit: Rp ${String(data.debit).padStart(15)} | Credit: Rp ${String(data.credit).padStart(15)}`);
  }
  
  console.log('========================================================================');
  console.log(`TOTAL DEBIT  : Rp ${totalDebit}`);
  console.log(`TOTAL CREDIT : Rp ${totalCredit}`);
  console.log(`DIFFERENCE   : Rp ${totalDebit - totalCredit}`);
}

main();

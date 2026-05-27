const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const suffix = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase() === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(dbUrl, dbKey);

async function main() {
  const { data: coas } = await supabase.from('coas').select('id, account_code, account_name');
  console.log('COAs count:', coas.length);
  const coaMap = {};
  coas.forEach(c => {
    coaMap[c.id] = c;
    coaMap[c.account_code] = c;
  });

  const { data: lines } = await supabase.from('journal_lines').select('account_id, debit_amount, credit_amount, journal_entry_id');
  console.log('Journal lines count:', lines.length);

  const linesByAccountId = {};
  lines.forEach(l => {
    linesByAccountId[l.account_id] = (linesByAccountId[l.account_id] || 0) + Number(l.credit_amount) - Number(l.debit_amount);
  });

  console.log('\nGrouped by account_id in journal_lines:');
  for (const [accId, net] of Object.entries(linesByAccountId)) {
    const coa = coaMap[accId];
    console.log(`account_id: ${accId} | Code: ${coa ? coa.account_code : 'UNKNOWN'} | Name: ${coa ? coa.account_name : 'UNKNOWN'} | Net Credit: Rp ${net.toLocaleString()}`);
  }
}

main();

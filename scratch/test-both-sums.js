const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const suffix = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase() === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(dbUrl, dbKey);

async function main() {
  const { data: coas } = await supabase.from('coas').select('id, account_code').eq('account_code', '4-1000');
  const coaId = coas[0].id;
  console.log(`COA ID: ${coaId}`);

  // Fetch all journal lines for 4-1000
  const { data: lines } = await supabase.from('journal_lines').select('id, debit_amount, credit_amount, journal_entry_id').eq('account_id', coaId);
  console.log(`Total lines from .eq('account_id', coaId): ${lines.length}`);

  let sumEq = 0;
  lines.forEach(l => {
    sumEq += Number(l.credit_amount) - Number(l.debit_amount);
  });
  console.log(`Sum from .eq: Rp ${sumEq.toLocaleString()}`);

  // Fetch all journal lines (no filter)
  const { data: allLines } = await supabase.from('journal_lines').select('id, account_id, debit_amount, credit_amount, journal_entry_id');
  console.log(`Total all lines: ${allLines.length}`);

  let sumAll = 0;
  allLines.forEach(l => {
    if (l.account_id === coaId) {
      sumAll += Number(l.credit_amount) - Number(l.debit_amount);
    }
  });
  console.log(`Sum from all lines filter: Rp ${sumAll.toLocaleString()}`);

  // Let's print each line's details
  lines.forEach(l => {
    console.log(`Line ID: ${l.id} | JE ID: ${l.journal_entry_id} | Cr: ${l.credit_amount}`);
  });
}

main();

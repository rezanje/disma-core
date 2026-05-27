const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const suffix = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase() === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(dbUrl, dbKey);

async function main() {
  console.log(`Checking Sales Revenue journal lines for ${dbUrl}...`);

  // Fetch COA for 4-1000
  const { data: coas } = await supabase.from('coas').select('id, account_code, account_name').eq('account_code', '4-1000');
  if (!coas || coas.length === 0) {
    console.error('COA 4-1000 not found');
    return;
  }
  const coaId = coas[0].id;
  console.log(`COA 4-1000 ID: ${coaId}`);

  // Fetch journal lines
  const { data: lines, error: lineError } = await supabase
    .from('journal_lines')
    .select('journal_entry_id, debit_amount, credit_amount')
    .eq('account_id', coaId);
  
  if (lineError) {
    console.error('Error fetching journal lines:', lineError);
    return;
  }

  console.log(`Found ${lines.length} journal lines for 4-1000`);

  // Fetch all journal entries to get dates and descriptions
  const jeIds = lines.map(l => l.journal_entry_id);
  const { data: entries, error: jeError } = await supabase
    .from('journal_entries')
    .select('id, transaction_date, description, reference_type, reference_id')
    .in('id', jeIds);

  if (jeError) {
    console.error('Error fetching journal entries:', jeError);
    return;
  }

  const jeMap = new Map();
  entries.forEach(e => jeMap.set(e.id, e));

  let totalCredit = 0;
  let totalDebit = 0;

  console.log('\n--- Journal Lines ---');
  lines.forEach(l => {
    const je = jeMap.get(l.journal_entry_id);
    const date = je ? je.transaction_date : 'N/A';
    const desc = je ? je.description : 'N/A';
    const refType = je ? je.reference_type : 'N/A';
    const refId = je ? je.reference_id : 'N/A';
    
    totalCredit += l.credit_amount;
    totalDebit += l.debit_amount;

    console.log(`JE ID: ${l.journal_entry_id} | Date: ${date} | Cr: Rp ${l.credit_amount.toLocaleString()} | Dr: Rp ${l.debit_amount.toLocaleString()} | Ref: ${refType} (${refId}) | Desc: ${desc}`);
  });

  console.log('\n--- Summary ---');
  console.log(`Total Credit: Rp ${totalCredit.toLocaleString()}`);
  console.log(`Total Debit: Rp ${totalDebit.toLocaleString()}`);
  console.log(`Net Sales Revenue: Rp ${(totalCredit - totalDebit).toLocaleString()}`);
}

main();

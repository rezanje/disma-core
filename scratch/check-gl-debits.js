const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const suffix = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase() === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(dbUrl, dbKey);

async function main() {
  console.log('Checking Piutang Usaha (coa-2 / 1-2000) Debits...');

  // Fetch journal lines debiting coa-2 that are not opening entries
  const { data: lines, error } = await supabase
    .from('journal_lines')
    .select('journal_entry_id, debit_amount, credit_amount')
    .eq('account_id', 'coa-2')
    .gt('debit_amount', 0);

  if (error) return console.error(error);

  const entryIds = lines.map(l => l.journal_entry_id);
  const { data: entries, error: entError } = await supabase
    .from('journal_entries')
    .select('id, transaction_date, description, reference_type, reference_id')
    .in('id', entryIds);

  if (entError) return console.error(entError);

  const entryMap = new Map();
  entries.forEach(e => entryMap.set(e.id, e));

  console.log(`Found ${lines.length} debit lines:`);
  let totalDebit = 0;
  for (const line of lines) {
    const je = entryMap.get(line.journal_entry_id);
    if (!je) continue;
    if (je.reference_type === 'Opening') continue; // skip opening
    
    console.log(`  Date: ${je.transaction_date} | Entry ID: ${je.id} | Ref: ${je.reference_type} (${je.reference_id}) | Amount: Rp ${line.debit_amount.toLocaleString()} | Description: ${je.description}`);
    totalDebit += Number(line.debit_amount);
  }
  console.log(`Total non-opening Debit: Rp ${totalDebit.toLocaleString()}`);
}

main();

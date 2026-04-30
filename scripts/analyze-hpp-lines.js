const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  // 1. Find COA for 5-1000
  const { data: coa } = await supabase.from('coas').select('id').eq('account_code', '5-1000').single();
  if (!coa) return console.error("COA 5-1000 not found");
  
  console.log(`COA 5-1000 ID: ${coa.id}`);

  // 2. Find Journal Lines for this COA
  const { data: lines, error } = await supabase
    .from('journal_lines')
    .select('journal_entry_id, debit_amount, credit_amount')
    .eq('account_id', coa.id);
  
  if (error) return console.error(error);

  console.log(`\n=== Journal Lines for HPP (${lines.length} lines) ===`);
  for (const line of lines) {
    // Fetch the journal entry details
    const { data: entry } = await supabase
      .from('journal_entries')
      .select('description, transaction_type, reference_id, created_at')
      .eq('id', line.journal_entry_id)
      .single();
      
    console.log(`Entry: ${entry?.description || 'Unknown'}`);
    console.log(`Type: ${entry?.transaction_type} | Ref: ${entry?.reference_id} | Created: ${entry?.created_at}`);
    console.log(`Debit: Rp ${line.debit_amount} | Credit: Rp ${line.credit_amount}\n`);
  }
}

main();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  console.log("=== Journal Entries with account 5-1000 (HPP) ===");
  const { data: entries, error } = await supabase
    .from('journal_entries')
    .select(`
      id,
      description,
      transaction_type,
      reference_id,
      created_at,
      journal_lines (
        id,
        account_id,
        debit_amount,
        credit_amount,
        coas (
          account_code,
          account_name
        )
      )
    `);
  
  if (error) return console.error(error);

  for (const entry of entries) {
    const hppLine = entry.journal_lines?.find(line => line.coas?.account_code === '5-1000');
    if (hppLine) {
      console.log(`\nEntry: ${entry.description}`);
      console.log(`Type: ${entry.transaction_type} | Ref: ${entry.reference_id} | Created: ${entry.created_at}`);
      console.log(`HPP Debit: Rp ${hppLine.debit_amount}`);
      
      // Find the matching credit (usually inventory or similar)
      const otherLines = entry.journal_lines.filter(l => l.id !== hppLine.id);
      for (const line of otherLines) {
        console.log(`  -> ${line.coas?.account_name} (${line.coas?.account_code}): ${line.credit_amount ? 'Credit Rp ' + line.credit_amount : 'Debit Rp ' + line.debit_amount}`);
      }
    }
  }
}

main();

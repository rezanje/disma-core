const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const entryIds = [
    '12a98ba7-b8c3-4511-aa6a-94707e841bd3',
    '74d2bc16-50a8-4809-a9ea-7dd259b3695c'
  ];

  for (const id of entryIds) {
    const { data: lines } = await supabase.from('journal_lines').select('account_id, debit_amount, credit_amount').eq('journal_entry_id', id);
    const { data: entry } = await supabase.from('journal_entries').select('description').eq('id', id).single();

    console.log(`\nEntry ID: ${id} | ${entry?.description}`);
    if (!lines) continue;
    for (const line of lines) {
      const { data: coa } = await supabase.from('coas').select('account_code, account_name').eq('id', line.account_id).single();
      console.log(`  -> ${coa?.account_name} (${coa?.account_code}): Debit Rp ${line.debit_amount} | Credit Rp ${line.credit_amount}`);
    }
  }
}

main();

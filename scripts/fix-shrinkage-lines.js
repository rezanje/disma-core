const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const { data: accounts } = await supabase.from('coas').select('*');
  const hppAccount = accounts.find(a => a.account_code === '5-1000');
  const inventoryAccount = accounts.find(a => a.account_code === '1-3000');

  if (!hppAccount || !inventoryAccount) {
    console.error("Accounts not found");
    return;
  }

  // Find journal lines that credit inventory (1-3000)
  const { data: lines } = await supabase.from('journal_lines')
    .select('id, journal_entry_id, credit_amount')
    .eq('account_id', inventoryAccount.id)
    .gt('credit_amount', 0);

  if (lines && lines.length > 0) {
    console.log(`Found ${lines.length} lines crediting inventory. Fixing them to credit HPP...`);
    for (const line of lines) {
      const { error } = await supabase.from('journal_lines')
        .update({ account_id: hppAccount.id })
        .eq('id', line.id);
      
      if (error) {
        console.error("Error updating line:", error);
      } else {
        console.log(`Updated line ${line.id} to HPP (credit: ${line.credit_amount})`);
      }
    }
  } else {
    console.log("No inventory credit lines found.");
  }
}

main();

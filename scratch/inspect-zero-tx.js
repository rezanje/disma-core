const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function checkProfile(profile) {
  const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
  const url = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    console.log(`No env for ${profile}`);
    return;
  }
  const supabase = createClient(url, key);
  console.log(`\n=== CHECKING ${profile.toUpperCase()} ===`);
  const { data, error } = await supabase
    .from('cash_transactions')
    .select('id, date, type, amount, description, bank_account_id')
    .eq('amount', 0);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Found ${data.length} zero-amount cash transactions:`);
    data.slice(0, 10).forEach(d => {
      console.log(`- ID: ${d.id}, Date: ${d.date}, Desc: ${d.description}`);
    });
    if (data.length > 10) console.log(`... and ${data.length - 10} more`);
  }
}

async function main() {
  await checkProfile('local');
  await checkProfile('production');
}

main();

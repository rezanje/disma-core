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
    .select('*')
    .eq('date', '2026-05-20T00:00:00.000Z');
  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Found ${data.length} transactions for date 2026-05-20T00:00:00.000Z:`);
    data.forEach(d => {
      console.log(`- ID: ${d.id}, Type: ${d.type}, Amount: ${d.amount}, Desc: ${d.description}, BankAccountId: ${d.bank_account_id}`);
    });
  }
  
  // Also try date string without T00...
  const { data: data2 } = await supabase
    .from('cash_transactions')
    .select('*')
    .like('date', '2026-05-20%');
  console.log(`Found ${data2?.length || 0} transactions with like '2026-05-20%':`);
  data2?.forEach(d => {
    console.log(`- ID: ${d.id}, Date: ${d.date}, Type: ${d.type}, Amount: ${d.amount}, Desc: ${d.description}, BankAccountId: ${d.bank_account_id}`);
  });
}

async function main() {
  await checkProfile('local');
  await checkProfile('production');
}

main();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function searchProfile(profile) {
  const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
  const url = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    console.log(`No env for ${profile}`);
    return;
  }
  const supabase = createClient(url, key);
  console.log(`\n=== SEARCHING ${profile.toUpperCase()} ===`);
  const keywords = ['HILMAN', 'CICILAN', 'RIFAI', 'REAL CASH', 'NOTED'];
  for (const kw of keywords) {
    const { data, error } = await supabase
      .from('cash_transactions')
      .select('id, date, type, amount, description')
      .ilike('description', `%${kw}%`);
    if (error) {
      console.error(`Error searching ${kw}:`, error);
    } else {
      console.log(`Keyword "${kw}": Found ${data.length} transactions:`);
      data.forEach(d => {
        console.log(`  - ID: ${d.id}, Date: ${d.date}, Amount: ${d.amount}, Desc: ${d.description}`);
      });
    }
  }
}

async function main() {
  await searchProfile('local');
  await searchProfile('production');
}

main();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const suffix = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase() === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(dbUrl, dbKey);

async function main() {
  const { data, error } = await supabase.from('coas').select('id, account_code, account_name, account_type').order('account_code');
  if (error) {
    console.error(error);
    return;
  }
  console.log("=== ALL COAS ===");
  console.log(data);
}

main();

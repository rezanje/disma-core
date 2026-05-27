const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const { data, error } = await supabase.from('coas').select('id, account_code, account_name, account_type').limit(20);
  if (error) {
    console.error(error);
    return;
  }
  console.log("=== COAS ===");
  console.log(data);
}

main();

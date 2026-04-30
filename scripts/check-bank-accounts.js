const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const { data: accounts } = await supabase.from('bank_accounts').select('*');
  console.log("=== BANK ACCOUNTS ===");
  console.log(JSON.stringify(accounts, null, 2));
}

main();

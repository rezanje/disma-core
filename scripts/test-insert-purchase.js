const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const p = {
    id: '11111111-1111-1111-1111-111111111111',
    date: new Date().toISOString(),
    purchaser_id: null,
    status: 'Pending'
  };
  const { data, error } = await supabase.from('purchases').upsert([p]);
  console.log("Upsert result:", error || "Success");
}
main();

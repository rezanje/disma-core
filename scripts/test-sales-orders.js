const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const { data, error } = await supabase.from('sales_orders').select('*');
  console.log("Sales Orders count:", data ? data.length : 0);
  console.log("Sales Orders:", data);
  if (error) console.error("Error:", error);
}
main();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  console.log("=== Checking Rejected Items ===");
  const { data: rejects, error: err } = await supabase.from('rejected_items').select('*');
  if (err) return console.error(err);

  for (const r of rejects) {
    // get product name
    const { data: prod } = await supabase.from('products').select('name').eq('id', r.product_id).single();
    console.log(`Product: ${prod?.name} | Qty Reject: ${r.qty} | Source: ${r.source} | Date: ${r.date}`);
  }
}

main();

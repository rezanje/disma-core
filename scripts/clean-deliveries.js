const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  console.log("=== Cleaning up Duplicate Deliveries ===");
  
  const { data: deliveries, error: err } = await supabase.from('deliveries').select('*');
  if (err) return console.error(err);
  
  const seen = new Set();
  const idsToDelete = [];
  
  for (const d of deliveries) {
    if (seen.has(d.sales_order_id)) {
      idsToDelete.push(d.id);
    } else {
      seen.add(d.sales_order_id);
    }
  }
  
  if (idsToDelete.length > 0) {
    console.log(`Found ${idsToDelete.length} duplicate deliveries. Deleting...`);
    const { error: delErr } = await supabase.from('deliveries').delete().in('id', idsToDelete);
    if (delErr) return console.error("Error deleting:", delErr);
    console.log("Deleted duplicate deliveries successfully.");
  } else {
    console.log("No duplicate deliveries found.");
  }
}

main();

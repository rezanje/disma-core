const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  console.log("=== Checking Sales Orders ===");
  const { data: orders, error: oErr } = await supabase.from('sales_orders').select('*');
  if (oErr) return console.error(oErr);

  for (const so of orders) {
    console.log(`\nPO: ${so.po_number} | ID: ${so.id} | Status: ${so.status}`);
    
    // Check purchase items
    const { data: pItems, error: piErr } = await supabase.from('purchase_items').select('*').eq('sales_order_id', so.id);
    if (piErr) {
      console.error("Error fetching purchase items:", piErr);
      continue;
    }
    
    if (!pItems || pItems.length === 0) {
      console.log("   No purchase items found for this SO.");
      continue;
    }
    
    console.log(`   Total Purchase Items: ${pItems.length}`);
    const qcedCount = pItems.filter(pi => pi.is_qced).length;
    const onlineCount = pItems.filter(pi => pi.purchase_method === 'Online').length;
    console.log(`   QCed Items: ${qcedCount}/${pItems.length}`);
    console.log(`   Online Items: ${onlineCount}`);
    
    pItems.forEach(pi => {
       console.log(`     - Item Product ID: ${pi.product_id} | Method: ${pi.purchase_method} | QCed: ${pi.is_qced}`);
    });
  }
}

main();

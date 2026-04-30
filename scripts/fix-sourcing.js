const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const soId = '76c27fa7-6683-4cc6-a003-8fd9e0fd0cd5';
  
  // Get the items
  const { data: items, error: iErr } = await supabase.from('sales_order_items').select('*').eq('sales_order_id', soId);
  if (iErr) return console.error(iErr);
  
  if (!items || items.length === 0) {
    console.log("No items found for SO");
    return;
  }
  
  const purchaseId = uuidv4();
  const p = {
    id: purchaseId,
    date: new Date().toISOString(),
    purchaser_id: 'pending',
    status: 'Pending'
  };
  
  const { error: pErr } = await supabase.from('purchases').upsert([p]);
  if (pErr) return console.error("Error inserting purchase:", pErr);
  
  const pItems = items.map(item => ({
    id: uuidv4(),
    purchase_id: purchaseId,
    product_id: item.product_id,
    qty_target: item.qty,
    qty_purchased: 0,
    estimated_unit_price: item.unit_price,
    actual_unit_price: 0,
    is_checked: false,
    purchase_method: 'Pasar',
    sales_order_id: soId
  }));
  
  const { error: piErr } = await supabase.from('purchase_items').upsert(pItems);
  if (piErr) return console.error("Error inserting purchase items:", piErr);
  
  console.log("Successfully fixed Sourcing for SO", soId);
}
main();

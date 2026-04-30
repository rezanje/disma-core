const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const { data: so_items } = await supabase.from('sales_order_items').select('*, products(name, base_price, selling_price)');
  console.log("=== SALES ORDER ITEMS ===");
  so_items?.forEach(i => console.log(`${i.products?.name} | Sold Qty: ${i.qty_final} | Selling Price: ${i.unit_price} | Cost Price: ${i.products?.base_price} | Margin/Item: ${i.unit_price - i.products?.base_price}`));

  const { data: po_items } = await supabase.from('purchase_items').select('*, products(name, base_price)');
  console.log("\n=== PURCHASE ITEMS ===");
  po_items?.forEach(i => console.log(`${i.products?.name} | Bought Qty: ${i.qty_purchased} | Actual Unit Price: ${i.actual_unit_price} | Target Unit Price: ${i.target_unit_price}`));
}

main();

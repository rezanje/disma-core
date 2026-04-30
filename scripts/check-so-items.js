const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const soId = '76c27fa7-6683-4cc6-a003-8fd9e0fd0cd5';
  console.log("=== Checking Sales Order Items ===");
  
  const { data: items, error: err } = await supabase.from('sales_order_items').select('*').eq('sales_order_id', soId);
  if (err) return console.error(err);

  items.forEach(item => {
    console.log(`Item ID: ${item.id} | Product: ${item.product_id} | Qty: ${item.qty} | Qty Final: ${item.qty_final}`);
  });
}

main();

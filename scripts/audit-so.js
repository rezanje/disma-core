const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  // 1. Check the sales order directly
  const { data: so } = await supabase.from('sales_orders').select('*').eq('id', '76c27fa7-6683-4cc6-a003-8fd9e0fd0cd5').single();
  console.log("=== SALES ORDER ===");
  console.log(JSON.stringify(so, null, 2));

  // 2. Check items
  const { data: items } = await supabase.from('sales_order_items').select('*').eq('sales_order_id', '76c27fa7-6683-4cc6-a003-8fd9e0fd0cd5');
  console.log("\n=== SALES ORDER ITEMS ===");
  items?.forEach(i => console.log(`  Product: ${i.product_id} | Qty: ${i.qty} (final: ${i.qty_final}) | Price: ${i.unit_price} | Subtotal: ${i.subtotal}`));

  // 3. Check ALL invoices
  const { data: invoices } = await supabase.from('invoices').select('*');
  console.log("\n=== ALL INVOICES ===");
  invoices?.forEach(inv => console.log(`  ${inv.id} | Client: ${inv.client_id} | SO: ${inv.sales_order_id} | Total: ${inv.total_amount} | Paid: ${inv.amount_paid} | Status: ${inv.status}`));

  // 4. Check ALL sales orders
  const { data: allSO } = await supabase.from('sales_orders').select('id, client_id, status, total_amount');
  console.log("\n=== ALL SALES ORDERS ===");
  allSO?.forEach(o => console.log(`  ${o.id} | Client: ${o.client_id} | Status: ${o.status} | Total: ${o.total_amount}`));
}

main();

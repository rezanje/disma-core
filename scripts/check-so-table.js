const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  // Check all sales orders count
  const { data: sos, count } = await supabase.from('sales_orders').select('*', { count: 'exact' });
  console.log(`Total sales orders in DB: ${count || sos?.length || 0}`);
  sos?.forEach(so => console.log(`  ${so.id} | ${so.client_id} | ${so.status}`));
  
  // Check all sales order items count  
  const { data: items, count: itemCount } = await supabase.from('sales_order_items').select('*', { count: 'exact' });
  console.log(`\nTotal SO items in DB: ${itemCount || items?.length || 0}`);
  items?.forEach(i => console.log(`  SO: ${i.sales_order_id} | Product: ${i.product_id} | Subtotal: ${i.subtotal}`));
  
  // Understanding the discrepancy:
  // Client page shows: Total Revenue = sum of salesOrderItems.subtotal WHERE salesOrderId is in client's orders
  // But if salesOrders table is empty, it should show Rp0...
  // UNLESS the client page uses the local cache, which still has the data from before
  
  // Check the original invoice
  console.log("\n=== INVOICE BREAKDOWN ===");
  const { data: inv1 } = await supabase.from('invoices').select('*').eq('id', 'fc162fa6-a717-4957-98e5-702bb530032c').single();
  console.log("Original Invoice:", JSON.stringify(inv1, null, 2));
  
  const { data: inv2 } = await supabase.from('invoices').select('*').eq('id', 'TF-88bcbf46').single();
  console.log("\nTukar Faktur:", JSON.stringify(inv2, null, 2));
}

main();

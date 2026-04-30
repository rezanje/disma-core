const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  // 1. Get the client
  const { data: clients } = await supabase.from('clients').select('id, company_name');
  console.log("=== ALL CLIENTS ===");
  clients?.forEach(c => console.log(`  ${c.id} | ${c.company_name}`));

  const testClient = clients?.find(c => c.company_name?.includes('TES PAK'));
  if (!testClient) return console.log("Client TES PAK REZA not found");

  console.log(`\nClient: ${testClient.company_name} (${testClient.id})`);

  // 2. Sales Orders for this client
  const { data: orders } = await supabase.from('sales_orders').select('id, status, total_amount').eq('client_id', testClient.id);
  console.log("\n=== SALES ORDERS ===");
  orders?.forEach(o => console.log(`  ${o.id} | Status: ${o.status} | Total: ${o.total_amount}`));

  // 3. Sales Order Items
  if (orders?.length) {
    for (const order of orders) {
      const { data: items } = await supabase.from('sales_order_items').select('id, product_id, qty, unit_price, subtotal, qty_final').eq('sales_order_id', order.id);
      console.log(`\n  Items for order ${order.id}:`);
      items?.forEach(i => console.log(`    Product: ${i.product_id} | Qty: ${i.qty} (final: ${i.qty_final}) | Price: ${i.unit_price} | Subtotal: ${i.subtotal}`));
      const totalFromItems = items?.reduce((sum, i) => sum + (i.subtotal || 0), 0) || 0;
      console.log(`  -> Items total: Rp ${totalFromItems}`);
    }
  }

  // 4. Invoices for this client
  const { data: invoices } = await supabase.from('invoices').select('id, sales_order_id, total_amount, amount_paid, status').eq('client_id', testClient.id);
  console.log("\n=== INVOICES ===");
  invoices?.forEach(inv => console.log(`  ${inv.id} | SO: ${inv.sales_order_id} | Total: ${inv.total_amount} | Paid: ${inv.amount_paid} | Status: ${inv.status}`));

  // 5. Deliveries
  const { data: deliveries } = await supabase.from('deliveries').select('id, sales_order_id, status, invoice_id');
  const clientDeliveries = deliveries?.filter(d => orders?.some(o => o.id === d.sales_order_id));
  console.log("\n=== DELIVERIES ===");
  clientDeliveries?.forEach(d => console.log(`  ${d.id} | SO: ${d.sales_order_id} | Status: ${d.status} | Invoice: ${d.invoice_id}`));
}

main();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

(async () => {
  const { data: clients } = await sb.from('clients').select('id, company_name').limit(1);
  const { data: products } = await sb.from('products').select('id, name, selling_price, base_price').limit(1);
  if (!clients?.[0] || !products?.[0]) { console.error('no client/product'); process.exit(1); }

  const soId = 'so-fasttrack-test-' + Date.now();
  const poNumber = 'PO-FT-' + Date.now().toString().slice(-6);

  const { error: e1 } = await sb.from('sales_orders').insert({
    id: soId,
    po_number: poNumber,
    client_id: clients[0].id,
    order_date: new Date().toISOString(),
    target_delivery_date: new Date(Date.now() + 3 * 86400000).toISOString(),
    status: 'Belanja',
  });
  if (e1) { console.error('SO insert fail:', e1); process.exit(1); }

  const { error: e2 } = await sb.from('sales_order_items').insert({
    id: 'soi-ft-' + Date.now(),
    sales_order_id: soId,
    product_id: products[0].id,
    qty: 5,
    unit_price: 80000,
    subtotal: 400000,
  });
  if (e2) { console.error('Item insert fail:', e2); process.exit(1); }

  console.log('✅ Test SO created:', poNumber, 'id=', soId, 'product=', products[0].name);
})();

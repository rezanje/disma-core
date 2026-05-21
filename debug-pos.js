const { createClient } = require('@supabase/supabase-js');
async function run() {
  const supabase = createClient(
    'https://plzkrzzmqatjgsitvmfd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMzQ1OCwiZXhwIjoyMDkwMzc5NDU4fQ.xaSluKpM8JQiBZwbEX-Vrx8d-cIXcAGey8uKBDDsGtQ'
  );
  
  const soRes = await supabase.from('sales_orders').select('id, po_number, shopping_list_document_id, shopping_list_compiled_at');
  const pRes = await supabase.from('purchases').select('id, advance_code, status');
  const piRes = await supabase.from('purchase_items').select('id, purchase_id');

  if (soRes.error) console.error('SO Error:', soRes.error);
  if (pRes.error) console.error('Purchase Error:', pRes.error);
  if (piRes.error) console.error('PI Error:', piRes.error);

  const salesOrders = soRes.data || [];
  const purchases = pRes.data || [];
  const purchaseItems = piRes.data || [];

  console.log('--- Sales Orders with Shopping List Doc ID ---');
  salesOrders.filter(so => so.shopping_list_document_id).forEach(so => {
    console.log(`SO: ${so.po_number}, DocID: ${so.shopping_list_document_id}, CompiledAt: ${so.shopping_list_compiled_at}`);
  });

  console.log('\n--- Purchases (Advances) ---');
  purchases.forEach(p => {
    console.log(`Purchase ID: ${p.id}, Code: ${p.advance_code}, Status: ${p.status}`);
  });

  console.log('\n--- Purchase Items Count per Purchase ---');
  const counts = {};
  purchaseItems.forEach(pi => {
    counts[pi.purchase_id] = (counts[pi.purchase_id] || 0) + 1;
  });
  Object.entries(counts).forEach(([id, count]) => {
    console.log(`Purchase ${id}: ${count} items`);
  });
}
run();

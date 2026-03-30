const { createClient } = require('@supabase/supabase-js');
async function run() {
  const supabase = createClient(
    'https://plzkrzzmqatjgsitvmfd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMzQ1OCwiZXhwIjoyMDkwMzc5NDU4fQ.xaSluKpM8JQiBZwbEX-Vrx8d-cIXcAGey8uKBDDsGtQ'
  );
  
  const so = await supabase.from('sales_orders').select('*', { count: 'exact', head: true });
  const po = await supabase.from('purchases').select('*', { count: 'exact', head: true });
  const soi = await supabase.from('sales_order_items').select('*', { count: 'exact', head: true });
  
  console.log(`Sales Orders: ${so.count}`);
  console.log(`Purchases: ${po.count}`);
  console.log(`Sales Order Items: ${soi.count}`);
}
run();

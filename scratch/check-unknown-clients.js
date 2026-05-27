const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const suffix = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase() === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(dbUrl, dbKey);

async function main() {
  const { data: sales, error: err1 } = await supabase.from('sales_orders').select('*');
  if (err1) throw err1;

  const { data: clients, error: err2 } = await supabase.from('clients').select('*');
  if (err2) throw err2;

  console.log(`Total Sales Orders: ${sales.length}`);
  console.log(`Total Clients: ${clients.length}`);

  sales.forEach(so => {
    const client = clients.find(c => c.id === so.client_id);
    if (!client) {
      console.log(`\nInvalid Sales Order found:`);
      console.log(`  - ID: ${so.id}`);
      console.log(`  - PO Number: ${so.po_number}`);
      console.log(`  - Client ID in SO: "${so.client_id}"`);
      console.log(`  - Status: ${so.status}`);
      console.log(`  - Order Date: ${so.order_date}`);
    }
  });
}

main().catch(console.error);

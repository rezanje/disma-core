const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const profile = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase();
const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const supabase = createClient(dbUrl, dbKey);
  const { data: dbClients, error } = await supabase
    .from('clients')
    .select('company_name, total_order_jan_may')
    .order('company_name');
  
  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total clients in DB: ${dbClients.length}`);
  dbClients.forEach((c, idx) => {
    console.log(`${idx + 1}. ${c.company_name} - Total Order: ${c.total_order_jan_may}`);
  });
}

main();

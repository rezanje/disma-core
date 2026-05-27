const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const profile = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase();
const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const supabase = createClient(dbUrl, dbKey);
  
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, client_id, total_amount, amount_paid, is_consolidated, sales_order_ids, sales_order_id, superseded_by_invoice_id, status');

  if (error) {
    console.error('Error fetching invoices:', error);
    return;
  }

  const imported = invoices.filter(inv => inv.id.startsWith('inv-import-'));
  const nonImported = invoices.filter(inv => !inv.id.startsWith('inv-import-'));

  console.log(`Total Invoices: ${invoices.length}`);
  console.log(`Imported Invoices (inv-import-*): ${imported.length}`);
  console.log(`Non-Imported Invoices: ${nonImported.length}`);

  if (nonImported.length > 0) {
    console.log('\nDetails of Non-Imported Invoices:');
    nonImported.forEach(inv => {
      console.log(`ID: ${inv.id}, ClientID: ${inv.client_id}, Total: ${inv.total_amount}, Paid: ${inv.amount_paid}, Consolidated: ${inv.is_consolidated}`);
    });
  }
}

main();

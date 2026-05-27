const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ckkohudfuisgzlrjipev.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra29odWRmdWlzZ3pscmppcGV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMTY5OCwiZXhwIjoyMDkwMzc3Njk4fQ.6xxE7Y8uLwhDjCUc189TYq5ArZm3L87JNdxTZT9oApQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: clients } = await supabase.from('clients').select('id, company_name, total_order_jan_may');
  const holycows = clients.filter(c => c.company_name.toLowerCase().includes('holycow'));
  console.log('Holycow clients:', holycows);

  for (const hc of holycows) {
    const { data: invoices } = await supabase.from('invoices').select('id, client_id, total_amount, amount_paid, is_consolidated, sales_order_id, sales_order_ids').eq('client_id', hc.id);
    console.log(`\nInvoices for ${hc.company_name}:`, invoices);
  }
}
main();

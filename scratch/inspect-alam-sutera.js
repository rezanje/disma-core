const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ckkohudfuisgzlrjipev.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra29odWRmdWlzZ3pscmppcGV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMTY5OCwiZXhwIjoyMDkwMzc3Njk4fQ.6xxE7Y8uLwhDjCUc189TYq5ArZm3L87JNdxTZT9oApQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: clients } = await supabase.from('clients').select('*');
  const { data: invoices } = await supabase.from('invoices').select('*');

  const getClientOutstandingARSingle = (cId) => {
    const clientInvoices = invoices.filter(inv => inv.client_id === cId);
    const consolidatedSOIds = new Set(
      clientInvoices
        .filter(inv => inv.is_consolidated && inv.sales_order_ids?.length > 0)
        .flatMap(inv => inv.sales_order_ids)
    );
    const activeInvoices = clientInvoices.filter(inv => {
      if (inv.superseded_by_invoice_id) return false;
      if (inv.sales_order_id && consolidatedSOIds.has(inv.sales_order_id) && !inv.is_consolidated) return false;
      return true;
    });
    return activeInvoices.reduce((sum, inv) => sum + (inv.total_amount - inv.amount_paid), 0);
  };

  const getClientLifetimeRevenueSingle = (cId) => {
    const client = clients.find(c => c.id === cId);
    if (!client) return 0;
    const totalJanMay = client.total_order_jan_may || 0;
    const clientInvoices = invoices.filter(inv => inv.client_id === cId);
    const consolidatedSOIds = new Set(
      clientInvoices
        .filter(inv => inv.is_consolidated && inv.sales_order_ids?.length > 0)
        .flatMap(inv => inv.sales_order_ids)
    );
    const activeInvoices = clientInvoices.filter(inv => {
      if (inv.superseded_by_invoice_id) return false;
      if (inv.sales_order_id && consolidatedSOIds.has(inv.sales_order_id) && !inv.is_consolidated) return false;
      return true;
    });
    const activeNonImported = activeInvoices.filter(inv => !inv.id.startsWith('inv-import-'));
    return totalJanMay + activeNonImported.reduce((sum, inv) => sum + inv.total_amount, 0);
  };

  const targets = [
    'client-holycow-by-chef-afit---alam-sutera',
    'client-holycow-by-chef-afit-alam-sutera',
    'client-holycow-by-chef-afit---wolter',
    'client-holycow-by-chef-afit-wolter'
  ];

  for (const tid of targets) {
    const c = clients.find(x => x.id === tid);
    if (c) {
      console.log(`\nClient ID: ${c.id}`);
      console.log(`Company Name: ${c.company_name}`);
      console.log(`Total Jan-May: ${c.total_order_jan_may}`);
      console.log(`Outstanding AR (calc): ${getClientOutstandingARSingle(c.id)}`);
      console.log(`Lifetime Rev (calc): ${getClientLifetimeRevenueSingle(c.id)}`);
    }
  }
}
main();

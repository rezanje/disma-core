const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ckkohudfuisgzlrjipev.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra29odWRmdWlzZ3pscmppcGV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMTY5OCwiZXhwIjoyMDkwMzc3Njk4fQ.6xxE7Y8uLwhDjCUc189TYq5ArZm3L87JNdxTZT9oApQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: rawClients } = await supabase.from('clients').select('*');
  const { data: rawInvoices } = await supabase.from('invoices').select('*');

  // camelCase transformation simulation as done by the GET route
  const toCamel = (obj) => {
    if (Array.isArray(obj)) return obj.map(toCamel);
    if (obj === null || typeof obj !== 'object') return obj;
    const n = {};
    Object.keys(obj).forEach((k) => {
      let ck = k.replace(/(_\w)/g, (m) => m[1].toUpperCase());
      n[ck] = toCamel(obj[k]);
    });
    return n;
  };

  const clients = toCamel(rawClients);
  const invoices = toCamel(rawInvoices);

  // Exact functions from page.tsx:
  const getClientOutstandingARSingle = (cId) => {
    const clientInvoices = invoices.filter(inv => inv.clientId === cId);
    const consolidatedSOIds = new Set(
      clientInvoices
        .filter((inv) => inv.isConsolidated && inv.salesOrderIds?.length > 0)
        .flatMap((inv) => inv.salesOrderIds)
    );
    const activeInvoices = clientInvoices.filter((inv) => {
      if (inv.supersededByInvoiceId) return false;
      if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !inv.isConsolidated) return false;
      return true;
    });
    return activeInvoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0);
  };

  const getClientOutstandingAR = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return 0;
    if (client.isBrand) {
      const branches = clients.filter(c => c.parentId === clientId);
      const selfAR = getClientOutstandingARSingle(clientId);
      const branchesAR = branches.reduce((sum, b) => sum + getClientOutstandingARSingle(b.id), 0);
      return selfAR + branchesAR;
    }
    return getClientOutstandingARSingle(clientId);
  };

  const getClientLifetimeRevenueSingle = (cId) => {
    const client = clients.find(c => c.id === cId);
    if (!client) return 0;
    const totalJanMay = client.totalOrderJanMay || 0;
    const clientInvoices = invoices.filter(inv => inv.clientId === cId);
    const consolidatedSOIds = new Set(
      clientInvoices
        .filter((inv) => inv.isConsolidated && inv.salesOrderIds?.length > 0)
        .flatMap((inv) => inv.salesOrderIds)
    );
    const activeInvoices = clientInvoices.filter((inv) => {
      if (inv.supersededByInvoiceId) return false;
      if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !inv.isConsolidated) return false;
      return true;
    });
    const activeNonImported = activeInvoices.filter(inv => !inv.id.startsWith('inv-import-'));
    return totalJanMay + activeNonImported.reduce((sum, inv) => sum + inv.totalAmount, 0);
  };

  const getClientLifetimeRevenue = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return 0;
    if (client.isBrand) {
      const branches = clients.filter(c => c.parentId === clientId);
      const selfRev = getClientLifetimeRevenueSingle(clientId);
      const branchesRev = branches.reduce((sum, b) => sum + getClientLifetimeRevenueSingle(b.id), 0);
      return selfRev + branchesRev;
    }
    return getClientLifetimeRevenueSingle(clientId);
  };

  const holycows = clients.filter(c => c.companyName.toLowerCase().includes('holycow'));
  
  console.log('Results of frontend logic simulation for Holycow clients:');
  holycows.forEach(c => {
    console.log(`\nClient: ${c.companyName} (${c.id})`);
    console.log(`- Parent ID: ${c.parentId}`);
    console.log(`- Is Brand: ${c.isBrand}`);
    console.log(`- Total Jan-May: ${c.totalOrderJanMay}`);
    console.log(`- OUTSTANDING AR (totalDebt): ${getClientOutstandingAR(c.id)}`);
    console.log(`- TOTAL REVENUE (totalRevenue): ${getClientLifetimeRevenue(c.id)}`);
  });
}
main();

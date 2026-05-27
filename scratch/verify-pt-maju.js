const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const suffix = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase() === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dbUrl || !dbKey) {
  console.error("Missing database URL or Key in .env.local");
  process.exit(1);
}

const supabase = createClient(dbUrl, dbKey);
const TARGET_CLIENT_ID = 'b72db4b6-980b-4af5-9178-4adc5be8bfee'; // PT Maju Bersama

async function main() {
  const { data: rawClients } = await supabase.from('clients').select('*');
  const { data: rawInvoices } = await supabase.from('invoices').select('*');

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

  const client = clients.find(c => c.id === TARGET_CLIENT_ID);
  if (!client) {
    console.error("PT Maju Bersama not found in database.");
    return;
  }

  console.log(`Client: ${client.companyName}`);
  console.log(`Outstanding AR: Rp ${getClientOutstandingARSingle(TARGET_CLIENT_ID).toLocaleString('id-ID')}`);
  console.log(`Lifetime Revenue: Rp ${getClientLifetimeRevenueSingle(TARGET_CLIENT_ID).toLocaleString('id-ID')}`);
}

main();

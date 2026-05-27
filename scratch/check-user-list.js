const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const profile = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase();
const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const userProvidedList = [
  { name: "ANIMO BREAD CINERE", amount: 5664000 },
  { name: "ATSUMARU BAR", amount: 414000 },
  { name: "ATSUMARU IZAKAYA", amount: 5059500 },
  { name: "BAKMIE TAAT", amount: 3689950 },
  { name: "BAPAK ARCHIE", amount: 4403850 },
  { name: "BAPAK DAMAR", amount: 835750 },
  { name: "CENTRAL KITCHEN SEINDONESIA CIBINONG", amount: 43140000 },
  { name: "CENTRAL KITCHEN SEINDONESIA KIAT ANANDA", amount: 1358946600 },
  { name: "CUAN YU", amount: 0 },
  { name: "DAILY BREAD CAFE", amount: 1065250 },
  { name: "DAILY BREAD EPICENTRUM", amount: 18050186 },
  { name: "DAILY BREAD TEBET", amount: 2983750 },
  { name: "DEMIE BAKMIE BINTARO", amount: 11023280 },
  { name: "DEMIE BAKMIE BLOK M", amount: 13643860 },
  { name: "DEMIE BAKMIE CENTRAL KITCHEN", amount: 263262540 },
  { name: "DEMIE BAKMIE CILANDAK", amount: 17846490 },
  { name: "DEMIE BAKMIE KATERING", amount: 1671300 },
  { name: "DEMIE BAKMIE KEMANG", amount: 18754930 },
  { name: "DEMIE BAKMIE MARGONDA", amount: 11228050 },
  { name: "DEMIE BAKMIE MENTENG", amount: 29075442 },
  { name: "DEMIE BAKMIE SENOPATI", amount: 16531980 },
  { name: "DEMIE BAKMIE STORE", amount: 15666000 },
  { name: "DEMIE BAKMIE TEBET", amount: 21033850 },
  { name: "DEMIE CATERING", amount: 220000 },
  { name: "FRESH BOX", amount: 545763050 },
  { name: "GOAT COFFEE", amount: 6003550 },
  { name: "HEADQUARTER BAR & POOL", amount: 432000 },
  { name: "HOLYCOW BY CHEF AFIT - ALAM SUTERA", amount: 13211000 },
  { name: "HOLYCOW BY CHEF AFIT - BATU TULIS", amount: 5108500 },
  { name: "HOLYCOW BY CHEF AFIT - BATUTULIS", amount: 309800 }, // Wait, user prompt says "HOLYCOW BY CHEF AFIT - BATUTULIS","3,098,000" - wait, let's keep exact value 3098000
  { name: "HOLYCOW BY CHEF AFIT - BEKASI", amount: 47636000 },
  { name: "HOLYCOW BY CHEF AFIT - BINTARO", amount: 16782500 },
  { name: "HOLYCOW BY CHEF AFIT - CIBUBUR", amount: 8923500 },
  { name: "HOLYCOW BY CHEF AFIT - CIJANTUNG", amount: 57652000 },
  { name: "HOLYCOW BY CHEF AFIT - CITOS", amount: 15829000 },
  { name: "HOLYCOW BY CHEF AFIT - FOODTRUCK", amount: 3225000 },
  { name: "HOLYCOW BY CHEF AFIT - GADING SERPONG", amount: 8057000 },
  { name: "HOLYCOW BY CHEF AFIT - KALIBATA CITY", amount: 10275500 },
  { name: "HOLYCOW BY CHEF AFIT - KALIMALANG", amount: 12727000 },
  { name: "HOLYCOW BY CHEF AFIT - KEBON JERUK", amount: 16547250 },
  { name: "HOLYCOW BY CHEF AFIT - KELAPA GADING", amount: 10457000 },
  { name: "HOLYCOW BY CHEF AFIT - MAMPANG", amount: 5826500 },
  { name: "HOLYCOW BY CHEF AFIT - PIK", amount: 5089500 },
  { name: "HOLYCOW BY CHEF AFIT - WOLTER", amount: 10796500 },
  { name: "HOLYCOW HERITAGE ARJUNA", amount: 8502660 },
  { name: "HOLYCOW WAREHOUSE STORED", amount: 634000 },
  { name: "HOLYCOW WAREHOUSE WOLTER", amount: 291000 },
  { name: "IBU DEBBY", amount: 1016000 },
  { name: "IBU EUIS", amount: 310800 },
  { name: "IBU SYIFA", amount: 332000 },
  { name: "JANKENDON", amount: 1767750 },
  { name: "KEDAI MIE TJAP 1000 TAHUN BINTARO", amount: 8457000 },
  { name: "KEDAI MIE TJAP 1000 TAHUN CK BINTARO", amount: 40387200 },
  { name: "KEDAI MIE TJAP 1000 TAHUN CK BINTARO (RAKER)", amount: 209100 },
  { name: "KEDAI MIE TJAP 1000 TAHUN SCBD", amount: 22581100 },
  { name: "KEDAI MIE TJAP 1000 TAHUN Senopati", amount: 7316600 },
  { name: "KENARA CATERING", amount: 3616750 },
  { name: "KILO ASTHA", amount: 1612600 },
  { name: "KILO TRINITY", amount: 1033250 },
  { name: "KUALINARI CATERING", amount: 1730000 },
  { name: "KYO COFFEE ASTHA", amount: 2617000 },
  { name: "KYO COFFEE JATIWARINGIN", amount: 68390500 },
  { name: "MEAT A MEAT STEAK", amount: 48706600 },
  { name: "MIDAZ SENAYAN GOLF", amount: 4491000 },
  { name: "MITRA BOGA KREASI PRIMA", amount: 4000000 },
  { name: "MOOKIE", amount: 27394532 },
  { name: "MS JACKSON", amount: 13446650 },
  { name: "NARASA", amount: 12162200 },
  { name: "PEPR BURGER SENAYAN", amount: 25024000 },
  { name: "PEPR BURGER UF CIPETE", amount: 26752000 },
  { name: "PT MITRA BOGA KREASI PRIMA", amount: 3400000 },
  { name: "PT MITRABOGA KREASI PRIMA", amount: 15800000 },
  { name: "RESTO SETO", amount: 2669685 },
  { name: "RIVARENO PLAZA SENAYAN", amount: 13984000 },
  { name: "RIVARENO URBAN FOREST CIPETE", amount: 11332440 },
  { name: "RNI", amount: 4683000 },
  { name: "SHOTS COFFEE", amount: 205096300 },
  { name: "SIMPANG RAYA", amount: 29204000 },
  { name: "SLICED PIZZA BINTARO", amount: 11170700 },
  { name: "SLICED PIZZA BLOK M", amount: 31124450 },
  { name: "SLICED PIZZA CIBIS", amount: 58558050 },
  { name: "SLICED PIZZA CIKINI", amount: 143600 },
  { name: "SLICED PIZZA PONDOK PINANG", amount: 9256600 },
  { name: "SLICED PIZZA SCBD", amount: 10766850 },
  { name: "SSI GROUP", amount: 1014900 },
  { name: "SULU ADITYAWARMAN", amount: 1248900 },
  { name: "THE HALAL GUYS SMB", amount: 6730185 },
  { name: "VIETNAMESE PHO 24 NOODLE", amount: 72582200 }
];

// Correct the typo: user prompt says HOLYCOW BY CHEF AFIT - BATUTULIS is 3,098,000 in string but let's check both possibilities.
userProvidedList.forEach(item => {
  if (item.name === "HOLYCOW BY CHEF AFIT - BATUTULIS" && item.amount === 309800) {
    // wait, we keep what's in the prompt which has "3,098,000" -> parsed to 3098000. Wait, in prompt it is "3,098,000". So let's make it 3098000.
    item.amount = 3098000;
  }
});

async function main() {
  const supabase = createClient(dbUrl, dbKey);
  console.log(`Checking DB on profile: ${profile}`);

  // Fetch clients
  const { data: dbClients, error: clientErr } = await supabase
    .from('clients')
    .select('id, company_name, total_order_jan_may');

  if (clientErr) {
    console.error('Error fetching clients:', clientErr);
    return;
  }

  // Fetch invoices
  const { data: dbInvoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, client_id, total_amount, amount_paid, is_consolidated, sales_order_ids, sales_order_id, superseded_by_invoice_id, status, paid_date, due_date');

  if (invErr) {
    console.error('Error fetching invoices:', invErr);
    return;
  }

  console.log(`Total DB Clients: ${dbClients.length}`);
  console.log(`Total DB Invoices: ${dbInvoices.length}`);

  const getClientLifetimeRevenue = (client, invoicesList) => {
    const totalJanMay = Number(client.total_order_jan_may) || 0;
    const clientInvoices = invoicesList.filter(inv => inv.client_id === client.id);
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
    return totalJanMay + activeNonImported.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
  };

  const results = [];
  let userTotal = 0;
  let computedTotal = 0;
  let dbJanMayTotal = 0;

  userProvidedList.forEach(userItem => {
    userTotal += userItem.amount;
    const dbClient = dbClients.find(c => c.company_name.trim().toUpperCase() === userItem.name.trim().toUpperCase());
    
    if (!dbClient) {
      results.push({
        name: userItem.name,
        userAmount: userItem.amount,
        dbJanMay: null,
        computedRevenue: null,
        status: 'MISSING_IN_DB'
      });
      return;
    }

    const dbJanMay = Number(dbClient.total_order_jan_may || 0);
    dbJanMayTotal += dbJanMay;
    const computedRevenue = getClientLifetimeRevenue(dbClient, dbInvoices);
    computedTotal += computedRevenue;

    const matchesJanMay = dbJanMay === userItem.amount;
    const matchesComputed = computedRevenue === userItem.amount;

    results.push({
      name: userItem.name,
      userAmount: userItem.amount,
      dbJanMay,
      computedRevenue,
      status: matchesJanMay ? 'MATCH_JAN_MAY' : (matchesComputed ? 'MATCH_COMPUTED_BUT_NOT_JAN_MAY' : 'MISMATCH')
    });
  });

  console.log('\n--- MATCHING RESULTS ---');
  results.forEach(res => {
    if (res.status === 'MISMATCH' || res.status === 'MISSING_IN_DB') {
      console.log(`❌ ${res.name}: User=${res.userAmount}, DB_JanMay=${res.dbJanMay}, Computed=${res.computedRevenue} [${res.status}]`);
    } else if (res.status === 'MATCH_COMPUTED_BUT_NOT_JAN_MAY') {
      console.log(`⚠️ ${res.name}: User=${res.userAmount}, DB_JanMay=${res.dbJanMay}, Computed=${res.computedRevenue} [Matches computed, but JanMay column is different]`);
    }
  });

  console.log('\n--- SUMMARY ---');
  console.log(`User Total: ${userTotal}`);
  console.log(`DB JanMay Total: ${dbJanMayTotal}`);
  console.log(`Computed App Total: ${computedTotal}`);
  console.log(`Mismatches: ${results.filter(r => r.status === 'MISMATCH').length}`);
  console.log(`Missing: ${results.filter(r => r.status === 'MISSING_IN_DB').length}`);
}

main();

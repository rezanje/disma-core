const { createClient } = require('@supabase/supabase-js');

async function run() {
  const supabase = createClient(
    'https://plzkrzzmqatjgsitvmfd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMzQ1OCwiZXhwIjoyMDkwMzc5NDU4fQ.xaSluKpM8JQiBZwbEX-Vrx8d-cIXcAGey8uKBDDsGtQ'
  );

  console.log("Fetching COAs...");
  const { data: coas } = await supabase.from('coas').select('*');
  console.log("Fetching Journal Entries...");
  const { data: entries } = await supabase.from('journal_entries').select('*');
  console.log("Fetching Journal Lines...");
  const { data: lines } = await supabase.from('journal_lines').select('*');

  const coaMap = {};
  coas.forEach(c => {
    coaMap[c.id] = c;
  });

  const entryMap = {};
  entries.forEach(e => {
    entryMap[e.id] = e;
  });

  let totalRev = 0;
  let totalCogs = 0;
  let totalOpex = 0;

  const opexBreakdown = {};

  lines.forEach(line => {
    const coa = coaMap[line.account_id];
    const entry = entryMap[line.journal_entry_id];
    if (!coa || !entry) return;

    const code = coa.account_code;
    const isAssetExpense = code.startsWith('1') || code.startsWith('5') || code.startsWith('6');
    const bal = isAssetExpense 
      ? (line.debit_amount - line.credit_amount)
      : (line.credit_amount - line.debit_amount);

    if (code.startsWith('4')) {
      totalRev += bal;
    } else if (code.startsWith('5')) {
      totalCogs += bal;
    } else if (code.startsWith('6')) {
      totalOpex += bal;
      opexBreakdown[coa.account_name] = (opexBreakdown[coa.account_name] || 0) + bal;
    }
  });

  const netProfit = totalRev - (totalCogs + totalOpex);
  const profitMargin = totalRev > 0 ? (netProfit / totalRev) * 100 : 0;

  console.log("\n=== FINANCIAL AUDIT SUMMARY ===");
  console.log(`Total Revenue (4-xxxx): Rp ${totalRev.toLocaleString('id-ID')}`);
  console.log(`Total COGS (5-xxxx): Rp ${totalCogs.toLocaleString('id-ID')}`);
  console.log(`Total Operating Expenses (6-xxxx): Rp ${totalOpex.toLocaleString('id-ID')}`);
  console.log("  OpEx Breakdown:");
  Object.entries(opexBreakdown).forEach(([name, val]) => {
    console.log(`    - ${name}: Rp ${val.toLocaleString('id-ID')}`);
  });
  console.log("--------------------------------");
  console.log(`Net Profit: Rp ${netProfit.toLocaleString('id-ID')}`);
  console.log(`Profit Margin: ${profitMargin.toFixed(2)}%`);
}

run();

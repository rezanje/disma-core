const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const suffix = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase() === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(dbUrl, dbKey);

async function run() {
  console.log(`Running database consistency audit against ${dbUrl}...\n`);

  // 1. Fetch COAs
  const { data: coas } = await supabase.from('coas').select('*');
  const coaMap = {};
  coas.forEach(c => coaMap[c.id] = c);

  // 2. Fetch Journal Entries
  const { data: entries } = await supabase.from('journal_entries').select('*');
  const entryMap = {};
  entries.forEach(e => entryMap[e.id] = e);

  // 3. Fetch Journal Lines
  const { data: lines } = await supabase.from('journal_lines').select('*');

  console.log(`Analyzing ${entries.length} journal entries and ${lines.length} journal lines...`);

  // Check 1: Orphaned journal lines
  const orphanedLines = [];
  lines.forEach(line => {
    if (!entryMap[line.journal_entry_id]) {
      orphanedLines.push(line);
    }
  });

  if (orphanedLines.length > 0) {
    console.warn(`[FAIL] Found ${orphanedLines.length} orphaned journal lines!`);
  } else {
    console.log(`[PASS] No orphaned journal lines found.`);
  }

  // Check 2: Balance of each journal entry (Debit must equal Credit)
  const entryBalances = {};
  lines.forEach(line => {
    if (!entryBalances[line.journal_entry_id]) {
      entryBalances[line.journal_entry_id] = { debit: 0, credit: 0 };
    }
    entryBalances[line.journal_entry_id].debit += Number(line.debit_amount || 0);
    entryBalances[line.journal_entry_id].credit += Number(line.credit_amount || 0);
  });

  let unbalancedEntriesCount = 0;
  Object.entries(entryBalances).forEach(([entryId, bal]) => {
    const entry = entryMap[entryId];
    const diff = Math.abs(bal.debit - bal.credit);
    if (diff > 0.01) {
      unbalancedEntriesCount++;
      console.warn(`[FAIL] Journal Entry ${entryId} (${entry?.description || 'No Description'}) is unbalanced! Debit: ${bal.debit}, Credit: ${bal.credit}`);
    }
  });

  if (unbalancedEntriesCount === 0) {
    console.log(`[PASS] All journal entries are perfectly balanced (Debits = Credits).`);
  } else {
    console.warn(`[FAIL] Found ${unbalancedEntriesCount} unbalanced journal entries.`);
  }

  // Check 3: Check ledger equation (Assets = Liabilities + Equity + Net Profit)
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  let totalRevenue = 0;
  let totalExpenses = 0;

  lines.forEach(line => {
    const coa = coaMap[line.account_id];
    if (!coa) return;

    const code = coa.account_code;
    const isAssetExpense = code.startsWith('1') || code.startsWith('5') || code.startsWith('6');
    const balance = isAssetExpense 
      ? (Number(line.debit_amount) - Number(line.credit_amount))
      : (Number(line.credit_amount) - Number(line.debit_amount));

    if (code.startsWith('1')) totalAssets += balance;
    else if (code.startsWith('2')) totalLiabilities += balance;
    else if (code.startsWith('3')) totalEquity += balance;
    else if (code.startsWith('4')) totalRevenue += balance;
    else if (code.startsWith('5') || code.startsWith('6')) totalExpenses += balance;
  });

  const netProfit = totalRevenue - totalExpenses;
  const equationDiff = Math.abs(totalAssets - (totalLiabilities + totalEquity + netProfit));

  console.log("\n--- LEDGER SUMMARY ---");
  console.log(`Total Assets: Rp ${totalAssets.toLocaleString('id-ID')}`);
  console.log(`Total Liabilities: Rp ${totalLiabilities.toLocaleString('id-ID')}`);
  console.log(`Total Equity: Rp ${totalEquity.toLocaleString('id-ID')}`);
  console.log(`Total Revenue: Rp ${totalRevenue.toLocaleString('id-ID')}`);
  console.log(`Total Expenses (HPP + OpEx): Rp ${totalExpenses.toLocaleString('id-ID')}`);
  console.log(`Net Profit: Rp ${netProfit.toLocaleString('id-ID')}`);
  console.log(`Accounting Equation Difference: Rp ${equationDiff}`);
  
  if (equationDiff < 0.05) {
    console.log("[PASS] Ledger is in perfect balance (Assets = Liabilities + Equity + Net Profit).");
  } else {
    console.warn("[FAIL] Ledger equation is unbalanced!");
  }
}

run();

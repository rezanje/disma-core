const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'data', 'DISMA_keuangan_20Mei2026.json');

function main() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error("JSON file not found at:", FILE_PATH);
    return;
  }

  const content = fs.readFileSync(FILE_PATH, 'utf8');
  const data = JSON.parse(content);

  console.log("Keys in JSON file:", Object.keys(data));

  const entries = data.journal_entries || [];
  const lines = data.journal_lines || [];
  const coas = data.coas || [];

  console.log(`Journal Entries in JSON: ${entries.length}`);
  console.log(`Journal Lines in JSON: ${lines.length}`);
  console.log(`COAs in JSON: ${coas.length}`);

  const monthlyData = {};

  lines.forEach(line => {
    // In JSON, keys might be snake_case or camelCase. Let's handle both.
    const entryId = line.journal_entry_id || line.journalEntryId;
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    const dateStr = entry.transaction_date || entry.transactionDate;
    if (!dateStr) return;

    const date = new Date(dateStr);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { revenue: 0, expense: 0, entries: new Set() };
    }

    monthlyData[monthKey].entries.add(entry.id);

    const accountId = line.account_id || line.accountId;
    const coa = coas.find(c => c.id === accountId);
    if (!coa) return;

    const code = coa.account_code || coa.accountCode;
    if (!code) return;

    if (code.startsWith('4')) {
      const revVal = (line.credit_amount || line.creditAmount || 0) - (line.debit_amount || line.debitAmount || 0);
      monthlyData[monthKey].revenue += revVal;
    } else if (code.startsWith('5') || code.startsWith('6')) {
      const expVal = (line.debit_amount || line.debitAmount || 0) - (line.credit_amount || line.creditAmount || 0);
      monthlyData[monthKey].expense += expVal;
    }
  });

  console.log("\nMonthly Breakdown in JSON:");
  Object.keys(monthlyData).sort().forEach(month => {
    const d = monthlyData[month];
    console.log(`Month: ${month}`);
    console.log(`  - Unique Entries: ${d.entries.size}`);
    console.log(`  - Total Revenue: Rp ${d.revenue.toLocaleString('id-ID')}`);
    console.log(`  - Total Expense: Rp ${d.expense.toLocaleString('id-ID')}`);
    console.log(`  - Net Profit: Rp ${(d.revenue - d.expense).toLocaleString('id-ID')}`);
  });
}

main();

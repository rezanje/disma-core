const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const { data: entries, error } = await supabase.from('journal_entries').select('id, transaction_date, description, reference_type');
  if (error) {
    console.error(error);
    return;
  }

  console.log(`Total entries: ${entries.length}`);
  if (entries.length === 0) return;

  // Let's find min and max dates
  const dates = entries.map(e => new Date(e.transaction_date));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  console.log(`Min transaction date: ${minDate.toISOString()}`);
  console.log(`Max transaction date: ${maxDate.toISOString()}`);

  // Count entries by month
  const countsByMonth = {};
  entries.forEach(e => {
    const month = e.transaction_date.substring(0, 7); // YYYY-MM
    countsByMonth[month] = (countsByMonth[month] || 0) + 1;
  });
  console.log('\nEntries count by month:');
  console.log(JSON.stringify(countsByMonth, null, 2));

  // Let's get the coas to map names
  const { data: coas } = await supabase.from('coas').select('id, account_code, account_name, account_type');
  const coaMap = {};
  coas.forEach(c => {
    coaMap[c.id] = c;
  });

  // Get all journal lines
  const { data: lines } = await supabase.from('journal_lines').select('account_id, debit_amount, credit_amount, journal_entry_id');
  
  // Calculate revenue and HPP by month
  const financialSummaryByMonth = {};
  const accountBalancesAllTime = {};
  
  lines.forEach(l => {
    const coa = coaMap[l.account_id];
    if (!coa) return;

    const entry = entries.find(e => e.id === l.journal_entry_id);
    if (!entry) return;

    const month = entry.transaction_date.substring(0, 7);
    if (!financialSummaryByMonth[month]) {
      financialSummaryByMonth[month] = {
        revenue: 0,
        hpp: 0,
        otherExpenses: 0,
        otherRevenues: 0
      };
    }

    const netDebitCredit = l.debit_amount - l.credit_amount;
    const netCreditDebit = l.credit_amount - l.debit_amount;

    if (coa.account_code === '4-1000') {
      // Sales Revenue (Credit increases balance)
      financialSummaryByMonth[month].revenue += netCreditDebit;
    } else if (coa.account_code === '5-1000') {
      // HPP Expense (Debit increases balance)
      financialSummaryByMonth[month].hpp += netDebitCredit;
    } else if (coa.account_type === 'Expense') {
      financialSummaryByMonth[month].otherExpenses += netDebitCredit;
    } else if (coa.account_type === 'Revenue') {
      financialSummaryByMonth[month].otherRevenues += netCreditDebit;
    }

    if (!accountBalancesAllTime[coa.account_code]) {
      accountBalancesAllTime[coa.account_code] = {
        name: coa.account_name,
        type: coa.account_type,
        debit: 0,
        credit: 0
      };
    }
    accountBalancesAllTime[coa.account_code].debit += l.debit_amount;
    accountBalancesAllTime[coa.account_code].credit += l.credit_amount;
  });

  console.log('\nFinancial Summary by Month:');
  Object.keys(financialSummaryByMonth).sort().forEach(month => {
    const data = financialSummaryByMonth[month];
    console.log(`Month: ${month}`);
    console.log(`  Sales (4-1000): Rp ${data.revenue.toLocaleString('id-ID')}`);
    console.log(`  HPP (5-1000):   Rp ${data.hpp.toLocaleString('id-ID')}`);
    console.log(`  Other Revenue:  Rp ${data.otherRevenues.toLocaleString('id-ID')}`);
    console.log(`  Other Expense:  Rp ${data.otherExpenses.toLocaleString('id-ID')}`);
    console.log(`  Net Income:     Rp ${(data.revenue + data.otherRevenues - data.hpp - data.otherExpenses).toLocaleString('id-ID')}`);
  });

  console.log('\nAll Account Balances (All Time):');
  Object.keys(accountBalancesAllTime).sort().forEach(code => {
    const act = accountBalancesAllTime[code];
    let balance = 0;
    if (['Asset', 'Expense'].includes(act.type)) {
      balance = act.debit - act.credit;
    } else {
      balance = act.credit - act.debit;
    }
    console.log(`${code} | ${act.name} | Type: ${act.type} | Balance: Rp ${balance.toLocaleString('id-ID')}`);
  });
}

main();

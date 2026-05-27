const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const suffix = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase() === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(dbUrl, dbKey);

const jsonPath = path.join(__dirname, '../data/DISMA_keuangan_20Mei2026.json');
const D = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

async function main() {
  console.log('--- Receivables Audit (Optimized) ---');

  // 1. Calculate stats from JSON
  let jsonPreMayTotalNominal = 0;
  let jsonPreMayTotalPaid = 0;
  let jsonPreMayTotalOutstanding = 0;

  let jsonMayTotalNominal = 0;
  let jsonMayTotalPaid = 0;
  let jsonMayTotalOutstanding = 0;

  D.receivables_outstanding.forEach(r => {
    const isMay = r.tanggal_invoice && r.tanggal_invoice.startsWith('2026-05');
    if (isMay) {
      jsonMayTotalNominal += r.nominal_tagihan;
      jsonMayTotalPaid += r.sudah_dibayar || 0;
      jsonMayTotalOutstanding += r.outstanding;
    } else {
      jsonPreMayTotalNominal += r.nominal_tagihan;
      jsonPreMayTotalPaid += r.sudah_dibayar || 0;
      jsonPreMayTotalOutstanding += r.outstanding;
    }
  });

  console.log('\nFrom JSON receivables_outstanding:');
  console.log(`Pre-May Nominal: Rp ${jsonPreMayTotalNominal.toLocaleString()} | Outstanding: Rp ${jsonPreMayTotalOutstanding.toLocaleString()}`);
  console.log(`May Nominal: Rp ${jsonMayTotalNominal.toLocaleString()} | Outstanding: Rp ${jsonMayTotalOutstanding.toLocaleString()}`);
  console.log(`GRAND TOTAL OUTSTANDING IN JSON: Rp ${(jsonPreMayTotalOutstanding + jsonMayTotalOutstanding).toLocaleString()}`);

  // 2. Fetch from DB (invoices table)
  const { data: dbInvoices, error: invError } = await supabase.from('invoices').select('issue_date, total_amount, amount_paid, status');
  if (invError) return console.error('DB Invoices Error:', invError);

  let dbPreMayNominal = 0;
  let dbPreMayPaid = 0;
  let dbMayNominal = 0;
  let dbMayPaid = 0;

  dbInvoices.forEach(inv => {
    const isMay = inv.issue_date && inv.issue_date.startsWith('2026-05');
    if (isMay) {
      dbMayNominal += Number(inv.total_amount);
      dbMayPaid += Number(inv.amount_paid);
    } else {
      dbPreMayNominal += Number(inv.total_amount);
      dbPreMayPaid += Number(inv.amount_paid);
    }
  });

  console.log('\nFrom DB Invoices Table:');
  console.log(`Pre-May Invoices Total: Rp ${dbPreMayNominal.toLocaleString()} | Paid: Rp ${dbPreMayPaid.toLocaleString()} | Net Outstanding: Rp ${(dbPreMayNominal - dbPreMayPaid).toLocaleString()}`);
  console.log(`May Invoices Total: Rp ${dbMayNominal.toLocaleString()} | Paid: Rp ${dbMayPaid.toLocaleString()} | Net Outstanding: Rp ${(dbMayNominal - dbMayPaid).toLocaleString()}`);
  console.log(`GRAND TOTAL OUTSTANDING IN DB INVOICES: Rp ${(dbPreMayNominal - dbPreMayPaid + dbMayNominal - dbMayPaid).toLocaleString()}`);

  // 3. Fetch all journal entries at once
  const { data: dbEntries, error: entError } = await supabase.from('journal_entries').select('id, reference_type, description, transaction_date');
  if (entError) return console.error('DB Entries Error:', entError);
  const entryMap = new Map();
  dbEntries.forEach(e => entryMap.set(e.id, e));

  // 4. Fetch from DB Journal Lines for Piutang Usaha
  const { data: lines, error: lineError } = await supabase
    .from('journal_lines')
    .select('journal_entry_id, debit_amount, credit_amount')
    .eq('account_id', 'coa-2'); // coa-2 is Piutang Usaha (1-2000)
  
  if (lineError) return console.error('DB Lines Error:', lineError);

  let totalDebit = 0;
  let totalCredit = 0;
  let openingDebit = 0;
  let openingCredit = 0;
  let txDebit = 0;
  let txCredit = 0;

  for (const line of lines) {
    const je = entryMap.get(line.journal_entry_id);
    const dr = Number(line.debit_amount || 0);
    const cr = Number(line.credit_amount || 0);
    totalDebit += dr;
    totalCredit += cr;
    if (je && je.reference_type === 'Opening') {
      openingDebit += dr;
      openingCredit += cr;
    } else {
      txDebit += dr;
      txCredit += cr;
    }
  }

  console.log('\nFrom DB General Ledger (1-2000 / Piutang Usaha):');
  console.log(`Opening Balance (Apr 30): Debit Rp ${openingDebit.toLocaleString()} | Credit Rp ${openingCredit.toLocaleString()} | Net Rp ${(openingDebit - openingCredit).toLocaleString()}`);
  console.log(`Transactions Posting: Debit Rp ${txDebit.toLocaleString()} | Credit Rp ${txCredit.toLocaleString()} | Net Rp ${(txDebit - txCredit).toLocaleString()}`);
  console.log(`LEDGER TOTAL: Debit Rp ${totalDebit.toLocaleString()} | Credit Rp ${totalCredit.toLocaleString()} | Net Balance Rp ${(totalDebit - totalCredit).toLocaleString()}`);

  // Check how much Piutang Usaha payments (PEMASUKAN_PIUTANG) were actually posted in GL
  let totalPaymentsGl = 0;
  for (const line of lines) {
    const je = entryMap.get(line.journal_entry_id);
    if (je && je.reference_type === 'CashTx') {
      totalPaymentsGl += Number(line.credit_amount || 0);
    }
  }
  console.log(`Payments posted in GL (credit amount from CashTx): Rp ${totalPaymentsGl.toLocaleString()}`);
}

main();

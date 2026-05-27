const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const jsonPath = path.join(__dirname, '../data/DISMA_keuangan_20Mei2026.json');
const D = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

function main() {
  console.log('--- Matching Payments in JSON ---');

  // 1. Total payments in transactions_mei (PEMASUKAN_PIUTANG)
  const paymentsMay = D.transactions_mei.filter(t => t.kategori === 'PEMASUKAN_PIUTANG');
  const totalMayCashPayments = paymentsMay.reduce((sum, t) => sum + (t.kas_masuk || 0), 0);
  console.log(`May Cash Transactions (PEMASUKAN_PIUTANG) count: ${paymentsMay.length}`);
  console.log(`May Cash Transactions (PEMASUKAN_PIUTANG) total: Rp ${totalMayCashPayments.toLocaleString()}`);

  // 2. Total already paid in receivables_outstanding
  let totalInvoicePaid = 0;
  let hasPartialPaymentDateCount = 0;
  D.receivables_outstanding.forEach(r => {
    totalInvoicePaid += r.sudah_dibayar || 0;
    if (r.tanggal_bayar_partial) {
      hasPartialPaymentDateCount++;
    }
  });
  console.log(`Total "sudah_dibayar" in receivables: Rp ${totalInvoicePaid.toLocaleString()}`);
  console.log(`Count of receivables with "tanggal_bayar_partial": ${hasPartialPaymentDateCount}`);

  // 3. Print some sample cash payments and invoices to see if we can match them by customer or description
  console.log('\nSample Cash Payments:');
  paymentsMay.slice(0, 5).forEach(p => {
    console.log(`  Date: ${p.tgl} | Account: ${p.akun} | Amount: Rp ${p.kas_masuk.toLocaleString()} | Info: ${p.keterangan}`);
  });

  console.log('\nSample Receivables with partial payments:');
  D.receivables_outstanding.filter(r => r.sudah_dibayar > 0).slice(0, 5).forEach(r => {
    console.log(`  Customer: ${r.customer} | Inv Date: ${r.tanggal_invoice} | Total: Rp ${r.nominal_tagihan.toLocaleString()} | Paid: Rp ${r.sudah_dibayar.toLocaleString()} | Pay Date: ${r.tanggal_bayar_partial}`);
  });
}

main();

const fs = require('fs');

const path = './data/DISMA_keuangan_20Mei2026.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

console.log('=== AUDITING REVENUE AND HPP FROM JSON ===');

// 1. Let's see dates of receivables_outstanding
let totalReceivablesAll = 0;
let totalReceivablesBeforeMay = 0;
let totalReceivablesInMay = 0;

let receivablesInMayList = [];

data.receivables_outstanding.forEach(r => {
  const tgl = r.tanggal_invoice; // e.g. "2026-05-15" or similar
  const nominal = Number(r.nominal_tagihan || 0);
  totalReceivablesAll += nominal;
  
  if (tgl < '2026-05-01') {
    totalReceivablesBeforeMay += nominal;
  } else {
    totalReceivablesInMay += nominal;
    receivablesInMayList.push(r);
  }
});

console.log(`Total Receivables (Outstanding List): Rp ${totalReceivablesAll.toLocaleString('id-ID')}`);
console.log(`  Issued before May 1 (Opening AR): Rp ${totalReceivablesBeforeMay.toLocaleString('id-ID')}`);
console.log(`  Issued in May 1 - 20 (May Sales):   Rp ${totalReceivablesInMay.toLocaleString('id-ID')} (${receivablesInMayList.length} items)`);

// 2. Let's see purchases_mei (Belanja)
let totalPurchasesMei = 0;
data.purchases_mei.forEach(p => {
  totalPurchasesMei += Number(p.harga_total || 0);
});
console.log(`\nTotal Purchases in May (purchases_mei): Rp ${totalPurchasesMei.toLocaleString('id-ID')} (${data.purchases_mei.length} items)`);

// Let's check cash flow actuals for May
let totalCashIn = 0;
let totalCashOut = 0;
let cashInByKategori = {};
let cashOutByKategori = {};

data.transactions_mei.forEach(t => {
  const mas = Number(t.kas_masuk || 0);
  const kel = Number(t.kas_keluar || 0);
  totalCashIn += mas;
  totalCashOut += kel;

  if (mas > 0) {
    cashInByKategori[t.kategori] = (cashInByKategori[t.kategori] || 0) + mas;
  }
  if (kel > 0) {
    cashOutByKategori[t.kategori] = (cashOutByKategori[t.kategori] || 0) + kel;
  }
});

console.log('\n=== CASH FLOW SUMMARY (MAY 1 - 20) ===');
console.log(`Total Cash In: Rp ${totalCashIn.toLocaleString('id-ID')}`);
console.log('Cash In by Category:');
for (const [k, val] of Object.entries(cashInByKategori)) {
  console.log(`  ${k}: Rp ${val.toLocaleString('id-ID')}`);
}
console.log(`Total Cash Out: Rp ${totalCashOut.toLocaleString('id-ID')}`);
console.log('Cash Out by Category:');
for (const [k, val] of Object.entries(cashOutByKategori)) {
  console.log(`  ${k}: Rp ${val.toLocaleString('id-ID')}`);
}

// Let's look at payables_vendor_estimate
let totalBelanjaVendor = 0;
let totalBayarVendor = 0;
let totalHutangOutstanding = 0;
data.payables_vendor_estimate.forEach(v => {
  totalBelanjaVendor += Number(v.belanja_mei_1_20 || 0);
  totalBayarVendor += Number(v.bayar_mei_1_20 || 0);
  totalHutangOutstanding += Number(v.estimasi_hutang_outstanding || 0);
});

console.log('\n=== PAYABLES VENDOR ESTIMATE ===');
console.log(`Total Belanja Mei 1-20: Rp ${totalBelanjaVendor.toLocaleString('id-ID')}`);
console.log(`Total Bayar Mei 1-20: Rp ${totalBayarVendor.toLocaleString('id-ID')}`);
console.log(`Total Estimasi Hutang Outstanding: Rp ${totalHutangOutstanding.toLocaleString('id-ID')}`);

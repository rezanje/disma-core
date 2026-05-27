const fs = require('fs');

const raw = fs.readFileSync('data/DISMA_keuangan_20Mei2026.json', 'utf8');
const D = JSON.parse(raw);

console.log('=== ALL FRESH BOX DATA IN JSON ===\n');

// 1. Check in receivables_outstanding
console.log('--- Receivables Outstanding ---');
let arCount = 0;
let arTotal = 0;
D.receivables_outstanding.forEach((r, idx) => {
  if (r.customer && r.customer.toLowerCase().includes('fresh')) {
    arCount++;
    arTotal += r.nominal_tagihan;
    console.log(`[AR #${idx+1}] Invoice Date: ${r.tanggal_invoice} | Customer: ${r.customer} | Nominal: Rp ${r.nominal_tagihan.toLocaleString()} | Paid: Rp ${(r.sudah_dibayar || 0).toLocaleString()} | Outstanding: Rp ${r.outstanding.toLocaleString()} | Pay Date: ${r.tanggal_bayar_partial || 'N/A'}`);
  }
});
console.log(`Total Fresh Box Invoices: ${arCount} | Total Amount: Rp ${arTotal.toLocaleString()}\n`);

// 2. Check in purchases_mei
console.log('--- Purchases Mei ---');
let purCount = 0;
D.purchases_mei.forEach((p, idx) => {
  if (p.supplier && p.supplier.toLowerCase().includes('fresh')) {
    purCount++;
    console.log(`[Purchase #${idx+1}] Supplier: ${p.supplier} | Total: Rp ${(p.harga_total || 0).toLocaleString()}`);
  }
});
console.log(`Total Fresh Box Purchases in purchases_mei: ${purCount}\n`);

// 3. Check in payables_vendor_estimate
console.log('--- Payables Vendor Estimate ---');
let apCount = 0;
D.payables_vendor_estimate.forEach((v, idx) => {
  if (v.supplier && v.supplier.toLowerCase().includes('fresh')) {
    apCount++;
    console.log(`[AP #${idx+1}] Supplier: ${v.supplier} | Belanja Mei: Rp ${(v.belanja_mei_1_20 || 0).toLocaleString()} | Bayar Mei: Rp ${(v.bayar_mei_1_20 || 0).toLocaleString()} | Outstanding: Rp ${(v.estimasi_hutang_outstanding || 0).toLocaleString()}`);
  }
});
console.log(`Total Fresh Box AP Estimates: ${apCount}\n`);

// 4. Check in transactions_mei
console.log('--- Transactions Mei (Cash Flow) ---');
let txInCount = 0, txOutCount = 0;
let txInTotal = 0, txOutTotal = 0;
D.transactions_mei.forEach((t, idx) => {
  const desc = t.keterangan || '';
  const cat = t.kategori || '';
  const mas = Number(t.kas_masuk || 0);
  const kel = Number(t.kas_keluar || 0);

  const matchesFreshBox = desc.toLowerCase().includes('fresh') || cat.toLowerCase().includes('fresh');
  if (matchesFreshBox) {
    if (mas > 0) {
      txInCount++;
      txInTotal += mas;
      console.log(`[Tx #${idx+1} IN] Date: ${t.tgl} | Account: ${t.akun} | Amount: Rp ${mas.toLocaleString()} | Cat: ${cat} | Desc: ${desc}`);
    } else {
      txOutCount++;
      txOutTotal += kel;
      console.log(`[Tx #${idx+1} OUT] Date: ${t.tgl} | Account: ${t.akun} | Amount: Rp ${kel.toLocaleString()} | Cat: ${cat} | Desc: ${desc}`);
    }
  }
});
console.log(`\nTotal Cash In from Fresh Box: ${txInCount} | Total Amount: Rp ${txInTotal.toLocaleString()}`);
console.log(`Total Cash Out for Fresh Box: ${txOutCount} | Total Amount: Rp ${txOutTotal.toLocaleString()}`);

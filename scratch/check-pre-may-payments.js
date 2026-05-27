const fs = require('fs');
const path = './data/DISMA_keuangan_20Mei2026.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

let preMayNominal = 0;
let preMayPaid = 0;
let preMayOutstanding = 0;

data.receivables_outstanding.forEach(r => {
  if (r.tanggal_invoice < '2026-05-01') {
    preMayNominal += Number(r.nominal_tagihan || 0);
    preMayPaid += Number(r.sudah_dibayar || 0);
    preMayOutstanding += Number(r.outstanding || 0);
  }
});

console.log('=== Pre-May Invoices Status ===');
console.log(`Nominal Tagihan: Rp ${preMayNominal.toLocaleString()}`);
console.log(`Sudah Dibayar (hingga 20 Mei): Rp ${preMayPaid.toLocaleString()}`);
console.log(`Outstanding:     Rp ${preMayOutstanding.toLocaleString()}`);

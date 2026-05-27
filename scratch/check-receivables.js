const fs = require('fs');
const path = './data/DISMA_keuangan_20Mei2026.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

let totalNominal = 0;
let totalPaid = 0;
let totalOutstanding = 0;

let beforeMayOutstanding = 0;
let inMayOutstanding = 0;

data.receivables_outstanding.forEach(r => {
  const nominal = Number(r.nominal_tagihan || 0);
  const paid = Number(r.sudah_dibayar || 0);
  const out = Number(r.outstanding || 0);
  
  totalNominal += nominal;
  totalPaid += paid;
  totalOutstanding += out;
  
  if (r.tanggal_invoice < '2026-05-01') {
    beforeMayOutstanding += out;
  } else {
    inMayOutstanding += out;
  }
});

console.log(`Receivables Outstanding List Summary:`);
console.log(`  Total Nominal Tagihan: Rp ${totalNominal.toLocaleString('id-ID')}`);
console.log(`  Total Sudah Dibayar:   Rp ${totalPaid.toLocaleString('id-ID')}`);
console.log(`  Total Outstanding:     Rp ${totalOutstanding.toLocaleString('id-ID')}`);
console.log(`  Before May Outstanding:Rp ${beforeMayOutstanding.toLocaleString('id-ID')}`);
console.log(`  In May Outstanding:    Rp ${inMayOutstanding.toLocaleString('id-ID')}`);

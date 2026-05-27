const fs = require('fs');
const D = JSON.parse(fs.readFileSync('data/DISMA_keuangan_20Mei2026.json', 'utf8'));

let sumBelanja = 0;
let sumBayar = 0;
let sumOutstanding = 0;
D.payables_vendor_estimate.forEach(v => {
  sumBelanja += v.belanja_mei_1_20 || 0;
  sumBayar += v.bayar_mei_1_20 || 0;
  sumOutstanding += v.estimasi_hutang_outstanding || 0;
});

console.log("Sum Belanja:", sumBelanja);
console.log("Sum Bayar:", sumBayar);
console.log("Sum Outstanding:", sumOutstanding);

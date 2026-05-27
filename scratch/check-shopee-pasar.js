const fs = require('fs');
const D = JSON.parse(fs.readFileSync('data/DISMA_keuangan_20Mei2026.json', 'utf8'));

console.log("=== PASAR TXS ===");
D.transactions_mei.filter(t => t.keterangan && t.keterangan.toLowerCase().includes('pasar')).forEach(t => {
  console.log(t);
});

console.log("\n=== SHOPEE TXS ===");
let shopeeSum = 0;
D.transactions_mei.filter(t => t.keterangan && t.keterangan.toLowerCase().includes('shopee')).forEach(t => {
  console.log(t);
  shopeeSum += t.kas_keluar || 0;
});
console.log("Total Shopee Outflow:", shopeeSum);

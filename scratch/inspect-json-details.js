const fs = require('fs');
const D = JSON.parse(fs.readFileSync('data/DISMA_keuangan_20Mei2026.json', 'utf8'));

console.log("=== JSON METADATA ===");
console.log(D.metadata);

console.log("\n=== PAYABLES VENDOR ESTIMATE ===");
console.log(JSON.stringify(D.payables_vendor_estimate, null, 2));

console.log("\n=== PAYABLES PERSONAL ===");
console.log(JSON.stringify(D.payables_personal, null, 2));

console.log("\n=== TRANSACTIONS MEI SUMMARY ===");
const categories = {};
D.transactions_mei.forEach(t => {
  const cat = t.kategori || 'UNKNOWN';
  if (!categories[cat]) categories[cat] = { in: 0, out: 0, count: 0 };
  categories[cat].in += t.kas_masuk || 0;
  categories[cat].out += t.kas_keluar || 0;
  categories[cat].count++;
});
console.log(categories);

console.log("\n=== CHECKING VENDORS IN TRANSACTIONS ===");
const suppliersFound = new Set();
D.transactions_mei.forEach(t => {
  if (t.keterangan) {
    const suppliers = ['aldiansyah', 'AA Utom', 'kevin', 'PESEK', 'SUMINTO', 'TASMI FRESH', 'ALFATIH', 'DELTAFOOD', 'HIJRAH', 'LESTARI', 'PAK ANDI', 'SAFIRA', 'SHOPEE', 'TOKO ERNI', 'TOKO OMO', 'RAFFLESIA', 'TOKOPEDIA'];
    suppliers.forEach(s => {
      if (t.keterangan.toLowerCase().includes(s.toLowerCase())) {
        suppliersFound.add(s);
      }
    });
  }
});
console.log("Suppliers found in transactions:", Array.from(suppliersFound));

const fs = require('fs');
const D = JSON.parse(fs.readFileSync('data/DISMA_keuangan_20Mei2026.json', 'utf8'));

console.log("=== OPEX TRANSACTIONS IN JSON ===");
const categories = ['KENDARAAN', 'ONGKIR_KIRIM', 'GAJI_OPERASIONAL_KARYAWAN', 'UTILITIES', 'MARKETING', 'OPERASIONAL_KANTOR', 'LAINNYA'];

categories.forEach(cat => {
  const txs = D.transactions_mei.filter(t => t.kategori === cat);
  const total = txs.reduce((sum, t) => sum + (t.kas_keluar || 0), 0);
  console.log(`${cat}: total=${total}, count=${txs.length}`);
});

console.log("\n=== VEHICLE / KENDARAAN DETAIL ===");
D.transactions_mei.filter(t => t.kategori === 'KENDARAAN').forEach(t => console.log(t));

console.log("\n=== OPERASIONAL_KANTOR DETAIL ===");
D.transactions_mei.filter(t => t.kategori === 'OPERASIONAL_KANTOR').forEach(t => console.log(t));

const fs = require('fs');
const D = JSON.parse(fs.readFileSync('data/DISMA_keuangan_20Mei2026.json', 'utf8'));

const keywords = ['bbm', 'bensin', 'toll', 'e-toll', 'kuli', 'lembur', 'plastik', 'packing', 'parkir', 'perawatan', 'grandmax', 'service', 'lain-lain', 'tco', 'tcl'];

console.log("=== KEYWORD SEARCH IN JSON TRANSACTIONS ===");
D.transactions_mei.forEach((t, idx) => {
  const desc = (t.keterangan || '').toLowerCase();
  const matched = keywords.filter(kw => desc.includes(kw));
  if (matched.length > 0) {
    console.log(`[Row ${idx+1}] date=${t.tgl} desc="${t.keterangan}" out=${t.kas_keluar} cat=${t.kategori}`);
  }
});

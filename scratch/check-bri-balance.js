const fs = require('fs');
const path = require('path');
const jsonPath = path.join(__dirname, '../data/DISMA_keuangan_20Mei2026.json');
const D = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

function main() {
  console.log('BRI Transactions near Row 277:');
  const briTxs = D.transactions_mei.filter(t => t.akun === 'BRI');
  
  // Find index of row tx-import-0277
  const idx = D.transactions_mei.findIndex((t, i) => `tx-import-${String(i+1).padStart(4, '0')}` === 'tx-import-0277');
  console.log(`Index in all transactions: ${idx}`);
  
  // Let's filter BRI transactions and find where tx-import-0277 is
  const briIdx = briTxs.findIndex(t => t.keterangan.includes('Fresh Box') && t.tgl === '2026-05-06');
  console.log(`Index in BRI transactions: ${briIdx}`);
  
  // Show 5 transactions before and after in BRI
  const start = Math.max(0, briIdx - 3);
  const end = Math.min(briTxs.length, briIdx + 4);
  
  for (let i = start; i < end; i++) {
    const t = briTxs[i];
    console.log(`[${i}] Date: ${t.tgl} | Desc: ${t.keterangan} | In: ${t.kas_masuk} | Out: ${t.kas_keluar} | Balance: ${t.saldo_setelah_trans} | Category: ${t.kategori}`);
  }
}

main();

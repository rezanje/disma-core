const fs = require('fs');
const path = require('path');
const jsonPath = path.join(__dirname, '../data/DISMA_keuangan_20Mei2026.json');
const D = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

function checkNear(txId, bankName) {
  console.log(`\n--- Transactions near ${txId} (${bankName}) ---`);
  const txs = D.transactions_mei.filter(t => t.akun === bankName);
  const idx = D.transactions_mei.findIndex((t, i) => `tx-import-${String(i+1).padStart(4, '0')}` === txId);
  const bankIdx = txs.findIndex(t => t.tgl === D.transactions_mei[idx].tgl && t.keterangan === D.transactions_mei[idx].keterangan);
  
  const start = Math.max(0, bankIdx - 2);
  const end = Math.min(txs.length, bankIdx + 3);
  
  for (let i = start; i < end; i++) {
    const t = txs[i];
    console.log(`[${i}] Date: ${t.tgl} | Desc: ${t.keterangan} | In: ${t.kas_masuk} | Out: ${t.kas_keluar} | Balance: ${t.saldo_setelah_trans} | Cat: ${t.kategori}`);
  }
}

checkNear('tx-import-0277', 'BRI');
checkNear('tx-import-0380', 'BRI');
checkNear('tx-import-0398', 'MANDIRI');

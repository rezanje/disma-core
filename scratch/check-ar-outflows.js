const fs = require('fs');
const path = './data/DISMA_keuangan_20Mei2026.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

console.log('=== PEMASUKAN_PIUTANG Cash Out Transactions ===');
data.transactions_mei.forEach((t, idx) => {
  if (t.kategori === 'PEMASUKAN_PIUTANG' && t.kas_keluar > 0) {
    console.log(`Index: ${idx}, Date: ${t.tgl}, Account: ${t.akun}, Outflow: Rp ${t.kas_keluar.toLocaleString()}, Desc: ${t.keterangan}`);
  }
});

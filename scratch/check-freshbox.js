const fs = require('fs');
const path = require('path');
const jsonPath = path.join(__dirname, '../data/DISMA_keuangan_20Mei2026.json');
const D = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

function main() {
  console.log('--- All Fresh Box Transactions in JSON ---');
  const freshBoxTxs = D.transactions_mei.filter(t => t.keterangan.toUpperCase().includes('FRESH BOX'));
  console.log(`Count: ${freshBoxTxs.length}`);
  
  freshBoxTxs.forEach(t => {
    console.log(`Date: ${t.tgl} | Account: ${t.akun} | In: Rp ${t.kas_masuk.toLocaleString()} | Out: Rp ${t.kas_keluar.toLocaleString()} | Balance: Rp ${t.saldo_setelah_trans.toLocaleString()} | Desc: ${t.keterangan}`);
  });

  console.log('\n--- Fresh Box Receivables in JSON ---');
  const freshBoxRec = D.receivables_outstanding.filter(r => r.customer.toUpperCase().includes('FRESH BOX'));
  console.log(`Count: ${freshBoxRec.length}`);
  freshBoxRec.forEach(r => {
    console.log(`Date: ${r.tanggal_invoice} | Total: Rp ${r.nominal_tagihan.toLocaleString()} | Paid: Rp ${r.sudah_dibayar.toLocaleString()} | Outstanding: Rp ${r.outstanding.toLocaleString()} | Pay Date: ${r.tanggal_bayar_partial}`);
  });
}

main();

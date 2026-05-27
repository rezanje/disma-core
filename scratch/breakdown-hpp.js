const fs = require('fs');

const raw = fs.readFileSync('data/DISMA_keuangan_20Mei2026.json', 'utf8');
const D = JSON.parse(raw);

console.log('=== BREAKDOWN OF HPP (5-1000) COMPONENTS FROM JSON ===\n');

let totalBelanjaVendor = 0;
let totalFreshBoxOutflows = 0;

const belanjaList = [];
const freshBoxList = [];

D.transactions_mei.forEach((t, idx) => {
  const mas = Number(t.kas_masuk || 0);
  const kel = Number(t.kas_keluar || 0);
  const isOutflow = kel > 0;
  const amount = isOutflow ? kel : mas;
  
  if (isOutflow) {
    if (t.kategori === 'BELANJA_BARANG_VENDOR') {
      totalBelanjaVendor += amount;
      belanjaList.push({ idx: idx + 1, ...t, amount });
    } else if (t.kategori === 'PEMASUKAN_PIUTANG') {
      totalFreshBoxOutflows += amount;
      freshBoxList.push({ idx: idx + 1, ...t, amount });
    }
  }
});

console.log(`1. BELANJA_BARANG_VENDOR Outflows (Total: Rp ${totalBelanjaVendor.toLocaleString('id-ID')})`);
console.log('--------------------------------------------------------------------------------');
belanjaList.forEach(item => {
  console.log(`[Tx #${item.idx}] Date: ${item.tgl} | Account: ${item.akun} | Amount: Rp ${item.amount.toLocaleString('id-ID')} | Desc: ${item.keterangan}`);
});

console.log(`\n2. FRESH BOX Miscategorized Outflows (Total: Rp ${totalFreshBoxOutflows.toLocaleString('id-ID')})`);
console.log('--------------------------------------------------------------------------------');
freshBoxList.forEach(item => {
  console.log(`[Tx #${item.idx}] Date: ${item.tgl} | Account: ${item.akun} | Amount: Rp ${item.amount.toLocaleString('id-ID')} | Desc: ${item.keterangan}`);
});

console.log('\n=== SUMMARY ===');
console.log(`Total HPP = Belanja Vendor (Rp ${totalBelanjaVendor.toLocaleString('id-ID')}) + Fresh Box Outflows (Rp ${totalFreshBoxOutflows.toLocaleString('id-ID')})`);
console.log(`Total HPP = Rp ${(totalBelanjaVendor + totalFreshBoxOutflows).toLocaleString('id-ID')}`);

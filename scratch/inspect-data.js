const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '../data/DISMA_keuangan_20Mei2026.json');
const D = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const mayInvoices = D.receivables_outstanding.filter(r => r.tanggal_invoice && r.tanggal_invoice.startsWith('2026-05'));
console.log(`May invoices in receivables_outstanding count: ${mayInvoices.length}`);

let totalMayNominal = 0;
mayInvoices.forEach(inv => {
  totalMayNominal += inv.nominal_tagihan;
});
console.log(`Total May Nominal Tagihan: Rp ${totalMayNominal.toLocaleString()}`);

if (mayInvoices.length > 0) {
  console.log('Sample May invoice:', mayInvoices[0]);
}

// Let's also check all invoices in receivables_outstanding that are outstanding
let totalOutstanding = 0;
D.receivables_outstanding.forEach(r => {
  totalOutstanding += r.outstanding;
});
console.log(`Total Outstanding in JSON: Rp ${totalOutstanding.toLocaleString()}`);

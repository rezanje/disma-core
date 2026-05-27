const fs = require('fs');

const raw = fs.readFileSync('data/DISMA_keuangan_20Mei2026.json', 'utf8');
const D = JSON.parse(raw);

const isoDate = (d) => {
  if (!d) return null;
  if (typeof d !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
    return d.length === 10 ? `${d}T00:00:00.000Z` : d;
  }
  const m = d.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',mei:'05',jun:'06',jul:'07',aug:'08',agu:'08',sep:'09',oct:'10',okt:'10',nov:'11',dec:'12',des:'12' };
    const mo = months[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2,'0')}T00:00:00.000Z`;
  }
  const t = Date.parse(d);
  if (!isNaN(t)) return new Date(t).toISOString();
  return null;
};

let totalMeiInvoices = 0;
let totalParsedMeiInvoices = 0;
let totalNominalRaw = 0;
let totalNominalParsed = 0;

D.receivables_outstanding.forEach((r, idx) => {
  const parsedDate = isoDate(r.tanggal_invoice);
  const nominal = Number(r.nominal_tagihan || 0);

  // Check if original date looks like May or if parsed date is in May
  const isMayOriginal = r.tanggal_invoice && (r.tanggal_invoice.toLowerCase().includes('may') || r.tanggal_invoice.toLowerCase().includes('mei') || r.tanggal_invoice.includes('-05-') || r.tanggal_invoice.startsWith('2026-05'));
  const isMayParsed = parsedDate && parsedDate >= '2026-05-01';

  if (isMayOriginal) {
    totalMeiInvoices++;
    totalNominalRaw += nominal;
  }

  if (isMayParsed) {
    totalParsedMeiInvoices++;
    totalNominalParsed += nominal;
  }

  if (isMayOriginal || isMayParsed) {
    console.log(`Idx: ${idx + 1} | Customer: ${r.customer} | Raw Date: ${r.tanggal_invoice} | Parsed: ${parsedDate} | Nominal: Rp ${nominal.toLocaleString()} | Matches May condition? Original: ${isMayOriginal}, Parsed: ${isMayParsed}`);
  }
});

console.log(`\n=== SUMMARY ===`);
console.log(`Original May Invoices Count: ${totalMeiInvoices} | Total Nominal: Rp ${totalNominalRaw.toLocaleString()}`);
console.log(`Parsed May Invoices Count: ${totalParsedMeiInvoices} | Total Nominal: Rp ${totalNominalParsed.toLocaleString()}`);

import assert from 'node:assert/strict';
import { reportProblems, type ReportInput } from './shopping-report';

const NAMA: Record<string, string> = { cabe: 'Cabe', apel: 'Apel' };
const nama = (id: string) => NAMA[id] || id;

const baris = (over: Partial<ReportInput['lines'][0]> = {}) => ({
  id: 'L1', productId: 'cabe', purchaseId: 'P1',
  isChecked: true, actualUnitPrice: 40000, qtyPurchased: 5,
  vendorId: 'v1', paymentMethod: 'Cash' as const,
  ...over,
});

const dasar: ReportInput = {
  purchaseIds: ['P1'],
  lines: [baris()],
  pocketBankAccountId: 'kantong-hilman',
  onBehalfOfUserId: null,
  proofImage: null,
};

// laporan yang diisi sendiri, lengkap -> boleh
assert.deepEqual(reportProblems(dasar, nama, 'u-hilman'), []);

// vendor kosong
assert.match(reportProblems({ ...dasar, lines: [baris({ vendorId: null })] }, nama, 'u1')[0], /Vendor belum diisi: Cabe/);

// harga kosong
assert.match(reportProblems({ ...dasar, lines: [baris({ actualUnitPrice: 0 })] }, nama, 'u1')[0], /Harga beli belum diisi/);

// baris yang tidak jadi dibeli tidak menahan apa pun
assert.deepEqual(reportProblems({ ...dasar, lines: [baris({ isChecked: false, vendorId: null, actualUnitPrice: 0 })] }, nama, 'u1'), []);

// tunai tanpa kantong
assert.match(reportProblems({ ...dasar, pocketBankAccountId: null }, nama, 'u1')[0], /kantong siapa/);
// tempo dan transfer tidak menarik tunai, jadi tidak butuh kantong
assert.deepEqual(reportProblems({ ...dasar, pocketBankAccountId: null, lines: [baris({ paymentMethod: 'Tempo' })] }, nama, 'u1'), []);
assert.deepEqual(reportProblems({ ...dasar, pocketBankAccountId: null, lines: [baris({ paymentMethod: 'Transfer' })] }, nama, 'u1'), []);

// harga di atas batas tanpa alasan
const batas = new Map([['L1', 35000]]);
assert.match(reportProblems({ ...dasar, ceilings: batas }, nama, 'u1')[0], /di atas batas/);
// dengan alasan -> lolos
assert.deepEqual(reportProblems({ ...dasar, ceilings: batas, lines: [baris({ overCeilingReason: 'cabe lagi mahal' })] }, nama, 'u1'), []);

// menyalin punya orang lain wajib foto kertasnya
assert.match(reportProblems({ ...dasar, onBehalfOfUserId: 'u-hilman' }, nama, 'u-sifa').join(' '), /[Ff]oto/);
assert.deepEqual(reportProblems({ ...dasar, onBehalfOfUserId: 'u-hilman', proofImage: 'data:image/png;base64,x' }, nama, 'u-sifa'), []);

// beberapa masalah dilaporkan sekaligus, bukan satu per satu tiap kali diklik
const banyak = reportProblems(
  { ...dasar, pocketBankAccountId: null, lines: [baris({ vendorId: null })] },
  nama, 'u1',
);
assert.equal(banyak.length, 2, 'vendor kosong + kantong belum dipilih');

// harga nol membuat belanjanya nol rupiah, jadi kantong memang belum diperlukan —
// yang dikeluhkan cuma vendor dan harganya, bukan kantongnya.
const nolRupiah = reportProblems(
  { ...dasar, pocketBankAccountId: null, lines: [baris({ vendorId: null, actualUnitPrice: 0 })] },
  nama, 'u1',
);
assert.equal(nolRupiah.length, 2);
assert.ok(!nolRupiah.some(m => /kantong/.test(m)));

console.log('shopping-report: OK');

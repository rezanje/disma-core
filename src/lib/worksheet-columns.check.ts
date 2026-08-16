import assert from 'node:assert/strict';
import { worksheetColumns, columnOffsets, WorksheetKind } from './worksheet-columns';

// Semua lembar dicetak landscape A4 (297mm) dengan margin 14mm kiri-kanan. Kolom yang
// melewati batas tercetak di luar kertas dan tidak terlihat sama sekali — dan itu baru
// ketahuan setelah orang berdiri di pasar memegang kertasnya.
const START_X = 16;
const RIGHT_EDGE = 297 - 14;
(['belanja', 'qc', 'serah-terima'] as WorksheetKind[]).forEach(kind => {
  const cols = worksheetColumns(kind);
  const offsets = columnOffsets(cols, START_X);
  const end = offsets[offsets.length - 1] + cols[cols.length - 1].width;
  assert.ok(end <= RIGHT_EDGE, `lembar "${kind}" selebar ${end}mm, melewati batas ${RIGHT_EDGE}mm`);
  assert.deepEqual(offsets[0], START_X);
});

const belanja = worksheetColumns('belanja');
const headers = belanja.map(c => c.header);

// kolom tulis tangan harus ada, dan urutannya sama dengan urutan pengisian di layar
assert.deepEqual(
  belanja.filter(c => c.handwritten).map(c => c.header),
  ['Harga Beli Asli', 'Qty Asli', 'Vendor', 'Catatan'],
);

// kolom cetak mendahului kolom tulis tangan — orang mengisi ke kanan, tidak melompat
const firstHandwritten = belanja.findIndex(c => c.handwritten);
assert.ok(belanja.slice(0, firstHandwritten).every(c => !c.handwritten));
assert.ok(headers.includes('SKU') && headers.includes('Nama Barang') && headers.includes('Qty Beli'));

assert.deepEqual(
  worksheetColumns('qc').filter(c => c.handwritten).map(c => c.header),
  ['Qty Lolos', 'Qty Reject', 'Alasan', 'Tujuan Reject'],
);
assert.deepEqual(
  worksheetColumns('serah-terima').filter(c => c.handwritten).map(c => c.header),
  ['Qty Diterima', 'Qty Ditolak', 'Alasan'],
);

console.log('worksheet-columns: OK');

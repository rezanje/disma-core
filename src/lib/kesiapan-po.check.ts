import assert from 'node:assert/strict';
import { barisSiap, sisaTerutang, kesiapan, labelKesiapan } from './kesiapan-po';

// --- sisa terutang ---
assert.equal(sisaTerutang({ id: 'a', qty: 10 }), 10);
assert.equal(sisaTerutang({ id: 'a', qty: 10, qtyDelivered: 4 }), 6);
assert.equal(sisaTerutang({ id: 'a', qty: 10, qtyDelivered: 10 }), 0);
assert.equal(sisaTerutang({ id: 'a', qty: 10, qtyDelivered: 99 }), 0); // tidak pernah negatif

// --- baris siap kalau QC sudah menyentuhnya ---
assert.equal(barisSiap({ id: 'a', qty: 10, qtyFinal: 10 }), true);
assert.equal(barisSiap({ id: 'a', qty: 10, qtyFinal: 7 }), true);   // lolos sebagian tetap siap
// qtyFinal 0 = "kosong di pasar", keputusan yang sudah diambil — bukan belum diperiksa.
assert.equal(barisSiap({ id: 'a', qty: 10, qtyFinal: 0 }), true);
assert.equal(barisSiap({ id: 'a', qty: 10 }), false);
assert.equal(barisSiap({ id: 'a', qty: 10, qtyFinal: null }), false);
// tidak ada sisa terutang: tidak perlu menunggu QC sama sekali
assert.equal(barisSiap({ id: 'a', qty: 10, qtyDelivered: 10 }), true);

// --- rekap satu PO ---
const campur = kesiapan([
  { id: '1', qty: 5, qtyFinal: 5 },
  { id: '2', qty: 3, qtyFinal: 3 },
  { id: '3', qty: 4 },                 // masih ditunggu
]);
assert.deepEqual(campur, { total: 3, siap: 2, belum: 1, lengkap: false });
assert.match(labelKesiapan(campur), /2 dari 3 barang siap/);
assert.match(labelKesiapan(campur), /1 masih ditunggu/);

const penuh = kesiapan([{ id: '1', qty: 5, qtyFinal: 5 }]);
assert.equal(penuh.lengkap, true);
assert.equal(labelKesiapan(penuh), '1 barang siap');

const kosong = kesiapan([]);
assert.deepEqual(kosong, { total: 0, siap: 0, belum: 0, lengkap: false });
assert.equal(labelKesiapan(kosong), 'Tidak ada barang');

console.log('kesiapan-po: OK');

import assert from 'node:assert/strict';
import { pendingEdits, hasPendingEdits } from './order-edits';

const ITEMS = [
  { id: 'a', qty: 2, unitPrice: 174000 },
  { id: 'b', qty: 2, unitPrice: 30000 },
  { id: 'c', qty: 3, unitPrice: 42000 },
];
// Modal mengisi SEMUA baris saat dibuka, bukan cuma yang disentuh — jadi "ada isinya"
// tidak sama dengan "ada yang berubah". Itu sebabnya tombolnya dulu tidak bisa
// membedakan sudah diedit atau belum.
const asOpened = { a: { qty: 2, price: 174000 }, b: { qty: 2, price: 30000 }, c: { qty: 3, price: 42000 } };

assert.deepEqual(pendingEdits(ITEMS, asOpened), []);
assert.equal(hasPendingEdits(ITEMS, asOpened), false);

// qty berubah
assert.deepEqual(pendingEdits(ITEMS, { ...asOpened, b: { qty: 5, price: 30000 } }), ['b']);
// harga berubah
assert.deepEqual(pendingEdits(ITEMS, { ...asOpened, a: { qty: 2, price: 180000 } }), ['a']);
// dua-duanya, urut sesuai urutan baris
assert.deepEqual(
  pendingEdits(ITEMS, { ...asOpened, c: { qty: 1, price: 42000 }, a: { qty: 9, price: 174000 } }),
  ['a', 'c'],
);

// angka berbentuk teks dari input tidak dianggap berubah
assert.deepEqual(pendingEdits(ITEMS, { ...asOpened, a: { qty: '2' as never, price: '174000' as never } }), []);

// baris tanpa entri edit diabaikan; entri untuk baris yang sudah dihapus juga
assert.deepEqual(pendingEdits(ITEMS, {}), []);
assert.deepEqual(pendingEdits(ITEMS, { hilang: { qty: 99, price: 1 } }), []);
assert.deepEqual(pendingEdits([], asOpened), []);

console.log('order-edits: OK');

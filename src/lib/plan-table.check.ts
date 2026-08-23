import assert from 'node:assert/strict';
import { sortRows, groupRows, rowValue, toggleAll } from './plan-table';

const NAMA: Record<string, string> = { p1: 'Cabe', p2: 'Apel', p3: 'Bawang' };
const nameOf = (r: { productId: string }) => NAMA[r.productId] || r.productId;

const ROWS = [
  { id: 'a', productId: 'p1', qtyTarget: 5, estimatedUnitPrice: 40000, plannedVendorId: 'v1', salesOrderId: 'so1', paymentMethod: 'Cash', purchaseMethod: 'Pasar' },
  { id: 'b', productId: 'p2', qtyTarget: 20, estimatedUnitPrice: 10000, salesOrderId: 'so1', paymentMethod: 'Tempo', purchaseMethod: 'Vendor' },
  { id: 'c', productId: 'p3', qtyTarget: 2, estimatedUnitPrice: 30000, plannedVendorId: 'v1', salesOrderId: 'so2' },
];

const labels = {
  vendorName: (id?: string | null) => (id === 'v1' ? 'Toko Mamen' : 'Vendor lain'),
  poName: (id?: string | null) => (id === 'so1' ? 'PO-001' : 'PO-002'),
};

// --- nilai baris ---
assert.equal(rowValue(ROWS[0]), 200000);
assert.equal(rowValue(ROWS[1]), 200000);
assert.equal(rowValue({ id: 'x', productId: 'p1' }), 0);

// --- urutan ---
assert.deepEqual(sortRows(ROWS, 'nama', nameOf).map(r => r.id), ['b', 'c', 'a']); // Apel, Bawang, Cabe
assert.deepEqual(sortRows(ROWS, 'qty', nameOf).map(r => r.id), ['b', 'a', 'c']);  // terbanyak dulu
assert.deepEqual(sortRows(ROWS, 'harga', nameOf).map(r => r.id), ['a', 'c', 'b']); // termahal dulu
assert.deepEqual(sortRows(ROWS, 'nilai', nameOf).map(r => r.id).slice(2), ['c']);   // c paling kecil
// sortRows tidak boleh mengubah urutan aslinya
assert.deepEqual(ROWS.map(r => r.id), ['a', 'b', 'c']);

// --- pengelompokan ---
assert.deepEqual(groupRows(ROWS, 'none', labels).map(g => g.rows.length), [3]);

const perVendor = groupRows(ROWS, 'vendor', labels);
assert.deepEqual(perVendor.map(g => g.label), ['Vendor belum dipilih', 'Toko Mamen']);
assert.deepEqual(perVendor[0].rows.map(r => r.id), ['b']);
assert.deepEqual(perVendor[1].rows.map(r => r.id), ['a', 'c']);

const perPo = groupRows(ROWS, 'po', labels);
assert.deepEqual(perPo.map(g => g.label), ['PO-001', 'PO-002']);

const perBayar = groupRows(ROWS, 'bayar', labels);
assert.deepEqual(perBayar.map(g => g.label), ['Cara bayar belum dipilih', 'Cash', 'Tempo']);

const perJalur = groupRows(ROWS, 'jalur', labels);
assert.deepEqual(perJalur.map(g => g.label), ['Jalur beli belum dipilih', 'Pasar', 'Vendor']);

// tidak ada baris yang hilang atau dobel waktu dikelompokkan
for (const key of ['vendor', 'po', 'bayar', 'jalur'] as const) {
  const ids = groupRows(ROWS, key, labels).flatMap(g => g.rows.map(r => r.id)).sort();
  assert.deepEqual(ids, ['a', 'b', 'c'], `kelompok ${key} kehilangan/menggandakan baris`);
}

// --- centang semua ---
assert.deepEqual([...toggleAll(['a', 'b'], new Set())].sort(), ['a', 'b']);
assert.deepEqual([...toggleAll(['a', 'b'], new Set(['a', 'b']))], []);
// sebagian tercentang -> lengkapi, bukan kosongkan
assert.deepEqual([...toggleAll(['a', 'b'], new Set(['a']))].sort(), ['a', 'b']);
// baris di luar layar tidak ikut terhapus
assert.deepEqual([...toggleAll(['a'], new Set(['a', 'z']))], ['z']);
assert.deepEqual([...toggleAll([], new Set(['z']))], ['z']);

console.log('plan-table: OK');

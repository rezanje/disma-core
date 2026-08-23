import assert from 'node:assert/strict';
import { suggestVendor, vendorPrefills } from './vendor-suggest';

const PRODUCTS = [
  { id: 'cabe', defaultVendorId: 'v-master' },
  { id: 'apel' },
  { id: 'jeruk', defaultVendorId: null },
];

const HISTORY = [
  { productId: 'cabe', vendorId: 'v-lama', date: '2026-08-01' },
  { productId: 'cabe', vendorId: 'v-baru', date: '2026-08-20' },
  { productId: 'cabe', vendorId: null, date: '2026-08-22' },   // belanja pasar, tanpa vendor
  { productId: 'apel', vendorId: 'v-apel', date: '2026-07-01' },
];

// riwayat terakhir menang atas data master
assert.equal(suggestVendor('cabe', HISTORY, PRODUCTS), 'v-baru');
// tidak ada riwayat -> data master produk
assert.equal(suggestVendor('bawang', HISTORY, [{ id: 'bawang', defaultVendorId: 'v-bawang' }]), 'v-bawang');
// riwayat ada tapi produknya tidak punya vendor bawaan
assert.equal(suggestVendor('apel', HISTORY, PRODUCTS), 'v-apel');
// tidak ada apa-apa -> tidak menebak
assert.equal(suggestVendor('jeruk', HISTORY, PRODUCTS), undefined);
assert.equal(suggestVendor('entah', [], []), undefined);
// baris riwayat tanpa vendor tidak boleh menghapus kandidat yang sudah ada
assert.equal(suggestVendor('cabe', [{ productId: 'cabe', vendorId: null, date: '2026-12-31' }, ...HISTORY], PRODUCTS), 'v-baru');

// --- baris mana yang boleh diisi ---
const LINES = [
  { id: 'a', productId: 'cabe' },                                          // kosong -> diisi
  { id: 'b', productId: 'cabe', plannedVendorId: 'v-pilihan' },            // sudah ada vendor -> jangan diubah
  { id: 'c', productId: 'cabe', paymentMethod: 'Cash' },                   // keputusan lain tidak menghalangi
  { id: 'd', productId: 'cabe', purchaseMethod: 'Pasar' },                 // idem
  { id: 'e', productId: 'jeruk' },                                         // tidak ada saran -> dilewati
];
assert.deepEqual(vendorPrefills(LINES, HISTORY, PRODUCTS), [
  { id: 'a', vendorId: 'v-baru' },
  { id: 'c', vendorId: 'v-baru' },
  { id: 'd', vendorId: 'v-baru' },
]);
assert.deepEqual(vendorPrefills([], HISTORY, PRODUCTS), []);
// tanpa riwayat: jatuh ke vendor bawaan produk
assert.deepEqual(vendorPrefills(LINES, [], PRODUCTS).map(x => x.vendorId), ['v-master', 'v-master', 'v-master']);

console.log('vendor-suggest: OK');

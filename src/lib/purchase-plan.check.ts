import assert from 'node:assert/strict';
import {
  toPurchaseMethod, fromPurchaseMethod, lineIsPlanned, unplannedLines, cashNeeded,
} from './purchase-plan';

// --- dua pertanyaan → satu nilai tersimpan ---
assert.equal(toPurchaseMethod(false, 'ambil-sendiri'), 'Pasar');
assert.equal(toPurchaseMethod(false, 'vendor-antar-gudang'), 'Vendor');
assert.equal(toPurchaseMethod(false, 'vendor-antar-klien'), 'Dropship');
// Online selalu masuk gudang, jadi jawaban cara ambil tidak mengubah apa pun
assert.equal(toPurchaseMethod(true, 'ambil-sendiri'), 'Online');
assert.equal(toPurchaseMethod(true, 'vendor-antar-klien'), 'Online');

// --- bolak-balik: baris yang sudah direncanakan dibuka lagi dengan jawaban yang sama ---
(['Pasar', 'Online', 'Vendor', 'Dropship'] as const).forEach(m => {
  const a = fromPurchaseMethod(m);
  assert.equal(toPurchaseMethod(a.isOnline, a.handling), m, `bolak-balik ${m} tidak konsisten`);
});
// belum direncanakan → default paling aman: beli sendiri di pasar
assert.deepEqual(fromPurchaseMethod(null), { isOnline: false, handling: 'ambil-sendiri' });

// --- kelengkapan rencana per baris ---
assert.equal(lineIsPlanned({ id: 'a', purchaseMethod: 'Pasar', paymentMethod: 'Cash', estimatedUnitPrice: 12000 }), true,
  'baris pasar tidak wajib punya vendor — vendornya baru diketahui di lapangan');
assert.equal(lineIsPlanned({ id: 'b', purchaseMethod: 'Vendor', paymentMethod: 'Tempo' }), false,
  'kiriman vendor tanpa vendor tidak punya alamat kirim maupun pihak yang ditagih');
assert.equal(lineIsPlanned({ id: 'c', purchaseMethod: 'Vendor', paymentMethod: 'Tempo', plannedVendorId: 'v1' }), true);
assert.equal(lineIsPlanned({ id: 'd', purchaseMethod: 'Dropship', paymentMethod: 'Cash', estimatedUnitPrice: 5000 }), false);
assert.equal(lineIsPlanned({ id: 'e', purchaseMethod: 'Online', paymentMethod: 'Transfer' }), false);
// belum diputuskan sama sekali
assert.equal(lineIsPlanned({ id: 'f' }), false);
assert.equal(lineIsPlanned({ id: 'g', purchaseMethod: 'Pasar' }), false, 'cara bayar wajib diisi');

// --- dokumen siap dilepas kalau tidak ada baris yang tertinggal ---
const LINES = [
  { id: 'a', purchaseMethod: 'Pasar', paymentMethod: 'Cash', estimatedUnitPrice: 12000 },
  { id: 'b', purchaseMethod: 'Vendor', paymentMethod: 'Tempo' },
  { id: 'c', purchaseMethod: 'Online', paymentMethod: 'Transfer', plannedVendorId: 'v9' },
];
assert.deepEqual(unplannedLines(LINES), ['b']);
assert.deepEqual(unplannedLines([]), []);
assert.deepEqual(unplannedLines(LINES.filter(l => l.id !== 'b')), []);

// --- uang tunai yang benar-benar perlu dibawa ---
const PRICED = [
  { id: 'a', purchaseMethod: 'Pasar', paymentMethod: 'Cash', qtyTarget: 10, estimatedUnitPrice: 30000 },   // 300.000
  { id: 'b', purchaseMethod: 'Vendor', paymentMethod: 'Cash', qtyTarget: 5, estimatedUnitPrice: 20000 },   // 100.000
  { id: 'c', purchaseMethod: 'Pasar', paymentMethod: 'Tempo', qtyTarget: 10, estimatedUnitPrice: 50000 },  // tempo
  { id: 'd', purchaseMethod: 'Online', paymentMethod: 'Cash', qtyTarget: 2, estimatedUnitPrice: 90000 },   // dibayar kantor
  { id: 'e', purchaseMethod: 'Dropship', paymentMethod: 'Cash', qtyTarget: 4, estimatedUnitPrice: 10000 },// tidak lewat sourcing
  { id: 'f', purchaseMethod: 'Pasar', paymentMethod: 'Transfer', qtyTarget: 3, estimatedUnitPrice: 10000 },// transfer
];
assert.equal(cashNeeded(PRICED), 400000);
assert.equal(cashNeeded([]), 0);
assert.equal(cashNeeded([{ id: 'x', purchaseMethod: 'Pasar', paymentMethod: 'Cash' }]), 0);

console.log('purchase-plan: OK');

// --- harga jadi bagian rencana (22 Agu 2026) ---
// Baris tunai tanpa harga tidak boleh lolos: uang tunainya jadi nol untuk baris itu.
assert.equal(lineIsPlanned({ id: 'h', purchaseMethod: 'Pasar', paymentMethod: 'Cash' }), false,
  'tunai tanpa harga belum direncanakan');
assert.equal(lineIsPlanned({ id: 'i', purchaseMethod: 'Pasar', paymentMethod: 'Cash', estimatedUnitPrice: 12000 }), true);
assert.equal(lineIsPlanned({ id: 'j', purchaseMethod: 'Pasar', paymentMethod: 'Cash', estimatedUnitPrice: 0 }), false);
// Tempo dan transfer tidak menarik tunai, jadi harga tidak menahan pelepasan rencana.
assert.equal(lineIsPlanned({ id: 'k', purchaseMethod: 'Vendor', paymentMethod: 'Tempo', plannedVendorId: 'v1' }), true);
assert.equal(lineIsPlanned({ id: 'l', purchaseMethod: 'Vendor', paymentMethod: 'Transfer', plannedVendorId: 'v1' }), true);

console.log('purchase-plan (harga): OK');

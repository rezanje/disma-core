import assert from 'node:assert/strict';
import { gabungBaris, tunaiDibutuhkan } from './belanja-merge';

const baris = (over: Partial<Parameters<typeof gabungBaris>[0][number]>) => ({
  purchaseId: 'adv-1', productId: 'p1', productName: 'Bawang', skuCode: 'SKU1',
  totalQty: 10, estimatedPrice: 20000, purchaseMethod: 'Pasar', paymentMethod: 'Cash',
  vendorId: null as string | null, vendorName: undefined as string | undefined, ...over,
});

// --- barang sama, vendor & jalur & bayar sama: dijumlah jadi satu baris ---
const satu = gabungBaris([
  baris({ purchaseId: 'adv-1', totalQty: 10 }),
  baris({ purchaseId: 'adv-2', totalQty: 5 }),
]);
assert.equal(satu.length, 1);
assert.equal(satu[0].totalQty, 15);
assert.deepEqual(satu[0].dariDokumen, ['adv-1', 'adv-2']);

// --- harga beda: ambil yang tertinggi supaya uang yang dibawa tidak kurang ---
const harga = gabungBaris([
  baris({ purchaseId: 'adv-1', estimatedPrice: 20000 }),
  baris({ purchaseId: 'adv-2', estimatedPrice: 23000 }),
]);
assert.equal(harga[0].estimatedPrice, 23000);

// --- cara bayar beda: TIDAK boleh disatukan, uang yang disiapkan jadi salah ---
const bayar = gabungBaris([
  baris({ paymentMethod: 'Cash' }),
  baris({ paymentMethod: 'Tempo' }),
]);
assert.equal(bayar.length, 2);

// --- vendor beda: dua perjalanan, dua baris ---
assert.equal(gabungBaris([
  baris({ vendorId: 'v1', vendorName: 'Kevin' }),
  baris({ vendorId: 'v2', vendorName: 'Andi' }),
]).length, 2);

// --- jalur beli beda: pasar dan online bukan satu perjalanan ---
assert.equal(gabungBaris([
  baris({ purchaseMethod: 'Pasar' }),
  baris({ purchaseMethod: 'Online' }),
]).length, 2);

// --- urutan: vendor bernama dulu (alfabetis), pasar umum terakhir ---
const urut = gabungBaris([
  baris({ productId: 'p9', vendorId: null, vendorName: undefined }),
  baris({ productId: 'p2', vendorId: 'v2', vendorName: 'Kevin' }),
  baris({ productId: 'p3', vendorId: 'v1', vendorName: 'Andi' }),
]);
assert.deepEqual(urut.map(r => r.vendorName || '-'), ['Andi', 'Kevin', '-']);

// --- daftar kosong tidak meledak ---
assert.deepEqual(gabungBaris([]), []);

// --- uang tunai: hanya Cash di pasar/vendor yang dihitung ---
assert.equal(tunaiDibutuhkan([
  { totalQty: 10, estimatedPrice: 20000, purchaseMethod: 'Pasar', paymentMethod: 'Cash' },   // 200.000
  { totalQty: 5, estimatedPrice: 30000, purchaseMethod: 'Pasar', paymentMethod: 'Tempo' },   // ditagih nanti
  { totalQty: 2, estimatedPrice: 50000, purchaseMethod: 'Online', paymentMethod: 'Cash' },   // bukan di pasar
  { totalQty: 3, estimatedPrice: 10000, purchaseMethod: 'Vendor', paymentMethod: 'Transfer' }, // dibayar kantor
]), 200000);
assert.equal(tunaiDibutuhkan([]), 0);

console.log('belanja-merge: OK');

import assert from 'node:assert/strict';
import { revisionLine, appendRevisions, revisionSummary, MAX_REVISI } from './revision-note';

assert.equal(revisionLine({ produk: 'Temukunci', dari: 5, jadi: 8, satuan: 'Kg' }), 'Temukunci 5 → 8 Kg');
assert.equal(revisionLine({ produk: 'Cuka', dari: 10, jadi: 0 }), 'Cuka 10 → 0');

// catatan pertama
assert.equal(appendRevisions(null, [{ produk: 'Temukunci', dari: 5, jadi: 8, satuan: 'Kg' }]), 'Temukunci 5 → 8 Kg');
assert.equal(appendRevisions('', []), '');
// tanpa perubahan baru, catatan lama tidak disentuh
assert.equal(appendRevisions('Cuka 10 → 12', []), 'Cuka 10 → 12');

// terbaru di atas, yang lama tetap tersimpan
assert.equal(
  appendRevisions('Cuka 10 → 12', [{ produk: 'Temukunci', dari: 5, jadi: 8 }]),
  'Temukunci 5 → 8\nCuka 10 → 12',
);

// dua perubahan sekaligus tetap urut
assert.equal(
  appendRevisions('Lama 1 → 2', [{ produk: 'A', dari: 1, jadi: 2 }, { produk: 'B', dari: 3, jadi: 4 }]),
  'A 1 → 2\nB 3 → 4\nLama 1 → 2',
);

// kepanjangan: dipotong, tapi dikatakan bahwa ada yang dipotong
const panjang = Array.from({ length: MAX_REVISI }, (_, i) => `Lama${i} 1 → 2`).join('\n');
const dipotong = appendRevisions(panjang, [{ produk: 'Baru', dari: 9, jadi: 10 }]);
const baris = dipotong.split('\n');
assert.equal(baris.length, MAX_REVISI + 1);
assert.equal(baris[0], 'Baru 9 → 10');
assert.match(baris[baris.length - 1], /^…1 perubahan lama tidak ditampilkan/);

// keterangan potongan tidak menumpuk tiap kali disimpan
const lagi = appendRevisions(dipotong, [{ produk: 'Baru2', dari: 1, jadi: 2 }]);
assert.equal(lagi.split('\n').filter(l => l.startsWith('…')).length, 1);

// --- ringkasan notifikasi ---
assert.equal(revisionSummary('ADV-1', [{ produk: 'Temukunci', dari: 5, jadi: 8, satuan: 'Kg' }]), 'ADV-1: Temukunci 5 → 8 Kg');
assert.equal(revisionSummary('ADV-1', [{ produk: 'A', dari: 1, jadi: 2 }, { produk: 'B', dari: 1, jadi: 2 }]), 'ADV-1: 2 barang berubah qty-nya');

console.log('revision-note: OK');

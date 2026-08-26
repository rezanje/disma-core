import assert from 'node:assert/strict';
import { perjalanan, ringkasan, persen, layarSekarang, TAHAPAN, DI_LUAR_JALUR } from './po-progress';

// --- posisi tahap ---
const diQC = perjalanan('QC');
assert.equal(diQC.find(t => t.key === 'Belanja')?.keadaan, 'lewat');
assert.equal(diQC.find(t => t.key === 'QC')?.keadaan, 'sekarang');
assert.equal(diQC.find(t => t.key === 'Dikirim')?.keadaan, 'belum');

// tahap pertama & terakhir
assert.equal(perjalanan('Draft')[0].keadaan, 'sekarang');
assert.equal(perjalanan('Selesai').every(t => t.keadaan !== 'belum'), true);

// --- benar-benar di luar jalur: tidak menandai tahap mana pun ---
assert.equal(perjalanan('Batal').every(t => t.keadaan === 'belum'), true);
assert.equal(perjalanan('Pending Approval').every(t => t.keadaan === 'belum'), true);
assert.equal(persen('Pending Approval'), 0);

// --- status non-tahap yang SEBENARNYA sudah jauh berjalan tetap menunjukkan posisinya.
//     "Awaiting Audit" terjadi setelah barang dibawa kurir; menampilkannya 0% membuat PO
//     yang barangnya sudah di jalan terbaca seperti belum diapa-apakan. ---
const audit = perjalanan('Awaiting Audit');
assert.equal(audit.find(t => t.key === 'Dikirim')?.keadaan, 'sekarang');
assert.equal(audit.find(t => t.key === 'QC')?.keadaan, 'lewat');
assert.equal(audit.find(t => t.key === 'Terkirim')?.keadaan, 'belum');
assert.ok(persen('Awaiting Audit') > persen('Packing'));

const kurang = perjalanan('Kurang Kirim');
assert.equal(kurang.find(t => t.key === 'Terkirim')?.keadaan, 'sekarang');
assert.ok(persen('Kurang Kirim') > persen('Awaiting Audit'));

// --- ringkasan menyebut pemegang bolanya, bukan cuma nama status ---
assert.match(ringkasan('Sourcing'), /Sourcing/);
assert.match(ringkasan('Siap Kirim'), /Gudang/);
// Pemegang ditulis siapa yang mengerjakan di aplikasi — kurir tidak memakai aplikasi.
assert.match(ringkasan('Dikirim'), /Admin PO/);
assert.equal(ringkasan('Batal'), DI_LUAR_JALUR['Batal'].pesan);
assert.match(ringkasan('Awaiting Audit'), /diaudit/i);
assert.match(ringkasan('Entah'), /tidak dikenal/);

// --- persen naik searah perjalanan, tidak pernah lewat 100 ---
assert.equal(persen('Batal'), 0);
assert.ok(persen('Draft') < persen('QC'));
assert.ok(persen('QC') < persen('Terkirim'));
assert.equal(persen('Selesai'), 100);

// --- layar yang dituju ikut menyesuaikan status non-tahap ---
assert.equal(layarSekarang('Awaiting Audit'), 'Audit pengiriman');
// Tahap yang sedang berjalan ikut memakai tujuan khusus statusnya, bukan tujuan tahapnya.
assert.equal(perjalanan('Awaiting Audit').find(t => t.keadaan === 'sekarang')?.href, '/admin/audit-pengiriman');
// Statusnya sendiri ("Dikirim") tetap menunjuk layar konfirmasi sampai.
assert.equal(layarSekarang('Dikirim'), 'Hari ini');
assert.equal(layarSekarang('Terkirim'), 'Tukar faktur');
assert.equal(layarSekarang('QC'), 'QC & Inspeksi');
assert.equal(layarSekarang('Batal'), '');

// --- tiap tahap punya pemegang, layar, alamat, dan kunci izin ---
assert.equal(TAHAPAN.every(t => t.layar.length > 0), true);
assert.equal(TAHAPAN.every(t => t.href.startsWith('/')), true);
assert.equal(TAHAPAN.every(t => t.izin.length > 0), true);
assert.equal(TAHAPAN.every(t => t.pemegang.length > 0), true);
assert.equal(new Set(TAHAPAN.map(t => t.key)).size, TAHAPAN.length);

console.log('po-progress: OK');

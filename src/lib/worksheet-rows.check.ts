import assert from 'node:assert/strict';
import { jumlahKolomTercetak, barisBermasalah, qty } from './worksheet-rows';

// --- jumlah kolom tercetak per jenis lembar ---
assert.equal(jumlahKolomTercetak('belanja'), 4);        // SKU, Nama, Qty Beli, Harga Patokan
assert.equal(jumlahKolomTercetak('qc'), 3);             // SKU, Nama, Qty Datang
assert.equal(jumlahKolomTercetak('serah-terima'), 3);   // PO, Nama, Qty Kirim
assert.equal(jumlahKolomTercetak('inbound'), 4);        // SKU, Nama, Asal, Qty Harusnya
assert.equal(jumlahKolomTercetak('outbound'), 4);       // PO, Klien, Nama, Qty Siapkan

// --- baris yang jumlah selnya pas: tidak ada masalah ---
assert.deepEqual(barisBermasalah('qc', [{ cells: ['SKU1', 'Bayam', '10 Kg'] }]), []);

// --- baris kurang / kelebihan sel ketahuan, dengan nomor barisnya ---
assert.deepEqual(barisBermasalah('qc', [
  { cells: ['SKU1', 'Bayam', '10 Kg'] },
  { cells: ['SKU2', 'Cabe'] },
  { cells: ['SKU3', 'Tomat', '5 Kg', 'kelebihan'] },
]), [1, 2]);

assert.deepEqual(barisBermasalah('qc', []), []);

// --- qty: aman terhadap nilai kosong, tidak pernah mencetak "undefined" ---
assert.equal(qty(10, 'Kg'), '10 Kg');
assert.equal(qty(0, 'Kg'), '0 Kg');
assert.equal(qty(5), '5');
assert.equal(qty(null), '—');
assert.equal(qty(undefined, 'Kg'), '—');

console.log('worksheet-rows: OK');

import assert from 'node:assert/strict';
import { petaHariKirim, hariOperasi, localDay } from './hari-operasi';

// --- localDay memakai zona setempat, bukan UTC ---
assert.equal(localDay('2026-08-25T01:00:00'), '2026-08-25');
assert.equal(localDay('bukan tanggal'), '');

const sumber = {
  salesOrders: [
    { id: 'so-25', targetDeliveryDate: '2026-08-25T00:00:00' },
    { id: 'so-26', targetDeliveryDate: '2026-08-26T00:00:00' },
    { id: 'so-kosong', targetDeliveryDate: null },
  ],
  purchaseItems: [
    { purchaseId: 'adv-1', salesOrderId: 'so-25' },
    { purchaseId: 'adv-1', salesOrderId: 'so-26' },   // dokumen yang sama melayani dua hari
    { purchaseId: 'adv-2', salesOrderId: 'so-26' },
    { purchaseId: 'adv-3', salesOrderId: null },      // belanja manual, tanpa PO
  ],
  deliveries: [{ id: 'del-1', salesOrderId: 'so-26' }],
  invoices: [{ id: 'inv-1', salesOrderId: 'so-25' }],
};

const peta = petaHariKirim(sumber);

// --- PO memetakan dirinya sendiri ---
assert.equal(peta.get('so-25'), '2026-08-25');
assert.equal(peta.get('so-26'), '2026-08-26');
assert.equal(peta.get('so-kosong'), undefined);

// --- dokumen belanja lintas hari: diambil yang PALING AWAL ---
assert.equal(peta.get('adv-1'), '2026-08-25');
assert.equal(peta.get('adv-2'), '2026-08-26');
assert.equal(peta.get('adv-3'), undefined);

// --- pengiriman & tagihan ikut PO-nya ---
assert.equal(peta.get('del-1'), '2026-08-26');
assert.equal(peta.get('inv-1'), '2026-08-25');

// --- INTI: belanja jam 01:00 tanggal 24 untuk kiriman tanggal 25
//     masuk ke hari kirim 25, bukan tanggal kalendernya ---
assert.equal(
  hariOperasi({ referenceId: 'adv-1', transactionDate: '2026-08-24T01:00:00' }, peta),
  '2026-08-25',
);

// --- dan yang diketik siang tanggal 25 pun tetap jatuh di hari kirim yang sama ---
assert.equal(
  hariOperasi({ referenceId: 'adv-1', transactionDate: '2026-08-25T11:30:00' }, peta),
  '2026-08-25',
);

// --- yang tidak melayani PO mana pun tetap pakai tanggal transaksinya ---
assert.equal(
  hariOperasi({ referenceId: 'biaya-listrik', transactionDate: '2026-08-24T14:00:00' }, peta),
  '2026-08-24',
);
assert.equal(
  hariOperasi({ transactionDate: '2026-08-24T14:00:00' }, peta),
  '2026-08-24',
);

// --- daftar kosong tidak meledak ---
assert.equal(petaHariKirim({ salesOrders: [], purchaseItems: [], deliveries: [], invoices: [] }).size, 0);

console.log('hari-operasi: OK');

import assert from 'node:assert/strict';
import { tanpaRef, tujuanTransaksi } from './tx-rujukan';

const kamus = {
  invoices: [{ id: 'inv-1', salesOrderId: 'so-1' }, { id: 'inv-yatim', salesOrderId: null }],
  salesOrders: [{ id: 'so-1', poNumber: 'PO-0042' }],
  purchases: [{ id: 'adv-1', advanceCode: 'ADV-20260825-001' }],
};

// --- id mentah dibuang dari deskripsi ---
assert.equal(tanpaRef('Payment Invoice - Ref: 7a38c8c1-c560-4417'), 'Payment Invoice');
assert.equal(tanpaRef('Bayar vendor'), 'Bayar vendor');
assert.equal(tanpaRef(''), '');

// --- faktur ditelusuri sampai nomor PO-nya ---
const inv = tujuanTransaksi({ referenceType: 'Invoice', referenceId: 'inv-1', description: 'x' }, kamus);
assert.equal(inv?.label, 'Faktur PO PO-0042');
assert.match(inv?.href || '', /detailId=inv-1/);

// faktur tanpa PO tetap bisa dibuka, cuma labelnya umum
assert.equal(tujuanTransaksi({ referenceType: 'Invoice', referenceId: 'inv-yatim', description: 'x' }, kamus)?.label, 'Faktur');

// --- belanja memakai kode dokumennya ---
assert.equal(
  tujuanTransaksi({ referenceType: 'Purchase', referenceId: 'adv-1', description: 'x' }, kamus)?.label,
  'Belanja ADV-20260825-001',
);

// --- jenis lain punya layar tujuan tanpa perlu kamus ---
assert.match(tujuanTransaksi({ referenceType: 'Expense', referenceId: 'e1', description: 'x' }, kamus)?.href || '', /expenses/);
assert.match(tujuanTransaksi({ referenceType: 'Reimbursement', referenceId: 'r1', description: 'x' }, kamus)?.href || '', /reimbursements/);

// --- yang tidak menunjuk ke mana pun: null, bukan tautan mati ---
assert.equal(tujuanTransaksi({ referenceType: 'Manual', referenceId: 'x', description: 'x' }, kamus), null);

// --- baris lama: rujukannya cuma ada di dalam teks deskripsi, kolomnya kosong ---
const lama = tujuanTransaksi({ description: 'Payment Invoice - Ref: inv-1' }, kamus);
assert.equal(lama?.label, 'Faktur PO PO-0042');
assert.match(lama?.href || '', /detailId=inv-1/);
// teks tanpa kata faktur tidak ditebak jadi invoice
assert.equal(tujuanTransaksi({ description: 'Setoran tunai - Ref: inv-1' }, kamus), null);
assert.equal(tujuanTransaksi({ referenceType: 'Invoice', referenceId: 'tidak-ada', description: 'x' }, kamus), null);
assert.equal(tujuanTransaksi({ referenceType: 'Invoice', description: 'x' }, kamus), null);

console.log('tx-rujukan: OK');

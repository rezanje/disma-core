import assert from 'node:assert/strict';
import { awaitingArrival, awaitingQc, buildFifoAllocations, stillOwed } from './daily-flow';

const purchases = [
  { id: 'P-selesai', status: 'Selesai' },
  { id: 'P-jalan', status: 'Belanja' },
];

const queue = awaitingQc([
  { id: 'a', purchaseId: 'P-selesai', purchaseMethod: 'Pasar' },                       // laporan sudah masuk
  { id: 'b', purchaseId: 'P-jalan', purchaseMethod: 'Pasar' },                         // masih belanja
  { id: 'c', purchaseId: 'P-selesai', purchaseMethod: 'Pasar', isQCed: true },         // sudah diperiksa
  { id: 'd', purchaseId: 'P-jalan', purchaseMethod: 'Vendor', isOnlineOrdered:true, inboundStatus: 'pra_inbound' }, // vendor sudah antar
  { id: 'e', purchaseId: 'P-selesai', purchaseMethod: 'Vendor' },                      // vendor belum datang
  { id: 'f', purchaseId: 'P-jalan', purchaseMethod: 'Online', isOnlineOrdered: true },
  { id: 'g', purchaseId: 'P-jalan', purchaseMethod: 'Online' },                        // belum dipesan
  { id: 'h', purchaseId: 'P-selesai', purchaseMethod: 'Pasar', inboundStatus: 'verified' },
  { id: 'i', purchaseId: 'hilang', purchaseMethod: 'Pasar' },                          // induknya tidak ada
], purchases);
assert.deepEqual(queue.map(q => q.id), ['a', 'd']);

// sebagian sudah diperiksa tapi belum tuntas -> masih antre
assert.deepEqual(
  awaitingQc([{ id: 'j', purchaseId: 'P-selesai', purchaseMethod: 'Pasar', inboundStatus: 'partial' }], purchases).map(x => x.id),
  ['j'],
);

assert.equal(stillOwed({ salesOrderId: 'S', productId: 'P', qty: 10 }), 10);
assert.equal(stillOwed({ salesOrderId: 'S', productId: 'P', qty: 10, qtyDelivered: 4 }), 6);
assert.equal(stillOwed({ salesOrderId: 'S', productId: 'P', qty: 10, qtyFinal: 10 }), 0);
assert.equal(stillOwed({ salesOrderId: 'S', productId: 'P', qty: 10, qtyDelivered: 12 }), 0); // tidak pernah minus

const orders = [
  { id: 'SO-baru', status: 'Diproses', orderDate: '2026-08-20' },
  { id: 'SO-lama', status: 'Diproses', orderDate: '2026-08-18' },
  { id: 'SO-tutup', status: 'Selesai', orderDate: '2026-08-01' },
];
const lines = [
  { salesOrderId: 'SO-baru', productId: 'APEL', qty: 5 },
  { salesOrderId: 'SO-lama', productId: 'APEL', qty: 8 },
  { salesOrderId: 'SO-tutup', productId: 'APEL', qty: 100 },
];

// cukup buat semua: yang tertua dapat duluan, sisanya masuk gudang
const cukup = buildFifoAllocations('APEL', 20, orders, lines);
assert.deepEqual(cukup.allocations, [{ soId: 'SO-lama', qty: 8 }, { soId: 'SO-baru', qty: 5 }]);
assert.equal(cukup.inventoryRemainder, 7);

// kurang: yang tertua penuh dulu, sisanya kebagian seadanya
const kurang = buildFifoAllocations('APEL', 10, orders, lines);
assert.deepEqual(kurang.allocations, [{ soId: 'SO-lama', qty: 8 }, { soId: 'SO-baru', qty: 2 }]);
assert.equal(kurang.inventoryRemainder, 0);

// tidak ada yang datang
assert.deepEqual(buildFifoAllocations('APEL', 0, orders, lines).allocations, [
  { soId: 'SO-lama', qty: 0 }, { soId: 'SO-baru', qty: 0 },
]);

// produk yang tidak dipesan siapa pun: semuanya ke gudang
const nganggur = buildFifoAllocations('JERUK', 6, orders, lines);
assert.deepEqual(nganggur.allocations, []);
assert.equal(nganggur.inventoryRemainder, 6);

console.log('daily-flow: OK');

// Finance receives only ordered goods destined for our warehouse.
assert.deepEqual(awaitingArrival([
  { id: 'vendor', purchaseId: 'P-jalan', purchaseMethod: 'Vendor', isOnlineOrdered: true },
  { id: 'online', purchaseId: 'P-jalan', purchaseMethod: 'Online', isOnlineOrdered: true },
  { id: 'not-ordered', purchaseId: 'P-jalan', purchaseMethod: 'Vendor' },
  { id: 'dropship', purchaseId: 'P-jalan', purchaseMethod: 'Dropship', isOnlineOrdered: true },
  { id: 'received', purchaseId: 'P-jalan', purchaseMethod: 'Vendor', isOnlineOrdered: true, inboundStatus: 'pra_inbound' },
  { id: 'finished', purchaseId: 'P-jalan', purchaseMethod: 'Vendor', isOnlineOrdered: true, isQCed: true },
  { id: 'missing', purchaseId: 'missing', purchaseMethod: 'Vendor', isOnlineOrdered: true },
], purchases).map(i => i.id), ['vendor', 'online']);

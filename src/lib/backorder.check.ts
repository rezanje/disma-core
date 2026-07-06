import assert from 'node:assert/strict';
import { qtyOwed, roundQtyToBook, nextSoStatus } from './backorder';

// qtyOwed = qty - qtyDelivered (floored at 0)
assert.equal(qtyOwed({ qty: 10, qtyDelivered: 0 }), 10);
assert.equal(qtyOwed({ qty: 10, qtyDelivered: 9 }), 1);
assert.equal(qtyOwed({ qty: 10, qtyDelivered: 10 }), 0);
assert.equal(qtyOwed({ qty: 10 }), 10); // qtyDelivered undefined => 0
assert.equal(qtyOwed({ qty: 10, qtyDelivered: 12 }), 0); // never negative

// roundQtyToBook: QC'd round uses qtyFinal; non-QC uses remaining owed
assert.equal(roundQtyToBook({ qty: 10, qtyFinal: 9, qtyDelivered: 0 }), 9); // round 1 QC 9
assert.equal(roundQtyToBook({ qty: 10, qtyFinal: 1, qtyDelivered: 9 }), 1); // round 2 QC 1
assert.equal(roundQtyToBook({ qty: 10, qtyDelivered: 0 }), 10); // never QC'd => full owed
assert.equal(roundQtyToBook({ qty: 10, qtyDelivered: 8 }), 2); // non-QC, partly delivered
assert.equal(roundQtyToBook({ qty: 10, qtyFinal: 0, qtyDelivered: 10 }), 0);

// nextSoStatus: Kurang Kirim while any item still owed, else Selesai
assert.equal(nextSoStatus([{ qty: 10, qtyDelivered: 10 }]), 'Selesai');
assert.equal(nextSoStatus([{ qty: 10, qtyDelivered: 9 }]), 'Kurang Kirim');
assert.equal(nextSoStatus([{ qty: 5, qtyDelivered: 5 }, { qty: 10, qtyDelivered: 8 }]), 'Kurang Kirim');
assert.equal(nextSoStatus([{ qty: 5, qtyDelivered: 5 }, { qty: 10, qtyDelivered: 10 }]), 'Selesai');

console.log('backorder.check: all assertions passed');

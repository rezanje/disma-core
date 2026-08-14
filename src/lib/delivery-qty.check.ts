/**
 * Runnable check for the printed delivery quantity. No test framework in this
 * repo — run directly:  npx tsx src/lib/delivery-qty.check.ts
 *
 * Exists because the surat jalan and the berita acara disagreed. Both are signed
 * at the same handover, from the same adjustment form, but only the berita acara
 * honoured the courier's corrections — the surat jalan always printed the
 * ordered quantity. One rule, one function, used by both drawers.
 */
import assert from 'node:assert/strict';
import { printedQty } from './delivery-qty';

const item = (over: Partial<{ id: string; qty: number; qtyFinal: number | null }> = {}) =>
  ({ id: 'i1', qty: 10, ...over });

// No corrections anywhere: the ordered quantity is what ships.
assert.equal(printedQty(item(), undefined), 10);
assert.equal(printedQty(item(), {}), 10);

// QC committed a different quantity for this round — that wins over the order.
assert.equal(printedQty(item({ qtyFinal: 8 }), {}), 8);

// The courier corrected it at the door. That is the most recent truth, so it
// beats both the order and the QC figure.
assert.equal(printedQty(item({ qtyFinal: 8 }), { i1: 6 }), 6);
assert.equal(printedQty(item(), { i1: 6 }), 6);

// Zero is a real correction — the client took none of this line. It must not be
// mistaken for "no adjustment given" and fall back to the ordered quantity.
assert.equal(printedQty(item({ qtyFinal: 8 }), { i1: 0 }), 0);

// An adjustment for a different line never leaks into this one.
assert.equal(printedQty(item({ qtyFinal: 8 }), { other: 3 }), 8);

// qtyFinal is reset to null between backorder rounds; that is "no QC figure".
assert.equal(printedQty(item({ qtyFinal: null }), {}), 10);
assert.equal(printedQty(item({ qtyFinal: null }), { i1: 4 }), 4);

// Negatives are never printed, whatever the source.
assert.equal(printedQty(item(), { i1: -5 }), 0);
assert.equal(printedQty(item({ qtyFinal: -2 }), {}), 0);

console.log('delivery-qty: all checks passed');

/**
 * Runnable check for the COGS source detector. No test framework in this repo —
 * run directly:  npx tsx src/lib/cogs-source.check.ts
 *
 * When a delivered item has no purchase record, accounting falls back to the
 * product's base price for COGS. The books still balance and the profit report
 * still prints, so nothing on screen says the cost was a guess. This tells
 * Finance which lines are guesses BEFORE they approve the delivery.
 */
import assert from 'node:assert/strict';
import { cogsFallbackItems } from './cogs-source';

const purchaseItems = [
  { productId: 'p1', salesOrderId: 'so1', actualUnitPrice: 12_000 },
  { productId: 'p2', salesOrderId: 'so1', actualUnitPrice: 0 },
  { productId: 'p3', salesOrderId: 'so9', actualUnitPrice: 8_000 },
];

// A line bought for this very order has a real cost — no warning.
assert.deepEqual(cogsFallbackItems('so1', [{ productId: 'p1' }], purchaseItems), []);

// Bought, but the price was never filled in. A zero cost is not a cost, so it
// falls back the same way a missing row does.
assert.deepEqual(cogsFallbackItems('so1', [{ productId: 'p2' }], purchaseItems), ['p2']);

// Never bought at all for any order.
assert.deepEqual(cogsFallbackItems('so1', [{ productId: 'p4' }], purchaseItems), ['p4']);

// Bought for a DIFFERENT order: accounting accepts that as the cost basis, so
// this is not a fallback and must not be warned about.
assert.deepEqual(cogsFallbackItems('so1', [{ productId: 'p3' }], purchaseItems), []);

// Several lines at once, reported in the order given.
assert.deepEqual(
  cogsFallbackItems('so1', [{ productId: 'p1' }, { productId: 'p4' }, { productId: 'p2' }], purchaseItems),
  ['p4', 'p2']
);

// Nothing to deliver, nothing to warn about.
assert.deepEqual(cogsFallbackItems('so1', [], purchaseItems), []);
assert.deepEqual(cogsFallbackItems('so1', [{ productId: 'p1' }], []), ['p1']);

console.log('cogs-source: all checks passed');

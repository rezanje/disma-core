/**
 * Runnable check for the dropship arithmetic. No test framework in this repo —
 * run directly:  npx tsx src/lib/dropship.check.ts
 */
import assert from 'node:assert/strict';
import {
  isDropship, dropshipShortfall, dropshipLineValue, groupKey, groupDropship, splitDropshipTotals,
} from './dropship';

// isDropship keys off the purchase method, and only that method.
assert.equal(isDropship({ purchaseMethod: 'Dropship' }), true);
assert.equal(isDropship({ purchaseMethod: 'Vendor' }), false);
assert.equal(isDropship({ purchaseMethod: 'Pasar' }), false);
assert.equal(isDropship({}), false);

// Shortfall is what the client did not get. Never negative: a vendor who
// over-delivers does not create a negative susulan.
assert.equal(dropshipShortfall(10, 8), 2);
assert.equal(dropshipShortfall(10, 10), 0);
assert.equal(dropshipShortfall(10, 12), 0);
assert.equal(dropshipShortfall(10, 0), 10);

// Billing follows what was received, not what was ordered.
assert.equal(dropshipLineValue(8, 12_500), 100_000);
assert.equal(dropshipLineValue(0, 12_500), 0);

// One surat jalan per vendor+client pairing, so grouping is on both.
assert.equal(groupKey('v1', 'so1'), 'v1::so1');
assert.equal(groupKey(undefined, 'so1'), '::so1');

const grouped = groupDropship([
  { id: 'a', vendorId: 'v1', salesOrderId: 'so1' },
  { id: 'b', vendorId: 'v1', salesOrderId: 'so1' },
  { id: 'c', vendorId: 'v2', salesOrderId: 'so1' },
  { id: 'd', vendorId: 'v1', salesOrderId: 'so2' },
]);
assert.equal(grouped.length, 3);
const first = grouped.find(g => g.key === 'v1::so1');
assert.ok(first);
assert.deepEqual(first.items.map(i => i.id), ['a', 'b']);
assert.equal(first.vendorId, 'v1');
assert.equal(first.salesOrderId, 'so1');
// Same vendor, different order => a separate delivery note.
assert.equal(grouped.find(g => g.key === 'v1::so2')?.items.length, 1);

// The invoice follows the selling price of what arrived; the vendor is owed the
// cost of what arrived; the susulan is what never turned up.
const totals = splitDropshipTotals([
  { qtyOrdered: 10, qtyReceived: 8, unitCost: 10_000, unitPrice: 15_000 },
  { qtyOrdered: 5, qtyReceived: 5, unitCost: 20_000, unitPrice: 26_000 },
]);
assert.equal(totals.revenue, 8 * 15_000 + 5 * 26_000);
assert.equal(totals.cogs, 8 * 10_000 + 5 * 20_000);
assert.deepEqual(totals.shortfalls, [{ index: 0, qty: 2 }]);

// Nothing received at all: no invoice, no vendor obligation, everything is a susulan.
const nothing = splitDropshipTotals([{ qtyOrdered: 4, qtyReceived: 0, unitCost: 1_000, unitPrice: 2_000 }]);
assert.equal(nothing.revenue, 0);
assert.equal(nothing.cogs, 0);
assert.deepEqual(nothing.shortfalls, [{ index: 0, qty: 4 }]);

console.log('dropship: all checks passed');

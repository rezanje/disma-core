/**
 * Runnable check for the delivery-route helpers. No test framework in this repo —
 * run directly:  npx tsx src/lib/delivery-route.check.ts
 */
import assert from 'node:assert/strict';
import { hasLocation, googleMapsUrl, moveItem, sortStops } from './delivery-route';

// A client counts as located only with BOTH coordinates. A half-filled record
// would put a pin on the equator.
assert.equal(hasLocation({ latitude: -6.2, longitude: 106.8 }), true);
assert.equal(hasLocation({ latitude: -6.2 }), false);
assert.equal(hasLocation({ longitude: 106.8 }), false);
assert.equal(hasLocation({}), false);
// 0 is a real coordinate, not "missing".
assert.equal(hasLocation({ latitude: 0, longitude: 0 }), true);

// The courier's link opens their own map app at the exact point.
assert.equal(
  googleMapsUrl(-6.2088, 106.8456),
  'https://www.google.com/maps/search/?api=1&query=-6.2088%2C106.8456'
);

// Manual reordering: move an item and close the gap behind it.
assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
assert.deepEqual(moveItem(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c']);
// Out-of-range indices leave the list untouched rather than dropping items.
assert.deepEqual(moveItem(['a', 'b', 'c'], -1, 1), ['a', 'b', 'c']);
assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 9), ['a', 'b', 'c']);
// The original array is never mutated.
const original = ['a', 'b', 'c'];
moveItem(original, 0, 2);
assert.deepEqual(original, ['a', 'b', 'c']);

// Stops render in the order Admin PO set. Anything never ordered sorts last,
// in a stable order, so new drops land at the bottom instead of jumping around.
assert.deepEqual(
  sortStops([{ id: 'c', routeOrder: 2 }, { id: 'a', routeOrder: 0 }, { id: 'b', routeOrder: 1 }]).map(s => s.id),
  ['a', 'b', 'c']
);
assert.deepEqual(
  sortStops([{ id: 'x' }, { id: 'a', routeOrder: 0 }, { id: 'y' }]).map(s => s.id),
  ['a', 'x', 'y']
);

console.log('delivery-route: all checks passed');

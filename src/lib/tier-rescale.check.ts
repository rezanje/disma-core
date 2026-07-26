import assert from 'node:assert/strict';
import { rescaleTiers } from './tier-rescale';

// Proportional rescale: a +50% tier stays +50% of the new base.
assert.deepEqual(
  rescaleTiers(20000, 30000, [30000, 26000, 24000, 22000, 23000]),
  [45000, 39000, 36000, 33000, 34500]
);

// A +30% product stays +30%.
assert.deepEqual(rescaleTiers(10000, 12000, [13000]), [15600]);

// Rounds to whole rupiah.
assert.deepEqual(rescaleTiers(3, 10, [10]), [33]);

// oldBase <= 0 -> cannot derive a ratio -> clear the slot.
assert.deepEqual(rescaleTiers(0, 12000, [13000, 11000]), [undefined, undefined]);
assert.deepEqual(rescaleTiers(-5, 12000, [13000]), [undefined]);

// A missing / zero tier clears that slot but leaves its neighbours alone.
assert.deepEqual(
  rescaleTiers(10000, 20000, [13000, null, undefined, 0, 11000]),
  [26000, undefined, undefined, undefined, 22000]
);

// newBase of 0 yields 0, not a crash.
assert.deepEqual(rescaleTiers(10000, 0, [13000]), [0]);

// Non-finite input is treated as unusable, never propagated.
assert.deepEqual(rescaleTiers(NaN, 100, [200]), [undefined]);
assert.deepEqual(rescaleTiers(100, NaN, [200]), [undefined]);

// Empty input is an empty result.
assert.deepEqual(rescaleTiers(100, 200, []), []);

console.log('tier-rescale.check: all assertions passed');

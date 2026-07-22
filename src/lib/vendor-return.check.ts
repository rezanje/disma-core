import assert from 'node:assert/strict';
import { isReturnSplitValid, isSwapSplitValid } from './vendor-return';

// isReturnSplitValid: three buckets, non-negative, summing to the return total
assert.equal(isReturnSplitValid({ pass: 10, buang: 0, vendor: 0 }, 10), true);
assert.equal(isReturnSplitValid({ pass: 3, buang: 2, vendor: 5 }, 10), true);
assert.equal(isReturnSplitValid({ pass: 3, buang: 2, vendor: 4 }, 10), false); // sums to 9
assert.equal(isReturnSplitValid({ pass: -1, buang: 6, vendor: 5 }, 10), false); // negative
assert.equal(isReturnSplitValid({ pass: 0.1, buang: 0.2, vendor: 0.7 }, 1), true); // float tolerant
assert.equal(isReturnSplitValid({ pass: NaN, buang: 0, vendor: 0 }, 10), false); // NaN

// isSwapSplitValid: replacement QC split, non-negative, summing to the vendor-return qty
assert.equal(isSwapSplitValid({ pass: 5, reject: 0 }, 5), true);
assert.equal(isSwapSplitValid({ pass: 3, reject: 2 }, 5), true);
assert.equal(isSwapSplitValid({ pass: 3, reject: 1 }, 5), false); // sums to 4
assert.equal(isSwapSplitValid({ pass: 2, reject: -1 }, 1), false); // negative

console.log('vendor-return.check: all assertions passed');

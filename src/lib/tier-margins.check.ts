import assert from 'node:assert/strict';
import { ladderFor, tierPricesFor } from './tier-margins';

// Fresh produce runs the +50% B2C ladder.
assert.equal(ladderFor('Sayuran')['Tier 1'], 50);
assert.equal(ladderFor('Buah')['Tier 1'], 50);

// Category matching ignores case and stray whitespace — the catalogue has both
// "Sayuran" and "SAYURAN".
assert.equal(ladderFor('SAYURAN')['Tier 1'], 50);
assert.equal(ladderFor('  buah  ')['Tier 1'], 50);

// Everything else runs the +30% ladder, including missing categories.
assert.equal(ladderFor('Dry Goods')['Tier 1'], 30);
assert.equal(ladderFor('Frozen food')['Tier 1'], 30);
assert.equal(ladderFor(null)['Tier 1'], 30);
assert.equal(ladderFor(undefined)['Tier 1'], 30);
assert.equal(ladderFor('')['Tier 1'], 30);

// Both ladders share Tier 3/4/5, and Tier 4 (Bottom) is the cheapest — NOT Tier 5.
for (const cat of ['Sayuran', 'Dry Goods']) {
  const l = ladderFor(cat);
  assert.deepEqual([l['Tier 3'], l['Tier 4'], l['Tier 5']], [20, 10, 15]);
  assert.ok(l['Tier 4'] < l['Tier 5'], 'Tier 4 must be cheaper than Tier 5');
}

// Prices round UP to the nearest 1000, matching the published pricelist.
// Cabe Merah Keriting, HPP 38.000 -> the 26 Juli sheet prints 57/50/46/42/44.
assert.deepEqual(tierPricesFor(38000, 'Sayuran'), [57000, 50000, 46000, 42000, 44000]);

// Jinten Hitam, HPP 60.000 packaged -> 78/75/72/66/69.
assert.deepEqual(tierPricesFor(60000, 'Dry Goods'), [78000, 75000, 72000, 66000, 69000]);

// A base that lands exactly on a thousand is not bumped to the next one.
assert.deepEqual(tierPricesFor(10000, 'Dry Goods'), [13000, 12500, 12000, 11000, 11500].map(v => Math.ceil(v / 1000) * 1000));

// Zero base yields zeros, not NaN.
assert.deepEqual(tierPricesFor(0, 'Sayuran'), [0, 0, 0, 0, 0]);

console.log('tier-margins.check: all assertions passed');

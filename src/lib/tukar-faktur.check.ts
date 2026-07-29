import assert from 'node:assert/strict';
import { isoLocalDate, tfPeriodFor, generateTfNumber, periodKey } from './tukar-faktur';

// isoLocalDate: formats the LOCAL calendar date. `toISOString()` on a local midnight in
// WIB (+7) reports the previous day — that shift is what pushed TF periods back one day.
const localMidnight = new Date(2026, 6, 31, 0, 0, 0, 0); // 31 Jul 2026, local
assert.equal(isoLocalDate(localMidnight), '2026-07-31');
const lateEvening = new Date(2026, 6, 31, 23, 59, 59, 0);
assert.equal(isoLocalDate(lateEvening), '2026-07-31');
assert.equal(isoLocalDate(new Date(2026, 0, 5)), '2026-01-05'); // zero-padding

// periodKey rides on the same local formatting.
const midWeek = tfPeriodFor(new Date(2026, 6, 8)); // Wed 8 Jul 2026 → Mon 6 – Sun 12
assert.equal(periodKey(midWeek), '2026-07-06_2026-07-12');

// A week that straddles month end is cut at the last day of the month.
const straddling = tfPeriodFor(new Date(2026, 6, 29)); // Wed 29 Jul → week ends 2 Aug
assert.equal(isoLocalDate(straddling.periodStart), '2026-07-27');
assert.equal(isoLocalDate(straddling.periodEnd), '2026-07-31');

// TF number names the client: ids are all prefixed `client-`, so the prefix must be
// stripped before slicing or every client reads as "CLIENT".
assert.equal(generateTfNumber('client-maisen', straddling, 0), 'TF-2026-07-MAISEN-01');
assert.equal(generateTfNumber('client-goat-coffee', straddling, 1), 'TF-2026-07-GOATCO-02');
assert.equal(generateTfNumber('client-maisen', midWeek, 0), 'TF-2026-W28-MAISEN-01'); // non month-end → week label
assert.equal(generateTfNumber('7f3a91c2', midWeek, 0), 'TF-2026-W28-7F3A91-01'); // id without prefix still works

console.log('tukar-faktur.check: all assertions passed');

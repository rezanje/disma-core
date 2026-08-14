/**
 * Runnable check for the Tukar Faktur eligibility window. No test framework in
 * this repo — run directly:  npx tsx src/lib/tf-window.check.ts
 *
 * The window exists because GenerateTfModal only offers invoices younger than
 * TF_WINDOW_DAYS. Anything older silently drops out of the picker: the goods
 * shipped, the invoice exists, and there is no way to bill it from that screen.
 * These helpers put a warning in front of that instead of letting it happen
 * quietly, and they are shared with the picker so the two cannot drift apart.
 */
import assert from 'node:assert/strict';
import { TF_WINDOW_DAYS, daysLeftInTfWindow, tfWindowBucket, isInvoiceIssued } from './tf-window';

const today = new Date('2026-08-15T00:00:00.000Z');
const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

assert.equal(TF_WINDOW_DAYS, 14);

// Fresh today: the whole window is still ahead.
assert.equal(daysLeftInTfWindow(daysAgo(0), today), 14);
assert.equal(daysLeftInTfWindow(daysAgo(5), today), 9);
// The last day it can still be picked.
assert.equal(daysLeftInTfWindow(daysAgo(14), today), 0);
// Past the window, the number goes negative — how far past is useful to show.
assert.equal(daysLeftInTfWindow(daysAgo(20), today), -6);

// Buckets drive the two panels: what to chase now, and what already slipped.
assert.equal(tfWindowBucket(daysAgo(0), today), 'ok');
assert.equal(tfWindowBucket(daysAgo(9), today), 'ok');
// Inside the last four days, it is urgent.
assert.equal(tfWindowBucket(daysAgo(10), today), 'urgent');
assert.equal(tfWindowBucket(daysAgo(14), today), 'urgent');
// Past it entirely.
assert.equal(tfWindowBucket(daysAgo(15), today), 'expired');
assert.equal(tfWindowBucket(daysAgo(60), today), 'expired');

// A date-only string (the shape invoices actually store) works the same.
assert.equal(tfWindowBucket('2026-08-15', today), 'ok');
assert.equal(tfWindowBucket('2026-07-01', today), 'expired');

// Garbage in must not crash the screen, and must not be silently called fine —
// an invoice we cannot date is one we cannot promise is still billable.
assert.equal(tfWindowBucket('not-a-date', today), 'expired');
assert.equal(daysLeftInTfWindow('not-a-date', today), -Infinity);

// An invoice is only reachable once finance has audited its order out of
// 'Awaiting Audit'.
const orders = [
  { id: 'so-done', status: 'Terkirim' },
  { id: 'so-waiting', status: 'Awaiting Audit' },
];
assert.equal(isInvoiceIssued({ salesOrderId: 'so-done' }, orders), true);
assert.equal(isInvoiceIssued({ salesOrderId: 'so-waiting' }, orders), false);
// A consolidated invoice waits for every order in it.
assert.equal(isInvoiceIssued({ salesOrderIds: ['so-done', 'so-waiting'] }, orders), false);
assert.equal(isInvoiceIssued({ salesOrderIds: ['so-done'] }, orders), true);
// Manual invoices carry no order link and count as issued.
assert.equal(isInvoiceIssued({}, orders), true);
// An order id we cannot find is not a reason to hold the invoice back.
assert.equal(isInvoiceIssued({ salesOrderId: 'gone' }, orders), true);
// salesOrderIds wins when both are present, matching the picker.
assert.equal(isInvoiceIssued({ salesOrderId: 'so-waiting', salesOrderIds: ['so-done'] }, orders), true);

console.log('tf-window: all checks passed');

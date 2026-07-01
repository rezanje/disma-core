import assert from "node:assert";
import {
  isoWeekKey,
  buildWeeklyMax,
  acuanForRecord,
  dayKeyWib,
  PurchaseRecord,
} from "../../src/lib/sku-pnl";

// isoWeekKey: 2026-01-05 is Monday of ISO week 2 of 2026
assert.strictEqual(isoWeekKey("2026-01-05T03:00:00.000Z"), "2026-W02");

// Acuan = previous week's MAX, per product, global across vendors, current week ignored.
const purchases: PurchaseRecord[] = [
  // product A, previous week (W02): two buys, max 12000
  { productId: "A", date: "2026-01-06T02:00:00Z", actualUnitPrice: 10000, qtyReceived: 5, finalized: true },
  { productId: "A", date: "2026-01-08T02:00:00Z", actualUnitPrice: 12000, qtyReceived: 5, finalized: true },
  // product A, this week (W03): should NOT influence its own acuan
  { productId: "A", date: "2026-01-13T02:00:00Z", actualUnitPrice: 9000, qtyReceived: 5, finalized: true },
  // product B, previous week: isolated from A
  { productId: "B", date: "2026-01-07T02:00:00Z", actualUnitPrice: 3000, qtyReceived: 1, finalized: true },
];
const wm = buildWeeklyMax(purchases);

// A bought this-week (W03) -> acuan is W02 max = 12000
const aThisWeek = purchases[2];
assert.strictEqual(acuanForRecord(aThisWeek, wm), 12000);

// A bought in W02 -> previous week (W01) has no data -> null
const aPrevWeek = purchases[0];
assert.strictEqual(acuanForRecord(aPrevWeek, wm), null);

// Product isolation: B's acuan does not leak A's numbers
assert.strictEqual(acuanForRecord(purchases[3], wm), null);

// WIB week bucketing is deterministic (independent of host TZ).
// Sun 20:00 UTC = Mon 03:00 WIB -> that Monday's week (W03).
assert.strictEqual(isoWeekKey("2026-01-11T20:00:00.000Z"), "2026-W03");
// Sun 16:00 UTC = Sun 23:00 WIB -> still Sunday -> W02.
assert.strictEqual(isoWeekKey("2026-01-11T16:00:00.000Z"), "2026-W02");
// dayKeyWib returns the WIB calendar day.
assert.strictEqual(dayKeyWib("2026-01-11T20:00:00.000Z"), "2026-01-12");
// Year boundary: a WIB record in early Jan resolves its previous week to 2025-W52.
assert.strictEqual(
  acuanForRecord(
    { productId: "X", date: "2026-01-01T05:00:00Z", actualUnitPrice: 1, qtyReceived: 1, finalized: true },
    new Map([["X", new Map([["2025-W52", 500]])]])
  ),
  500
);
// buildWeeklyMax ignores non-positive (draft/unpriced) prices.
assert.strictEqual(
  buildWeeklyMax([
    { productId: "Z", date: "2026-01-06T02:00:00Z", actualUnitPrice: 0, qtyReceived: 1, finalized: false },
  ]).size,
  0
);

console.log("Task 1 checks passed");

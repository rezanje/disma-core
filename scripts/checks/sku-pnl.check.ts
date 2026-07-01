import assert from "node:assert";
import {
  isoWeekKey,
  buildWeeklyMax,
  acuanForRecord,
  dayKeyWib,
  PurchaseRecord,
  classifyLossMovement,
  MovementLike,
  aggregateDaily,
  LossRecord,
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

// classifyLossMovement buckets
const mk = (o: Partial<MovementLike>): MovementLike => ({ kind: "", stockDelta: 0, ...o });

assert.strictEqual(
  classifyLossMovement(mk({ kind: "ADJUSTMENT", referenceType: "QC", destination: "Reject/Write-off" })),
  "reject"
);
// Vendor replaces it -> not our loss
assert.strictEqual(
  classifyLossMovement(mk({ kind: "ADJUSTMENT", referenceType: "QC", destination: "Return to Supplier" })),
  null
);
// Opname spoilage -> waste
assert.strictEqual(
  classifyLossMovement(mk({ kind: "ADJUSTMENT", source: "Stock Opname", stockDelta: -3, note: "Stock Opname: barang busuk" })),
  "waste"
);
// Opname generic deficit -> missing
assert.strictEqual(
  classifyLossMovement(mk({ kind: "ADJUSTMENT", source: "Stock Opname", stockDelta: -2, note: "Stock Opname: selisih hitung" })),
  "missing"
);
// Opname surplus -> not a loss
assert.strictEqual(
  classifyLossMovement(mk({ kind: "ADJUSTMENT", source: "Stock Opname", stockDelta: 4, note: "lebih" })),
  null
);
// Client return reject -> return
assert.strictEqual(classifyLossMovement(mk({ kind: "RETURN_REJECT", stockDelta: 0 })), "return");
// Ordinary inbound -> nothing
assert.strictEqual(classifyLossMovement(mk({ kind: "QC_INVENTORY", stockDelta: 10 })), null);

// ISO week direct checks at the year boundary (forward + explicit current-week).
assert.strictEqual(isoWeekKey("2025-12-29T20:00:00.000Z"), "2026-W01"); // WIB Dec 30 (Tue) rolls into 2026-W01
assert.strictEqual(isoWeekKey("2026-01-01T05:00:00.000Z"), "2026-W01"); // WIB Jan 1 is in 2026-W01

// aggregateDaily: weighted avg, variance sign & qty basis, loss merge, netPnl, draft flag
const aggPurchases: PurchaseRecord[] = [
  // acuan source: product A previous week (W02) max = 12000
  { productId: "A", date: "2026-01-06T02:00:00Z", actualUnitPrice: 12000, qtyReceived: 1, finalized: true },
  // this week (W03), same day, two buys -> weighted avg = (10000*4 + 8000*6)/10 = 8800
  { productId: "A", date: "2026-01-13T02:00:00Z", actualUnitPrice: 10000, qtyReceived: 4, finalized: true },
  { productId: "A", date: "2026-01-13T09:00:00Z", actualUnitPrice: 8000, qtyReceived: 6, finalized: false },
];
const aggLosses: LossRecord[] = [
  { productId: "A", date: "2026-01-13T10:00:00Z", qty: 2, unitCost: 9000, bucket: "waste" },
];
const agg = aggregateDaily(aggPurchases, aggLosses);
const a13 = agg.find((r) => r.productId === "A" && r.date === "2026-01-13")!;
assert.strictEqual(a13.qty, 10);
assert.strictEqual(a13.avgBuyPrice, 8800);
assert.strictEqual(a13.acuan, 12000);
// variance = (12000 - 8800) * 10 = 32000 (untung), qty basis = received
assert.strictEqual(a13.varianceAmount, 32000);
assert.strictEqual(a13.lossWaste, 18000); // 2 * 9000
assert.strictEqual(a13.lossTotal, 18000);
assert.strictEqual(a13.netPnl, 14000); // 32000 - 18000
assert.strictEqual(a13.hasDraft, true); // one line not finalized

console.log("All sku-pnl checks passed");

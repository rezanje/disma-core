# SKU Daily P/L Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give finance one place showing, per SKU per calendar day, whether that SKU made or lost money — combining purchase price variance (vs a weekly reference price) with physical losses (reject, missing, waste, client return).

**Architecture:** A **derived report**, not a new datastore. Every input already exists in the Zustand store: `purchaseItems` + `purchases` (buy price, qty received, date), and `stockMovements` (physical-loss events, each already stamped with `unitCost`, `skuCode`, `date`, `kind`). Physical losses already post to the GL (account `5-2000 Beban Kerusakan`) via existing QC / opname / return flows, so the report adds **zero new journal code and zero schema changes**. All math lives in one pure, self-contained module (`src/lib/sku-pnl.ts`) that is unit-tested with `ts-node` + Node's `assert`; the page maps store objects into the module's small input shapes and renders a table.

**Tech Stack:** Next.js App Router (client component), Zustand store (`@/lib/store`), `date-fns` v4 (ISO week math), existing shadcn UI primitives (`@/components/ui/*`), `ts-node` (already a devDependency) for the self-check.

## Global Constraints

- **No new dependencies.** Use `date-fns` (already installed) and `ts-node` (already installed). No test framework is configured; checks run via `npx ts-node`.
- **No schema / migration changes.** The report derives from existing store arrays only.
- **No new GL postings.** Physical losses already hit `5-2000`; price variance is a KPI and must never post to the GL.
- **Reference price ("harga acuan") = the MAX actual buy price of the *previous* ISO week**, per `productId`, global across all vendors. Deliberate worst-case baseline (owner's decision).
- **Variance qty basis = qty *received*** (`inboundQtyReceived ?? qtyPurchased`), never qty ordered.
- **Physical losses valued at `unitCost` from the movement, falling back to `product.basePrice`.** (Client-return movements carry no `unitCost`, so they fall back to `basePrice`, matching how the GL already books them via `recordShrinkage`.)
- **Scope of "beli ke pasar": exclude online (Shopee) purchases** — filter out `PurchaseItem.isOnlineOrdered`.
- **Loss buckets are separate** (owner's decision): `reject`, `missing`, `waste`, `return`. Vendor-replaceable rejects are **not** losses (they route to "Return to Supplier", which the extractor excludes).
- All Rupiah amounts are integers; format for display only, never round mid-calculation.

---

## File Structure

- **Create** `src/lib/sku-pnl.ts` — pure calculation module. Self-contained input interfaces (no `@/types` import), so it runs under bare `ts-node`. Exports: `isoWeekKey`, `buildWeeklyMax`, `acuanForRecord`, `classifyLossMovement`, `aggregateDaily`, and the `PurchaseRecord` / `LossRecord` / `MovementLike` / `DailySkuPnl` / `LossBucket` types.
- **Create** `scripts/checks/sku-pnl.check.ts` — runnable `assert`-based self-check for the module. No framework.
- **Create** `src/app/finance/sku-pnl/page.tsx` — the report page. Maps store → module inputs, renders the daily table with filters and totals.
- **Modify** `src/lib/navigation.tsx` — add one Finance nav entry.
- **Modify** `src/types/index.ts:17-18` — add `'finance_sku_pnl'` to the `PermissionKey` union.

---

### Task 1: Pure module — ISO week + weekly acuan

**Files:**
- Create: `src/lib/sku-pnl.ts`
- Create (test): `scripts/checks/sku-pnl.check.ts`

**Interfaces:**
- Consumes: nothing (leaf module; only `date-fns`).
- Produces:
  - `isoWeekKey(dateIso: string): string` — e.g. `"2026-W27"`.
  - `interface PurchaseRecord { productId: string; date: string; actualUnitPrice: number; qtyReceived: number; finalized: boolean }`
  - `buildWeeklyMax(purchases: PurchaseRecord[]): Map<string, Map<string, number>>` — `productId → (weekKey → max actualUnitPrice)`.
  - `acuanForRecord(rec: PurchaseRecord, weeklyMax: Map<string, Map<string, number>>): number | null` — max buy price of the record's *previous* ISO week, or `null` if none.

- [ ] **Step 1: Write the module skeleton with the week + acuan functions**

Create `src/lib/sku-pnl.ts`:

```ts
import { parseISO, subDays, getISOWeek, getISOWeekYear } from "date-fns";

// --- Input shapes (structural, deliberately decoupled from @/types) ---

export interface PurchaseRecord {
  productId: string;
  date: string;          // ISO string from parent Purchase.date
  actualUnitPrice: number;
  qtyReceived: number;   // inboundQtyReceived ?? qtyPurchased
  finalized: boolean;    // inbound QC completed
}

/** ISO week key, e.g. "2026-W07". Zero-padded week number. */
export function isoWeekKey(dateIso: string): string {
  const d = parseISO(dateIso);
  const year = getISOWeekYear(d);
  const week = getISOWeek(d);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** productId -> (weekKey -> max actualUnitPrice observed that week). */
export function buildWeeklyMax(
  purchases: PurchaseRecord[]
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const p of purchases) {
    if (!(p.actualUnitPrice > 0)) continue; // ignore unpriced/draft-zero rows
    const wk = isoWeekKey(p.date);
    let byWeek = out.get(p.productId);
    if (!byWeek) {
      byWeek = new Map<string, number>();
      out.set(p.productId, byWeek);
    }
    const prev = byWeek.get(wk) ?? 0;
    if (p.actualUnitPrice > prev) byWeek.set(wk, p.actualUnitPrice);
  }
  return out;
}

/** Acuan = max buy price of the record's PREVIOUS ISO week (same product), else null. */
export function acuanForRecord(
  rec: PurchaseRecord,
  weeklyMax: Map<string, Map<string, number>>
): number | null {
  const prevWeekKey = isoWeekKey(subDays(parseISO(rec.date), 7).toISOString());
  return weeklyMax.get(rec.productId)?.get(prevWeekKey) ?? null;
}
```

- [ ] **Step 2: Write the failing self-check**

Create `scripts/checks/sku-pnl.check.ts`:

```ts
import assert from "node:assert";
import {
  isoWeekKey,
  buildWeeklyMax,
  acuanForRecord,
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

console.log("Task 1 checks passed");
```

- [ ] **Step 3: Run the check to verify it passes**

Run: `npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' scripts/checks/sku-pnl.check.ts`
Expected: prints `Task 1 checks passed`, exit 0. (If it fails, fix `src/lib/sku-pnl.ts` until green.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/sku-pnl.ts scripts/checks/sku-pnl.check.ts
git commit -m "feat(sku-pnl): weekly acuan (max buy price of previous ISO week)"
```

---

### Task 2: Physical-loss classification

**Files:**
- Modify: `src/lib/sku-pnl.ts`
- Modify (test): `scripts/checks/sku-pnl.check.ts`

**Interfaces:**
- Consumes: Task 1 module.
- Produces:
  - `type LossBucket = 'reject' | 'missing' | 'waste' | 'return'`
  - `interface MovementLike { kind: string; referenceType?: string; source?: string; destination?: string; stockDelta: number; note?: string }`
  - `classifyLossMovement(m: MovementLike): LossBucket | null` — returns the bucket a `StockMovement` belongs to, or `null` if it is not a loss (including vendor-replaceable rejects and opname surpluses).

- [ ] **Step 1: Add the classifier to `src/lib/sku-pnl.ts`**

Append to `src/lib/sku-pnl.ts`:

```ts
// --- Physical loss classification (maps existing StockMovements to buckets) ---

export type LossBucket = "reject" | "missing" | "waste" | "return";

export interface MovementLike {
  kind: string;
  referenceType?: string;
  source?: string;
  destination?: string;
  stockDelta: number;
  note?: string;
}

const WASTE_RE = /busuk|waste|rusak|expired|kadaluarsa|kadaluwarsa/i;

/**
 * Which loss bucket (if any) a stock movement belongs to.
 * - QC reject we eat (Disposal) -> 'reject'. Vendor-replaceable ("Return to Supplier")
 *   and B2C-diversion (kind QC_INVENTORY) are excluded -> not our loss.
 * - Stock-opname deficit -> 'waste' if the note reads spoilage, else 'missing'.
 * - Client return that failed QC -> 'return'.
 */
export function classifyLossMovement(m: MovementLike): LossBucket | null {
  if (m.kind === "RETURN_REJECT") return "return";

  if (m.kind === "ADJUSTMENT") {
    // QC reject disposal: destination stamped "Reject/Write-off"; "Return to Supplier" excluded.
    if (m.referenceType === "QC") {
      return m.destination === "Reject/Write-off" ? "reject" : null;
    }
    // Stock opname: only deficits are losses.
    if (m.source === "Stock Opname" && m.stockDelta < 0) {
      return WASTE_RE.test(m.note ?? "") ? "waste" : "missing";
    }
  }
  return null;
}
```

- [ ] **Step 2: Extend the self-check (before the final `console.log`)**

Insert into `scripts/checks/sku-pnl.check.ts` above `console.log(...)`, and add `classifyLossMovement, MovementLike` to the import from `../../src/lib/sku-pnl`:

```ts
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
```

- [ ] **Step 3: Run the check to verify it passes**

Run: `npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' scripts/checks/sku-pnl.check.ts`
Expected: prints `Task 1 checks passed` after the new asserts run without throwing, exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sku-pnl.ts scripts/checks/sku-pnl.check.ts
git commit -m "feat(sku-pnl): classify stock movements into loss buckets"
```

---

### Task 3: Daily aggregation (variance + losses → per-SKU-per-day rows)

**Files:**
- Modify: `src/lib/sku-pnl.ts`
- Modify (test): `scripts/checks/sku-pnl.check.ts`

**Interfaces:**
- Consumes: Task 1 + Task 2 exports.
- Produces:
  - `interface LossRecord { productId: string; date: string; qty: number; unitCost: number; bucket: LossBucket }`
  - `interface DailySkuPnl { productId: string; date: string; qty: number; avgBuyPrice: number; acuan: number | null; varianceAmount: number; lossReject: number; lossMissing: number; lossWaste: number; lossReturn: number; lossTotal: number; netPnl: number; hasDraft: boolean }`
  - `aggregateDaily(purchases: PurchaseRecord[], losses: LossRecord[]): DailySkuPnl[]` — one row per `productId`+calendar-day (`yyyy-MM-dd`), sorted by date desc then productId. `varianceAmount = acuan == null ? 0 : (acuan - avgBuyPrice) * qty` (positive = untung). `netPnl = varianceAmount - lossTotal`.

- [ ] **Step 1: Add the aggregator to `src/lib/sku-pnl.ts`**

Append to `src/lib/sku-pnl.ts` (add `format` to the `date-fns` import line):

```ts
// add `format` to the existing date-fns import:
//   import { parseISO, subDays, getISOWeek, getISOWeekYear, format } from "date-fns";

export interface LossRecord {
  productId: string;
  date: string;
  qty: number;
  unitCost: number;
  bucket: LossBucket;
}

export interface DailySkuPnl {
  productId: string;
  date: string; // yyyy-MM-dd
  qty: number;
  avgBuyPrice: number;
  acuan: number | null;
  varianceAmount: number;
  lossReject: number;
  lossMissing: number;
  lossWaste: number;
  lossReturn: number;
  lossTotal: number;
  netPnl: number;
  hasDraft: boolean;
}

const dayKey = (dateIso: string) => format(parseISO(dateIso), "yyyy-MM-dd");
const rowKey = (productId: string, day: string) => `${productId}__${day}`;

/** One row per SKU per calendar day: weighted-avg buy price, variance vs acuan, summed losses. */
export function aggregateDaily(
  purchases: PurchaseRecord[],
  losses: LossRecord[]
): DailySkuPnl[] {
  const weeklyMax = buildWeeklyMax(purchases);

  const rows = new Map<string, DailySkuPnl>();
  const priceQtySum = new Map<string, number>(); // sum(price*qty) for weighted avg

  const ensure = (productId: string, day: string): DailySkuPnl => {
    const k = rowKey(productId, day);
    let r = rows.get(k);
    if (!r) {
      r = {
        productId,
        date: day,
        qty: 0,
        avgBuyPrice: 0,
        acuan: null,
        varianceAmount: 0,
        lossReject: 0,
        lossMissing: 0,
        lossWaste: 0,
        lossReturn: 0,
        lossTotal: 0,
        netPnl: 0,
        hasDraft: false,
      };
      rows.set(k, r);
      priceQtySum.set(k, 0);
    }
    return r;
  };

  // Purchases -> qty, weighted avg price, acuan, draft flag
  for (const p of purchases) {
    const day = dayKey(p.date);
    const k = rowKey(p.productId, day);
    const r = ensure(p.productId, day);
    r.qty += p.qtyReceived;
    priceQtySum.set(k, (priceQtySum.get(k) ?? 0) + p.actualUnitPrice * p.qtyReceived);
    if (!p.finalized) r.hasDraft = true;
    // acuan is a per-product/per-week constant; last write wins (identical within a day)
    r.acuan = acuanForRecord(p, weeklyMax);
  }

  // Losses -> bucket sums
  for (const l of losses) {
    const day = dayKey(l.date);
    const r = ensure(l.productId, day);
    const amt = l.qty * l.unitCost;
    if (l.bucket === "reject") r.lossReject += amt;
    else if (l.bucket === "missing") r.lossMissing += amt;
    else if (l.bucket === "waste") r.lossWaste += amt;
    else if (l.bucket === "return") r.lossReturn += amt;
  }

  // Finalize derived fields
  for (const [k, r] of rows) {
    r.avgBuyPrice = r.qty > 0 ? (priceQtySum.get(k) ?? 0) / r.qty : 0;
    r.varianceAmount = r.acuan == null ? 0 : (r.acuan - r.avgBuyPrice) * r.qty;
    r.lossTotal = r.lossReject + r.lossMissing + r.lossWaste + r.lossReturn;
    r.netPnl = r.varianceAmount - r.lossTotal;
  }

  return Array.from(rows.values()).sort(
    (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.productId.localeCompare(b.productId))
  );
}
```

- [ ] **Step 2: Extend the self-check (before the final `console.log`)**

Add `aggregateDaily, LossRecord` to the import, then insert:

```ts
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
```

- [ ] **Step 3: Run the check to verify it passes**

Run: `npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' scripts/checks/sku-pnl.check.ts`
Expected: prints `Task 1 checks passed`, exit 0. (Rename the final log to `"All sku-pnl checks passed"` if preferred.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/sku-pnl.ts scripts/checks/sku-pnl.check.ts
git commit -m "feat(sku-pnl): daily per-SKU aggregation of variance and losses"
```

---

### Task 4: Report page + navigation

**Files:**
- Create: `src/app/finance/sku-pnl/page.tsx`
- Modify: `src/lib/navigation.tsx` (add nav entry near line 52, after `finance_reports`)
- Modify: `src/types/index.ts:17-18` (add `'finance_sku_pnl'` to `PermissionKey`)

**Interfaces:**
- Consumes: `aggregateDaily`, `classifyLossMovement`, `PurchaseRecord`, `LossRecord`, `DailySkuPnl` from `@/lib/sku-pnl`; store selectors `products`, `purchases`, `purchaseItems`, `stockMovements` from `@/lib/store`; `formatRupiah` from `@/lib/utils`.
- Produces: a Finance route at `/finance/sku-pnl`.

- [ ] **Step 1: Add the permission key**

In `src/types/index.ts`, line 17, add `finance_sku_pnl` to the `PermissionKey` union (same line as the other finance keys):

```ts
  | 'finance_dashboard' | 'finance_approvals' | 'finance_reports' | 'finance_assets' | 'finance_sku_pnl'
```

- [ ] **Step 2: Add the nav entry**

In `src/lib/navigation.tsx`, immediately after the `finance_reports` entry (line 52), add:

```tsx
  { key: 'finance_sku_pnl', title: 'Untung Rugi per SKU', href: '/finance/sku-pnl', icon: <BarChart3 className="h-4 w-4 text-emerald-500" />, category: 'Finance' },
```

(`BarChart3` is already imported in this file — reuse it.)

- [ ] **Step 3: Create the report page**

Create `src/app/finance/sku-pnl/page.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { formatRupiah } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  aggregateDaily,
  classifyLossMovement,
  PurchaseRecord,
  LossRecord,
} from "@/lib/sku-pnl";

export default function SkuPnlPage() {
  const products = useAppStore((s) => s.products);
  const purchases = useAppStore((s) => s.purchases);
  const purchaseItems = useAppStore((s) => s.purchaseItems);
  const stockMovements = useAppStore((s) => s.stockMovements);

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  // Map store -> pure-module inputs.
  const rows = useMemo(() => {
    const purchaseById = new Map(purchases.map((p) => [p.id, p]));

    const purchaseRecords: PurchaseRecord[] = purchaseItems
      .filter((pi) => !pi.isOnlineOrdered) // "beli ke pasar": exclude online
      .map((pi) => {
        const parent = purchaseById.get(pi.purchaseId);
        if (!parent) return null;
        const price = pi.actualUnitPrice ?? 0;
        if (!(price > 0)) return null; // not yet priced -> skip
        return {
          productId: pi.productId,
          date: parent.date,
          actualUnitPrice: price,
          qtyReceived: pi.inboundQtyReceived ?? pi.qtyPurchased,
          finalized: !!pi.inboundStatus && pi.inboundStatus !== "pra_inbound",
        } as PurchaseRecord;
      })
      .filter((r): r is PurchaseRecord => r !== null);

    const lossRecords: LossRecord[] = stockMovements
      .map((m) => {
        const bucket = classifyLossMovement({
          kind: m.kind,
          referenceType: m.referenceType,
          source: m.source,
          destination: m.destination,
          stockDelta: m.stockDelta,
          note: m.note,
        });
        if (!bucket) return null;
        // ponytail: unitCost fallback to basePrice; client-return movements carry no
        // unitCost, so they fall back to basePrice — matches how the GL books them.
        const unitCost = m.unitCost ?? productById.get(m.productId)?.basePrice ?? 0;
        return {
          productId: m.productId,
          date: m.date,
          qty: m.quantity,
          unitCost,
          bucket,
        } as LossRecord;
      })
      .filter((r): r is LossRecord => r !== null);

    return aggregateDaily(purchaseRecords, lossRecords);
  }, [purchases, purchaseItems, stockMovements, productById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (!q) return true;
      const p = productById.get(r.productId);
      return (
        (p?.name ?? "").toLowerCase().includes(q) ||
        (p?.skuCode ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, from, to, productById]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => {
          acc.variance += r.varianceAmount;
          acc.loss += r.lossTotal;
          acc.net += r.netPnl;
          return acc;
        },
        { variance: 0, loss: 0, net: 0 }
      ),
    [filtered]
  );

  const money = (n: number) => formatRupiah(Math.round(n));
  const signClass = (n: number) =>
    n > 0 ? "text-emerald-600" : n < 0 ? "text-rose-600" : "text-muted-foreground";

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">Untung Rugi per SKU</h1>
        <p className="text-sm text-muted-foreground">
          Selisih harga beli vs acuan mingguan (harga tertinggi minggu lalu) plus
          kerugian fisik (reject, hilang, waste, retur). Selisih harga = KPI, tidak
          menyentuh GL; kerugian fisik sudah tercatat di jurnal (5-2000).
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <div className="grow">
            <Label htmlFor="search">Cari SKU</Label>
            <Input
              id="search"
              placeholder="Nama atau kode SKU"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="from">Dari</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="to">Sampai</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Selisih Harga (KPI)</CardTitle></CardHeader>
          <CardContent className={`text-xl font-bold ${signClass(totals.variance)}`}>{money(totals.variance)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Kerugian Fisik</CardTitle></CardHeader>
          <CardContent className="text-xl font-bold text-rose-600">{money(totals.loss)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Net Untung/Rugi</CardTitle></CardHeader>
          <CardContent className={`text-xl font-bold ${signClass(totals.net)}`}>{money(totals.net)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2">Tanggal</th>
                <th className="p-2">SKU</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">Avg Beli</th>
                <th className="p-2 text-right">Acuan</th>
                <th className="p-2 text-right">Selisih</th>
                <th className="p-2 text-right">Reject</th>
                <th className="p-2 text-right">Hilang</th>
                <th className="p-2 text-right">Waste</th>
                <th className="p-2 text-right">Retur</th>
                <th className="p-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const p = productById.get(r.productId);
                return (
                  <tr key={`${r.productId}-${r.date}`} className="border-b hover:bg-muted/40">
                    <td className="p-2 whitespace-nowrap">{r.date}</td>
                    <td className="p-2">
                      <div className="font-medium">{p?.name ?? r.productId}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {p?.skuCode}
                        {r.hasDraft && <Badge variant="outline" className="text-amber-600">draft</Badge>}
                      </div>
                    </td>
                    <td className="p-2 text-right">{r.qty}</td>
                    <td className="p-2 text-right">{r.qty > 0 ? money(r.avgBuyPrice) : "—"}</td>
                    <td className="p-2 text-right">{r.acuan == null ? "—" : money(r.acuan)}</td>
                    <td className={`p-2 text-right ${signClass(r.varianceAmount)}`}>{r.acuan == null ? "—" : money(r.varianceAmount)}</td>
                    <td className="p-2 text-right text-rose-600">{r.lossReject ? money(-r.lossReject) : "—"}</td>
                    <td className="p-2 text-right text-rose-600">{r.lossMissing ? money(-r.lossMissing) : "—"}</td>
                    <td className="p-2 text-right text-rose-600">{r.lossWaste ? money(-r.lossWaste) : "—"}</td>
                    <td className="p-2 text-right text-rose-600">{r.lossReturn ? money(-r.lossReturn) : "—"}</td>
                    <td className={`p-2 text-right font-semibold ${signClass(r.netPnl)}`}>{money(r.netPnl)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Tidak ada data.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles and the route renders**

Run: `npm run lint` — expect no new errors in the three changed files.
Then run: `npm run dev`, open `http://localhost:3000/finance/sku-pnl`, confirm the page renders, the summary cards populate, the SKU search and date filters narrow the table, and draft rows show the `draft` badge. (Verify `stockMovements` is a real store selector — it is referenced in `store.ts`; if the selector name differs, align the import.)

- [ ] **Step 5: Commit**

```bash
git add src/app/finance/sku-pnl/page.tsx src/lib/navigation.tsx src/types/index.ts
git commit -m "feat(finance): Untung Rugi per SKU daily report page"
```

---

## Self-Review

**1. Spec coverage:**
- One place, per SKU per date → Task 3 `aggregateDaily` (row per productId+day) + Task 4 page. ✓
- Acuan = max buy price of previous ISO week, global per SKU → Task 1 `buildWeeklyMax` + `acuanForRecord`. ✓
- Cheaper than acuan = untung → Task 3 `varianceAmount` sign (positive when acuan > avgBuyPrice). ✓
- Variance qty basis = received → Task 3 uses `qtyReceived`; Task 4 maps `inboundQtyReceived ?? qtyPurchased`. ✓
- Loss buckets separate (reject/missing/waste/return) → Task 2 `classifyLossMovement`, Task 3 four sums. ✓
- Vendor-replaceable reject not a loss → Task 2 excludes `"Return to Supplier"`. ✓
- Losses valued at actual `unitCost` (fallback basePrice) → Task 4 mapping. ✓
- Client return valued at buy cost, booked on return date → Task 2 `'return'` bucket by movement date; valued at `unitCost ?? basePrice` (documented fallback). ✓
- Loss booked on the day it is discovered (not purchase day) → losses keyed by the stock movement's own `date`. ✓
- Draft vs final → Task 3 `hasDraft`, Task 4 badge. ✓
- Scope excludes Shopee/online → Task 4 `!pi.isOnlineOrdered`. ✓
- Aggregate row per SKU per day, weighted-avg buy price, raw kept → Task 3 (derived rows; raw store untouched). ✓
- GL: physical losses already post to `5-2000` via existing flows; variance never posts → no GL code added, documented in header + page copy. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". All steps carry full code and exact run commands. ✓

**3. Type consistency:** `PurchaseRecord`, `LossRecord`, `MovementLike`, `DailySkuPnl`, `LossBucket`, and function names (`isoWeekKey`, `buildWeeklyMax`, `acuanForRecord`, `classifyLossMovement`, `aggregateDaily`) are used identically across Tasks 1–4 and the page import. ✓

## Open follow-ups (not blocking)

- **Missing vs waste split is a keyword heuristic** on the opname note (`WASTE_RE`). If finance wants a hard split, add a `lossReason` enum to the opname form and classify on that instead — one-field change, no rearchitecture.
- **Client-return valuation** uses `basePrice` (no per-lot cost is recoverable at return time). If exact lot cost is ever needed, it requires lot tracking, which is out of scope here.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-02-sku-daily-pnl.md`.

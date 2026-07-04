# Backorder / Kurang Kirim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track the qty a client is still owed when we ship less than ordered (QC shortfall or BAST reject), keep the SO open as `Kurang Kirim`, and let the remainder flow back through QC → delivery → BAST as a fresh round until fully delivered.

**Architecture:** Add a cumulative `qtyDelivered` (accepted) counter per SO item; `owed = qty − qtyDelivered`. Each delivery round books only that round's qty via a **fresh invoice + fresh delivery**. At BAST, fold accepted qty into `qtyDelivered`, reset that item's `qtyFinal` so it re-enters QC, and set SO status to `Kurang Kirim` (owed remains) or `Selesai` (owed cleared). All shortfall math lives in one pure module.

**Tech Stack:** Next.js 16 (App Router), Zustand store (`src/lib/store.ts`), Supabase sync via `/api/db`, TypeScript. No unit-test framework in repo — pure logic is checked with a `tsx` self-check script; integration changes are checked with `npm run build` (typecheck) + preview.

---

## Model recap (why `qtyFinal` resets at BAST)

Two counters per `SalesOrderItem`:
- `qtyFinal` — **current round's** QC-committed qty. Reset to `undefined` after that round's BAST.
- `qtyDelivered` — **cumulative accepted** qty across all rounds. Only grows.

`owed = qty − (qtyDelivered ?? 0)`. QC top-up needs `needed = qty − qtyDelivered − qtyFinal`.
Resetting `qtyFinal` at BAST is required so BAST **rejects** (client accepts less than shipped)
also re-enter QC — a cumulative `qtyFinal` would under-count the owed remainder.

## File structure

- **Create** `src/lib/backorder.ts` — pure shortfall helpers (`qtyOwed`, `roundQtyToBook`, `nextSoStatus`). One responsibility: fulfillment arithmetic. No store/React imports.
- **Create** `src/lib/backorder.check.ts` — runnable `assert` self-check for the above.
- **Modify** `src/types/index.ts` — add field + status.
- **Modify** `src/lib/constants.ts` — status color.
- **Modify** `src/app/warehouse/qc/page.tsx` — re-QC eligibility + `needed` formula + Packing push condition.
- **Modify** `src/app/warehouse/outbound/page.tsx` — fresh delivery per round.
- **Modify** `src/lib/accounting.ts` — `finalizeSalesOrderDelivery` per-round booking.
- **Modify** `src/app/finance/approvals/page.tsx` — `handleVerifyDelivery` per-round booking.
- **Modify** `src/app/admin/sales-orders/page.tsx` — `handleConfirmBAST` accumulation + status + Owed column.
- **DB migration** (Supabase, project `ckkohudfuisgzlrjipev`) — add `qty_delivered` column.

---

### Task 1: Types — add `qtyDelivered` and `Kurang Kirim` status

**Files:**
- Modify: `src/types/index.ts:151` and `src/types/index.ts:173-188`

- [ ] **Step 1: Add the status to the union**

In `src/types/index.ts:151`, change:
```ts
export type SalesOrderStatus = 'Pending Approval' | 'Draft' | 'Belanja' | 'Sourcing' | 'QC' | 'Packing' | 'Siap Kirim' | 'Dikirim' | 'Awaiting Audit' | 'Terkirim' | 'Selesai' | 'Batal';
```
to:
```ts
export type SalesOrderStatus = 'Pending Approval' | 'Draft' | 'Belanja' | 'Sourcing' | 'QC' | 'Packing' | 'Siap Kirim' | 'Dikirim' | 'Awaiting Audit' | 'Terkirim' | 'Kurang Kirim' | 'Selesai' | 'Batal';
```

- [ ] **Step 2: Add the field to `SalesOrderItem`**

In `src/types/index.ts`, inside `interface SalesOrderItem` after the `qtyFinal?` line (`:178`), add:
```ts
  qtyDelivered?: number;    // Cumulative qty ACCEPTED by client across all delivery rounds. owed = qty - qtyDelivered
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: compiles (no type errors from these additions).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(backorder): add qtyDelivered field and Kurang Kirim status"
```

---

### Task 2: Pure shortfall helpers + self-check

**Files:**
- Create: `src/lib/backorder.ts`
- Create: `src/lib/backorder.check.ts`

- [ ] **Step 1: Write the self-check first (it will fail — module missing)**

Create `src/lib/backorder.check.ts`:
```ts
import assert from 'node:assert/strict';
import { qtyOwed, roundQtyToBook, nextSoStatus } from './backorder';

// qtyOwed = qty - qtyDelivered (floored at 0)
assert.equal(qtyOwed({ qty: 10, qtyDelivered: 0 }), 10);
assert.equal(qtyOwed({ qty: 10, qtyDelivered: 9 }), 1);
assert.equal(qtyOwed({ qty: 10, qtyDelivered: 10 }), 0);
assert.equal(qtyOwed({ qty: 10 }), 10); // qtyDelivered undefined => 0
assert.equal(qtyOwed({ qty: 10, qtyDelivered: 12 }), 0); // never negative

// roundQtyToBook: QC'd round uses qtyFinal; non-QC uses remaining owed
assert.equal(roundQtyToBook({ qty: 10, qtyFinal: 9, qtyDelivered: 0 }), 9); // round 1 QC 9
assert.equal(roundQtyToBook({ qty: 10, qtyFinal: 1, qtyDelivered: 9 }), 1); // round 2 QC 1
assert.equal(roundQtyToBook({ qty: 10, qtyDelivered: 0 }), 10); // never QC'd => full owed
assert.equal(roundQtyToBook({ qty: 10, qtyDelivered: 8 }), 2); // non-QC, partly delivered
assert.equal(roundQtyToBook({ qty: 10, qtyFinal: 0, qtyDelivered: 10 }), 0);

// nextSoStatus: Kurang Kirim while any item still owed, else Selesai
assert.equal(nextSoStatus([{ qty: 10, qtyDelivered: 10 }]), 'Selesai');
assert.equal(nextSoStatus([{ qty: 10, qtyDelivered: 9 }]), 'Kurang Kirim');
assert.equal(nextSoStatus([{ qty: 5, qtyDelivered: 5 }, { qty: 10, qtyDelivered: 8 }]), 'Kurang Kirim');
assert.equal(nextSoStatus([{ qty: 5, qtyDelivered: 5 }, { qty: 10, qtyDelivered: 10 }]), 'Selesai');

console.log('backorder.check: all assertions passed');
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx tsx src/lib/backorder.check.ts`
Expected: FAIL — `Cannot find module './backorder'`.

- [ ] **Step 3: Implement the module**

Create `src/lib/backorder.ts`:
```ts
// Pure fulfillment arithmetic for the backorder ("Kurang Kirim") flow.
// No store/React imports so it stays trivially testable.

/** Minimal shape these helpers read from a SalesOrderItem. */
type ItemFulfillment = {
  qty: number;              // ordered
  qtyFinal?: number;        // current round's QC-committed qty (reset to undefined after each round's BAST)
  qtyDelivered?: number;    // cumulative accepted across rounds
};

/** Qty the client is still owed = ordered minus cumulative accepted. */
export function qtyOwed(item: ItemFulfillment): number {
  return Math.max(0, item.qty - (item.qtyDelivered ?? 0));
}

/**
 * Qty to book (revenue/HPP/stock) for the delivery round about to be finalized.
 * If the round went through QC, qtyFinal is that round's committed qty.
 * If it never went through QC (direct ship), book the remaining owed qty.
 */
export function roundQtyToBook(item: ItemFulfillment): number {
  if (item.qtyFinal != null) return Math.max(0, item.qtyFinal);
  return qtyOwed(item);
}

/** SO status after a BAST round: still owed anywhere => Kurang Kirim, else Selesai. */
export function nextSoStatus(items: ItemFulfillment[]): 'Kurang Kirim' | 'Selesai' {
  return items.some(i => qtyOwed(i) > 0) ? 'Kurang Kirim' : 'Selesai';
}
```

- [ ] **Step 4: Run the self-check to confirm it passes**

Run: `npx tsx src/lib/backorder.check.ts`
Expected: `backorder.check: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/backorder.ts src/lib/backorder.check.ts
git commit -m "feat(backorder): pure shortfall helpers with self-check"
```

---

### Task 3: Status color for `Kurang Kirim`

**Files:**
- Modify: `src/lib/constants.ts:282`

- [ ] **Step 1: Add the color entry**

In `src/lib/constants.ts`, inside `STATUS_COLORS`, add a line after `Terkirim: ...` (`:282`):
```ts
  'Kurang Kirim': 'bg-amber-100 text-amber-800 border-amber-200',
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add src/lib/constants.ts
git commit -m "feat(backorder): amber badge color for Kurang Kirim"
```

---

### Task 4: DB migration — `qty_delivered` column

**Files:**
- Supabase project `ckkohudfuisgzlrjipev`, table `sales_order_items`.

- [ ] **Step 1: Apply migration**

Use the Supabase `apply_migration` tool (name: `sales_order_items_qty_delivered`) with SQL:
```sql
alter table public.sales_order_items add column if not exists qty_delivered numeric;
```
(Nullable; camelCase `qtyDelivered` ⇄ snake `qty_delivered` mapping is automatic in `src/app/api/db/route.ts`.)

- [ ] **Step 2: Verify**

Run this SQL via the Supabase `execute_sql` tool:
```sql
select column_name, is_nullable, data_type from information_schema.columns
where table_name = 'sales_order_items' and column_name = 'qty_delivered';
```
Expected: one row, `is_nullable = YES`.

- [ ] **Step 3: No commit** (schema change is remote-only; nothing to stage).

---

### Task 5: QC — allow re-QC of backordered items + correct `needed`

**Files:**
- Modify: `src/app/warehouse/qc/page.tsx:62-78` (`buildFifoAllocations`), `:301-309` (Packing push), `:555-560` (render `needed`)

- [ ] **Step 1: Fix eligibility + needed in `buildFifoAllocations`**

In `src/app/warehouse/qc/page.tsx`, replace the body of `buildFifoAllocations` (lines 63-75) — specifically the two filters and the `needed` line — so it reads:
```ts
    const eligibleSos = salesOrders
      .filter(so => !['Batal', 'Selesai', 'Terkirim', 'Packing', 'Siap Kirim', 'Dikirim', 'Awaiting Audit'].includes(so.status))
      .filter(so => salesOrderItems.some(i =>
        i.salesOrderId === so.id &&
        i.productId === productId &&
        Math.max(0, i.qty - (i.qtyDelivered ?? 0) - (i.qtyFinal ?? 0)) > 0
      ))
      .sort((a, b) => a.orderDate.localeCompare(b.orderDate))

    let remaining = totalPassed
    const allocations: PoAllocation[] = eligibleSos.map(so => {
      const soItem = salesOrderItems.find(i => i.salesOrderId === so.id && i.productId === productId)
      const needed = soItem ? Math.max(0, soItem.qty - (soItem.qtyDelivered ?? 0) - (soItem.qtyFinal ?? 0)) : 0
      const alloc = Math.min(needed, remaining)
      remaining -= alloc
      return { soId: so.id, qty: alloc }
    })
```
(`'Kurang Kirim'` is intentionally NOT in the excluded-status list, so a backordered SO is eligible. The eligibility now keys on remaining-to-QC `> 0` instead of `qtyFinal == null`.)

- [ ] **Step 2: Fix the Packing-push condition**

In `src/app/warehouse/qc/page.tsx:306`, change:
```ts
      if (soItems.length > 0 && soItems.every(i => i.qtyFinal != null)) {
```
to:
```ts
      if (soItems.length > 0 && soItems.every(i => (i.qtyFinal != null) || (i.qty - (i.qtyDelivered ?? 0) <= 0))) {
```
(An already-fully-delivered item has `qtyFinal` reset to null but 0 owed — it must not block the push.)

- [ ] **Step 3: Fix the render-side `needed` (line ~558)**

In `src/app/warehouse/qc/page.tsx:558`, change:
```ts
                            const needed = soItem ? Math.max(0, soItem.qty - (soItem.qtyFinal ?? 0)) : 0
```
to:
```ts
                            const needed = soItem ? Math.max(0, soItem.qty - (soItem.qtyDelivered ?? 0) - (soItem.qtyFinal ?? 0)) : 0
```

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add src/app/warehouse/qc/page.tsx
git commit -m "feat(backorder): re-QC backordered items, needed = owed - inflight"
```

---

### Task 6: Outbound — fresh delivery per round

**Files:**
- Modify: `src/app/warehouse/outbound/page.tsx:59-69`

- [ ] **Step 1: Only skip creating a delivery when an OPEN one exists**

In `src/app/warehouse/outbound/page.tsx:60`, change:
```ts
    const alreadyHasDelivery = existingDeliveries.some(d => d.salesOrderId === soId);
```
to:
```ts
    // A completed (Terkirim) delivery from a previous round must NOT block a new
    // round's delivery — only an in-flight delivery should.
    const alreadyHasDelivery = existingDeliveries.some(d => d.salesOrderId === soId && d.status !== 'Terkirim');
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add src/app/warehouse/outbound/page.tsx
git commit -m "feat(backorder): create a fresh delivery for each new round"
```

---

### Task 7: Per-round booking in `finalizeSalesOrderDelivery`

**Files:**
- Modify: `src/lib/accounting.ts:679-742`

- [ ] **Step 1: Import the helper**

At the top of `src/lib/accounting.ts`, add to the existing imports:
```ts
import { roundQtyToBook } from './backorder';
```

- [ ] **Step 2: Book only this round's qty, with a fresh invoice + delivery**

In `finalizeSalesOrderDelivery` (`src/lib/accounting.ts:679`), replace the revenue calc, invoice reuse, delivery reuse, and COGS loop (lines 684-732) with round-scoped logic. The function body from `const soItems = ...` through the `recordDeliveryAndInvoice` call becomes:
```ts
  const soItems = store.salesOrderItems.filter(i => i.salesOrderId === soId);
  const roundQtyById = new Map(soItems.map(i => [i.id, roundQtyToBook(i)]));
  const totalRevenue = soItems.reduce((sum, item) => sum + ((roundQtyById.get(item.id) ?? 0) * item.unitPrice), 0);

  // Nothing left to ship this round → nothing to book.
  if (totalRevenue <= 0 && soItems.every(i => (roundQtyById.get(i.id) ?? 0) <= 0)) {
    return true;
  }

  store.beginUndoableBatch();
  try {
    // Fresh invoice for THIS round (never reuse an already-booked one).
    const invoiceId = uuidv4();
    await store.addInvoice({
      id: invoiceId,
      salesOrderId: soId,
      clientId: so.clientId || '',
      issueDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      totalAmount: totalRevenue,
      amountPaid: 0,
      status: 'Unpaid',
    });

    // Fresh delivery for THIS round.
    const deliveryId = uuidv4();
    await store.addDelivery({
      id: deliveryId,
      salesOrderId: soId,
      courierId: '',
      status: 'Terkirim',
      deliveryDate: new Date().toISOString(),
      invoiceId,
      notes: 'Manual ship (PO page)',
    });

    let totalCogs = 0;
    const stockDeductionItems: { productId: string; qty: number }[] = [];
    soItems.forEach(item => {
      const roundQty = roundQtyById.get(item.id) ?? 0;
      if (roundQty <= 0) return;
      let pItem = store.purchaseItems.find(pi => pi.salesOrderId === soId && pi.productId === item.productId && pi.actualUnitPrice > 0);
      if (!pItem) pItem = store.purchaseItems.filter(pi => pi.productId === item.productId && pi.actualUnitPrice > 0).pop();
      const unitCogs = pItem ? pItem.actualUnitPrice : (store.products.find(p => p.id === item.productId)?.basePrice || 0);
      totalCogs += unitCogs * roundQty;
      stockDeductionItems.push({ productId: item.productId, qty: roundQty });
    });

    const ok = await recordDeliveryAndInvoice(deliveryId, invoiceId, totalRevenue, totalCogs, stockDeductionItems, false);
    if (!ok) return false;
    return true;
  } finally {
```
Leave the existing `finally { ... }` block (which closes the undo batch) intact. Delete the now-obsolete `existingInvoice`/`existingDelivery` lookups and the `updateDelivery` status branch that referenced them.

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add src/lib/accounting.ts
git commit -m "feat(backorder): per-round invoice+delivery booking in finalizeSalesOrderDelivery"
```

---

### Task 8: Per-round booking in finance delivery audit

**Files:**
- Modify: `src/app/finance/approvals/page.tsx:566-621`

- [ ] **Step 1: Import the helper**

In `src/app/finance/approvals/page.tsx`, add a new import line:
```ts
import { roundQtyToBook } from "@/lib/backorder"
```

- [ ] **Step 2: Scope revenue/COGS/stock to this round and force a fresh invoice**

In `handleVerifyDelivery` (`src/app/finance/approvals/page.tsx:566`), replace lines 574-608 (the `totalRevenue` calc through the COGS loop) with:
```ts
    const soItems = salesOrderItems.filter(i => i.salesOrderId === soId)
    const roundQtyById = new Map(soItems.map(i => [i.id, roundQtyToBook(i)]))
    const totalRevenue = soItems.reduce((sum, item) => sum + ((roundQtyById.get(item.id) ?? 0) * item.unitPrice), 0)

    // Reuse the delivery's own invoice only if it is not already booked; otherwise
    // this is a new round → create a fresh invoice so recordDeliveryAndInvoice books it.
    const bookedInvoiceIds = new Set(
      useAppStore.getState().journalEntries
        .filter(e => e.referenceType === 'Invoice')
        .map(e => e.referenceId)
    )
    let invoiceId = delivery?.invoiceId
    if (!invoiceId || bookedInvoiceIds.has(invoiceId)) {
      const so = salesOrders.find(s => s.id === soId)
      invoiceId = uuidv4()
      await useAppStore.getState().addInvoice({
        id: invoiceId,
        salesOrderId: soId,
        clientId: so?.clientId || '',
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        totalAmount: totalRevenue,
        amountPaid: 0,
        status: 'Unpaid' as const
      })
      await updateDelivery(deliveryId, { invoiceId })
    }

    let totalCogs = 0
    const stockDeductionItems: { productId: string, qty: number }[] = []
    soItems.forEach(item => {
      const roundQty = roundQtyById.get(item.id) ?? 0
      if (roundQty <= 0) return
      let pItem = purchaseItems.find(pi => pi.salesOrderId === soId && pi.productId === item.productId && pi.actualUnitPrice > 0)
      if (!pItem) {
        pItem = purchaseItems.filter(pi => pi.productId === item.productId && pi.actualUnitPrice > 0).pop()
      }
      const unitCogs = pItem ? pItem.actualUnitPrice : (products.find(p => p.id === item.productId)?.basePrice || 0)
      totalCogs += (unitCogs * roundQty)
      stockDeductionItems.push({ productId: item.productId, qty: roundQty })
    })
```
(The subsequent `isFastTrack` line and `recordDeliveryAndInvoice(deliveryId, invoiceId, totalRevenue, totalCogs, stockDeductionItems, isFastTrack)` call stay unchanged.)

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: compiles (confirm `useAppStore` and `uuidv4` are already imported in this file — they are used elsewhere in it).

- [ ] **Step 4: Commit**

```bash
git add src/app/finance/approvals/page.tsx
git commit -m "feat(backorder): per-round booking in finance delivery audit"
```

---

### Task 9: BAST — accumulate `qtyDelivered`, set status, reset `qtyFinal`

**Files:**
- Modify: `src/app/admin/sales-orders/page.tsx:179-240` (`handleConfirmBAST`)
- Add import of `roundQtyToBook`, `nextSoStatus` from `@/lib/backorder`.

- [ ] **Step 1: Import helpers**

In `src/app/admin/sales-orders/page.tsx`, add:
```ts
import { roundQtyToBook, nextSoStatus } from "@/lib/backorder"
```

- [ ] **Step 2: Rewrite `handleConfirmBAST`**

Replace the body of `handleConfirmBAST` (`src/app/admin/sales-orders/page.tsx:179-240`) with:
```ts
  const handleConfirmBAST = async () => {
    if (!selectedSO) return
    toast.loading("Memproses konfirmasi penerimaan...", { id: "confirm-bast" })
    try {
      let totalQtyRetur = 0
      // Snapshot updated items so we can recompute SO status afterwards.
      const updatedItems: { qty: number; qtyDelivered: number }[] = []

      for (const item of selectedItems) {
        // Qty actually shipped THIS round (before this BAST folds into qtyDelivered).
        const shippedThisRound = roundQtyToBook(item)
        const status = bastStatuses[item.id] || 'Accepted'

        let accepted = shippedThisRound
        if (status === 'Return') {
          accepted = 0
        } else if (status === 'Partial') {
          accepted = bastQtyPass[item.id] !== undefined ? bastQtyPass[item.id] : shippedThisRound
        }
        accepted = Math.max(0, Math.min(accepted, shippedThisRound))
        const qtyRetur = shippedThisRound - accepted

        if (qtyRetur > 0) {
          totalQtyRetur += qtyRetur
          await useAppStore.getState().addRejectedItem({
            id: uuidv4(),
            date: new Date().toISOString(),
            productId: item.productId,
            qty: qtyRetur,
            reason: bastReasons[item.id] || 'Retur BAST Delivery',
            source: 'Return',
            referenceId: selectedSO.id,
            reportedBy: currentUser?.id || 'system'
          })
        }

        const newQtyDelivered = (item.qtyDelivered ?? 0) + accepted
        // Fold this round into cumulative delivered; reset qtyFinal so any remaining
        // owed qty re-enters the QC queue as the next round.
        await updateSalesOrderItem(item.id, {
          qtyDelivered: newQtyDelivered,
          qtyFinal: undefined,
          subtotalFinal: newQtyDelivered * item.unitPrice
        })
        updatedItems.push({ qty: item.qty, qtyDelivered: newQtyDelivered })
      }

      const soStatus = nextSoStatus(updatedItems)
      await updateSalesOrder(selectedSO.id, {
        status: soStatus,
        deliveredAt: new Date().toISOString()
      })

      setIsDetailOpen(false)
      toast.success(
        soStatus === 'Kurang Kirim'
          ? `BAST dikonfirmasi! Sisa kurang kirim masuk antrean susulan (QC).`
          : (totalQtyRetur > 0
              ? `BAST dikonfirmasi! ${totalQtyRetur} barang retur dicatat.`
              : "BAST dikonfirmasi! Pesanan selesai."),
        { id: "confirm-bast" }
      )

      setBastStatuses({})
      setBastQtyPass({})
      setBastReasons({})
    } catch (e) {
      console.error(e)
      toast.error("Gagal memproses BAST", { id: "confirm-bast" })
    }
  }
```
Note: `deliveredAt` is already written by the current code (`:224`); if TypeScript complains it is not on `SalesOrder`, keep it exactly as the pre-existing code had it (it compiled before). If `updateSalesOrderItem` rejects `qtyFinal: undefined`, pass `qtyFinal: null as unknown as undefined` OR confirm the store spreads updates (it does: `{ ...d, ...data }`), in which case `undefined` overwrites correctly.

- [ ] **Step 3: Update the BAST modal's displayed "Qty Kirim" and default accepted qty**

Find where the BAST table renders per item (search `bastQtyPass` / `bastStatuses` in the JSX of `src/app/admin/sales-orders/page.tsx`). Wherever the row currently derives its target qty from `item.qtyFinal ?? item.qty`, change it to use this round's shipped qty:
```ts
const shippedThisRound = roundQtyToBook(item)
```
Use `shippedThisRound` for the "QTY KIRIM" cell and as the default value / max of the "QTY DITERIMA" input.

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/sales-orders/page.tsx
git commit -m "feat(backorder): BAST folds accepted into qtyDelivered, sets Kurang Kirim/Selesai"
```

---

### Task 10: SO detail — show `Owed` per item + verify Kurang Kirim is an active order

**Files:**
- Modify: `src/app/admin/sales-orders/page.tsx` (SO detail item list render; active/archived tab filter)

- [ ] **Step 1: Add an Owed indicator in the item detail rows**

In the SO detail "RINCIAN BARANG PESANAN" render, for each item add an owed badge computed as:
```ts
const owed = Math.max(0, item.qty - (item.qtyDelivered ?? 0))
```
Render, when `owed > 0`, a small amber label near the qty column, e.g.:
```tsx
{owed > 0 && (
  <span className="ml-2 text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
    Kurang {owed} {product?.uom}
  </span>
)}
```
(Match the surrounding JSX/variable names for `item` and `product` in that block.)

- [ ] **Step 2: Confirm `Kurang Kirim` sits in the ACTIVE tab, not archived**

Locate the tab filter (search `activeTab` and the status test that splits active vs. archived/finished orders, near `:270` and the list filters). Ensure orders with status `'Kurang Kirim'` are treated as ACTIVE (not filtered out as done). If the filter checks `status !== 'Selesai' && status !== 'Batal'`, `Kurang Kirim` already qualifies — no change. If it uses an explicit allow-list of active statuses, add `'Kurang Kirim'` to it.

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/sales-orders/page.tsx
git commit -m "feat(backorder): show owed qty per item, keep Kurang Kirim in active orders"
```

---

### Task 11: End-to-end verification (preview)

**Files:** none (manual verification).

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: full production build passes with no type errors.

- [ ] **Step 2: Start preview and walk the flow**

Start the dev server (preview_start `dev`), then:
1. Create/find an SO with an item ordered qty 10.
2. In QC, pass 9 (reject 1). Confirm SO advances to Packing.
3. Outbound → handover → finance audit (Terkirim). Confirm a delivery + invoice for **9** were booked (check journal: revenue 9×price, HPP for 9).
4. BAST confirm accepting 9. Confirm SO status becomes **`Kurang Kirim`** (amber badge), item shows **Kurang 1**.
5. Re-buy/allocate the 1kg via QC (it must reappear in the QC queue). Confirm qtyFinal set to 1.
6. Outbound creates a **new** delivery. Finance audit books a **second** invoice/delivery for **1** only (not 10).
7. BAST confirm accepting 1. Confirm SO becomes **`Selesai`**, item owed 0.

- [ ] **Step 3: Check for console/runtime errors**

Use preview_console_logs (level error) and preview_logs (level error). Expected: none related to this flow.

- [ ] **Step 4: Final commit if any fixups were needed**

```bash
git add -A
git commit -m "test(backorder): e2e verification fixups"
```

---

## Self-review notes

- **Spec coverage:** qtyDelivered/owed (T1,T2), Kurang Kirim status+color (T1,T3), QC re-eligibility + needed (T5), per-round fresh invoice+delivery booking at both Terkirim entry points (T6,T7,T8), BAST accumulation + status + qtyFinal reset (T9), UI owed + active-tab (T10), susulan sources reuse existing QC/shopping paths (no code — inherent once T5 lets backordered SOs re-QC), vendor-free = price-0 manual (no code, documented deferral). ✔
- **Booking trigger:** kept at Terkirim per-round per approved refinement (a). ✔
- **Type consistency:** helper names `qtyOwed` / `roundQtyToBook` / `nextSoStatus` used identically in T2 def and T5/T7/T8/T9 consumers. ✔
- **Known limitation:** `accepted < shipped` over-book at Terkirim is pre-existing and out of scope (documented in spec).
```

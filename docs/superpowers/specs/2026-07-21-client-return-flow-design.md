# Client Return Flow: One Rejection Point, Goods Back to Stock

**Date:** 2026-07-21
**Status:** Design approved, not implemented

## Problem

A client rejecting goods on delivery leaks in three ways.

The system asks about rejection twice. The courier captures it on site through the BAST modal, writing `qtyFinal` per item (`src/app/courier/list/page.tsx:53-86`). Finance then books the invoice on that figure via `roundQtyToBook` (`src/lib/accounting.ts:591`), so the invoice is correct. Afterwards, admin is asked again at BAST confirmation — Accepted / Partial / Return per item (`src/app/admin/sales-orders/page.tsx:194-213`).

That second question is where it breaks. Choosing Return logs a `rejectedItem` but still advances `qtyDelivered` by the full shipped round (`:223-230`), so the units are simultaneously recorded as rejected and as delivered. They are invoiced, never restocked, and never re-owed. The code comment there acknowledges the gap and defers it.

Meanwhile the goods physically return on the truck and no record follows them. `addPendingReturn` exists in the store (`src/lib/store.ts:3012`) with **zero callers**, so `pendingReturns` is permanently empty — and the entire "Inspeksi Retur Customer" tab in QC (`src/app/warehouse/qc/page.tsx:761-830`), along with its handler `handleProcessReturnQC` (`:338-400`), is unreachable code.

## Business reality

Clients inspect at the door and reject there. The courier brings the goods back the same day. There is no later-complaint path, so no credit note is needed — the invoice was never wrong.

## Decisions

**The courier's on-site figure is the single rejection point.** It already drives the invoice, and because `shippedThisRound` resolves to `qtyFinal`, the unaccepted remainder correctly stays owed: `qtyDelivered` advances only by the accepted quantity, `nextSoStatus` returns `Kurang Kirim`, and the shortfall re-enters the QC allocation queue for a follow-up round. This behaviour is already correct and is not being changed.

**BAST loses its rejection controls.** The Accepted / Partial / Return selector and the `qtyRetur` / `addRejectedItem` block are removed. BAST becomes confirmation of what the courier recorded. `qtyDelivered`, the `qtyFinal: null` reset, and `nextSoStatus` stay exactly as they are.

**A courier reduction creates a pending return.** When the on-site adjustment lowers an item below what was shipped, write one `PendingReturn` per reduced item: `{ id, productId, originalSoId, qty: shipped − accepted, reason, date, status: 'Pending QC' }`.

**The dormant QC tab handles the goods.** No new screen. Once `pendingReturns` is populated the existing tab lights up, and `handleProcessReturnQC` already does the work: a `RETURN_RESTOCK` movement with positive `stockDelta` for the passing quantity, and for the failing quantity `recordShrinkage` plus a `rejectedItem` with `source: 'Return'` that surfaces in Rejection Monitor and loss analytics.

## Not changing

Invoice timing and amount. `recordDeliveryAndInvoice`. Backorder arithmetic in `src/lib/backorder.ts`. The internal QC reject flow (Return / Disposal / B2C), which is sound. The Rejection Monitor.

## Risks

**Warehouse must actually work the returns queue.** Goods sit outside inventory until someone processes the tab. That is the intended control — it is what makes the restock decision deliberate — but a queue nobody opens is stock that never comes back. Consider a badge count on the QC tab.

**Double-counting if BAST rejection is not fully removed.** Leaving any path that writes a `Return`-sourced `rejectedItem` from BAST would log the same units twice, once from BAST and once from `handleProcessReturnQC`. Removal must be complete.

**A courier reduction to zero.** Verify a fully-rejected item produces a pending return for the whole quantity and leaves the order `Kurang Kirim`, not `Selesai`.

## Acceptance criteria

1. BAST shows no per-item Accepted / Partial / Return control and creates no `rejectedItem`.
2. A courier reduction creates one `PendingReturn` per reduced item, quantity equal to the shortfall.
3. That return appears in QC → Inspeksi Retur Customer.
4. Processing it as pass increases sellable stock by the passing quantity.
5. Processing it as reject records shrinkage and a `rejectedItem` with `source: 'Return'`, and does not increase stock.
6. The sales order still reaches `Kurang Kirim` when a shortfall remains, and the shortfall re-enters the QC allocation queue.
7. The invoice amount is unchanged by any of the above.

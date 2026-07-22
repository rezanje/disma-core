# Customer Return QC: Three Decisions, One Trackable Vendor Swap

**Date:** 2026-07-22
**Status:** Design approved, not implemented
**Builds on:** [2026-07-21-client-return-flow-design.md](2026-07-21-client-return-flow-design.md)

## Problem

A customer return that reaches QC (`pendingReturns`) can only end two ways today:
pass → restock, or reject → shrinkage. `handleProcessReturnQC`
(`src/app/warehouse/qc/page.tsx:341-405`) splits the returned quantity between
`retQtyPass` (a `RETURN_RESTOCK` movement) and `retQtyReject` (`recordShrinkage`
+ a `Return`-sourced `rejectedItem`).

The business has a third outcome. When the goods came back not because we damaged
them but because they may still be swappable, the warehouse wants to send them
back to the vendor and try to exchange them — not write them off, not shelve them.
There is no way to record that, so today it is forced into "reject" and booked as
a loss that never happened.

## Business reality

Three real outcomes when a customer return is inspected:

1. **Masuk stok** — still sellable, goes back to sellable inventory.
2. **Buang** — our fault (wilted, overheated in transit), a genuine loss.
3. **Retur ke vendor** — try to swap with the vendor. Neutral until resolved:
   the vendor either sends a replacement (no loss) or refuses (then it becomes a
   loss). "Swap," not "refund" — the compensation is replacement goods, so no
   cash or AP movement is involved.

Outcome 3 is a *pending state*, not an instant one. The warehouse ships the goods
back and waits. The CEO wants that tracked to conclusion, and wants the
replacement goods quality-checked before they hit sellable stock.

## Precedent to reuse

Incoming-goods QC already offers a three-way reject disposition —
`Return | Disposal | B2C` (`src/app/warehouse/qc/page.tsx:63`, routing at
`:205-258`). "Retur ke vendor" for customer returns mirrors the `Return`
disposition. Reuse its shape (button group, `rejectedItem` logging, `admin_po`
notification) rather than inventing new UI language.

## Decisions

### Decision 1 — at customer-return QC (existing "Inspeksi Retur Customer" tab)

The returned quantity is split across **three** buckets instead of two. The
total must still equal `activeReturn.qty`.

| Bucket | Effect | Status of code |
|---|---|---|
| **Masuk Stok** (`retQtyPass`) | `RETURN_RESTOCK` movement, +sellable stock | exists, unchanged |
| **Buang** (`retQtyReject`) | `recordShrinkage` + `rejectedItem` `source:'Return'` | exists, unchanged |
| **Retur ke Vendor** (`retQtyVendor`) | create one `VendorReturn` per return item, `status:'Menunggu Vendor'` | new |

A `retQtyVendor > 0` requires a `vendorId`. Default it to the product's active
`VendorPrice` (`status === 'active'`), editable via dropdown. No stock and no
loss is booked at this point — the goods are physically leaving for the vendor
and their fate is undecided.

The `PendingReturn` is marked `Processed` only when all three buckets are
accounted for (unchanged completion rule).

### Decision 2 — follow-up (new "Retur ke Vendor" tab in QC)

Lists every `VendorReturn` with `status === 'Menunggu Vendor'`, grouped by
vendor. Each row offers two resolutions:

| Action | Effect | New status |
|---|---|---|
| **Ditukar** | Warehouse QC-checks the replacement *in this tab*: a pass/reject qty split. Pass qty → `RETURN_RESTOCK` into sellable stock. Reject qty → `recordShrinkage` + `rejectedItem`. | `Selesai-Ditukar` |
| **Ditolak Vendor** | Vendor won't swap. Full qty → `recordShrinkage` + `rejectedItem` `source:'Return'`. | `Selesai-Ditolak` |

**Why the replacement is QC'd here, not in the incoming-QC queue:** the incoming
queue is driven by `purchaseItems` tied to a `Purchase` (cost, vendor bill,
accounting). A free swap has no cost; routing it through that queue would require
a fabricated zero-value purchase that pollutes purchasing and finance. Checking
the replacement inside this tab gives the identical quality gate — warehouse
inspects before goods reach stock — with no ledger pollution.

### Notifications

On creating a `VendorReturn`, notify `admin_po` users (they coordinate with
vendors), mirroring the incoming-QC reject notification at `:260-273`.

## Data model

New entity:

```ts
export interface VendorReturn {
  id: string;
  productId: string;
  vendorId: string;
  qty: number;
  reason: string;
  date: string;                 // created
  originalReturnId: string;     // the PendingReturn it came from
  status: 'Menunggu Vendor' | 'Selesai-Ditukar' | 'Selesai-Ditolak';
  resolvedDate?: string;
  replacementPassQty?: number;  // set on Ditukar
  replacementRejectQty?: number;// set on Ditukar
}
```

Store: `vendorReturns` array with `addVendorReturn` and `updateVendorReturn`,
following the `pendingReturns` / `addPendingReturn` / `updatePendingReturn`
pattern (`src/lib/store.ts:3012`). Persist like other collections — a
state-only mutation reappears on the next sync (the lesson already baked into
`handleProcessReturnQC`'s `Processed` comment at `:398-400`).

## Finance behaviour

- **Menunggu Vendor:** neutral. No shrinkage, no stock. The goods are in limbo
  and must not appear as a loss.
- **Selesai-Ditukar:** neutral overall — replacement pass qty restocks; only the
  replacement's own reject qty is a loss. Surfaces in loss-analytics as
  "Kompensasi Retur Supplier" (`src/app/admin/loss-analytics/page.tsx:487`),
  the same category the incoming-QC `Return` disposition uses.
- **Selesai-Ditolak:** the full quantity becomes shrinkage at resolution time —
  the loss lands when the vendor refuses, not when the return was first created.

## Not changing

The customer-on-site rejection point, BAST, invoice timing/amount, backorder
arithmetic, the existing Masuk Stok / Buang buckets, and the incoming-QC flow.
This spec only adds a third bucket and its follow-up lifecycle.

## Risks

**A limbo queue nobody works.** Goods sit as `Menunggu Vendor` — neither stock
nor loss — until someone resolves them. Same control risk the parent spec flags
for `pendingReturns`. Add a badge count on the "Retur ke Vendor" tab.

**Loss timing.** Because a refused swap books the loss only at resolution, a
`VendorReturn` left open indefinitely hides a loss. The badge count is the
mitigation; no auto-expiry in v1 (YAGNI — add if open returns actually pile up).

**Vendor attribution.** `PendingReturn` has no vendor link; the vendor is chosen
at QC time from the product's active price. If a product has no active
`VendorPrice`, the dropdown must still allow a manual pick — do not block the
decision.

## Acceptance criteria

1. Customer-return QC shows three qty inputs — Masuk Stok, Buang, Retur ke Vendor
   — and requires their sum to equal the return quantity.
2. A `retQtyVendor > 0` requires a vendor and creates one `VendorReturn` per
   item with `status:'Menunggu Vendor'`; no stock and no shrinkage is booked for
   that quantity.
3. The new `VendorReturn` appears in the "Retur ke Vendor" tab and notifies
   `admin_po`.
4. **Ditukar** with a pass/reject split restocks the pass qty, books shrinkage +
   `rejectedItem` for the reject qty, and sets status `Selesai-Ditukar`.
5. **Ditolak Vendor** books shrinkage + `rejectedItem` for the full qty and sets
   status `Selesai-Ditolak`; no stock is added.
6. While `Menunggu Vendor`, the quantity appears in neither inventory nor loss
   analytics as a loss.
7. Masuk Stok and Buang behave exactly as before.

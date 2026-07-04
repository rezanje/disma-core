# Backorder / Kurang Kirim — Design

**Date:** 2026-07-05
**Status:** Approved (design), pending implementation plan

## Problem

Order 10kg, but we can only ship 9kg (1kg fails QC / rejected). Today the shortfall
is lost:

- QC sets `qtyFinal = 9`. Once set, the SO item is **excluded from re-QC**
  (`qc/page.tsx:65` filters `qtyFinal == null`) and the SO advances to Packing then
  `Selesai`, **freezing fulfillment at 9**.
- Client is billed 9 (fair), but there is **no backorder object** tracking that the
  client is still owed 1kg. Re-delivering the remaining 1kg is manual, unguided.

The same gap applies when a client rejects part of a delivery at BAST (busuk on
arrival) and still wants the rejected qty replaced: `accepted < ordered` but nothing
tracks the owed remainder.

## Goal

An SO item is not `Selesai` until the client has **accepted the full ordered qty**.
The owed remainder stays trackable and re-enters the QC → packing → delivery → BAST
pipeline as a second (third, …) delivery. One mechanism covers both causes
(QC shortfall and BAST partial-reject), because both reduce to `owed > 0`.

## Approach A (chosen): cumulative fulfillment counter + reopen

Rejected alternatives:
- **B — child backorder SO:** spawn a linked SO for the remainder. Clean pipeline
  reuse, but SO proliferation and Tukar Faktur/reporting must understand parent-child.
  Too much surface area.
- **C — reopen QC only, no new field:** tiniest diff, but `qtyFinal` is single-round
  and cannot represent "9 delivered + 1 owed" across multiple partial deliveries →
  double-billing risk.

## Data model

`SalesOrderItem` (`src/types/index.ts:173`):
- **Add** `qtyDelivered?: number` — cumulative qty **accepted by the client** across
  all delivery rounds. Absent/undefined = 0.
- `qty` (ordered) and `qtyFinal` (this round's QC-committed qty) keep their current
  meaning.
- Derived: `owed = qty − (qtyDelivered ?? 0)`.

`SalesOrderStatus` (`src/types/index.ts:151`):
- **Add** `'Kurang Kirim'` — backorder open (part accepted, remainder owed).

## Item lifecycle

```
QC allocates ≤ owed this round → sets qtyFinal (this round's shipment target)
  → Packing → Dikirim → Terkirim → BAST
BAST: accepted = qtyPass (client-accepted qty this round)
  → qtyDelivered += accepted
  → book revenue / HPP / stock for `accepted` via a NEW invoice + NEW delivery
  → reject (qtyFinal − accepted) → rejectedItem (existing behaviour)
Recompute SO status after BAST:
  any item qtyDelivered < qty → 'Kurang Kirim', and reset those items' qtyFinal = undefined
                                (so they re-enter the QC queue)
  all items qtyDelivered == qty → 'Selesai'
```

## QC eligibility fix (`src/app/warehouse/qc/page.tsx`)

- **Line 64** — `'Kurang Kirim'` must NOT be in the excluded-status list, so a
  backordered SO is re-QC-able. (Currently excludes Batal/Selesai/Terkirim/Packing/
  Siap Kirim/Dikirim/Awaiting Audit.)
- **Lines 71 and 558** — shortfall becomes
  `needed = qty − (qtyDelivered ?? 0) − (qtyFinal ?? 0)` (was `qty − (qtyFinal ?? 0)`),
  so a top-up round computes the true remaining owed rather than the full ordered qty.
- The eligibility filter at line 65 (`qtyFinal == null`) still works because the
  lifecycle resets `qtyFinal = undefined` when a backorder is opened.

## Booking per round (`src/lib/accounting.ts`)

- `finalizeSalesOrderDelivery` currently creates **one invoice + one delivery per SO**
  and reuses an existing invoice if found — this would skip booking on round 2 because
  `recordDeliveryAndInvoice` dedup-guards on `invoiceId`.
- Change: **each delivery round creates a fresh invoice + fresh delivery**, with total
  = `accepted × unitPrice` for that round only. HPP and stock deduction likewise scoped
  to the round's accepted qty.
- Tukar Faktur (weekly, per client, `src/app/admin/tukar-faktur`) is unchanged — it
  aggregates whatever invoices exist, so multiple per-round invoices for one SO fold
  into the weekly batch naturally.

**Booking trigger (resolves current Terkirim-vs-BAST split):** revenue/HPP/stock for a
round is booked at **BAST confirm**, when `accepted` (qtyPass) is authoritative — not
at Terkirim on the provisional `qtyFinal`. This avoids booking 9 at Terkirim then the
client accepting 8. Concretely: `handleConfirmBAST` (`src/app/admin/sales-orders/page.tsx:179`)
becomes the single booking point per round, creating the round's fresh invoice +
delivery and calling `recordDeliveryAndInvoice` for the accepted qty. The Terkirim
shortcut (`finalizeSalesOrderDelivery` via `advanceStatus`) is reconciled to this
model so booking is not duplicated (dedup already guards on `invoiceId`).

## Susulan stock sources (3, all via existing paths)

1. **Gudang** — QC allocates from available inventory (`buildFifoAllocations`) with no
   purchase.
2. **Beli susulan** — reject → shopping-list susulan queue → buy → QC.
3. **Vendor replaces free (vendor's fault)** — susulan purchase priced **0** so it adds
   no HPP. Recorded via the reason/notes text on the susulan buy.
   - *Deferred:* explicit "resolusi retur" dropdown (Write-off / Ganti-gratis /
     Beli-ulang). For now, price-0 manual entry in the susulan buy is the lazy path.
     Add the structured field if the manual keyword/price approach proves error-prone.

## UI

- `Kurang Kirim` status badge (amber) in the SO list (`src/app/admin/sales-orders`).
- SO detail: `Owed` column per item = `qty − (qtyDelivered ?? 0)`.

## Scope

**Unified:** both QC shortfall and BAST partial-reject flow through the same
`owed > 0` mechanism. No per-cause special-casing.

## Out of scope

- Structured "resolusi retur" dropdown (deferred, see above).
- Auto-pricing vendor-free replacements (manual price-0 for now).
- Partial-payment reconciliation between round bookings and Tukar Faktur (existing
  behaviour, not changed here).

## Backward compatibility

- `qtyDelivered` is optional; existing SO items read it as 0. Legacy `Selesai` orders
  are unaffected (never re-opened).
- New `'Kurang Kirim'` status is additive; existing status handling untouched.
- DB: add nullable `qty_delivered` column to `sales_order_items`; camel/snake mapping
  is automatic in `src/app/api/db/route.ts`.
```

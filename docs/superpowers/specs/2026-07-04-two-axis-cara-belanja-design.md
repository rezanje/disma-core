# Split "Cara Belanja" into two axes: Lokasi Ambil + Metode Bayar

Date: 2026-07-04 · Supersedes the single-axis "Cara Belanja" (location+payment conflated)

## Goal

Replace the single conflated `purchaseMethod` ("Cara Belanja": Pasar/Beli Online/Tempo/Gudang) with **two independent, authoritative axes** shown as two column groups in the Shopping List:

1. **Lokasi Ambil** (where the goods come from): **Pasar · Diantar Vendor · Online** (+ Gudang = from stock, orthogonal booking flag as today).
2. **Metode Bayar** (how it's paid): **Cash · Tempo · Transfer**.

The payment axis becomes the authoritative driver of accounting/AP routing (today that lives on `purchaseMethod === 'Transfer'`).

## Decisions (validated with user, 2026-07-04)

- **Cash** → paid from the sourcer's cash pocket (the daily self-serve pocket). `Dr HPP / Cr pocket (1-1500)`. Only Cash draws down the pocket.
- **Tempo** → vendor payable / hutang (AP). `Dr HPP-accrual (2-1100) → Utang Usaha (2-1000)`, settled later in AP Aging. Pay later.
- **Transfer** → **Finance transfers from BCA now** (sourcing spends nothing). Enters a finance queue to execute; `Dr HPP / Cr BCA (1-1200)`. Behaves like the Online finance-paid flow.
- Only **Cash** reduces the sourcing pocket. Tempo → AP; Transfer → BCA.
- **Location is logistics only** (Pasar/Diantar Vendor/Online) — it no longer implies payment. Online still routes to the finance/online-purchase queue as a location concern.

## Target data model

`PurchaseItem`:
- `purchaseMethod` (LOCATION): `'Pasar' | 'Vendor' | 'Online'` — rename the current `'Transfer'` value to `'Vendor'` ("Diantar Vendor"). This is the risky rename: `'Transfer'` currently *means Tempo* in routing.
- `paymentMethod` (PAYMENT): expand `'Cash' | 'Tempo'` → `'Cash' | 'Tempo' | 'Transfer'`. Becomes authoritative for AP/BCA routing.
- `fromStock` (Gudang): unchanged, orthogonal.

## Routing rewire map (the load-bearing part)

Today the Tempo/AP signal is `purchaseMethod === 'Transfer'` in **5 files / 10 sites**. All must move to `paymentMethod === 'Tempo'`:

| File | Today (`purchaseMethod === 'Transfer'`) | New |
|---|---|---|
| `lib/accounting.ts` | `recordPocketPurchase` excludes Transfer; QC vendor-bill trigger | pocket cash = `paymentMethod === 'Cash'`; AP trigger = `paymentMethod === 'Tempo'` |
| `app/warehouse/qc/page.tsx` | Tempo QC gate + `recordVendorBillFromInbound` when `purchaseMethod === 'Transfer'` | trigger on `paymentMethod === 'Tempo'` |
| `app/sourcing/list/page.tsx` | badges/messaging + `recordPocketPurchase` filter | payment-based |
| `lib/pdf.ts` | print filters exclude Transfer | exclude by `paymentMethod` |
| `app/admin/shopping-list/page.tsx` | `CARA_BELANJA_LABEL`, buttons, compile | two column groups (location + payment); carry both fields |

Plus **new**: `paymentMethod === 'Transfer'` → a finance BCA-transfer queue + posting (mirror the Online/finance flow, `Dr HPP / Cr BCA`).

Other `purchaseMethod` consumers (Pasar/Online routing in `warehouse/inbound`, `finance/approvals`, `finance/online-purchase`, `SourcingDashboard`, `purchase-requests`, `simulation`) mostly stay (they key on Pasar/Online = location), but every `'Transfer'` occurrence must be re-read: is it location ("Diantar Vendor") or the old Tempo signal? Trace each.

`paymentMethod` already drives `finance/approvals` settlement (14 refs) + `lib/vendor-payable.ts` — those already use `paymentMethod === 'Tempo'`, so they mostly align; verify the expanded `'Transfer'` value doesn't fall into a Cash bucket there.

## Shopping List UI

Two column groups replacing the single "Cara Belanja":
- **Lokasi**: Pasar / Diantar Vendor / Online buttons (+ Gudang toggle) → `purchaseMethod`.
- **Metode Bayar**: Cash / Tempo / Transfer buttons → `paymentMethod` (new per-item setter in the shopping list; today `paymentMethod` is only set at sourcing).
- Compile (`addPurchaseItems`) must carry BOTH `purchaseMethod` and `paymentMethod`.

## Reconciliation with the just-shipped pocket work (branch `docs/sourcing-pocket-daily-spec`)

The pocket work (P2b–P3) wired `recordPocketPurchase` to exclude `purchaseMethod !== 'Transfer'` (Tempo) and `!== 'Online'`. Under the new model that filter becomes `paymentMethod === 'Cash'` (pocket) — cleaner. QC's `recordVendorBillFromInbound` gate moves from `purchaseMethod === 'Transfer'` to `paymentMethod === 'Tempo'`. This partially rewrites those exact sites — sequence this AFTER the pocket branch merges (or rebase onto it).

## Risks

- **Value rename** `'Transfer'`→`'Vendor'` on `purchaseMethod`: tsc catches most; but string comparisons in un-typed spots (`=== 'Transfer'`) won't error if the value silently changes meaning — grep every literal.
- **Semantic flip**: `'Transfer'` currently means Tempo; after the change it means a *location* (Diantar Vendor) AND is also a *payment* value. Do NOT leave both meanings live — the payment `'Transfer'` and location `'Vendor'` are distinct; the old location `'Transfer'` value must be fully migrated to `'Vendor'`.
- Big blast radius (13 files touch `purchaseMethod`). Same profile as the remove-advance work → do it as its own focused session with spec → plan → subagent execution + heavy verification. **Do not hand-hack.**

## Recommended execution

Own session: `/brainstorm` is effectively done (this doc). Next: `/writing-plans` → subagent-driven execution, ideally rebased on / after the `docs/sourcing-pocket-daily-spec` branch so the pocket-site edits don't collide.

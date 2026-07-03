# Sourcing Pocket — daily self-serve cash from a shared Bank Jago pool

Date: 2026-07-03 · Extends [remove-advance spec](2026-07-03-remove-advance-design.md) (phases P2b–P3)

## Goal

Replace the derived per-PO advance tally in `sourcing/list` with a **real
cash-in-hand pocket per sourcer**, funded by the sourcer self-serving from one
shared **Bank Jago pool**. Finance tops up the pool weekly (BCA → Bank Jago,
decoupled from any PO). Sourcers withdraw to their pocket as needed through the
day, spend cash, and hard-close the pocket to zero every evening. Finance gets a
real-time daily monitor of withdrawals vs actual spend per sourcer.

This is the workflow layer on top of the "purpose flag" infra already shipped
(P2a).

## Decisions (validated with user, 2026-07-03)

1. **One shared Bank Jago pool** (`purpose='sourcing'`), not per-person pools.
2. **Pool top-up is PO-agnostic** — funding the pool references no PurchaseId.
   HPP/margin stays accurate because it comes from item-level `actualUnitPrice`
   (items already linked to their SO), independent of how cash was funded.
3. **Per-sourcer cash-in-hand pocket, 2-step** — withdraw (pool → pocket) then
   spend (pocket → vendor). Three live balances: pool + each sourcer's pocket.
4. **Withdrawal is full self-serve, no approval** — sourcer clicks "Tarik", pool
   debits, pocket credits, immediately.
5. **Daily hard close (D2)** — pocket must return to 0 each evening (setor sisa
   back to the pool). Gives real-time daily actual-spend monitoring.
6. **Multiple withdrawals per day** — running short intraday means withdrawing
   again from the pool (normal path), as long as the pool has balance.
7. **Reimbursement is a rare fallback** — only when the pool is empty AND the
   sourcer covered a purchase with personal cash. Not part of the normal cycle.

HPP/margin per PO is unchanged and out of scope.

## Data model

Reuse `bankAccount` + `CashTransaction` + `computeBankBalances` — money stays in
one source of truth. No parallel money entity.

**New (small):**
- `BankAccount.ownerUserId?: string` — links a pocket to its sourcer.
- `BankAccountPurpose` gains `'sourcing_pocket'` — distinguishes a pocket from
  the pool. Pool = `purpose:'sourcing'`, no owner. Pocket =
  `purpose:'sourcing_pocket'` + `ownerUserId` set.
- `TutupHariKantong` marker record — thin daily-close log, **not** a money store:
  `{ id, sourcerId, date, ditarik, belanja, disetor, defisit, closedAt, closedBy }`.
  Gates the daily cycle and feeds the finance monitor/history. All actual money
  lives in CashTransactions; this record is a derived snapshot + close flag.

**Reused:**
- CoA `1-1500` "Kas di Tangan Sourcing" for all pockets. Per-person balance comes
  from `bankAccountId` via `computeBankBalances`, not from the CoA. Aggregate
  `1-1500` = total cash-in-hand across all sourcers (correct for the balance sheet).
- Disbursement / kas-pindah for the pool top-up.

**Finance one-time setup:** in Cash & Bank, create a pocket account per active
sourcer (Hilman, Rifai) tagged `purpose='sourcing_pocket'` + owner; tag the real
Bank Jago account `purpose='sourcing'`.

## Accounting — four movements

Each movement = one balanced journal + CashTransaction pair. Only #2 and #4 need
a new helper.

| # | Movement | Who | Journal | Code |
|---|---|---|---|---|
| 1 | Top-up pool | Finance | Dr Bank Jago (pool CoA) / Cr BCA 1-1200 | existing disbursement, 0 new |
| 2 | Withdraw to pocket | Sourcing | Dr Kas Tangan 1-1500 / Cr Bank Jago (pool CoA) | new `recordPocketWithdrawal(sourcerId, amount)` |
| 3 | Cash purchase | Sourcing | Dr HPP 5-1000 / Cr Kas Tangan 1-1500 | replace `recordAdvanceExpense` (credited a virtual wallet) → credit the real pocket |
| 4 | Close day / setor sisa | Sourcing | Dr Bank Jago (pool CoA) / Cr Kas Tangan 1-1500, for remaining balance | new `recordPocketReturn(sourcerId)` + write `TutupHariKantong` |

Movement #3 only applies to **Cash/Pasar** items. Tempo items → AP (vendor bill),
Online items → paid from BCA. Neither touches the pocket.

## Withdrawal & pool guard

- Withdrawal amount must be `> 0` and `<= Bank Jago pool balance`. Over-pool
  withdrawal is **rejected** ("pool tidak cukup — minta finance top-up").
- Multiple withdrawals per day are allowed and normal.
- Because sourcers re-withdraw when short, the pocket normally never goes
  negative. It only goes negative if the pool is empty and the sourcer spends
  personal cash → that specific shortfall goes through the existing
  reimbursement flow.

## Screens

**A. Finance — pool top-up (existing, minor):** the Disbursement page already does
BCA → Bank Jago. Optional quick-pick "isi pool sourcing". No new screen.

**B. Sourcing — "Kantong Hari Ini" panel** (`sourcing/list`, replaces the old
violet "Uang Diambil dari Bank Jago" per-PO card):
- Real-time pocket balance (from the sourcer's pocket account, not a derived tally).
- **Tarik dari Bank Jago** button → amount input → immediate pool debit / pocket
  credit (self-serve, guarded by pool balance).
- Purchasing works as today (actual price per item) → debits the pocket.
- **Tutup Hari (Setor Sisa)** button → return remaining pocket balance to the
  pool, pocket → 0, day locked (writes `TutupHariKantong`).
- Day indicators: ditarik hari ini / kepake / sisa.

**C. Finance — "Pantau Harian Sourcing" dashboard** (new, small): table per day ×
per sourcer — ditarik | belanja aktual | disetor | status (buka/tutup) | defisit.
Reads CashTransactions grouped by date + the close markers. This delivers the
real-time daily visibility.

## Daily reconciliation

Per sourcer per day:
- `ditarik` = Σ pocket-In (from pool) that day
- `belanja` = Σ pocket-Out (purchases) that day
- expected `sisa` = ditarik − belanja
- **Tutup Hari**: setor `sisa` to the pool; pocket must reach 0. If the pocket is
  negative (personal cash covered a purchase while pool was empty), no setor —
  flag `defisit`, route through reimbursement.
- The day cannot be closed while the pocket balance is `> 0` — the app forces the
  setor action first.

## Scope

**In scope (P2b–P3):**
- `BankAccount.ownerUserId` + `'sourcing_pocket'` purpose + Supabase migration.
- Pocket account picker/tagging in Cash & Bank (owner + purpose).
- Helpers `recordPocketWithdrawal`, `recordPocketReturn`.
- Sourcing "Kantong Hari Ini" panel — real pocket balance replaces the derived
  `totalAdvanceReceived`/`totalHolding` tally (trace every consumer: progress
  bars, belanja-submit, reconciliation, `handleReportReturn`).
- Purchase posting: `recordAdvanceExpense` → credit the real pocket account.
- `TutupHariKantong` marker + finance "Pantau Harian Sourcing" dashboard.

**Out of scope (later phases):**
- Courier — same pattern, phase P4.
- Deleting advance-wallet dead code (`ADVANCE_WALLETS`, `USER_WALLETS`,
  `getAdvanceWallet*`, `recordAdvanceReturn`, `recordOperationalAdvanceTransfer`)
  — phase P5.
- HPP / margin per PO — unchanged.

## Open questions / risks

- **Pocket account per sourcer**: does finance create these before rollout, or is
  auto-provisioning on first withdrawal wanted? (Default: finance creates manually
  in Cash & Bank, matching the pool setup.)
- **Sourcing/list blast radius**: the derived tally threads through progress bars,
  belanja-submit, reconciliation, and `handleReportReturn`. Trace every consumer
  before swapping to the real pocket balance. Do it as a focused session, verify
  heavily (flagged in remove-advance P2b).
- **Multi-day carry**: D2 forces daily zero, so no carry — confirm sourcers accept
  the daily setor + re-withdraw next morning as the routine.
- **Reimbursement trigger**: confirm finance is fine with reimbursement only as the
  pool-empty fallback, not a per-day settlement.

# Remove Advance — replace with Disbursement + real sourcing pool account

Date: 2026-07-03 · Branch: `feat/sku-daily-pnl` · Item #3

## Goal

Delete the "Advance" feature. Sourcing (and courier) money moves entirely
through ordinary Disbursement (kas pindah) into a **real** shared bank account,
which the team self-serves from. No virtual advance wallets, no per-PO advance
funding, no advance settlement.

## Current model (Advance) — what exists today

- **Virtual wallet accounts**: `ADVANCE_WALLETS` (`bank-advance-sourcing`/CoA
  1-1500, `bank-advance-courier`/1-1510) + `USER_WALLETS`. Resolved via
  `getAdvanceWalletByRole` / `getAdvanceWalletByUserId` (`accounting.ts`).
- **Per-PO funding**: `approvals` `handleTransferPO` → `recordBudgetTransfer`
  moves real-bank money into the sourcer's virtual wallet, stamped per purchase
  (`advanceCode`, `budgetTransferDate`, `budgetAmount`, `operationalSpareAmount`).
- **Auto-backfill**: `approvals` `backfillMissingAdvances` creates an advance per
  compiled shopping list.
- **Spend / return**: `recordAdvanceExpense` (credit wallet CoA), `recordAdvanceReturn`,
  `recordOperationalAdvanceTransfer` (setor sisa).
- **Derived wallet display** (`sourcing/list`): `totalAdvanceReceived` = Σ funded
  purchases; `totalHolding` = received − shop − expenses. Not from CashTransactions.
- **Settlement**: `approvals/sourcing-settlement` + `recordReconciliationSettlement`,
  per-PO/per-advance.
- **UI**: ADVANCE tab in `approvals`; sourcing wallet card; courier wallet.

Footprint: ~155 refs / 16 files (approvals 53, accounting 39, sourcing/list 15,
sourcing-settlement 7, audit 5, shopping-list 8, sales-orders 6, courier/expenses 3,
vendor-payable 4, simulation 9, others).

## New model (target)

1. Finance disbursement Mandiri → BCA (weekly belanja + ops budget) — real banks.
2. Disbursement BCA → **Bank Jago** (real shared sourcing account, "kantong bersama").
3. Sourcing self-serves cash from Bank Jago per day. Leftover returned to Bank Jago.
   Shortfall → sourcer covers, files **reimbursement** (existing flow).
4. Courier: same — funded via disbursement to a real courier account, no advance.

Consequences:
- Sourcing "wallet" = the **real Bank Jago account balance**, not a derived per-PO tally.
- Spending = ordinary expenses booked against Bank Jago (HPP / opex CoA vs the
  real bank CoA), not against a virtual wallet CoA.
- No per-PO advance tracking, no advance settlement — reconciliation becomes
  account-balance based (or leans on existing expense/reimbursement flows).
- Migration: assume **no open advances** (fresh start).

## Removal / replacement map

| Area | Today | New |
|---|---|---|
| Wallet resolution | `ADVANCE_WALLETS`, `USER_WALLETS`, `getAdvanceWallet*` | delete; finance picks the real sourcing/courier bank in disbursement |
| Per-PO funding | `handleTransferPO`, `recordBudgetTransfer` advance path, `advanceCode`, backfill | delete; funding = existing Disbursement (`recordBudgetTransfer` real-bank path already works) |
| ADVANCE tab (approvals) | tab + backfill + transfer UI | delete |
| Spend | `recordAdvanceExpense` (credit wallet CoA) | book expense against the real sourcing bank account |
| Return | `recordAdvanceReturn`, `recordOperationalAdvanceTransfer` | disbursement/kas-pindah back to Bank Jago |
| Wallet display (sourcing/list) | derived `totalAdvanceReceived`/`totalHolding` | show real Bank Jago balance + its transactions |
| Settlement | sourcing-settlement, `recordReconciliationSettlement` per-advance | account-based; shortfall via reimbursement |
| Courier | `bank-advance-courier`, courier wallet | disbursement to real courier account |

## Progress

- **P1 DONE** (commit 705bbc1): removed ADVANCE tab + `backfillMissingAdvances` +
  `handleTransferBudget` + advance-only state from `approvals`. No new advances
  created/given. Settlement/audit/delivery tabs untouched.
- **P2a DONE** (commit 331ead3): `bank_accounts.purpose` column ('sourcing' |
  'kurir' | 'umum', migration applied to prod `ckkohudfuisgzlrjipev`) +
  `BankAccountPurpose` type + purpose Select in Cash & Bank create/edit forms.
  Finance can now tag the real Bank Jago account as `purpose='sourcing'`.
- **P2b–P3 DONE (code)** (2026-07-04, branch `docs/sourcing-pocket-daily-spec`):
  implemented the daily self-serve pocket model per
  [sourcing-pocket-daily spec](2026-07-03-sourcing-pocket-daily-design.md) +
  [plan](../plans/2026-07-03-sourcing-pocket-daily.md). Shared Bank Jago pool
  (`purpose='sourcing'`) + per-sourcer pocket (`purpose='sourcing_pocket'` +
  `ownerUserId`); helpers `recordPocketWithdrawal`/`recordPocketReturn`/
  `recordPocketPurchase`; "Kantong Hari Ini" panel (self-serve tarik + daily
  Tutup Hari) replacing the derived tally on the top summary card; `TutupHariKantong`
  marker + finance "Pantau Harian Sourcing" dashboard. NARROWED: the legacy
  "Rekon Catatan" breakdown was kept as historical (not torn down). **PENDING:**
  (1) apply migration `20260704000001_sourcing_pocket.sql` to prod DB, (2) tag the
  real Bank Jago (`sourcing`) + create/tag each sourcer pocket in Cash & Bank so
  DB rows carry `purpose`/`owner_user_id` (until then cash-tx sync reverts local
  tags to stale DB rows), (3) live e2e once (1)+(2) done. Courier (P4) + dead-code
  (P5) still pending.
- **P2b original notes** — rewire `sourcing/list` + `sourcing/expenses` to the real account:
  - The sourcing wallet card currently shows a DERIVED tally
    (`totalAdvanceReceived` = Σ funded purchases; `totalHolding` = received −
    shop − expenses). Replace with the balance of the `purpose==='sourcing'`
    bank account (`bankAccounts.find(b => b.purpose === 'sourcing')`).
    `totalHolding`/`totalAdvanceReceived`/`fundedPurchases` are threaded through
    progress bars, belanja-submit, reconciliation, and `handleReportReturn` —
    trace every consumer before swapping.
  - Expense/belanja posting: `recordAdvanceExpense` (credits virtual wallet CoA
    1-1500) → book against the real sourcing bank's CoA + a real cash Out tx.
  - `handleReportReturn`: setor sisa → kas pindah into the sourcing account
    (or leave as an expense-return record if finance prefers).
  - Risk: core sourcing workflow; do as its own focused session, verify heavily.

## Phased plan (each phase independently shippable + verifiable)

- **P0 — infra check (no code):** confirm real "Bank Jago" (sourcing) + courier
  bank accounts exist in DB (`bank_accounts`). If not, finance creates them in
  Cash & Bank. Disbursement already funds real banks — replacement infra is ready.
- **P1 — stop new advances:** remove the ADVANCE tab + `handleTransferPO` +
  `backfillMissingAdvances` from `approvals`. Funding now only via Disbursement.
  (Highest-visibility, 53 refs concentrated here.)
- **P2 — sourcing spend/display on real account:** `sourcing/list` + `sourcing/expenses`
  record expenses against the chosen real bank; wallet card shows that account's
  balance/txns. Drop `getAdvanceWalletByUserId` usage.
- **P3 — settlement:** remove advance settlement (`sourcing-settlement`,
  `recordReconciliationSettlement` advance bits); rely on account balance +
  reimbursement for shortfalls.
- **P4 — courier:** same treatment (`courier/expenses`, `bank-advance-courier`).
- **P5 — delete dead code:** `ADVANCE_WALLETS`, `USER_WALLETS`, `getAdvanceWallet*`,
  `recordAdvanceExpense/Return`, `recordOperationalAdvanceTransfer`, `advanceCode`,
  advance fields no longer read. Clean `simulation.ts`, `audit`, `vendor-payable`.

## P2 designation decision (how the app knows the sourcing/courier pool account)

Recommended: **A — `purpose` flag on bank account** (`'sourcing' | 'kurir' | 'umum'`).
Finance sets it in Cash & Bank; sourcing/courier pages query the account with the
matching purpose for both the wallet display and expense posting. Needs a
`bank_accounts.purpose` column (Supabase migration, nullable text default `'umum'`)
+ one Select in the edit-bank modal.

- B (hardcode account ids in config): simplest but brittle — ids are user-managed
  DB uuids; breaks when finance recreates the account. Rejected.
- C (finance picks each session): fine for the disbursement step (already works
  that way) but the sourcing wallet card needs a persistent designation. Rejected
  as the primary mechanism.

## Open questions / risks

- **DB accounts**: does a real "Bank Jago" sourcing account (and courier account)
  already exist, or does finance create them first? (P0)
- **Reports/ledger** referencing CoA 1-1500 / 1-1510 (advance wallets) — after
  removal these are historical only; leave past journals intact.
- **Reconciliation** semantics without per-PO advance — confirm finance is OK with
  account-balance + reimbursement instead of per-advance settlement.
- Big blast radius → implement + verify **phase by phase**, commit each; likely
  spans multiple sessions.

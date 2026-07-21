# Sourcing PR: Approval-Only (Remove Per-Purchase Advance)

**Date:** 2026-07-21
**Status:** Design approved, not yet implemented
**Closes:** P3 of [2026-07-03-remove-advance-design.md](2026-07-03-remove-advance-design.md), which removed the virtual advance wallet but left the per-purchase transfer in place.

## Problem

Sourcing money reaches the field twice.

Finance tops up Bank Jago (`bank-jago`, CoA `1-1400`, `purpose: 'sourcing'`) once a week through the Disbursement page — a pool transfer with no purchase order attached. Sourcers then withdraw from that pool into their own cash-in-hand pockets (`purpose: 'sourcing_pocket'`, CoA `1-1500`) via `recordPocketWithdrawal`, and close those pockets daily.

On top of that, the Purchase Request page still carries a "Transaksi" button that moves money *again*, per shopping document, from a source bank into a destination account (`handleDisburse` → `recordBudgetTransfer`, `src/app/admin/purchase-requests/page.tsx:397-420`). That step is the legacy per-PO advance. It predates the pocket model and no longer corresponds to how cash actually moves.

The button is not merely redundant. Because settlement treats the transferred figure as "money handed over", it asks the field to return a balance that was never separately handed to them.

## Decisions

**Sourcing-category PRs become approval-only.** Reaching `Approved` means the shopping budget is authorised. No money moves. The "Transaksi" button is not rendered for `category === 'Sourcing'`.

**Non-Sourcing PRs are untouched.** Asset purchases, vendor payments and operational expenses keep the existing disburse dialog and `recordPRExpensePayment` path (`src/lib/accounting.ts:1615`), including the CFO gate on strategic source accounts.

**Settlement reconciles plan against actual, not cash against cash.** Finance reviews whether realised spending is reasonable against the approved budget. Chasing physical cash moves entirely to the existing daily pocket close (`TutupHariKantong`).

**Settlement posts no journal entry for new-model purchases.** `recordPocketPurchase` (`src/lib/accounting.ts:972-1001`) already books each purchase at the moment it happens — Dr `2-1100` (GR/IR accrual), Cr pocket — and writes a matching `cashTransaction`. The spending is fully recorded before settlement is ever opened. Settlement only marks the purchase reviewed.

**Deficit auto-reimbursement is disabled for new-model purchases.** `recordReconciliationSettlement` currently auto-creates a "Talangan Defisit Sourcing" reimbursement when spend exceeds the advance (`src/lib/accounting.ts:1308-1330`). Under the pocket model an overspend is pool money used, not personal money fronted, so this would move company money out on a false premise, unattended. Overspend surfaces as a variance figure for Finance to read. A sourcer who genuinely paid from their own pocket files a claim through the existing reimbursement menu.

**In-flight purchases finish under the old rules.** Purchases whose money already left keep the old comparison until they settle. Both paths coexist until the old ones drain.

## Discriminator

`budgetTransferDate` presence.

Set → money was transferred under the old model → old comparison.
Absent → new model → plan-versus-actual.

No migration, no feature flag, no manual tagging. The old branch can be deleted once no unsettled purchase carries the field.

## Changes

### Purchase Request page — `src/app/admin/purchase-requests/page.tsx`

Hide the "Transaksi" button (`data-tour="pr-disburse"`, around :1075) when `activePR.category === 'Sourcing'`. Show the approved budget and a link to the linked shopping document instead.

`handleDisburse` keeps only its `else` branch (`recordPRExpensePayment`). The `disburseType === 'sourcing'` branch and its dialog fields — destination bank, sourcing assignee, spare amount — are removed. `disburseType` collapses to a single mode.

`disbursedAt` is written only inside `handleDisburse` (`:433`), so a Sourcing PR that never disburses will never carry it. Do not repurpose the field. For Sourcing PRs the authorisation marker is `status === 'Approved'`, which `handleCfoApprove` already sets, and the double-disburse guard is irrelevant because there is nothing to disburse.

### Settlement queue — `src/app/finance/approvals/sourcing-settlement/page.tsx:56`, `src/app/finance/approvals/page.tsx:174`

Filter changes from `p.budgetTransferDate && reconciliationStatus !== 'Terverifikasi'` to a report-submitted condition: `reconciliationStatus === 'Laporan Masuk'`. `src/app/sourcing/list/page.tsx:231` already writes that value when the sourcer submits their report, under both models, so no new write is needed. Old purchases pass through `Dana Ditransfer` first; new ones go straight from `Belum Transfer` to `Laporan Masuk`.

`ReconciliationStatus` values are left as they are. `Belum Transfer` reads oddly under the new model, but renaming a persisted enum across the codebase buys nothing.

### Settlement calculation — same two files, :69-77 and :126/:284

Old model, unchanged:
`totalBudget = budgetAmount + operationalSpareAmount`, `expectedReturns = totalBudget − spent − ops`, discrepancy shown, `recordReconciliationSettlement` posts.

New model:
`approvedBudget = budgetAmount` (written by shopping-list's Kirim ke Finance at `src/app/admin/shopping-list/page.tsx:757`), `variance = actualSpend − approvedBudget`. Displayed for review. No `expectedReturns` column, no journal entry, no auto-reimbursement. Approval sets `reconciliationStatus: 'Terverifikasi'` and `status: 'Selesai'`.

`operationalSpareAmount` is no longer written; it reads as `0` and is excluded from the new-model baseline rather than summed into it.

### Ops expense linkage — `src/app/sourcing/list/page.tsx:291`

Selects the purchase an operational expense attaches to by scanning funded purchases (`budgetTransferDate` set). With that field gone the expense loses its `purchaseId` and disappears from settlement entirely.

Re-point the lookup at purchases whose linked PR is approved. Same shape, different predicate.

### Accounting — `src/lib/accounting.ts:1049-1052`

`recordReconciliationSettlement` resolves the credit account from `budgetDestBankAccountId`, falling back to the virtual wallet `bank-advance-sourcing` / `1-1500` when absent. That wallet is the thing `remove-advance` deleted. Since the new model does not call this function at all, guard the call site rather than the function: settlement only invokes it when `budgetTransferDate` is present.

## Not changing

Bank Jago top-ups via Disbursement. Pocket withdrawal, daily close, and `recordPocketPurchase`. Shopping-list compile and Kirim ke Finance. The sourcer checklist — `src/app/sourcing/list/page.tsx:135` gates on `status Pending|Belanja` and purchaser match, never on funding, so shopping already works without a transfer. QC, delivery, and HPP recognition.

## Risks

**`status: 'Belanja'` is no longer set by disburse.** It is set by shopping-list at `:669` for linked sales orders, and the sourcer checklist accepts `Pending` too, so the checklist keeps working. Verify no other consumer depends on disburse specifically setting it.

**`purchaserId` is no longer assigned at disburse time.** Shopping-list writes `'pending'` (`:610`) and `sourcing/list:227` overwrites it on submit, so ownership self-heals — but only after submission. Anything that reads `purchaserId` before then sees `'pending'`. Check `src/app/warehouse/inbound/page.tsx:38` and `src/app/admin/loss-analytics/page.tsx:183`.

**Bank Jago can be drained without a per-document ceiling.** Approval authorises a figure; nothing enforces it at withdrawal time. That is the accepted trade-off of pool funding, and matches how the business already operates. Worth a follow-up: warn when a sourcer's open approved budgets exceed the pool balance.

## Acceptance criteria

1. A Sourcing PR shows no "Transaksi" button at any status.
2. A non-Sourcing PR disburses exactly as before, CFO gate included.
3. A new shopping document with no transfer reaches the settlement queue once its report is submitted.
4. Its settlement screen shows approved budget, actual spend, and variance — no expected-returns figure.
5. Approving it writes no journal entry and creates no reimbursement.
6. An in-flight purchase with `budgetTransferDate` set still settles under the old calculation, auto-reimbursement included.
7. An operational expense filed during a new-model shopping run appears against that purchase in settlement.

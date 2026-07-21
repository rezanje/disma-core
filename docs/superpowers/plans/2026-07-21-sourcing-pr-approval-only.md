# Sourcing PR Approval-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop moving money per shopping document — Sourcing purchase requests become approval-only, and settlement reviews plan against actual instead of chasing a cash balance.

**Architecture:** A single pure module (`src/lib/settlement-model.ts`) decides which model a purchase belongs to and computes its figures. Every settlement screen consumes that module instead of doing its own arithmetic, so the legacy branch lives in one place and can be deleted in one edit once in-flight purchases drain. The discriminator is `budgetTransferDate`: present means money already left under the old model.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zustand (`src/lib/store.ts`), Supabase.

**Spec:** [docs/superpowers/specs/2026-07-21-sourcing-pr-approval-only-design.md](../specs/2026-07-21-sourcing-pr-approval-only-design.md)

## Global Constraints

- This repo has **no test runner**. `package.json` scripts are `dev`, `build`, `lint`, `seed:dev-db` only. Do not add one. Verification is `npx tsc --noEmit` plus the browser checks written into each task.
- **Typecheck baseline: exactly 5 pre-existing errors**, in `src/app/admin/loss-analytics/page.tsx`, `src/app/admin/sales-orders/page.tsx`, and `src/app/finance/disbursements/page.tsx`. Any task that changes this count has broken something.
- Never start a dev server with `npm run dev` in a shell. Use the Browser pane's `preview_start` with the `dev` config from `.claude/launch.json`.
- Money paths only ever gain guards in this plan. No task may add a new code path that posts a journal entry or creates a reimbursement.
- `ReconciliationStatus` string values are persisted in Supabase. Never rename them.
- Indonesian UI copy. Match the surrounding uppercase-tracking Tailwind style of the file being edited.

---

### Task 1: Settlement model module

The shared decision and arithmetic, extracted before any screen changes so the three consumers cannot drift apart.

**Files:**
- Create: `src/lib/settlement-model.ts`
- Create: `src/lib/settlement-model.check.ts`

**Interfaces:**
- Consumes: `Purchase`, `PurchaseItem`, `OperationalExpense` from `@/types`.
- Produces: `isLegacyAdvance(purchase): boolean`, `computeSettlement(purchase, items, opsExpenses): SettlementFigures`, and the `SettlementFigures` interface. Tasks 4 and 5 call both.

- [ ] **Step 1: Write the check file first**

Create `src/lib/settlement-model.check.ts`:

```ts
/**
 * Runnable check for the settlement arithmetic. No test framework in this repo —
 * run directly:  npx tsx src/lib/settlement-model.check.ts
 */
import assert from 'node:assert/strict';
import { isLegacyAdvance, computeSettlement } from './settlement-model';
import type { Purchase, PurchaseItem, OperationalExpense } from '@/types';

const purchase = (over: Partial<Purchase>): Purchase =>
  ({ id: 'p1', date: '2026-07-21', status: 'Belanja', ...over } as Purchase);

const item = (price: number, qty: number): PurchaseItem =>
  ({ id: 'i', purchaseId: 'p1', actualUnitPrice: price, qtyPurchased: qty, isChecked: true } as PurchaseItem);

const ops = (amount: number): OperationalExpense =>
  ({ id: 'e', purchaseId: 'p1', amount } as OperationalExpense);

// Legacy: money was transferred, so we still ask for the balance back.
const legacy = purchase({
  budgetTransferDate: '2026-07-20T00:00:00.000Z',
  budgetAmount: 5_000_000,
  operationalSpareAmount: 200_000,
});
assert.equal(isLegacyAdvance(legacy), true);
const l = computeSettlement(legacy, [item(10_000, 400)], [ops(150_000)]);
assert.equal(l.isLegacy, true);
assert.equal(l.baseline, 5_200_000);
assert.equal(l.shopSpent, 4_000_000);
assert.equal(l.opsSpent, 150_000);
assert.equal(l.expectedReturns, 1_050_000);
assert.equal(l.variance, null);

// New model: no transfer, so we compare realised spend against the approved budget.
const fresh = purchase({ budgetAmount: 5_000_000 });
assert.equal(isLegacyAdvance(fresh), false);
const n = computeSettlement(fresh, [item(10_000, 400)], [ops(150_000)]);
assert.equal(n.isLegacy, false);
assert.equal(n.baseline, 5_000_000);
assert.equal(n.expectedReturns, null);
assert.equal(n.variance, -850_000); // under budget

// Overspend is a positive variance, never a payable.
const over = computeSettlement(purchase({ budgetAmount: 1_000_000 }), [item(10_000, 200)], []);
assert.equal(over.variance, 1_000_000);

// operationalSpareAmount is ignored under the new model even if stale data carries one.
const stale = computeSettlement(
  purchase({ budgetAmount: 1_000_000, operationalSpareAmount: 999_999 }), [], [],
);
assert.equal(stale.baseline, 1_000_000);

console.log('settlement-model: all checks passed');
```

- [ ] **Step 2: Run the check to verify it fails**

Run: `npx tsx src/lib/settlement-model.check.ts`
Expected: FAIL — `Cannot find module './settlement-model'`.

- [ ] **Step 3: Write the module**

Create `src/lib/settlement-model.ts`:

```ts
import type { Purchase, PurchaseItem, OperationalExpense } from '@/types';

export interface SettlementFigures {
  /** True when money was handed over per-document under the pre-2026-07-21 model. */
  isLegacy: boolean;
  /** Legacy: advance handed over. New: budget approved on the PR. */
  baseline: number;
  shopSpent: number;
  opsSpent: number;
  /** Legacy only — cash the sourcer still owes back. Null under the new model. */
  expectedReturns: number | null;
  /** New model only — realised minus approved. Positive means overspend. Null when legacy. */
  variance: number | null;
}

/**
 * Which settlement model a purchase belongs to.
 *
 * Money used to be transferred per shopping document; it now sits in the Bank Jago
 * pool and sourcers draw from it into their own pockets. `budgetTransferDate` is only
 * ever written by the old per-document transfer, so its presence dates the record.
 * Once no unsettled purchase carries it, this function and every `isLegacy` branch
 * can be deleted together.
 */
export const isLegacyAdvance = (purchase: Pick<Purchase, 'budgetTransferDate'>): boolean =>
  Boolean(purchase.budgetTransferDate);

export const computeSettlement = (
  purchase: Purchase,
  items: PurchaseItem[],
  opsExpenses: OperationalExpense[],
): SettlementFigures => {
  const isLegacy = isLegacyAdvance(purchase);
  const shopSpent = items.reduce(
    (sum, i) => sum + (i.actualUnitPrice || 0) * (i.qtyPurchased || 0), 0,
  );
  const opsSpent = opsExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  // The spare was part of the handover, so it only belongs in the legacy baseline.
  const baseline = isLegacy
    ? (purchase.budgetAmount || 0) + (purchase.operationalSpareAmount || 0)
    : (purchase.budgetAmount || 0);

  return {
    isLegacy,
    baseline,
    shopSpent,
    opsSpent,
    expectedReturns: isLegacy ? baseline - shopSpent - opsSpent : null,
    variance: isLegacy ? null : shopSpent + opsSpent - baseline,
  };
};
```

- [ ] **Step 4: Run the check to verify it passes**

Run: `npx tsx src/lib/settlement-model.check.ts`
Expected: `settlement-model: all checks passed`

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `5`

- [ ] **Step 6: Commit**

```bash
git add src/lib/settlement-model.ts src/lib/settlement-model.check.ts
git commit -m "feat(settlement): add settlement model module

Extracts the decision of which settlement model a purchase belongs to, and
the arithmetic for each, into one place. budgetTransferDate dates the record:
present means money was handed over per document under the old model.

Ships with a runnable assert check since the repo has no test framework."
```

---

### Task 2: Sourcing PRs stop disbursing

**Files:**
- Modify: `src/app/admin/purchase-requests/page.tsx` — step-4 block at :955-980, `handleDisburse` at :397-420, `openDisburse` at :223-237, dialog at :1151-1226

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: nothing consumed by later tasks. `disburseType` state is deleted; nothing outside this file reads it.

- [ ] **Step 1: Replace the step-4 body for Sourcing PRs**

In the workflow-state block, the current step 4 renders `Sudah Dicairkan` / the Transaksi button / a waiting message. Wrap that three-way choice so Sourcing never reaches it. Replace lines :959-979 (`<div className="flex-1">` through its closing `</div>`) with:

```tsx
                        <div className="flex-1">
                          {activePR.category === 'Sourcing' ? (
                            <>
                              <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Anggaran Disetujui</h5>
                              {activePR.status === 'Approved' ? (
                                <div className="space-y-1">
                                  <span className="inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">Siap Dibelanjakan</span>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                                    Dana diambil sendiri dari kas sourcing — tidak ada transfer per dokumen belanja.
                                  </p>
                                </div>
                              ) : (
                                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 italic">Menunggu persetujuan...</p>
                              )}
                            </>
                          ) : (
                            <>
                              <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Pencairan Dana</h5>
                              {activePR.disbursedAt ? (
                                <div className="space-y-1">
                                  <span className="inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">Sudah Dicairkan</span>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                                    Oleh: {activePR.disbursedBy} • {new Date(activePR.disbursedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                                  </p>
                                </div>
                              ) : activePR.status === 'Approved' && isFinanceRole ? (
                                <Button
                                  data-tour="pr-disburse"
                                  onClick={() => openDisburse(activePR)}
                                  className="mt-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider h-9 rounded-xl px-4"
                                >
                                  <DollarSign className="w-3.5 h-3.5 mr-1" /> Transaksi
                                </Button>
                              ) : (
                                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 italic">Menunggu pencairan dana oleh finance...</p>
                              )}
                            </>
                          )}
                        </div>
```

The step-number circle just above (:953-956) keys its filled state off `activePR.disbursedAt`. Change that condition to `(activePR.category === 'Sourcing' ? activePR.status === 'Approved' : !!activePR.disbursedAt)` so the Sourcing badge fills on approval.

- [ ] **Step 2: Delete the sourcing branch from `handleDisburse`**

Replace the whole `if (disburseType === 'sourcing') { ... } else { ... }` block (:397-428) with the former `else` body only:

```tsx
      if (!disburseContactId) { toast.error('Pilih atau buat kontak tujuan.', { id: loadingId }); setIsDisbursing(false); return }
      const contact = vendors.find(v => v.id === disburseContactId)
      const ok = await recordPRExpensePayment(
        activePR.id, amount, disburseBankId, disburseExpenseCode,
        contact?.companyName || 'Kontak', disburseNote, now
      )
```

Change `let ok = false` to `const ok` as shown. At :434, `disbursementType: disburseType === 'sourcing' ? 'sourcing' : 'other'` becomes `disbursementType: 'other'`.

Add a guard at the top of the function, directly after the `activePR.disbursedAt` check:

```tsx
    if (activePR.category === 'Sourcing') { toast.error('PR belanja tidak dicairkan per dokumen — dana diambil dari kas sourcing.'); return }
```

- [ ] **Step 3: Delete the now-dead state and dialog fields**

Remove the `disburseType` state (:181) and its `setDisburseType` call in `openDisburse` (:224). Remove the `disburseDestBankId`, `disburseSourcingId`, `disburseSpareRaw` states and their resets in `openDisburse`. Remove the type `<Select>` at :1151-1175 and the entire `{disburseType === 'sourcing' && ( ... )}` block at :1176-1226. Unwrap `{disburseType === 'expense' && ( ... )}` at :1227 so its contents render unconditionally.

Remove any import left unused by the deletions — `recordBudgetTransfer` and `updatePurchase` if this file no longer calls them. Let the typecheck and `npx eslint src/app/admin/purchase-requests/page.tsx` tell you which.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `5`

Run: `npx eslint src/app/admin/purchase-requests/page.tsx`
Expected: no unused-variable errors.

- [ ] **Step 5: Verify in the browser**

Start the preview (`preview_start` with name `dev`). Log in with PIN `5555` (Sifa, finance). Go to `/admin/purchase-requests`.

- Select a PR whose category is `Sourcing` and whose status is `Approved`. Expected: step 4 reads "Anggaran Disetujui / Siap Dibelanjakan". No Transaksi button anywhere on the card.
- Select a PR whose category is not `Sourcing` and status is `Approved`. Expected: the Transaksi button is present; opening it shows the contact and expense-code fields with no type selector and no sourcing fields.

Take a screenshot of each.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/purchase-requests/page.tsx
git commit -m "feat(pr): sourcing requests are approval-only

The per-document transfer was the legacy per-PO advance. Money now reaches
the field through the Bank Jago pool and per-sourcer pockets, so moving it
again per shopping document double-handles it and gives settlement a
baseline that was never separately handed over.

Non-Sourcing categories keep the disburse dialog unchanged."
```

---

### Task 3: Settlement queue admits new-model purchases

**Files:**
- Modify: `src/app/finance/approvals/sourcing-settlement/page.tsx:52-56`
- Modify: `src/app/finance/approvals/page.tsx:121-125`

**Interfaces:**
- Consumes: nothing.
- Produces: both queues now contain purchases with no `budgetTransferDate`. Tasks 4 and 5 must handle those.

- [ ] **Step 1: Change the sourcing-settlement filter**

Replace:

```tsx
  const pendingSettlements = purchases.filter(p => {
    // Show if money has been given (budgetTransferDate exists) 
    // AND it hasn't been finalized yet (reconciliationStatus !== 'Terverifikasi')
    return p.budgetTransferDate && p.reconciliationStatus !== 'Terverifikasi'
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
```

with:

```tsx
  // Queue on the report, not on the transfer. Purchases funded from the sourcing
  // pool never carry budgetTransferDate, so keying off it hid them entirely.
  // sourcing/list writes 'Laporan Masuk' on submit under both models.
  const pendingSettlements = purchases.filter(p => {
    return p.reconciliationStatus === 'Laporan Masuk'
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
```

- [ ] **Step 2: Change the approvals filter**

Replace:

```tsx
  const sourcingSettlements = purchases.filter(p => {
    // Show if money has been given (budgetTransferDate exists) 
    // AND it hasn't been finalized yet (reconciliationStatus !== 'Terverifikasi')
    return p.budgetTransferDate && p.reconciliationStatus !== 'Terverifikasi';
  }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
```

with:

```tsx
  // Queue on the report, not on the transfer — see sourcing-settlement/page.tsx.
  const sourcingSettlements = purchases.filter(p => {
    return p.reconciliationStatus === 'Laporan Masuk';
  }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `5`

- [ ] **Step 4: Commit**

```bash
git add src/app/finance/approvals/sourcing-settlement/page.tsx src/app/finance/approvals/page.tsx
git commit -m "fix(settlement): queue on report submitted, not on transfer

Purchases funded from the sourcing pool never carry budgetTransferDate, so
filtering on it would hide every new-model purchase from settlement."
```

---

### Task 4: Settlement screen computes and posts per model

**Files:**
- Modify: `src/app/finance/approvals/sourcing-settlement/page.tsx` — figures at :69-77, `processApprovalCore` at :140-190, and the returns/discrepancy JSX

**Interfaces:**
- Consumes: `computeSettlement`, `isLegacyAdvance`, `SettlementFigures` from Task 1.
- Produces: nothing consumed later.

- [ ] **Step 1: Import and replace the derived figures**

Add to the imports:

```tsx
import { computeSettlement, isLegacyAdvance } from "@/lib/settlement-model"
```

Replace:

```tsx
  const totalBudget = (selectedPurchase?.budgetAmount || 0) + (selectedPurchase?.operationalSpareAmount || 0)
  const totalShopSpent = pItems.reduce((sum, item) => sum + (item.actualUnitPrice * item.qtyPurchased), 0)
  const totalOpsSpent = pExpenses.reduce((sum, e) => sum + e.amount, 0)
```

with:

```tsx
  const figures = selectedPurchase ? computeSettlement(selectedPurchase, pItems, pExpenses) : null
  const totalBudget = figures?.baseline || 0
  const totalShopSpent = figures?.shopSpent || 0
  const totalOpsSpent = figures?.opsSpent || 0
```

Replace:

```tsx
  const expectedReturns = totalBudget - totalShopSpent - totalOpsSpent
  const returnDiscrepancy = totalReturns - expectedReturns
```

with:

```tsx
  const expectedReturns = figures?.expectedReturns ?? 0
  const returnDiscrepancy = totalReturns - expectedReturns
  const isLegacySettlement = figures?.isLegacy ?? false
```

- [ ] **Step 2: Hide the cash-return UI for new-model purchases**

Every block that renders `expectedReturns`, `returnDiscrepancy`, `totalReturns`, or the Setoran Pengembalian list is meaningless when no cash was handed over. Wrap each in `{isLegacySettlement && ( ... )}`.

In its place, when `!isLegacySettlement`, render a variance row alongside the existing budget and spend rows:

```tsx
{!isLegacySettlement && figures && (
  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
      Selisih vs Anggaran
    </span>
    <span className={cn(
      "text-sm font-black",
      figures.variance !== null && figures.variance > 0 ? "text-rose-600" : "text-emerald-600"
    )}>
      {figures.variance !== null && figures.variance > 0 ? '+' : ''}{formatRupiah(figures.variance || 0)}
    </span>
  </div>
)}
```

Use the file's existing `formatRupiah` and `cn` imports; add them if absent.

- [ ] **Step 3: Guard the journal posting in `processApprovalCore`**

Replace the `totalBudget` line and the `recordReconciliationSettlement` call (steps 4 in that function) with:

```tsx
    const figures = computeSettlement(latestPurchase, freshItems, freshExpenses)
    const totalShopSpent = figures.shopSpent

    // 4. Settle HPP and sync budget — legacy advances only. Under the pool model
    // recordPocketPurchase already booked Dr 2-1100 / Cr pocket at buy time, so
    // posting here would double-book, and the credit would land on the deleted
    // bank-advance-sourcing wallet whenever budgetDestBankAccountId is absent.
    if (figures.isLegacy) {
      const success = await recordReconciliationSettlement(
        purchaseId,
        totalShopSpent,
        0, // Ops already handled above as individual expenses
        figures.baseline,
        latestPurchase.budgetBankAccountId || 'bank-1'
      )
      if (!success) throw new Error("Gagal settle rekonsiliasi jurnal HPP.")
    }
```

Delete the now-unused `const totalBudget = ...` line inside the function. Everything after — `updatePurchase`, the sales-order advance to QC, price-history updates — stays exactly as-is and runs for both models.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `5`

- [ ] **Step 5: Verify in the browser**

Log in with PIN `5555`. Go to `/finance/approvals/sourcing-settlement`.

- Pick a purchase with `budgetTransferDate` set (an old one). Expected: the returns and discrepancy rows still show, exactly as before.
- Pick one without it. Expected: no returns row, no discrepancy row; a "Selisih vs Anggaran" row appears instead.

If no new-model purchase exists yet, note that and verify it in Task 7 instead. Do not fabricate data to make this step pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/finance/approvals/sourcing-settlement/page.tsx
git commit -m "feat(settlement): plan-vs-actual review for pool-funded purchases

Pool-funded spending is already booked by recordPocketPurchase at buy time,
so settlement posts nothing for it — it only marks the purchase reviewed.
Legacy advances keep the cash reconciliation and its journal entry."
```

---

### Task 5: Direct-settle path in the finance hub

**Files:**
- Modify: `src/app/finance/approvals/page.tsx` — `directSettleBudget` at :126, the settle handler around :284

**Interfaces:**
- Consumes: `isLegacyAdvance` from Task 1.
- Produces: nothing consumed later.

- [ ] **Step 1: Import the module**

```tsx
import { isLegacyAdvance } from "@/lib/settlement-model"
```

- [ ] **Step 2: Replace the derived budget**

Replace:

```tsx
  const directSettleBudget = (directSettlePurchase?.budgetAmount || 0) + (directSettlePurchase?.operationalSpareAmount || 0)
```

with:

```tsx
  // Spare only counts when it was actually handed over; see settlement-model.
  const directSettleBudget = directSettlePurchase
    ? (isLegacyAdvance(directSettlePurchase)
        ? (directSettlePurchase.budgetAmount || 0) + (directSettlePurchase.operationalSpareAmount || 0)
        : (directSettlePurchase.budgetAmount || 0))
    : 0
```

- [ ] **Step 3: Guard the settle handler**

At the handler that computes `advanceAmount` (:284), replace:

```tsx
      const advanceAmount = (purchase.budgetAmount || 0) + (purchase.operationalSpareAmount || 0)
```

with:

```tsx
      const isLegacy = isLegacyAdvance(purchase)
      const advanceAmount = isLegacy
        ? (purchase.budgetAmount || 0) + (purchase.operationalSpareAmount || 0)
        : (purchase.budgetAmount || 0)
```

Do not reach for `computeSettlement` here — this handler has no item or expense arrays to give it, and calling it with empty arrays would yield a meaningless `variance`. `isLegacyAdvance` is the whole of what this path needs.

Then locate the `recordReconciliationSettlement` call in the same handler and wrap it in `if (isLegacy) { ... }`, keeping its error handling inside the branch. Under the new model this handler must update status only.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `5`

- [ ] **Step 5: Commit**

```bash
git add src/app/finance/approvals/page.tsx
git commit -m "feat(settlement): apply settlement model to finance hub direct settle"
```

---

### Task 6: Operational expenses attach to approved purchases

Without this the sourcer's parking, fuel, and porter costs lose their `purchaseId` and vanish from settlement entirely.

**Files:**
- Modify: `src/app/sourcing/list/page.tsx:289-292`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Replace the funded-purchase lookup**

Replace:

```tsx
    const activePurchase = myPurchases
      .filter(p => p.budgetTransferDate && p.reconciliationStatus !== 'Laporan Masuk' && p.reconciliationStatus !== 'Terverifikasi')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
```

with:

```tsx
    // Attach to the newest shopping run still open for this sourcer. Pool-funded
    // runs have no budgetTransferDate, so requiring it orphaned their ops costs.
    const activePurchase = myPurchases
      .filter(p => p.reconciliationStatus !== 'Laporan Masuk' && p.reconciliationStatus !== 'Terverifikasi')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `5`

- [ ] **Step 3: Verify in the browser**

Log in with PIN `2222` (Hilman, sourcing). Go to `/sourcing/list?tab=ops`. File an operational expense. Then log in as PIN `5555` and open `/finance/approvals/sourcing-settlement` — the expense must appear under the sourcer's open shopping run, not as an unlinked item.

- [ ] **Step 4: Commit**

```bash
git add src/app/sourcing/list/page.tsx
git commit -m "fix(sourcing): link ops expenses to open runs regardless of funding

Keying the lookup off budgetTransferDate orphaned every ops expense filed
during a pool-funded shopping run."
```

---

### Task 7: End-to-end verification

No code. This task exists because the individual tasks each verify a slice, and the thing that matters is the whole path.

**Files:** none.

- [ ] **Step 1: Run the full flow as three roles**

With the preview running:

1. PIN `1111` (Bagus, admin) → `/admin/shopping-list`. Select sales orders, Buat Dokumen List, then Kirim ke Finance. Expect a PR created with category `Sourcing`.
2. PIN `5555` (Sifa, finance) → `/admin/purchase-requests`. Verify the new PR, approve it. Expect step 4 to read "Anggaran Disetujui / Siap Dibelanjakan" and no Transaksi button.
3. PIN `2222` (Hilman, sourcing) → `/sourcing/list`. The shopping run must appear in the checklist without any funding step. Complete the checklist and submit the report.
4. PIN `5555` → `/finance/approvals/sourcing-settlement`. The run must appear in the queue. Its card shows approved budget, actual spend, and a "Selisih vs Anggaran" figure — no expected-returns row.

- [ ] **Step 2: Confirm nothing was posted or created**

Before approving in step 1.4, note the balance of the sourcer's pocket account and of Bank Jago on `/finance/cash-bank`. Approve the settlement. Re-check both balances and `/finance/ledger`.

Expected: no new journal entry referencing this purchase beyond the ones `recordPocketPurchase` already wrote at buy time, and no new reimbursement on `/finance/approvals?tab=reimburse`.

If a "Talangan Defisit Sourcing" reimbursement appears, Task 4's guard did not take. Stop and fix before continuing.

- [ ] **Step 3: Confirm the legacy path still works**

Find a purchase that already has `budgetTransferDate` set (check `/finance/approvals?tab=settlement`, or query the store in the browser console). Settle it. Expected: the returns and discrepancy rows render, and a journal entry is posted, exactly as before this change.

If no such purchase exists in the current data, say so plainly in the final report rather than claiming this was verified.

- [ ] **Step 4: Check the `purchaserId` risk the spec flagged**

`purchaserId` used to be assigned when Finance disbursed. It is now written as `'pending'` by `src/app/admin/shopping-list/page.tsx:610` and only replaced with the real sourcer at `src/app/sourcing/list/page.tsx:227`, on report submit. So between compile and submit it reads `'pending'`.

Open `/warehouse/inbound` and `/admin/loss-analytics` while the run from step 1 is mid-flight — after the checklist is started but before the report is submitted. Confirm neither page crashes, shows a blank owner column, or drops the row. `src/app/warehouse/inbound/page.tsx:38` and `src/app/admin/loss-analytics/page.tsx:183` are the lines that read it.

Report what you saw. If either page misbehaves, do not patch it here — note it and raise it separately.

- [ ] **Step 5: Final typecheck and lint**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `5`

Run: `npx eslint src/lib/settlement-model.ts src/app/admin/purchase-requests/page.tsx src/app/finance/approvals/sourcing-settlement/page.tsx src/app/finance/approvals/page.tsx src/app/sourcing/list/page.tsx`
Expected: clean.

- [ ] **Step 6: Run the model check once more**

Run: `npx tsx src/lib/settlement-model.check.ts`
Expected: `settlement-model: all checks passed`

- [ ] **Step 7: Open the PR**

```bash
git push -u origin feat/sourcing-pr-approval-only
gh pr create --base main --title "feat: approval-only sourcing purchase requests"
```

Body must state which acceptance criteria from the spec were verified in the browser and which were not, and why.

---

## Acceptance criteria (from the spec)

1. A Sourcing PR shows no "Transaksi" button at any status. → Task 2
2. A non-Sourcing PR disburses exactly as before, CFO gate included. → Task 2
3. A new shopping document with no transfer reaches the settlement queue once its report is submitted. → Task 3, Task 7
4. Its settlement screen shows approved budget, actual spend, and variance — no expected-returns figure. → Task 4
5. Approving it writes no journal entry and creates no reimbursement. → Task 4, Task 7 step 2
6. An in-flight purchase with `budgetTransferDate` set still settles under the old calculation. → Task 4, Task 7 step 3
7. An operational expense filed during a new-model shopping run appears against that purchase. → Task 6

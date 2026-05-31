# PR Step-4 Disbursement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Finance "Advance" tab with a Step-4 "Transaksi" disbursement action on approved Purchase Requests that posts directly to the ledger (sourcing advance / direct vendor payment / other expense).

**Architecture:** Reuse existing accounting infra (`createAccountingEntry`, `recordBudgetTransfer`). Add two new posting helpers in `accounting.ts`, three persisted fields on `PurchaseRequest` (+ prod columns), a disbursement modal + Step-4 UI in the PR detail panel, and remove the "Advance" nav entry. Sourcing path keeps the existing reconciliation flow by funding the linked purchase.

**Tech Stack:** Next.js (App Router) + React + Zustand store + Supabase (Postgres) via `/api/db` and `/api/accounting/journal`. No unit-test runner in repo — verification gate is `npx tsc --noEmit` plus DB/manual checks.

**Spec:** `docs/superpowers/specs/2026-06-01-pr-step4-disbursement-design.md`

---

## File Structure

- `src/types/index.ts` — add 3 fields to `PurchaseRequest`.
- `src/lib/accounting.ts` — add `resolvePRExpenseAccountCode`, `recordDirectVendorPayment`, `recordPRExpense`.
- `src/app/admin/purchase-requests/page.tsx` — selectors, disbursement state, modal, Step-4 UI, badge.
- `src/lib/navigation.tsx` — remove "Advance" nav item.
- Prod DB (`purchase_requests`) — 3 new columns via Supabase `apply_migration`.

---

## Task 1: Prod DB columns (schema drift prevention)

**Files:** none (DB migration via Supabase MCP `apply_migration`, project_id `ckkohudfuisgzlrjipev`).

- [ ] **Step 1: Apply migration**

Name: `add_disbursement_fields_to_purchase_requests`
```sql
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS disbursed_at text;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS disbursement_type text;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS disbursed_by text;
```

- [ ] **Step 2: Verify columns exist**

Run SQL:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='purchase_requests'
  AND column_name IN ('disbursed_at','disbursement_type','disbursed_by');
```
Expected: 3 rows returned.

---

## Task 2: PurchaseRequest type fields

**Files:**
- Modify: `src/types/index.ts` (interface `PurchaseRequest`, ~line 610-625)

- [ ] **Step 1: Add fields**

In `interface PurchaseRequest`, after `salesOrderIds?: string[];` and before `createdAt: string;`, add:
```ts
  disbursedAt?: string;                              // ISO time the funds were disbursed (step 4)
  disbursementType?: 'sourcing' | 'vendor' | 'other';
  disbursedBy?: string;                              // user name/id who disbursed
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "types/index"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add disbursement fields to PurchaseRequest"
```

---

## Task 3: Accounting posting helpers

**Files:**
- Modify: `src/lib/accounting.ts` (add after `recordBudgetTransfer`, ~line 778)

Context: `createAccountingEntry(description, referenceType, referenceId, debits[], credits[], date?)` posts atomically. `addCashTransaction` is on the store. COA codes verified present: `5-1000` HPP, `6-1400` Beban Transportasi & BBM, `6-9000` Beban Operasional Lainnya, bank default `1-1200`.

- [ ] **Step 1: Add category→COA resolver + two helpers**

Append to `src/lib/accounting.ts`:
```ts
/** Map a Purchase Request category to its expense/COGS account code. */
export const resolvePRExpenseAccountCode = (category?: string): string => {
  switch (category) {
    case 'Sourcing': return HPP_ACCOUNT_CODE;       // 5-1000
    case 'Logistik & Bensin': return '6-1400';      // Beban Transportasi & BBM
    case 'Operasional Gudang':
    case 'Marketing & Promo':
    case 'Aset & Peralatan':
    case 'Lain-lain':
    default: return '6-9000';                        // Beban Operasional Lainnya
  }
};

/** Direct vendor payment for an approved PR. Final (no reconciliation). */
export const recordDirectVendorPayment = async (
  prId: string,
  amount: number,
  sourceBankAccountId: string,
  vendorName: string,
  category: string,
  description: string,
  date?: string
) => {
  const store = useAppStore.getState();
  const bank = store.bankAccounts.find(b => b.id === sourceBankAccountId);
  if (!bank) { console.error('[Accounting] Direct vendor payment: source bank not found.'); return false; }

  const desc = description || `Bayar Vendor: ${vendorName} - PR ${prId.slice(0, 8)}`;
  const success = await createAccountingEntry(
    desc,
    'Expense',
    prId,
    [{ accountCode: resolvePRExpenseAccountCode(category), amount }],
    [{ accountCode: bank.accountCode || '1-1200', amount }],
    date
  );

  if (success && amount > 0) {
    await store.addCashTransaction({
      id: uuidv4(),
      date: date || new Date().toISOString(),
      amount,
      type: 'Out',
      category: `Pembayaran Vendor (${category})`,
      description: desc,
      bankAccountId: sourceBankAccountId,
      counterpartName: vendorName,
      referenceType: 'Expense',
      referenceId: prId,
    });
  }
  return success;
};

/** Other operational expense for an approved PR. Final (no reconciliation). */
export const recordPRExpense = async (
  prId: string,
  amount: number,
  sourceBankAccountId: string,
  category: string,
  description: string,
  date?: string
) => {
  const store = useAppStore.getState();
  const bank = store.bankAccounts.find(b => b.id === sourceBankAccountId);
  if (!bank) { console.error('[Accounting] PR expense: source bank not found.'); return false; }

  const desc = description || `Pengeluaran: ${category} - PR ${prId.slice(0, 8)}`;
  const success = await createAccountingEntry(
    desc,
    'Expense',
    prId,
    [{ accountCode: resolvePRExpenseAccountCode(category), amount }],
    [{ accountCode: bank.accountCode || '1-1200', amount }],
    date
  );

  if (success && amount > 0) {
    await store.addCashTransaction({
      id: uuidv4(),
      date: date || new Date().toISOString(),
      amount,
      type: 'Out',
      category: `Pengeluaran (${category})`,
      description: desc,
      bankAccountId: sourceBankAccountId,
      counterpartName: 'Pengeluaran Operasional',
      referenceType: 'Expense',
      referenceId: prId,
    });
  }
  return success;
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "accounting"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/accounting.ts
git commit -m "feat(accounting): add PR vendor/expense disbursement helpers"
```

---

## Task 4: PR page — selectors, state, linked-purchase helper

**Files:**
- Modify: `src/app/admin/purchase-requests/page.tsx` (imports ~1-18; selectors ~32-41; state ~44-95)

- [ ] **Step 1: Import accounting helpers + vendor type**

In the import block, add an import line after the lucide import (line 18):
```ts
import { recordBudgetTransfer, recordDirectVendorPayment, recordPRExpense } from "@/lib/accounting"
```

- [ ] **Step 2: Add store selectors**

After line 41 (`const products = useAppStore(state => state.products) || []`), add:
```ts
  const vendors = useAppStore(state => state.vendors) || []
  const bankAccounts = useAppStore(state => state.bankAccounts) || []
  const users = useAppStore(state => state.users) || []
  const updatePurchase = useAppStore(state => state.updatePurchase)
```

- [ ] **Step 3: Add disbursement state**

After the existing `const [cfoNote, setCfoNote] = useState("")` (~line 156), add:
```ts
  // Step-4 disbursement modal state
  const [disburseOpen, setDisburseOpen] = useState(false)
  const [disburseType, setDisburseType] = useState<'sourcing' | 'vendor' | 'other'>('other')
  const [disburseBankId, setDisburseBankId] = useState("")
  const [disburseSourcingId, setDisburseSourcingId] = useState("")
  const [disburseVendorId, setDisburseVendorId] = useState("")
  const [disburseAmountRaw, setDisburseAmountRaw] = useState("")
  const [disburseSpareRaw, setDisburseSpareRaw] = useState("")
  const [disburseNote, setDisburseNote] = useState("")
  const [isDisbursing, setIsDisbursing] = useState(false)
```

- [ ] **Step 4: Add linked-purchase helper + open handler**

After `poPRCount`/`soHppTotal` helpers (~line 180), add:
```ts
  // Purchases (shopping list docs) funded by this PR — used for the sourcing path.
  const linkedPurchases = (pr: PurchaseRequest) =>
    purchases.filter(p => p.purchaseRequestId === pr.id)

  const openDisburse = (pr: PurchaseRequest) => {
    setDisburseType(pr.category === 'Sourcing' ? 'sourcing' : 'other')
    setDisburseBankId("")
    setDisburseSourcingId("")
    setDisburseVendorId("")
    setDisburseAmountRaw(formatNumber(String(pr.amount)))
    setDisburseSpareRaw("")
    setDisburseNote("")
    setDisburseOpen(true)
  }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "purchase-requests"`
Expected: no output (state declared, not yet used in JSX — `disburseOpen` etc. are referenced in Task 5/6; if tsc reports "declared but never read" it is a warning surfaced only by lint, tsc noEmit will pass. If an unused-var error appears, proceed — it resolves in Task 6).

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/purchase-requests/page.tsx
git commit -m "feat(pr): add disbursement selectors, state, linked-purchase helper"
```

---

## Task 5: PR page — disbursement submit handler

**Files:**
- Modify: `src/app/admin/purchase-requests/page.tsx` (add handler after `openDisburse`, before `return (`)

- [ ] **Step 1: Add handleDisburse**

Add this function (place it near the other handlers, e.g. after `handleCfoApprove`):
```ts
  const handleDisburse = async () => {
    if (!activePR) return
    if (activePR.status !== 'Approved') { toast.error('PR belum di-approve CFO.'); return }
    if (activePR.disbursedAt) { toast.error('PR ini sudah dicairkan.'); return }

    const amount = parseNumber(disburseAmountRaw)
    const spare = parseNumber(disburseSpareRaw) || 0
    if (amount <= 0) { toast.error('Nominal harus lebih dari 0.'); return }
    if (amount > activePR.amount) { toast.error('Nominal tidak boleh melebihi yang disetujui CFO.'); return }
    if (!disburseBankId) { toast.error('Pilih rekening sumber.'); return }

    const now = new Date().toISOString()
    setIsDisbursing(true)
    const loadingId = toast.loading('Memproses transaksi...')
    try {
      let ok = false

      if (disburseType === 'sourcing') {
        const linked = linkedPurchases(activePR)
        if (linked.length === 0) {
          toast.error('Belum ada shopping list untuk PR ini. Buat shopping list dulu.', { id: loadingId })
          setIsDisbursing(false); return
        }
        if (linked.length > 1) {
          toast.error('PR ini punya >1 shopping list. Cairkan lewat masing-masing dokumen.', { id: loadingId })
          setIsDisbursing(false); return
        }
        if (!disburseSourcingId) {
          toast.error('Pilih penanggung jawab sourcing.', { id: loadingId })
          setIsDisbursing(false); return
        }
        const purchase = linked[0]
        const user = users.find(u => u.id === disburseSourcingId)
        ok = await recordBudgetTransfer(purchase.id, amount + spare, disburseBankId, user?.name || 'Sourcing')
        if (ok) {
          await updatePurchase(purchase.id, {
            status: 'Belanja',
            purchaserId: disburseSourcingId,
            budgetAmount: amount,
            budgetTransferDate: now,
            budgetBankAccountId: disburseBankId,
            budgetTransferedBy: currentUser?.id,
            operationalSpareAmount: spare,
          })
        }
      } else if (disburseType === 'vendor') {
        if (!disburseVendorId) {
          toast.error('Pilih vendor.', { id: loadingId })
          setIsDisbursing(false); return
        }
        const vendor = vendors.find(v => v.id === disburseVendorId)
        ok = await recordDirectVendorPayment(
          activePR.id, amount, disburseBankId, vendor?.companyName || 'Vendor',
          activePR.category, disburseNote, now
        )
      } else {
        if (!disburseNote.trim()) {
          toast.error('Isi keterangan pengeluaran.', { id: loadingId })
          setIsDisbursing(false); return
        }
        ok = await recordPRExpense(activePR.id, amount, disburseBankId, activePR.category, disburseNote, now)
      }

      if (!ok) { toast.error('Gagal mencatat transaksi ke ledger.', { id: loadingId }); return }

      await updatePurchaseRequest(activePR.id, {
        disbursedAt: now,
        disbursementType: disburseType,
        disbursedBy: currentUser?.name || currentUser?.id,
      })
      toast.success('Transaksi tercatat & dana dicairkan.', { id: loadingId })
      setDisburseOpen(false)
    } catch (e) {
      toast.error(`Gagal: ${e instanceof Error ? e.message : String(e)}`, { id: loadingId })
    } finally {
      setIsDisbursing(false)
    }
  }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "purchase-requests"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/purchase-requests/page.tsx
git commit -m "feat(pr): add step-4 disbursement submit handler"
```

---

## Task 6: PR page — Step-4 UI, Transaksi button, badge, modal

**Files:**
- Modify: `src/app/admin/purchase-requests/page.tsx` (workflow block ends ~line 757 `</div>` of timeline; modal goes near other dialogs / end of component)

Context: Step 3 ("Persetujuan CFO") block ends around line 756 with two closing `</div>`s, then `</div>` closes the timeline `<div className="space-y-4">`, then the section `</div>`. Insert Step 4 INSIDE the timeline `space-y-4` container, after Step 3's outer `</div>`.

- [ ] **Step 1: Insert Step-4 timeline node**

Find the end of the Step 3 block (the `</div>` that closes `{/* Step 3: Approved & Released */}`'s outer `<div className="flex gap-3">`). Immediately after it, still inside `<div className="space-y-4">`, insert:
```tsx
                      {/* Step 4: Disbursement (Finance action) */}
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs",
                            activePR.disbursedAt ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-400 dark:bg-slate-800"
                          )}>4</div>
                        </div>
                        <div className="flex-1">
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
                              onClick={() => openDisburse(activePR)}
                              className="mt-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider h-9 rounded-xl px-4"
                            >
                              <DollarSign className="w-3.5 h-3.5 mr-1" /> Transaksi
                            </Button>
                          ) : (
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 italic">Menunggu pencairan dana oleh finance...</p>
                          )}
                        </div>
                      </div>
```

- [ ] **Step 2: Add the disbursement modal**

Near the end of the component, before the final closing `</div>`/`)` of the returned JSX (alongside any existing dialog/sheet), add a Dialog. This repo uses a `Dialog` pattern; if `Dialog` is not imported, use the existing modal/sheet component already used by this page. Add the import if needed:
```ts
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
```
Then add the modal JSX:
```tsx
      <Dialog open={disburseOpen} onOpenChange={setDisburseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transaksi Pencairan Dana</DialogTitle>
          </DialogHeader>
          {activePR && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tipe Transaksi</Label>
                <Select value={disburseType} onValueChange={(v) => setDisburseType(v as 'sourcing' | 'vendor' | 'other')}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sourcing">Kasih Dana Sourcing (pindah kas)</SelectItem>
                    <SelectItem value="vendor">Bayar Vendor Langsung</SelectItem>
                    <SelectItem value="other">Pengeluaran Lain</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Dari Rekening</Label>
                <Select value={disburseBankId} onValueChange={setDisburseBankId}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="-- Pilih rekening --" /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name} ({formatRupiah(b.balance)})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {disburseType === 'sourcing' && (
                <>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Penanggung Jawab Sourcing</Label>
                    <Select value={disburseSourcingId} onValueChange={setDisburseSourcingId}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="-- Pilih sourcing --" /></SelectTrigger>
                      <SelectContent>
                        {users.filter(u => u.role === 'sourcing').map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Operasional Tambahan (opsional)</Label>
                    <Input value={disburseSpareRaw} onChange={(e) => setDisburseSpareRaw(formatNumber(e.target.value))} placeholder="Rp 0" className="h-11 rounded-xl" />
                  </div>
                </>
              )}

              {disburseType === 'vendor' && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Vendor</Label>
                  <Select value={disburseVendorId} onValueChange={setDisburseVendorId}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="-- Pilih vendor --" /></SelectTrigger>
                    <SelectContent>
                      {vendors.map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.companyName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nominal (≤ {formatRupiah(activePR.amount)})</Label>
                <Input value={disburseAmountRaw} onChange={(e) => setDisburseAmountRaw(formatNumber(e.target.value))} className="h-11 rounded-xl" />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Keterangan {disburseType === 'other' ? '(wajib)' : '(opsional)'}
                </Label>
                <Textarea value={disburseNote} onChange={(e) => setDisburseNote(e.target.value)} className="min-h-[60px] rounded-xl text-xs" />
              </div>

              <Button onClick={handleDisburse} disabled={isDisbursing} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold uppercase tracking-wider h-11 rounded-xl">
                {isDisbursing ? 'Memproses...' : 'Catat & Transfer'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
```

- [ ] **Step 3: Verify the Dialog component path**

Run: `ls src/components/ui/dialog.tsx`
Expected: file exists. If not, run `grep -rl "DialogContent" src/components/ui` to find the correct module and adjust the import. If the repo has no Dialog, reuse the modal component already used elsewhere in this file (search the file for an existing overlay/sheet usage) and adapt the JSX wrapper accordingly.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "purchase-requests"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/purchase-requests/page.tsx
git commit -m "feat(pr): add step-4 disbursement UI, transaksi modal, status badge"
```

---

## Task 7: Remove "Advance" nav item

**Files:**
- Modify: `src/lib/navigation.tsx:39`

- [ ] **Step 1: Remove the Advance entry**

Delete this line (line 39):
```ts
      { key: 'finance_pencairan', title: 'Advance', href: '/finance/approvals?tab=pencairan' },
```
Leave the other Finance Hub children (Sourcing Settlement, Dashboard Settlement, Audit Ops, etc.) intact. Do NOT delete `/finance/approvals/page.tsx` — the route stays reachable so any in-flight advances can still be processed via Sourcing Settlement; only the nav shortcut is removed.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "navigation"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/navigation.tsx
git commit -m "feat(nav): remove Advance shortcut (disbursement moved to PR step 4)"
```

---

## Task 8: Build verify + manual/DB verification

**Files:** none.

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | tail -20`
Expected: no new errors in touched files (`accounting.ts`, `purchase-requests/page.tsx`, `navigation.tsx`, `types/index.ts`).

- [ ] **Step 2: Manual smoke (after deploy/preview)**

1. Approve a Sourcing PR that has a linked shopping list → Step 4 shows "Transaksi".
2. Click → modal defaults to "Kasih Dana Sourcing". Pick bank + sourcing person, submit.
3. PR shows "Sudah Dicairkan"; linked purchase appears in Sourcing Settlement.
4. Approve a non-sourcing PR → modal defaults to "Pengeluaran Lain"; submit with keterangan.

- [ ] **Step 3: DB verification**

Run SQL (replace `<prId>`):
```sql
SELECT id, disbursed_at, disbursement_type, disbursed_by FROM purchase_requests WHERE id='<prId>';
SELECT je.description, jl.debit_amount, jl.credit_amount, c.account_code
FROM journal_entries je
JOIN journal_lines jl ON jl.journal_entry_id = je.id
JOIN coas c ON c.id = jl.account_id
WHERE je.reference_id = '<prId>';
SELECT type, amount, category FROM cash_transactions WHERE reference_id='<prId>';
```
Expected: PR has `disbursed_*` set; journal lines balance (Σdebit = Σcredit); cash transaction Out recorded.

- [ ] **Step 4: Final — open PR for review/merge**

```bash
git push -u origin claude/pr-step4-disbursement
gh pr create --base main --title "feat: PR step-4 disbursement (replace Advance tab)" --body "Implements docs/superpowers/specs/2026-06-01-pr-step4-disbursement-design.md"
```

---

## Self-Review Notes

- **Spec coverage:** nav removal (Task 7), step-4 button + amount lock + badge (Task 6), modal types/fields/validation (Task 5/6), 3 postings + category→COA + double-post guard via `disbursedAt` (Task 3/5), new fields + prod columns (Task 1/2), sourcing→purchase linkage + edge cases (Task 5). All covered.
- **Double-post guard:** `handleDisburse` checks `activePR.disbursedAt` and blocks; UI hides the button once disbursed.
- **Type consistency:** `disbursementType` union `'sourcing'|'vendor'|'other'` identical in type, state, handler, and `updatePurchaseRequest` call.
- **No test runner:** verification is `tsc` + DB/manual, by design for this repo.

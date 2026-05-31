# Disbursement Destination & Contacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add explicit money destination to the PR step-4 modal — destination bank for sourcing (with reconciliation following it), and a contact + expense-type for general payments. Collapse the 3 transaction types into 2 (`sourcing`, `expense`).

**Architecture:** Reuse `vendors` as universal contacts (+`kind`). Extend `recordBudgetTransfer` with an optional destination bank, make `recordReconciliationSettlement` honor it (fallback to old wallet), and replace the two category helpers with one explicit-COA expense helper. UI: rework the disbursement modal + handler.

**Tech Stack:** Next.js + React + Zustand + Supabase. Verification gate: `npx tsc --noEmit -p tsconfig.json` (no test runner). Pre-existing tsc errors in `accounting.ts` (lines 337-338, ~1125-1159 `'QC'`) and jspdf are NOT ours — ignore.

**Spec:** `docs/superpowers/specs/2026-06-01-disbursement-destination-design.md`

---

## Task 1: Prod DB columns

**Files:** none (Supabase `apply_migration`, project_id `ckkohudfuisgzlrjipev`).

- [ ] **Step 1:** Apply migration `add_contact_kind_and_dest_bank`:
```sql
ALTER TABLE vendors   ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS budget_dest_bank_account_id text;
```
- [ ] **Step 2:** Verify:
```sql
SELECT table_name, column_name FROM information_schema.columns
WHERE (table_name='vendors' AND column_name='kind')
   OR (table_name='purchases' AND column_name='budget_dest_bank_account_id');
```
Expected: 2 rows.

---

## Task 2: Types

**Files:** Modify `src/types/index.ts`

- [ ] **Step 1:** In `interface Vendor`, add after `isTempo?: boolean;`:
```ts
  kind?: 'vendor' | 'toko' | 'perorangan';
```
- [ ] **Step 2:** In `interface Purchase`, add after `budgetBankAccountId?: string;`:
```ts
  budgetDestBankAccountId?: string; // Explicit advance destination bank (step-4 disbursement)
```
- [ ] **Step 3:** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "types/index"` → no output.
- [ ] **Step 4:** Commit: `git add src/types/index.ts && git commit -m "feat(types): add Vendor.kind and Purchase.budgetDestBankAccountId"`

---

## Task 3: Accounting — destination-aware transfer, reconciliation, expense helper

**Files:** Modify `src/lib/accounting.ts`

- [ ] **Step 1: Extend `recordBudgetTransfer`** (currently at ~line 730). Replace the whole function with:
```ts
export const recordBudgetTransfer = async (purchaseId: string, amount: number, bankAccountId: string, recipientName: string, destBankAccountId?: string) => {
  const store = useAppStore.getState();
  const bank = store.bankAccounts.find(b => b.id === bankAccountId);
  const sourceBankCode = bank?.accountCode || '1-1200';

  let targetBankId: string;
  let targetAccountCode: string;
  let targetName: string;
  if (destBankAccountId) {
    const destBank = store.bankAccounts.find(b => b.id === destBankAccountId);
    targetBankId = destBankAccountId;
    targetAccountCode = destBank?.accountCode || '1-1500';
    targetName = destBank?.name || recipientName;
  } else {
    const purchaser = store.users.find(u => u.name === recipientName || u.id === recipientName);
    const wallet = getAdvanceWalletByUserId(purchaser?.id);
    targetBankId = wallet?.bankAccountId || 'bank-advance-sourcing';
    targetAccountCode = wallet?.accountCode || '1-1500';
    targetName = wallet?.label || 'Kas Sourcing';
  }

  if (bankAccountId === targetBankId) {
    throw new Error(`Source bank tidak boleh sama dengan rekening tujuan (${bankAccountId}).`);
  }

  const success = await createAccountingEntry(
    `Pencairan Budget Sourcing: ${recipientName} - Ref: ${purchaseId.slice(0, 8)}`,
    'Transfer',
    purchaseId,
    [{ accountCode: targetAccountCode, amount }],
    [{ accountCode: sourceBankCode, amount }]
  );

  if (success && amount > 0) {
    const now = new Date().toISOString();
    await store.addCashTransaction({
      id: uuidv4(), date: now, amount, type: 'Out',
      category: 'Transfer Uang Muka Sourcing',
      description: `Pencairan Dana ke ${recipientName} - Ref: ${purchaseId.slice(0, 8)}`,
      bankAccountId, counterpartName: targetName,
    });
    await store.addCashTransaction({
      id: uuidv4(), date: now, amount, type: 'In',
      category: 'Transfer Uang Muka Sourcing',
      description: `Penerimaan Dana - Ref: ${purchaseId.slice(0, 8)}`,
      bankAccountId: targetBankId, counterpartName: bank?.name || 'Kas Pusat',
    });
  }
  return success;
};
```

- [ ] **Step 2: Make reconciliation honor the destination bank.** In `recordReconciliationSettlement` (~line 791-794), replace:
```ts
  const purchase = store.purchases.find(p => p.id === purchaseId);
  const wallet = getAdvanceWalletByUserId(purchase?.purchaserId);
  const targetBankId = wallet?.bankAccountId || 'bank-advance-sourcing';
  const advanceAccountCode = wallet?.accountCode || '1-1500';
```
with:
```ts
  const purchase = store.purchases.find(p => p.id === purchaseId);
  let targetBankId: string;
  let advanceAccountCode: string;
  if (purchase?.budgetDestBankAccountId) {
    const destBank = store.bankAccounts.find(b => b.id === purchase.budgetDestBankAccountId);
    targetBankId = purchase.budgetDestBankAccountId;
    advanceAccountCode = destBank?.accountCode || '1-1500';
  } else {
    const wallet = getAdvanceWalletByUserId(purchase?.purchaserId);
    targetBankId = wallet?.bankAccountId || 'bank-advance-sourcing';
    advanceAccountCode = wallet?.accountCode || '1-1500';
  }
```
(Leave the rest of the function unchanged — `targetBankId` and `advanceAccountCode` keep the same names so downstream usage is intact.)

- [ ] **Step 3: Replace the two old PR helpers with one explicit-COA helper.** Delete `resolvePRExpenseAccountCode`, `recordDirectVendorPayment`, and `recordPRExpense` (added in the prior feature, only used by the PR page). Add:
```ts
/** Pay a contact/vendor from an approved PR with an explicit expense COA. Final. */
export const recordPRExpensePayment = async (
  prId: string,
  amount: number,
  sourceBankAccountId: string,
  expenseAccountCode: string,
  payeeName: string,
  description: string,
  date?: string
) => {
  const store = useAppStore.getState();
  const bank = store.bankAccounts.find(b => b.id === sourceBankAccountId);
  if (!bank) { console.error('[Accounting] PR expense payment: source bank not found.'); return false; }

  const desc = description || `Pengeluaran ke ${payeeName} - PR ${prId.slice(0, 8)}`;
  const success = await createAccountingEntry(
    desc, 'Expense', prId,
    [{ accountCode: expenseAccountCode, amount }],
    [{ accountCode: bank.accountCode || '1-1200', amount }],
    date
  );

  if (success && amount > 0) {
    await store.addCashTransaction({
      id: uuidv4(), date: date || new Date().toISOString(), amount, type: 'Out',
      category: 'Pengeluaran / Pembayaran', description: desc,
      bankAccountId: sourceBankAccountId, counterpartName: payeeName,
      referenceType: 'Expense', referenceId: prId,
    });
  }
  return success;
};
```

- [ ] **Step 4:** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "accounting|purchase-requests"` — expect ONLY pre-existing accounting errors (337-338, 1125-1159). `purchase-requests` WILL error until Task 4 (it still imports the deleted helpers); that is expected — do NOT fix it here.
- [ ] **Step 5:** Commit: `git add src/lib/accounting.ts && git commit -m "feat(accounting): destination-aware sourcing transfer + explicit-COA expense helper"`

---

## Task 4: PR page — modal & handler rework

**Files:** Modify `src/app/admin/purchase-requests/page.tsx`

- [ ] **Step 1: Fix imports.** Replace line 20:
```ts
import { recordBudgetTransfer, recordDirectVendorPayment, recordPRExpense } from "@/lib/accounting"
```
with:
```ts
import { recordBudgetTransfer, recordPRExpensePayment } from "@/lib/accounting"
```

- [ ] **Step 2: Add expense-type constant** after `CATEGORY_OPTIONS` (~line 31):
```ts
const PR_EXPENSE_TYPES: { label: string; code: string }[] = [
  { label: 'Sewa Gedung/Workshop', code: '6-1100' },
  { label: 'Listrik, Air & Internet', code: '6-1200' },
  { label: 'Marketing & Iklan', code: '6-1300' },
  { label: 'Transportasi & BBM / Bengkel', code: '6-1400' },
  { label: 'ATK & Kantor', code: '6-1500' },
  { label: 'Admin Platform (Shopee/Tokopedia)', code: '6-1600' },
  { label: 'Ongkos Kirim', code: '6-1700' },
  { label: 'Gaji & Tunjangan', code: '6-1000' },
  { label: 'Operasional Lainnya', code: '6-9000' },
]
```

- [ ] **Step 3: Add `addVendor` selector** after the `updatePurchase` selector (~line 47):
```ts
  const addVendor = useAppStore(state => state.addVendor)
```

- [ ] **Step 4: Replace the disbursement state block** (currently ~lines 165-172, from `const [disburseType...` through `const [disburseNote...`) with:
```ts
  const [disburseType, setDisburseType] = useState<'sourcing' | 'expense'>('expense')
  const [disburseBankId, setDisburseBankId] = useState("")
  const [disburseDestBankId, setDisburseDestBankId] = useState("")
  const [disburseSourcingId, setDisburseSourcingId] = useState("")
  const [disburseContactId, setDisburseContactId] = useState("")
  const [disburseExpenseCode, setDisburseExpenseCode] = useState("6-9000")
  const [disburseAmountRaw, setDisburseAmountRaw] = useState("")
  const [disburseNote, setDisburseNote] = useState("")
  const [creatingContact, setCreatingContact] = useState(false)
  const [newContactName, setNewContactName] = useState("")
  const [newContactKind, setNewContactKind] = useState<'vendor' | 'toko' | 'perorangan'>('vendor')
```
(Removes `disburseVendorId` and `disburseSpareRaw`. Keep the existing `const [isDisbursing, setIsDisbursing] = useState(false)` line that follows.)

- [ ] **Step 5: Replace `openDisburse`** (~lines 204-211) with:
```ts
  const openDisburse = (pr: PurchaseRequest) => {
    setDisburseType(pr.category === 'Sourcing' ? 'sourcing' : 'expense')
    setDisburseBankId("")
    setDisburseDestBankId("")
    setDisburseSourcingId("")
    setDisburseContactId("")
    setDisburseExpenseCode("6-9000")
    setDisburseAmountRaw(formatNumber(String(pr.amount)))
    setDisburseNote("")
    setCreatingContact(false)
    setNewContactName("")
    setNewContactKind('vendor')
    setDisburseOpen(true)
  }

  const handleCreateContact = async () => {
    if (!newContactName.trim()) { toast.error('Isi nama kontak.'); return }
    const id = uuidv4()
    await addVendor({
      id, companyName: newContactName.trim(), picName: '', email: '', phone: '',
      address: '', createdAt: new Date().toISOString(), kind: newContactKind,
    })
    setDisburseContactId(id)
    setCreatingContact(false)
    setNewContactName("")
    toast.success('Kontak dibuat.')
  }
```

- [ ] **Step 6: Replace the whole `handleDisburse` function** (~lines 321-397) with:
```ts
  const handleDisburse = async () => {
    if (!activePR) return
    if (activePR.status !== 'Approved') { toast.error('PR belum di-approve CFO.'); return }
    if (activePR.disbursedAt) { toast.error('PR ini sudah dicairkan.'); return }

    const amount = parseNumber(disburseAmountRaw)
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
        if (linked.length === 0) { toast.error('Belum ada shopping list untuk PR ini. Buat shopping list dulu.', { id: loadingId }); setIsDisbursing(false); return }
        if (linked.length > 1) { toast.error('PR ini punya >1 shopping list. Cairkan lewat masing-masing dokumen.', { id: loadingId }); setIsDisbursing(false); return }
        if (!disburseSourcingId) { toast.error('Pilih penanggung jawab sourcing.', { id: loadingId }); setIsDisbursing(false); return }
        if (!disburseDestBankId) { toast.error('Pilih rekening tujuan.', { id: loadingId }); setIsDisbursing(false); return }
        if (disburseDestBankId === disburseBankId) { toast.error('Rekening tujuan tidak boleh sama dengan sumber.', { id: loadingId }); setIsDisbursing(false); return }
        const purchase = linked[0]
        const user = users.find(u => u.id === disburseSourcingId)
        ok = await recordBudgetTransfer(purchase.id, amount, disburseBankId, user?.name || 'Sourcing', disburseDestBankId)
        if (ok) {
          await updatePurchase(purchase.id, {
            status: 'Belanja',
            purchaserId: disburseSourcingId,
            budgetAmount: amount,
            budgetTransferDate: now,
            budgetBankAccountId: disburseBankId,
            budgetDestBankAccountId: disburseDestBankId,
            budgetTransferedBy: currentUser?.id,
          })
        }
      } else {
        if (!disburseContactId) { toast.error('Pilih atau buat kontak tujuan.', { id: loadingId }); setIsDisbursing(false); return }
        const contact = vendors.find(v => v.id === disburseContactId)
        ok = await recordPRExpensePayment(
          activePR.id, amount, disburseBankId, disburseExpenseCode,
          contact?.companyName || 'Kontak', disburseNote, now
        )
      }

      if (!ok) { toast.error('Gagal mencatat transaksi ke ledger.', { id: loadingId }); return }

      await updatePurchaseRequest(activePR.id, {
        disbursedAt: now,
        disbursementType: disburseType === 'sourcing' ? 'sourcing' : 'other',
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

- [ ] **Step 7: Rework the modal body.** Replace the inner content of the Dialog (currently lines ~1062-1129, i.e. the Tipe Transaksi `Select` through the Keterangan block — everything between `<div className="space-y-3">` and the final `<Button onClick={handleDisburse}...>`) with:
```tsx
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tipe Transaksi</Label>
                <Select value={disburseType} onValueChange={(v) => setDisburseType((v as 'sourcing' | 'expense') ?? 'expense')}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sourcing">Sourcing — Belanja PO (pindah kas)</SelectItem>
                    <SelectItem value="expense">Pengeluaran / Bayar</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Dari Rekening</Label>
                <Select value={disburseBankId} onValueChange={(v) => setDisburseBankId(v ?? '')}>
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
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ke Rekening (Tujuan)</Label>
                    <Select value={disburseDestBankId} onValueChange={(v) => setDisburseDestBankId(v ?? '')}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="-- Pilih rekening tujuan --" /></SelectTrigger>
                      <SelectContent>
                        {bankAccounts.filter(b => b.id !== disburseBankId).map(b => (
                          <SelectItem key={b.id} value={b.id}>{b.name} ({formatRupiah(b.balance)})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Penanggung Jawab Sourcing</Label>
                    <Select value={disburseSourcingId} onValueChange={(v) => setDisburseSourcingId(v ?? '')}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="-- Pilih sourcing --" /></SelectTrigger>
                      <SelectContent>
                        {users.filter(u => u.role === 'sourcing').map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {disburseType === 'expense' && (
                <>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ke Kontak</Label>
                      <button type="button" onClick={() => setCreatingContact(c => !c)} className="text-[9px] font-black uppercase tracking-widest text-emerald-600">
                        {creatingContact ? 'Batal' : '+ Kontak Baru'}
                      </button>
                    </div>
                    {creatingContact ? (
                      <div className="space-y-2 rounded-xl border border-slate-200 p-2">
                        <Input value={newContactName} onChange={(e) => setNewContactName(e.target.value)} placeholder="Nama kontak / toko / vendor" className="h-10 rounded-lg" />
                        <Select value={newContactKind} onValueChange={(v) => setNewContactKind((v as 'vendor' | 'toko' | 'perorangan') ?? 'vendor')}>
                          <SelectTrigger className="h-10 rounded-lg"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vendor">Vendor</SelectItem>
                            <SelectItem value="toko">Toko</SelectItem>
                            <SelectItem value="perorangan">Perorangan</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button type="button" onClick={handleCreateContact} className="w-full h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase">Simpan Kontak</Button>
                      </div>
                    ) : (
                      <Select value={disburseContactId} onValueChange={(v) => setDisburseContactId(v ?? '')}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="-- Pilih kontak --" /></SelectTrigger>
                        <SelectContent>
                          {vendors.map(v => (
                            <SelectItem key={v.id} value={v.id}>{v.companyName}{v.kind ? ` (${v.kind})` : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Jenis Pengeluaran</Label>
                    <Select value={disburseExpenseCode} onValueChange={(v) => setDisburseExpenseCode(v ?? '6-9000')}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PR_EXPENSE_TYPES.map(t => (
                          <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nominal (≤ {formatRupiah(activePR.amount)})</Label>
                <Input value={disburseAmountRaw} onChange={(e) => setDisburseAmountRaw(formatNumber(e.target.value))} className="h-11 rounded-xl" />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Keterangan (opsional)</Label>
                <Textarea value={disburseNote} onChange={(e) => setDisburseNote(e.target.value)} className="min-h-[60px] rounded-xl text-xs" />
              </div>
```
(Keep the existing `<Button onClick={handleDisburse}...>` and surrounding `</div>`/`)`/`</Dialog>` intact.)

- [ ] **Step 8:** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "purchase-requests"` → no output.
- [ ] **Step 9:** Commit: `git add src/app/admin/purchase-requests/page.tsx && git commit -m "feat(pr): disbursement destination bank + contact picker + expense type"`

---

## Task 5: Verify + PR

- [ ] **Step 1:** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "accounting|purchase-requests|types/index"` — expect ONLY the pre-existing accounting errors (337-338, 1125-1159). No errors in purchase-requests or types/index.
- [ ] **Step 2: DB smoke after deploy.** Disburse a Sourcing PR with dest bank → check `purchases.budget_dest_bank_account_id` set + journal balanced (debit dest bank COA, credit source). Disburse an expense PR to a (new) contact → check vendor created with `kind`, journal debits the chosen expense COA, cash Out recorded.
- [ ] **Step 3:** Push + PR:
```bash
git push -u origin claude/disbursement-destination
gh pr create --base main --title "feat: disbursement destination bank + contacts + expense types" --body "Implements docs/superpowers/specs/2026-06-01-disbursement-destination-design.md"
```

---

## Self-Review Notes
- **Spec coverage:** dest bank for sourcing (Task 3/4), drop operasional tambahan (Task 4 state/modal), contact picker + create (Task 4), expense-type→COA (Task 4 constant + Task 3 helper), reconciliation honors dest bank w/ fallback (Task 3), vendors.kind + purchases.budget_dest_bank_account_id (Task 1/2). Covered.
- **Backward compat:** `recordBudgetTransfer` destBank param optional → old advance-tab caller in `finance/approvals/page.tsx` (4 args) keeps working (wallet fallback). `recordReconciliationSettlement` falls back to wallet when `budgetDestBankAccountId` absent → old purchases unaffected.
- **disbursementType DB:** expense maps to existing `'other'` value — no enum/column change.
- **Removed helpers** `recordDirectVendorPayment`/`recordPRExpense`/`resolvePRExpenseAccountCode` were only used by the PR page (now updated) → safe to delete.
- **Type consistency:** `disburseType` union `'sourcing'|'expense'` consistent across state/openDisburse/handleDisburse/modal.

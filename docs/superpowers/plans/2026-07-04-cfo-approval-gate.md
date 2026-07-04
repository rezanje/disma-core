# CFO Approval Gate (Account-Based) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blanket "every disbursement needs CFO approval" rule with a per-account flag — transfers OUT of BRI/Mandiri need CFO approval, transfers out of every other account (BCA, Bank Jago, Cash, pockets) are admin-finance-only.

**Architecture:** Add one nullable boolean column to `bank_accounts` (`cfo_approval_required`) and one pure helper function (`bankRequiresCfoApproval`) in `accounting.ts` that both `finance/disbursements` and `admin/purchase-requests` call at their respective "which account is this coming from" decision points. No new tables, no new statuses — existing `Draft/Pending_CFO/Approved/Transferred` (Disbursement) and `Pending_Finance/Pending_CFO/Approved/Rejected` (Purchase Request) state machines are reused, just gated conditionally instead of unconditionally.

**Tech Stack:** Next.js 16 App Router, Zustand store (`src/lib/store.ts`), Supabase Postgres, no unit-test harness in this repo — verification is `npx tsc --noEmit` + targeted `grep` + manual browser walkthrough via the preview tools, matching how every other feature in this codebase has been verified this session.

**Reference spec:** `docs/superpowers/specs/2026-07-04-cfo-approval-gate-design.md`

---

### Task 1: Data model — `cfoApprovalRequired` field + migration + helper

**Files:**
- Modify: `src/types/index.ts` (`BankAccount` interface, ~line 423-431)
- Create: `supabase/migrations/20260705000001_bank_cfo_approval.sql`
- Modify: `src/lib/simulation.ts` (`DEFAULT_BANK_ACCOUNTS`, ~line 8-15)
- Modify: `src/lib/accounting.ts` (new helper, add near other bank-lookup helpers)

- [ ] **Step 1: Add the field to the type**

In `src/types/index.ts`, find:

```ts
export interface BankAccount {
  id: string;
  name: string; // e.g., 'BCA - 1234567890', 'Petty Cash'
  accountNumber?: string;
  accountCode?: string; // Linked COA
  balance: number;
  purpose?: BankAccountPurpose; // sourcing/courier pool designation (replaces Advance wallets)
  ownerUserId?: string; // set only for purpose='sourcing_pocket': the sourcer who owns this pocket
}
```

Replace with:

```ts
export interface BankAccount {
  id: string;
  name: string; // e.g., 'BCA - 1234567890', 'Petty Cash'
  accountNumber?: string;
  accountCode?: string; // Linked COA
  balance: number;
  purpose?: BankAccountPurpose; // sourcing/courier pool designation (replaces Advance wallets)
  ownerUserId?: string; // set only for purpose='sourcing_pocket': the sourcer who owns this pocket
  cfoApprovalRequired?: boolean; // true = transfers OUT of this account need CFO approval (BRI, Mandiri)
}
```

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260705000001_bank_cfo_approval.sql`:

```sql
-- Per-account CFO approval gate. true = transfers OUT of this account need
-- CFO approval (the strategic accounts: BRI revenue intake, Mandiri savings).
-- Everything else (BCA operational, Bank Jago, cash, pockets) defaults false
-- and is admin-finance-only.
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS cfo_approval_required boolean NOT NULL DEFAULT false;
```

- [ ] **Step 3: Apply the migration to prod via Supabase MCP**

Use the `mcp__807b22d2-3761-4301-bdb2-1317fb5086ac__apply_migration` tool (project `ckkohudfuisgzlrjipev`) with the SQL from Step 2. This repo has no separate dev database — `npm run dev` reads the same prod Supabase project, so the migration must be applied there directly (same pattern as `20260704000001_sourcing_pocket.sql` earlier this session).

- [ ] **Step 4: Tag BRI and Mandiri in prod data**

Run via the same Supabase MCP `execute_sql` tool to find the real account ids first:

```sql
select id, name, account_code from bank_accounts where name ilike '%BRI%' or name ilike '%Mandiri%';
```

Then tag both found rows:

```sql
update bank_accounts set cfo_approval_required = true where name ilike '%BRI%' or name ilike '%Mandiri%';
```

Verify with a `select id, name, cfo_approval_required from bank_accounts order by name;` — confirm exactly the BRI and Mandiri rows show `true` and nothing else does.

- [ ] **Step 5: Update the local simulation seed**

In `src/lib/simulation.ts`, find:

```ts
const DEFAULT_BANK_ACCOUNTS: BankAccount[] = [
  { id: 'bank-1', name: 'BCA (Utama)', accountNumber: '8001234455', accountCode: '1-1200', balance: 0 },
  { id: 'bank-2', name: 'Mandiri (Ops)', accountNumber: '123000998877', accountCode: '1-1300', balance: 0 },
  { id: 'bank-3', name: 'BRI (Simpanan)', accountNumber: '001122334455', accountCode: '1-1000', balance: 0 },
```

Replace with:

```ts
const DEFAULT_BANK_ACCOUNTS: BankAccount[] = [
  { id: 'bank-1', name: 'BCA (Utama)', accountNumber: '8001234455', accountCode: '1-1200', balance: 0 },
  { id: 'bank-2', name: 'Mandiri (Ops)', accountNumber: '123000998877', accountCode: '1-1300', balance: 0, cfoApprovalRequired: true },
  { id: 'bank-3', name: 'BRI (Simpanan)', accountNumber: '001122334455', accountCode: '1-1000', balance: 0, cfoApprovalRequired: true },
```

This only affects what `RESET + SIMULASI` seeds locally — the prod tagging from Step 4 is the one that matters for real data.

- [ ] **Step 6: Add the shared gate helper**

In `src/lib/accounting.ts`, add near the top-level exported helpers (after the imports, before the first `export const record...` function):

```ts
// Single source of truth for the CFO approval gate: transfers OUT of a
// cfoApprovalRequired=true account (BRI, Mandiri) need CFO sign-off.
// Everything else is admin-finance-only. Checked by both the Disbursement
// page and the Purchase Request disburse flow — never duplicate this logic.
export const bankRequiresCfoApproval = (bankAccountId: string): boolean => {
  const bank = useAppStore.getState().bankAccounts.find(b => b.id === bankAccountId);
  return bank?.cfoApprovalRequired === true;
};
```

- [ ] **Step 7: Verify with tsc**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as the pre-existing baseline (5) — no new errors from this task.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/lib/simulation.ts src/lib/accounting.ts supabase/migrations/20260705000001_bank_cfo_approval.sql
git commit -m "feat(cfo-approval): add per-account CFO approval gate field + helper"
```

---

### Task 2: Cash & Bank UI — tag accounts as CFO-gated

**Files:**
- Modify: `src/app/finance/cash-bank/page.tsx`

- [ ] **Step 1: Add the field to `bankForm` state**

Find (~line 64):

```ts
const [bankForm, setBankForm] = useState<{ name: string; number: string; balance: number; accountCode: string; purpose: BankAccountPurpose; ownerUserId: string }>({ name: '', number: '', balance: 0, accountCode: '1-1000', purpose: 'umum', ownerUserId: '' })
```

Replace with:

```ts
const [bankForm, setBankForm] = useState<{ name: string; number: string; balance: number; accountCode: string; purpose: BankAccountPurpose; ownerUserId: string; cfoApprovalRequired: boolean }>({ name: '', number: '', balance: 0, accountCode: '1-1000', purpose: 'umum', ownerUserId: '', cfoApprovalRequired: false })
```

- [ ] **Step 2: Pass it through on create**

Find in `handleCreateBank` (~line 130-138):

```ts
      await addBankAccount({
        id: bankId,
        name: bankForm.name,
        accountNumber: bankForm.number,
        accountCode: bankForm.accountCode,
        balance: bankForm.balance,
        purpose: bankForm.purpose,
        ownerUserId: bankForm.purpose === 'sourcing_pocket' ? bankForm.ownerUserId : undefined,
      })
```

Replace with:

```ts
      await addBankAccount({
        id: bankId,
        name: bankForm.name,
        accountNumber: bankForm.number,
        accountCode: bankForm.accountCode,
        balance: bankForm.balance,
        purpose: bankForm.purpose,
        ownerUserId: bankForm.purpose === 'sourcing_pocket' ? bankForm.ownerUserId : undefined,
        cfoApprovalRequired: bankForm.cfoApprovalRequired,
      })
```

- [ ] **Step 3: Reset the field after create**

Find (~line 169):

```ts
      setBankForm({ name: '', number: '', balance: 0, accountCode: '1-1000', purpose: 'umum', ownerUserId: '' })
```

Replace with:

```ts
      setBankForm({ name: '', number: '', balance: 0, accountCode: '1-1000', purpose: 'umum', ownerUserId: '', cfoApprovalRequired: false })
```

- [ ] **Step 4: Pass it through on update**

Find in `handleUpdateBank` (~line 246-253):

```ts
      await updateBankAccount(editingBank.id, {
        name: editingBank.name,
        accountNumber: editingBank.accountNumber,
        accountCode: editingBank.accountCode,
        purpose: editingBank.purpose || 'umum',
        ownerUserId: editingBank.purpose === 'sourcing_pocket' ? editingBank.ownerUserId : undefined,
        // Balance is NOT updated here because addCashTransaction already updated it
      })
```

Replace with:

```ts
      await updateBankAccount(editingBank.id, {
        name: editingBank.name,
        accountNumber: editingBank.accountNumber,
        accountCode: editingBank.accountCode,
        purpose: editingBank.purpose || 'umum',
        ownerUserId: editingBank.purpose === 'sourcing_pocket' ? editingBank.ownerUserId : undefined,
        cfoApprovalRequired: !!editingBank.cfoApprovalRequired,
        // Balance is NOT updated here because addCashTransaction already updated it
      })
```

- [ ] **Step 5: Add the checkbox to the create dialog**

Find (~line 568-581, right after the `sourcing_pocket` owner picker block and before the submit button):

```tsx
                    {bankForm.purpose === 'sourcing_pocket' && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 text-center block">Pemilik Kantong (Sourcing)</label>
                        <Select value={bankForm.ownerUserId} onValueChange={(val) => setBankForm({ ...bankForm, ownerUserId: val || '' })}>
                          <SelectTrigger className="h-12 rounded-xl text-center font-bold"><SelectValue placeholder="Pilih sourcing..." /></SelectTrigger>
                          <SelectContent>
                            {users.filter(u => u.role === 'sourcing').map(u => (
                              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <Button onClick={handleCreateBank} disabled={isSubmitting} className="w-full h-14 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl mt-4">
```

Replace with (adds the checkbox block right before the submit button):

```tsx
                    {bankForm.purpose === 'sourcing_pocket' && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 text-center block">Pemilik Kantong (Sourcing)</label>
                        <Select value={bankForm.ownerUserId} onValueChange={(val) => setBankForm({ ...bankForm, ownerUserId: val || '' })}>
                          <SelectTrigger className="h-12 rounded-xl text-center font-bold"><SelectValue placeholder="Pilih sourcing..." /></SelectTrigger>
                          <SelectContent>
                            {users.filter(u => u.role === 'sourcing').map(u => (
                              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-200">
                      <Checkbox
                        id="cfo-gate-create"
                        checked={bankForm.cfoApprovalRequired}
                        onCheckedChange={(checked) => setBankForm({ ...bankForm, cfoApprovalRequired: checked === true })}
                      />
                      <label htmlFor="cfo-gate-create" className="text-[10px] font-bold text-slate-600 leading-tight">
                        Butuh Approval CFO untuk transfer KELUAR dari rekening ini (BRI, Mandiri)
                      </label>
                    </div>
                    <Button onClick={handleCreateBank} disabled={isSubmitting} className="w-full h-14 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl mt-4">
```

- [ ] **Step 6: Add the checkbox to the edit dialog**

Find (~line 912-925, the matching `sourcing_pocket` block in the edit dialog):

```tsx
            {editingBank?.purpose === 'sourcing_pocket' && (
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 text-center block">Pemilik Kantong (Sourcing)</label>
                <Select value={editingBank?.ownerUserId || ''} onValueChange={(val) => setEditingBank({ ...editingBank, ownerUserId: val || '' })}>
                  <SelectTrigger className="h-12 rounded-xl text-center font-bold"><SelectValue placeholder="Pilih sourcing..." /></SelectTrigger>
                  <SelectContent>
                    {users.filter(u => u.role === 'sourcing').map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
```

Replace with:

```tsx
            {editingBank?.purpose === 'sourcing_pocket' && (
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 text-center block">Pemilik Kantong (Sourcing)</label>
                <Select value={editingBank?.ownerUserId || ''} onValueChange={(val) => setEditingBank({ ...editingBank, ownerUserId: val || '' })}>
                  <SelectTrigger className="h-12 rounded-xl text-center font-bold"><SelectValue placeholder="Pilih sourcing..." /></SelectTrigger>
                  <SelectContent>
                    {users.filter(u => u.role === 'sourcing').map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-200">
              <Checkbox
                id="cfo-gate-edit"
                checked={!!editingBank?.cfoApprovalRequired}
                onCheckedChange={(checked) => setEditingBank({ ...editingBank, cfoApprovalRequired: checked === true })}
              />
              <label htmlFor="cfo-gate-edit" className="text-[10px] font-bold text-slate-600 leading-tight">
                Butuh Approval CFO untuk transfer KELUAR dari rekening ini (BRI, Mandiri)
              </label>
            </div>
```

- [ ] **Step 7: Badge the account card when tagged**

Find (~line 837-841, inside the bank card render):

```tsx
                  <div className="mt-2">
                     <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest truncate">{b.accountNumber || 'PHYSICAL CASH'}</p>
                     <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5 truncate">{b.name}</p>
                     <p className="text-lg font-black mt-0.5 tracking-tighter">{formatRupiah(b.balance)}</p>
                  </div>
```

Replace with:

```tsx
                  <div className="mt-2">
                     <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest truncate">{b.accountNumber || 'PHYSICAL CASH'}</p>
                     <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5 truncate">{b.name}</p>
                     <p className="text-lg font-black mt-0.5 tracking-tighter">{formatRupiah(b.balance)}</p>
                     {b.cfoApprovalRequired && (
                        <Badge variant="outline" className="mt-1 text-[8px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border-amber-200">
                           Butuh Approval CFO
                        </Badge>
                     )}
                  </div>
```

- [ ] **Step 8: Verify with tsc**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same as baseline (5).

- [ ] **Step 9: Browser-verify**

Use the preview tools: open Cash & Bank, edit the BRI or Mandiri account, tick the checkbox, save, confirm the "Butuh Approval CFO" badge appears on the card. Untick, save, confirm badge disappears.

- [ ] **Step 10: Commit**

```bash
git add src/app/finance/cash-bank/page.tsx
git commit -m "feat(cfo-approval): tag bank accounts as CFO-gated in Cash & Bank UI"
```

---

### Task 3: Disbursements page — skip CFO steps for non-gated accounts

**Files:**
- Modify: `src/app/finance/disbursements/page.tsx`

- [ ] **Step 1: Import the helper**

Find (~line 19):

```ts
import { recordBudgetTransfer } from "@/lib/accounting"
```

Replace with:

```ts
import { recordBudgetTransfer, bankRequiresCfoApproval } from "@/lib/accounting"
```

- [ ] **Step 2: Re-check the gate inside `handleSubmitToCfo` — repurpose it as the free-path direct executor**

Find (~line 129-139):

```ts
  // Submit to CFO
  const handleSubmitToCfo = async (id: string) => {
    try {
      await updateDisbursementRequest(id, { status: 'Pending_CFO' })
      toast.success("Disbursement diajukan ke CFO untuk persetujuan.")
      setIsDetailOpen(false)
    } catch (e) {
      console.error(e)
      toast.error("Gagal mengajukan ke CFO.")
    }
  }
```

Leave this function exactly as-is (it's still used for the gated path). No change in this step — this step is a no-op checkpoint to confirm you found the right function before Step 3 edits the render logic around it.

- [ ] **Step 3: Branch the Draft-status action block**

Find (~line 496-515):

```tsx
              {/* ACTION BLOCKS ACCORDING TO ROLE & STATUS */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                {/* 1. DRAFT ACTIONS (FINANCE ADMIN) */}
                {selectedDisbursement.status === 'Draft' && isFinance && (
                  <div className="space-y-2">
                    <Button 
                      onClick={() => handleSubmitToCfo(selectedDisbursement.id)}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl shadow-sm"
                    >
                      Ajukan Approval ke CFO
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => handleDeleteDraft(selectedDisbursement.id)}
                      className="w-full border-rose-200 text-rose-600 hover:bg-rose-50 font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl"
                    >
                      Hapus Draft Request
                    </Button>
                  </div>
                )}
```

Replace with:

```tsx
              {/* ACTION BLOCKS ACCORDING TO ROLE & STATUS */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                {/* 1. DRAFT ACTIONS (FINANCE ADMIN) */}
                {selectedDisbursement.status === 'Draft' && isFinance && (
                  <div className="space-y-2">
                    {bankRequiresCfoApproval(selectedDisbursement.fromBankAccountId) ? (
                      <Button 
                        onClick={() => handleSubmitToCfo(selectedDisbursement.id)}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl shadow-sm"
                      >
                        Ajukan Approval ke CFO
                      </Button>
                    ) : (
                      <Button 
                        onClick={() => handleExecuteTransfer(selectedDisbursement)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl shadow-sm"
                      >
                        Eksekusi Transfer (Tanpa Approval CFO)
                      </Button>
                    )}
                    <Button 
                      variant="outline"
                      onClick={() => handleDeleteDraft(selectedDisbursement.id)}
                      className="w-full border-rose-200 text-rose-600 hover:bg-rose-50 font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl"
                    >
                      Hapus Draft Request
                    </Button>
                  </div>
                )}
```

`handleExecuteTransfer` already exists (~line 165) and calls `recordBudgetTransfer` + sets status to `'Transferred'` — reusing it here means Draft jumps straight to Transferred for non-gated accounts, skipping `Pending_CFO`/`Approved` entirely, exactly per spec.

- [ ] **Step 4: Verify with tsc**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same as baseline (5).

- [ ] **Step 5: Browser-verify — free account (BCA → Bank Jago)**

Use the preview tools:
1. Open `finance/disbursements`, create a new request: from BCA, to Bank Jago, some amount, a description.
2. Open the created Draft's detail — confirm the button now reads "Eksekusi Transfer (Tanpa Approval CFO)" (not "Ajukan Approval ke CFO").
3. Click it — confirm the request status becomes `Transferred` and the balances update (check via `finance/cash-bank`).

- [ ] **Step 6: Browser-verify — gated account (Mandiri → BCA) still requires CFO**

1. Create a new request: from Mandiri, to BCA.
2. Confirm the Draft detail shows "Ajukan Approval ke CFO" (unchanged from before).
3. Submit to CFO, log in as a CFO/super_admin role, approve it, confirm "Eksekusi Transfer (Kas Pindah)" button appears and executes normally — the existing gated flow must be completely unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/app/finance/disbursements/page.tsx
git commit -m "feat(cfo-approval): skip CFO step in Disbursements for non-gated accounts"
```

---

### Task 4: Purchase Request — remove amount cap + wire account-based CFO gate

**Files:**
- Modify: `src/app/admin/purchase-requests/page.tsx`

- [ ] **Step 1: Import the helper**

Find (~line 20):

```ts
import { recordBudgetTransfer, recordPRExpensePayment } from "@/lib/accounting"
```

Replace with:

```ts
import { recordBudgetTransfer, recordPRExpensePayment, bankRequiresCfoApproval } from "@/lib/accounting"
```

- [ ] **Step 2: Remove the amount cap and add the account gate in `handleDisburse`**

Find (~line 372-380):

```ts
  const handleDisburse = async () => {
    if (!activePR) return
    if (activePR.status !== 'Approved') { toast.error('PR belum di-approve CFO.'); return }
    if (activePR.disbursedAt) { toast.error('PR ini sudah dicairkan.'); return }

    const amount = parseNumber(disburseAmountRaw)
    if (amount <= 0) { toast.error('Nominal harus lebih dari 0.'); return }
    if (amount > activePR.amount) { toast.error('Nominal tidak boleh melebihi yang disetujui CFO.'); return }
    if (!disburseBankId) { toast.error('Pilih rekening sumber.'); return }
```

Replace with:

```ts
  const handleDisburse = async () => {
    if (!activePR) return
    if (activePR.status !== 'Approved') { toast.error('PR belum di-approve.'); return }
    if (activePR.disbursedAt) { toast.error('PR ini sudah dicairkan.'); return }

    const amount = parseNumber(disburseAmountRaw)
    if (amount <= 0) { toast.error('Nominal harus lebih dari 0.'); return }
    if (!disburseBankId) { toast.error('Pilih rekening sumber.'); return }

    // Rekening strategis (BRI/Mandiri) butuh approval CFO dulu sebelum bisa
    // dicairkan — jarang terjadi (mayoritas pencairan dari BCA/Jago, bebas).
    if (bankRequiresCfoApproval(disburseBankId)) {
      await updatePurchaseRequest(activePR.id, { status: 'Pending_CFO' })
      toast.success('Rekening sumber butuh approval CFO. PR diajukan ke CFO — cairkan lagi setelah disetujui.')
      setDisburseOpen(false)
      return
    }
```

Note: the original cap message ("Nominal tidak boleh melebihi yang disetujui CFO") is gone entirely — admin finance can now enter any amount, default still pre-filled from `activePR.amount` (existing behavior at line ~230, unchanged).

- [ ] **Step 3: Update the nominal field label (it referenced the removed cap)**

Find (~line 1270-1273):

```tsx
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nominal (≤ {formatRupiah(activePR.amount)})</Label>
                <Input value={disburseAmountRaw} onChange={(e) => setDisburseAmountRaw(formatNumber(e.target.value))} className="h-11 rounded-xl" />
              </div>
```

Replace with:

```tsx
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nominal (acuan pengajuan: {formatRupiah(activePR.amount)})</Label>
                <Input value={disburseAmountRaw} onChange={(e) => setDisburseAmountRaw(formatNumber(e.target.value))} className="h-11 rounded-xl" />
              </div>
```

- [ ] **Step 4: Fix the stale comment above `handleFinanceVerify`**

Find (~line 307-309):

```ts
  // Finance Verification Handler
  // Untuk PR kategori Sourcing: Finance langsung approve (skip CFO)
  // Untuk non-Sourcing: tetap diteruskan ke CFO seperti biasa
  const handleFinanceVerify = async (action: 'approve' | 'reject') => {
```

Replace with:

```ts
  // Finance Verification Handler
  // Finance langsung approve/reject di sini — CFO approval PR sekarang cuma
  // dipicu belakangan, di titik cairkan dana, kalau rekening sumbernya
  // strategis (lihat bankRequiresCfoApproval() di handleDisburse).
  const handleFinanceVerify = async (action: 'approve' | 'reject') => {
```

- [ ] **Step 5: Verify with tsc**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same as baseline (5).

- [ ] **Step 6: Browser-verify — free account disburse (BCA)**

1. Create a PR, verify it as Finance (status becomes `Approved`).
2. Open "Cairkan Dana", pick a non-gated bank (BCA), enter an amount different from the requested amount (higher and lower — try both across two PRs, or edit and retry once).
3. Confirm it disburses immediately (`disbursedAt` set, no `Pending_CFO` detour), and no error about exceeding the requested amount.

- [ ] **Step 7: Browser-verify — gated account disburse (Mandiri)**

1. On an `Approved` PR, open "Cairkan Dana", pick Mandiri as the source.
2. Confirm clicking disburse instead flips the PR to `Pending_CFO` (check the status badge on the PR list/detail) and does NOT disburse.
3. Log in as CFO/super_admin, approve the PR (existing `handleCfoApprove` UI at the `Pending_CFO` block) — confirm it returns to `Approved`.
4. Reopen "Cairkan Dana", pick Mandiri again, disburse — confirm it now succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/purchase-requests/page.tsx
git commit -m "feat(cfo-approval): PR disburse gate keyed on account, drop amount cap"
```

---

### Task 5: Final sweep

**Files:** none (verification only)

- [ ] **Step 1: Grep sweep for any other place that unconditionally requires CFO for a transfer**

Run: `grep -rn "Pending_CFO" src/app/ src/lib/`

Expected: only the two files touched in Tasks 3-4 reference it (plus type definitions in `src/types/index.ts`). If any other file sets a transfer/disbursement straight to `Pending_CFO` unconditionally, flag it — it was missed by this plan and needs the same gate.

- [ ] **Step 2: Full tsc gate**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 5 (unchanged baseline).

- [ ] **Step 3: Update the finance-fix-queue memory**

This isn't a code change — after all tasks are done and verified, note in conversation that this feature is shipped, so the memory file `disma-finance-fix-queue.md` can be updated in a later turn (per this session's established habit of updating memory after shipping a feature).

---

## Post-plan check (self-review, already done by planner — do not re-run)

- Spec coverage: Task 1 covers "Perubahan Data Model", Task 2 covers the Cash & Bank badge requirement, Task 3 covers "Perubahan Flow: Disbursement", Task 4 covers "Perubahan Flow: Purchase Request" (both the amount cap and the account-based gate), Task 5 covers "Verifikasi". The "Yang TIDAK berubah" section requires no tasks — it's confirmed by Task 5 Step 1's grep sweep finding no other call sites.
- No placeholders — every step has full code shown inline in the exact edit's before/after form.
- Type consistency — `bankRequiresCfoApproval(bankAccountId: string): boolean` is defined once in Task 1 and consumed identically (same name, same single-argument signature) in Task 3 and Task 4.

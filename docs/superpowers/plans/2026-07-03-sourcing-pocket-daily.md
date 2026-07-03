# Sourcing Pocket — Daily Self-Serve Cash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the derived per-PO advance tally in `sourcing/list` with a real per-sourcer cash-in-hand pocket funded self-serve from one shared Bank Jago pool, with daily hard-close and a finance daily monitor.

**Architecture:** Money stays in the existing `bankAccount` + `CashTransaction` + `computeBankBalances` machinery (no parallel money entity). A pocket is a real `bankAccount` (`purpose='sourcing_pocket'` + `ownerUserId`). Two new accounting helpers move cash pool↔pocket. A thin `TutupHariKantong` marker gates the daily cycle and feeds the finance monitor. Belanja posting is rewired from the derived-tally model to a real cash Out against the pocket.

**Tech Stack:** Next.js 16 (App Router), Zustand store, Supabase (Postgres) via `/api/db`, jsPDF, TypeScript. **No unit-test harness exists in this repo** — every task is verified by (a) `npx tsc --noEmit` producing no *new* errors, and (b) manual browser verification with the `preview_*` tools (dev server, login PINs: Finance `5555`, Sourcing/Hilman `2222`, Super Admin `120194`). Reference wiring pattern for a new table: the existing `disbursement_requests` table (migration `supabase/migrations/20260628000001_disbursement_requests.sql`, store lines ~1885-1906, `src/app/api/db/route.ts` group 2).

**Spec:** `docs/superpowers/specs/2026-07-03-sourcing-pocket-daily-design.md`
**Branch:** `docs/sourcing-pocket-daily-spec` (already checked out).

---

## Baseline verification (run once before Task 1)

- [ ] **Confirm current typecheck baseline**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: a small number (currently `6` pre-existing errors unrelated to this work, e.g. `loss-analytics`, `sales-orders`, `disbursements` Select typings, `shopping-list` `sellPrice`). Record the number; no task may increase it.

---

## Task 1: Data model — types + migration

**Files:**
- Modify: `src/types/index.ts:421-430` (BankAccount) and add `TutupHariKantong`
- Create: `supabase/migrations/20260704000001_sourcing_pocket.sql`

- [ ] **Step 1: Extend BankAccount + purpose union**

In `src/types/index.ts`, change the purpose union and BankAccount interface:

```ts
export type BankAccountPurpose = 'sourcing' | 'sourcing_pocket' | 'kurir' | 'umum';

export interface BankAccount {
  id: string;
  name: string;
  accountNumber?: string;
  accountCode?: string;
  balance: number;
  purpose?: BankAccountPurpose;
  ownerUserId?: string; // set only for purpose='sourcing_pocket': the sourcer who owns this pocket
}
```

- [ ] **Step 2: Add the TutupHariKantong marker type**

Append to `src/types/index.ts` (near other finance interfaces):

```ts
/** Thin daily-close marker for a sourcer's cash pocket. NOT a money store —
 * all money lives in CashTransactions; this snapshots the day and locks it. */
export interface TutupHariKantong {
  id: string;
  sourcerId: string;       // user id of the sourcer
  pocketBankAccountId: string;
  date: string;            // 'YYYY-MM-DD' — the closed day
  ditarik: number;         // Σ pocket-In from pool that day
  belanja: number;         // Σ pocket-Out (purchases) that day
  disetor: number;         // amount returned to pool at close
  defisit: number;         // >0 if pocket went negative (personal cash covered a buy)
  closedAt: string;        // ISO timestamp
  closedBy: string;        // user id/name who closed
}
```

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260704000001_sourcing_pocket.sql`:

```sql
-- Sourcing pocket: per-sourcer cash-in-hand account owner link + daily-close marker.
-- Pocket = bank_accounts row with purpose='sourcing_pocket' + owner_user_id set.
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS owner_user_id text;

CREATE TABLE IF NOT EXISTS public.tutup_hari_kantong (
    id TEXT PRIMARY KEY,
    sourcer_id TEXT NOT NULL,
    pocket_bank_account_id TEXT NOT NULL,
    date TEXT NOT NULL,
    ditarik NUMERIC NOT NULL DEFAULT 0,
    belanja NUMERIC NOT NULL DEFAULT 0,
    disetor NUMERIC NOT NULL DEFAULT 0,
    defisit NUMERIC NOT NULL DEFAULT 0,
    closed_at TIMESTAMPTZ DEFAULT NOW(),
    closed_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS tutup_hari_kantong_sourcer_date_idx
    ON public.tutup_hari_kantong(sourcer_id, date DESC);

ALTER TABLE public.tutup_hari_kantong ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.tutup_hari_kantong TO postgres;
GRANT ALL ON TABLE public.tutup_hari_kantong TO anon;
GRANT ALL ON TABLE public.tutup_hari_kantong TO authenticated;
GRANT ALL ON TABLE public.tutup_hari_kantong TO service_role;
```

- [ ] **Step 4: Apply the migration to Supabase**

Apply via the Supabase MCP `apply_migration` tool (name: `sourcing_pocket`, the SQL above) OR paste into the Supabase SQL editor. The `owner_user_id` column and `tutup_hari_kantong` table must exist before store sync will persist them (missing-table writes are silently skipped by `syncTable`, so the app won't crash if this is deferred — but the finance monitor stays empty until applied).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same count as baseline (types compile; unions widen safely).

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts supabase/migrations/20260704000001_sourcing_pocket.sql
git commit -m "feat(pocket): add ownerUserId + sourcing_pocket purpose + TutupHariKantong type & migration"
```

---

## Task 2: Store wiring for `tutup_hari_kantong`

Mirror the `disbursementRequests` wiring exactly.

**Files:**
- Modify: `src/lib/store.ts` (state decl ~429, add fn ~1885, init setIfDefined ~1098, local cache constant ~37)
- Modify: `src/app/api/db/route.ts` (GET group 2, ~129-155)

- [ ] **Step 1: Add store state + action to the interface**

In `src/lib/store.ts`, next to `disbursementRequests` in the state interface (~line 429):

```ts
  tutupHariKantong: TutupHariKantong[];
  addTutupHariKantong: (rec: TutupHariKantong) => Promise<void>;
```

Add `TutupHariKantong` to the type import from `@/types` at the top of the file.

- [ ] **Step 2: Add initial state + action implementation**

Near the `disbursementRequests: []` initializer (~line 1885):

```ts
      tutupHariKantong: [],
      addTutupHariKantong: async (rec) => {
        set({ tutupHariKantong: [...get().tutupHariKantong, rec] });
        await get().syncTable('tutup_hari_kantong', rec);
      },
```

- [ ] **Step 3: Load it on init**

In the init `setIfDefined` block (~line 1098, right after the `disbursementRequests` line):

```ts
            setIfDefined('tutupHariKantong', data.tutupHariKantong);
```

- [ ] **Step 4: Serve it from the API (GET group 2)**

In `src/app/api/db/route.ts`, group 2's `Promise.all` (~line 129) add `fetchTable('tutup_hari_kantong')` as the last element, destructure it as `tutupHariKantong`, and in the returned object (~line 153) add:

```ts
        tutupHariKantong: toCamel(tutupHariKantong),
```

(POST `/api/db` is already generic — `toSnake` + `upsert` — so `addTutupHariKantong` persists with no route change.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same as baseline.

- [ ] **Step 6: Browser smoke — store loads without error**

Start dev server (`preview_start`), login as Super Admin (PIN `120194`), open console logs (`preview_console_logs` level error). Expected: no errors; `[INIT] Phase 2 complete` logs present.

- [ ] **Step 7: Commit**

```bash
git add src/lib/store.ts src/app/api/db/route.ts
git commit -m "feat(pocket): wire tutup_hari_kantong table into store + api"
```

---

## Task 3: Cash & Bank — tag pocket accounts (owner + purpose)

**Files:**
- Modify: `src/app/finance/cash-bank/page.tsx` (create form ~554-563, edit form ~883-892, bankForm state ~63, addBankAccount call ~129-135)

- [ ] **Step 1: Add 'sourcing_pocket' + owner to the purpose Selects**

In BOTH the create form (~554) and edit form (~883) purpose `<SelectContent>`, add the new option after `sourcing`:

```tsx
                              <SelectItem value="sourcing">Kas Sourcing (pool bersama)</SelectItem>
                              <SelectItem value="sourcing_pocket">Kantong Sourcing (per orang)</SelectItem>
                              <SelectItem value="kurir">Kas Kurir</SelectItem>
```

- [ ] **Step 2: Add an owner picker shown only when purpose is sourcing_pocket**

`bankForm` state (~63) add `ownerUserId: string`:

```tsx
  const [bankForm, setBankForm] = useState<{ name: string; number: string; balance: number; accountCode: string; purpose: BankAccountPurpose; ownerUserId: string }>({ name: '', number: '', balance: 0, accountCode: '1-1000', purpose: 'umum', ownerUserId: '' })
```

Read users at the top of the component (if not already): `const users = useAppStore(state => state.users)`.

Immediately after the purpose `<Select>` block in the CREATE form, add:

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
```

- [ ] **Step 3: Persist ownerUserId on create**

In the `addBankAccount({...})` call (~129), add `ownerUserId: bankForm.purpose === 'sourcing_pocket' ? bankForm.ownerUserId : undefined,` and reset it in the form-reset (`~167`): add `ownerUserId: ''` to the reset object.

- [ ] **Step 4: Mirror owner picker + persistence in the EDIT modal**

In the edit modal, after the purpose Select (~892), add the same owner picker bound to `editingBank`:

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

Confirm `handleUpdateBank` already spreads `editingBank` into the update (it does — it passes the edited object), so `ownerUserId` persists with no extra change. If it maps fields explicitly, add `ownerUserId: editingBank.ownerUserId`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same as baseline.

- [ ] **Step 6: Browser verify — create two pockets**

Login Finance (`5555`) → Cash & Bank. Create "Kantong Hilman": purpose `Kantong Sourcing`, owner Hilman (the only sourcing user), saldo 0, COA `1-1500`. Also edit the Bank Jago account → purpose `Kas Sourcing (pool bersama)`. (Create a second pocket only if a second sourcing user exists.) Screenshot the card. Expected: card appears; reopening edit shows the saved owner.

- [ ] **Step 7: Commit**

```bash
git add src/app/finance/cash-bank/page.tsx
git commit -m "feat(pocket): tag sourcing_pocket accounts with owner in Cash & Bank"
```

---

## Task 4: Accounting helpers — withdraw & return

**Files:**
- Modify: `src/lib/accounting.ts` (add two exports near `recordBudgetTransfer` ~805)

- [ ] **Step 1: Add `recordPocketWithdrawal`**

Append after `recordBudgetTransfer` in `src/lib/accounting.ts`:

```ts
// Sourcing self-serve: move cash from the shared pool (Bank Jago) into a
// sourcer's cash-in-hand pocket. Pool → pocket, no PurchaseId. Guarded by the
// caller against pool balance; this fn assumes amount is already validated.
export const recordPocketWithdrawal = async (
  poolBankAccountId: string,
  pocketBankAccountId: string,
  amount: number,
  sourcerName: string
) => {
  const store = useAppStore.getState();
  const pool = store.bankAccounts.find(b => b.id === poolBankAccountId);
  const pocket = store.bankAccounts.find(b => b.id === pocketBankAccountId);
  if (!pool || !pocket || amount <= 0) return false;
  if (poolBankAccountId === pocketBankAccountId) return false;

  const poolCode = pool.accountCode || '1-1000';
  const pocketCode = pocket.accountCode || '1-1500';
  const ref = `POCKET-W-${Date.now().toString().slice(-8)}`;

  store.beginUndoableBatch();
  try {
    const ok = await createAccountingEntry(
      `Tarik Kantong: ${sourcerName} - ${formatDateRef()}`,
      'Transfer',
      ref,
      [{ accountCode: pocketCode, amount }],
      [{ accountCode: poolCode, amount }]
    );
    if (!ok) return false;
    const now = new Date().toISOString();
    await store.addCashTransaction({
      id: uuidv4(), date: now, amount, type: 'Out',
      category: 'Tarik Kantong Sourcing',
      description: `Tarik ke kantong ${sourcerName}`,
      bankAccountId: poolBankAccountId, counterpartName: pocket.name,
      referenceId: ref, referenceType: 'Transfer',
    });
    await store.addCashTransaction({
      id: uuidv4(), date: now, amount, type: 'In',
      category: 'Tarik Kantong Sourcing',
      description: `Penerimaan kantong dari ${pool.name}`,
      bankAccountId: pocketBankAccountId, counterpartName: pool.name,
      referenceId: ref, referenceType: 'Transfer',
    });
    return true;
  } finally {
    store.endUndoableBatch();
  }
};
```

If a `formatDateRef` helper doesn't exist, inline `new Date().toLocaleDateString('id-ID')` instead of `formatDateRef()`.

- [ ] **Step 2: Add `recordPocketReturn`**

```ts
// Daily close: return the pocket's entire remaining balance to the pool.
// pocket → pool. Amount = current pocket balance (computed by caller). Returns
// the amount returned so the caller can snapshot the TutupHariKantong marker.
export const recordPocketReturn = async (
  pocketBankAccountId: string,
  poolBankAccountId: string,
  amount: number,
  sourcerName: string
) => {
  const store = useAppStore.getState();
  const pool = store.bankAccounts.find(b => b.id === poolBankAccountId);
  const pocket = store.bankAccounts.find(b => b.id === pocketBankAccountId);
  if (!pool || !pocket || amount <= 0) return false;
  if (poolBankAccountId === pocketBankAccountId) return false;

  const poolCode = pool.accountCode || '1-1000';
  const pocketCode = pocket.accountCode || '1-1500';
  const ref = `POCKET-R-${Date.now().toString().slice(-8)}`;

  store.beginUndoableBatch();
  try {
    const ok = await createAccountingEntry(
      `Setor Sisa Kantong: ${sourcerName} - ${new Date().toLocaleDateString('id-ID')}`,
      'Transfer',
      ref,
      [{ accountCode: poolCode, amount }],
      [{ accountCode: pocketCode, amount }]
    );
    if (!ok) return false;
    const now = new Date().toISOString();
    await store.addCashTransaction({
      id: uuidv4(), date: now, amount, type: 'Out',
      category: 'Setor Sisa Kantong',
      description: `Setor sisa kantong ${sourcerName} ke ${pool.name}`,
      bankAccountId: pocketBankAccountId, counterpartName: pool.name,
      referenceId: ref, referenceType: 'Transfer',
    });
    await store.addCashTransaction({
      id: uuidv4(), date: now, amount, type: 'In',
      category: 'Setor Sisa Kantong',
      description: `Terima setoran kantong ${sourcerName}`,
      bankAccountId: poolBankAccountId, counterpartName: pocket.name,
      referenceId: ref, referenceType: 'Transfer',
    });
    return true;
  } finally {
    store.endUndoableBatch();
  }
};
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same as baseline. (If `formatDateRef` was referenced and doesn't exist, the count rises — switch to the inline `toLocaleDateString` form.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/accounting.ts
git commit -m "feat(pocket): add recordPocketWithdrawal + recordPocketReturn helpers"
```

---

## Task 5: Rewire belanja posting to spend from the real pocket

Today `handleSubmitLaporan` (`src/app/sourcing/list/page.tsx:209`) only sets `purchase.actualSpent` and relies on the derived tally — **no CashTransaction, no journal for the cash spend** (see comment at line 265). Move the Cash/Pasar spend to a real pocket Out.

**Files:**
- Modify: `src/lib/accounting.ts` (add `recordPocketPurchase`)
- Modify: `src/app/sourcing/list/page.tsx:209-281` (`handleSubmitLaporan`)

- [ ] **Step 1: Add `recordPocketPurchase` helper**

Append to `src/lib/accounting.ts`:

```ts
// Book a sourcer's actual Cash/Pasar spend against their pocket: Dr HPP / Cr
// pocket. Only for cash-paid items — Tempo (AP) and Online (BCA) are handled
// elsewhere and must NOT be passed here.
export const recordPocketPurchase = async (
  purchaseId: string,
  pocketBankAccountId: string,
  amount: number,
  sourcerName: string
) => {
  const store = useAppStore.getState();
  const pocket = store.bankAccounts.find(b => b.id === pocketBankAccountId);
  if (!pocket || amount <= 0) return false;
  const pocketCode = pocket.accountCode || '1-1500';
  const ok = await createAccountingEntry(
    `Belanja Tunai Sourcing (${sourcerName}) - Ref: ${purchaseId.slice(0, 8)}`,
    'Purchase',
    purchaseId,
    [{ accountCode: HPP_ACCOUNT_CODE, amount }],
    [{ accountCode: pocketCode, amount }]
  );
  if (!ok) return false;
  await store.addCashTransaction({
    id: `pocket-buy-${purchaseId}`, date: new Date().toISOString(), amount,
    type: 'Out', category: 'Belanja Sourcing (HPP)',
    description: `Belanja tunai - Ref: ${purchaseId.slice(0, 8)}`,
    bankAccountId: pocketBankAccountId, referenceId: purchaseId, referenceType: 'Purchase',
  });
  return true;
};
```

- [ ] **Step 2: Resolve the active sourcer's pocket in the page (LIVE balances)**

The stored `bankAccount.balance` is NOT live — the app derives real balances from cash transactions via `computeBankBalances` (see `src/app/finance/disbursements/page.tsx:36`). Resolve pocket + pool from the derived array so balances reflect every tarik/belanja/setor immediately.

Near the top of `SourcingListPage` (after `const bankAccounts = ...`), add (add `const cashTransactions = useAppStore(s => s.cashTransactions)` if not present, and `import { computeBankBalances } from "@/lib/bank-balance"`):

```tsx
  const derivedBanks = useMemo(() => computeBankBalances(bankAccounts, cashTransactions), [bankAccounts, cashTransactions])
  const myPocket = derivedBanks.find(b => b.purpose === 'sourcing_pocket' && b.ownerUserId === currentUser?.id)
  const pool = derivedBanks.find(b => b.purpose === 'sourcing')
  const pocketBalance = myPocket?.balance ?? 0
```

Ensure `useMemo` is imported from `react` (it likely already is).

- [ ] **Step 3: Post the cash spend in `handleSubmitLaporan`**

Inside `handleSubmitLaporan`, for each submitted purchase compute the **cash portion** (exclude Tempo + Online items) and call `recordPocketPurchase`. The cash portion = Σ over the purchase's `purchaseItems` where `purchaseMethod !== 'Transfer'` (Tempo) and `purchaseMethod !== 'Online'`, of `actualUnitPrice * qtyPurchased`. Add, right after the existing `updatePurchase(p.id, { ... actualSpent: pTotalCost ... })` call (~254):

```tsx
        if (myPocket) {
          const cashPortion = purchaseItems
            .filter(pi => pi.purchaseId === p.id && pi.purchaseMethod !== 'Transfer' && pi.purchaseMethod !== 'Online')
            .reduce((s, pi) => s + (pi.actualUnitPrice || 0) * (pi.qtyPurchased || 0), 0)
          if (cashPortion > 0) {
            await recordPocketPurchase(p.id, myPocket.id, cashPortion, currentUser?.name || 'Sourcing')
          }
        }
```

Remove/replace the stale comment at line 265 ("Saldo sourcing derived — tidak perlu CashTransaction") since cash now moves for real.

Import the helper: add `recordPocketPurchase` to the `@/lib/accounting` import in this file.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same as baseline.

- [ ] **Step 5: Browser verify (deferred to Task 6's end-to-end)** — belanja posting is exercised together with the pocket panel; mark done after Task 6 verification confirms the pocket balance drops by the cash spend.

- [ ] **Step 6: Commit**

```bash
git add src/lib/accounting.ts src/app/sourcing/list/page.tsx
git commit -m "feat(pocket): book cash belanja against the real sourcing pocket"
```

---

## Task 6: Sourcing "Kantong Hari Ini" panel (tarik + tutup hari)

Replace the old per-PO violet "Uang Diambil dari Bank Jago" card (`src/app/sourcing/list/page.tsx:458-511`) with a pocket panel driven by the real account.

**Files:**
- Modify: `src/app/sourcing/list/page.tsx:458-511`

- [ ] **Step 1: Compute today's pocket figures**

Above the JSX return, add derivations (uses `cashTransactions` from the store — add `const cashTransactions = useAppStore(s => s.cashTransactions)` if not present):

```tsx
  const todayStr = new Date().toISOString().slice(0, 10)
  const myPocketTx = cashTransactions.filter(t => t.bankAccountId === myPocket?.id && t.date.slice(0,10) === todayStr)
  const ditarikHariIni = myPocketTx.filter(t => t.type === 'In' && t.category === 'Tarik Kantong Sourcing').reduce((s,t)=>s+t.amount,0)
  const belanjaHariIni = myPocketTx.filter(t => t.type === 'Out' && t.category === 'Belanja Sourcing (HPP)').reduce((s,t)=>s+t.amount,0)
  const alreadyClosedToday = useAppStore.getState().tutupHariKantong.some(m => m.sourcerId === currentUser?.id && m.date === todayStr)
```

- [ ] **Step 2: Replace the violet card JSX with the pocket panel**

Swap the whole `{activePurchases.length > 0 && (() => { ... })()}` block at 458-511 with:

```tsx
      {myPocket ? (
        <div className="bg-violet-50 border border-violet-200 rounded-[2rem] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-violet-600" />
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-700">Kantong Hari Ini · {myPocket.name}</p>
            </div>
            <p className="text-xl font-black text-violet-800">{formatRupiah(pocketBalance)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-violet-600">
            <span>Ditarik: {formatRupiah(ditarikHariIni)}</span>
            <span>Kepake: {formatRupiah(belanjaHariIni)}</span>
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-1 flex-1 bg-white border-2 border-violet-200 rounded-xl px-3 focus-within:border-violet-500">
              <span className="text-xs font-bold text-slate-400">Rp</span>
              <input type="text" inputMode="numeric" id="pocket-withdraw-input" placeholder="0"
                className="flex-1 h-12 bg-transparent text-lg font-bold outline-none" />
            </div>
            <Button className="h-12 px-5 bg-violet-600 hover:bg-violet-700 font-bold rounded-xl"
              onClick={async () => {
                const val = parseNumber((document.getElementById('pocket-withdraw-input') as HTMLInputElement).value)
                if (val <= 0) return toast.error('Masukkan nominal tarik.')
                if (!pool) return toast.error('Rekening Bank Jago (pool) belum di-set finance.')
                if (val > (pool.balance ?? 0)) return toast.error(`Pool Bank Jago tidak cukup (tersedia ${formatRupiah(pool.balance ?? 0)}). Minta finance top-up.`)
                const ok = await recordPocketWithdrawal(pool.id, myPocket.id, val, currentUser?.name || 'Sourcing')
                if (ok) toast.success(`Tarik ${formatRupiah(val)} ke kantong.`)
                else toast.error('Gagal tarik.')
              }}>
              Tarik
            </Button>
          </div>
          <Button
            disabled={pocketBalance <= 0 || alreadyClosedToday}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 font-black rounded-xl uppercase text-[11px] tracking-widest disabled:opacity-40"
            onClick={async () => {
              if (!pool || !myPocket) return
              const ok = await recordPocketReturn(myPocket.id, pool.id, pocketBalance, currentUser?.name || 'Sourcing')
              if (!ok) return toast.error('Gagal setor sisa.')
              await useAppStore.getState().addTutupHariKantong({
                id: uuidv4(), sourcerId: currentUser?.id || 'unknown', pocketBankAccountId: myPocket.id,
                date: todayStr, ditarik: ditarikHariIni, belanja: belanjaHariIni,
                disetor: pocketBalance, defisit: pocketBalance < 0 ? Math.abs(pocketBalance) : 0,
                closedAt: new Date().toISOString(), closedBy: currentUser?.name || currentUser?.id || 'Sourcing',
              })
              toast.success('Hari ditutup, sisa disetor ke Bank Jago.')
            }}>
            {alreadyClosedToday ? 'Hari Sudah Ditutup' : 'Tutup Hari (Setor Sisa)'}
          </Button>
          <p className="text-[9px] text-violet-400 font-bold uppercase">Tarik sesuai kebutuhan (boleh berkali-kali). Tiap sore tutup hari — sisa balik ke Bank Jago.</p>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-5 text-[11px] font-bold text-amber-700">
          Kantong sourcing kamu belum di-set. Minta finance bikin rekening kantong (purpose "Kantong Sourcing" + owner kamu) di Cash & Bank.
        </div>
      )}
```

Ensure imports: `recordPocketWithdrawal`, `recordPocketReturn` from `@/lib/accounting`; `uuidv4`, `parseNumber`, `toast`, `Banknote` already imported (verify).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same as baseline.

- [ ] **Step 4: Browser end-to-end**

Finance (`5555`): top-up Bank Jago pool via Disbursement (BCA→Bank Jago, e.g. 5.000.000). Then login Hilman (`2222`) → Sourcing list. Verify: pocket panel shows `Kantong Hilman` Rp0. Tarik 500.000 → pocket shows 500.000, "Ditarik 500.000"; Bank Jago pool dropped 500.000 (check Cash & Bank as finance). Try Tarik above pool balance → rejected toast. Do a belanja submit (Task 5) with a cash item → pocket drops by the cash amount, "Kepake" reflects it. Click Tutup Hari → pocket → 0, pool regains the leftover, button becomes "Hari Sudah Ditutup". Screenshot each state.

- [ ] **Step 5: Commit**

```bash
git add src/app/sourcing/list/page.tsx
git commit -m "feat(pocket): Kantong Hari Ini panel — self-serve tarik + tutup hari"
```

---

## Task 7: Swap the derived tally display to the real pocket balance

The top summary card still shows `totalAdvanceReceived` / `remainingCash` from the derived model (`src/app/sourcing/list/page.tsx:114-133, 396-419`). Point it at the real pocket.

**Files:**
- Modify: `src/app/sourcing/list/page.tsx:114-133` (derivations) and `396-419` (summary card), `135-162` (`handleReportReturn`), `319` (ops clamp)

- [ ] **Step 1: Repoint the summary card**

Replace the card's displayed values: use `pocketBalance` for the "remaining" figure and `ditarikHariIni` (or the pocket's lifetime In) for the "received" figure. Concretely, in the summary card JSX (~396-405):

```tsx
              <p className="text-2xl font-black tracking-tighter leading-none">{formatRupiah(ditarikHariIni)}</p>
```
and (~404):
```tsx
          <p className={cn("text-2xl font-black tracking-tighter leading-none", pocketBalance < 0 ? "text-rose-500" : "text-emerald-600")}>
            {formatRupiah(pocketBalance)}
          </p>
```

For the progress bar (~411-415) use `belanjaHariIni` over `ditarikHariIni`:

```tsx
              style={{ width: `${ditarikHariIni > 0 ? Math.min(100, (belanjaHariIni / ditarikHariIni) * 100) : 0}%` }}
```
```tsx
              Pemakaian: {formatRupiah(belanjaHariIni)}
```

- [ ] **Step 2: Repoint `handleReportReturn` (setor sisa) — now redundant with Tutup Hari**

The old "setor sisa" (`handleReportReturn`, ~135) used `totalHolding`. Tutup Hari (Task 6) supersedes it. Either remove the old setor button/handler, or make `handleReportReturn` call `recordPocketReturn(myPocket.id, pool.id, pocketBalance, ...)`. Recommended: delete the old handler + its button and rely on Tutup Hari. Search for its JSX trigger and remove it. Also remove the now-unused `returnTargetBank` state + its picker if nothing else uses them. Verify no other caller references `handleReportReturn` or `totalHolding` after this.

- [ ] **Step 3: Repoint the ops-cash clamp (~319)**

`Math.min(opsFormData.amount, totalHolding)` → `Math.min(opsFormData.amount, pocketBalance)`.

- [ ] **Step 4: Remove now-dead derivations**

Delete `totalAdvanceReceived`, `totalHolding`, `fundedPurchases`, `totalShopSpent` and any other line that only fed the removed display. Run typecheck after deletion to catch stragglers.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "sourcing/list" ; npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: no `sourcing/list` errors; total count == baseline.

- [ ] **Step 6: Browser verify**

Hilman (`2222`): the top summary now tracks the pocket in real time — Tarik raises "received"/balance, belanja raises "Pemakaian", Tutup Hari zeroes it. No stale advance figures. Screenshot.

- [ ] **Step 7: Commit**

```bash
git add src/app/sourcing/list/page.tsx
git commit -m "refactor(pocket): sourcing summary reads real pocket balance, drop derived advance tally"
```

---

## Task 8: Finance "Pantau Harian Sourcing" dashboard

**Files:**
- Create: `src/app/finance/sourcing-monitor/page.tsx`
- Modify: `src/lib/navigation.tsx` (add a Finance nav entry ~32)

- [ ] **Step 1: Add the nav entry**

In `src/lib/navigation.tsx`, after the `finance_disbursements` entry (~32):

```tsx
  { key: 'finance_sourcing_monitor', title: 'Pantau Harian Sourcing', href: '/finance/sourcing-monitor', icon: <Banknote className="h-4 w-4 text-violet-500" />, category: 'Finance' },
```

Ensure `Banknote` is imported from `lucide-react` in that file (add if missing). Also add `'finance_sourcing_monitor'` to the finance/super_admin/ceo permission arrays in `src/lib/store.ts` (~640-669, same lines listing `finance_disbursements`).

- [ ] **Step 2: Build the monitor page**

Create `src/app/finance/sourcing-monitor/page.tsx`:

```tsx
"use client"

import { useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatRupiah } from "@/lib/utils"
import AuthGuard from "@/components/auth/auth-guard"

export default function SourcingMonitorPage() {
  const cashTransactions = useAppStore(s => s.cashTransactions)
  const bankAccounts = useAppStore(s => s.bankAccounts)
  const closes = useAppStore(s => s.tutupHariKantong)
  const users = useAppStore(s => s.users)

  const pockets = useMemo(() => bankAccounts.filter(b => b.purpose === 'sourcing_pocket'), [bankAccounts])

  // Build rows: one per (pocket, date) that had activity or a close marker.
  const rows = useMemo(() => {
    const map = new Map<string, { date: string; pocketId: string; sourcer: string; ditarik: number; belanja: number; disetor: number; closed: boolean; defisit: number }>()
    const keyOf = (pid: string, d: string) => `${pid}|${d}`
    for (const p of pockets) {
      const sourcer = users.find(u => u.id === p.ownerUserId)?.name || p.name
      for (const t of cashTransactions.filter(t => t.bankAccountId === p.id)) {
        const d = t.date.slice(0, 10)
        const k = keyOf(p.id, d)
        if (!map.has(k)) map.set(k, { date: d, pocketId: p.id, sourcer, ditarik: 0, belanja: 0, disetor: 0, closed: false, defisit: 0 })
        const row = map.get(k)!
        if (t.type === 'In' && t.category === 'Tarik Kantong Sourcing') row.ditarik += t.amount
        else if (t.type === 'Out' && t.category === 'Belanja Sourcing (HPP)') row.belanja += t.amount
        else if (t.type === 'Out' && t.category === 'Setor Sisa Kantong') row.disetor += t.amount
      }
    }
    for (const c of closes) {
      const k = keyOf(c.pocketBankAccountId, c.date)
      if (!map.has(k)) map.set(k, { date: c.date, pocketId: c.pocketBankAccountId, sourcer: users.find(u => u.id === c.sourcerId)?.name || c.sourcerId, ditarik: c.ditarik, belanja: c.belanja, disetor: c.disetor, closed: true, defisit: c.defisit })
      else { const r = map.get(k)!; r.closed = true; r.defisit = c.defisit }
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || a.sourcer.localeCompare(b.sourcer))
  }, [pockets, cashTransactions, closes, users])

  return (
    <AuthGuard allowedRoles={['finance', 'ceo', 'super_admin']}>
      <div className="space-y-6 max-w-6xl mx-auto">
        <Card>
          <CardHeader><CardTitle className="text-xl font-black uppercase tracking-tight">Pantau Harian Sourcing</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Sourcing</TableHead>
                  <TableHead className="text-right">Ditarik</TableHead>
                  <TableHead className="text-right">Belanja</TableHead>
                  <TableHead className="text-right">Disetor</TableHead>
                  <TableHead className="text-right">Sisa/Defisit</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8 text-sm">Belum ada aktivitas kantong sourcing.</TableCell></TableRow>
                ) : rows.map((r, i) => {
                  const sisa = r.ditarik - r.belanja - r.disetor
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-bold">{r.date}</TableCell>
                      <TableCell className="text-xs font-black">{r.sourcer}</TableCell>
                      <TableCell className="text-right text-xs">{formatRupiah(r.ditarik)}</TableCell>
                      <TableCell className="text-right text-xs">{formatRupiah(r.belanja)}</TableCell>
                      <TableCell className="text-right text-xs">{formatRupiah(r.disetor)}</TableCell>
                      <TableCell className={`text-right text-xs font-black ${r.defisit > 0 ? 'text-rose-600' : 'text-slate-600'}`}>{r.defisit > 0 ? `-${formatRupiah(r.defisit)}` : formatRupiah(sisa)}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={r.closed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>{r.closed ? 'Tutup' : 'Buka'}</Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  )
}
```

Verify `AuthGuard`'s prop name/shape against an existing page (e.g. `src/app/finance/ap-aging/page.tsx` imports `AuthGuard from "@/components/auth/auth-guard"`); match its actual API (it may wrap without an `allowedRoles` prop — adjust to the real signature).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: same as baseline.

- [ ] **Step 4: Browser verify**

Finance (`5555`) → open "Pantau Harian Sourcing" from the sidebar. After the Task 6 e2e, expect a row for Hilman today: ditarik/belanja/disetor filled, status Tutup. Screenshot.

- [ ] **Step 5: Commit**

```bash
git add src/app/finance/sourcing-monitor/page.tsx src/lib/navigation.tsx src/lib/store.ts
git commit -m "feat(pocket): finance daily sourcing monitor dashboard"
```

---

## Task 9: Simulation seed for local e2e

Make the local reset/simulation seed a Bank Jago pool + two pockets so the flow works without manual Cash & Bank setup.

**Files:**
- Modify: `src/lib/simulation.ts` (bank account seed ~9) and/or `src/lib/constants.ts` (`INITIAL_BANK_ACCOUNTS`)

- [ ] **Step 1: Locate the bank seed**

Run: `grep -nE "bank-1|Bank Jago|INITIAL_BANK_ACCOUNTS|accountNumber|purpose" src/lib/constants.ts src/lib/simulation.ts | head`
Identify the array seeding `bankAccounts`.

- [ ] **Step 2: Tag pool + add one pocket (Hilman)**

There is currently exactly one `role: 'sourcing'` user in `MOCK_USERS`: **Hilman** (`22222222-2222-2222-2222-222222222222`). "Rifai" in the data is a *vendor*, and "Rivai" is a *kurir* — neither is a sourcing user, so do NOT seed a Rifai pocket. Additional pockets are created per additional sourcing user later via Cash & Bank (Task 3).

In that seed array, set the Bank Jago row `purpose: 'sourcing'`, and append one pocket:

```ts
  { id: 'bank-pocket-hilman', name: 'Kantong Hilman', accountNumber: '', accountCode: '1-1500', balance: 0, purpose: 'sourcing_pocket', ownerUserId: '22222222-2222-2222-2222-222222222222' },
```

If the seed has no "Bank Jago" row yet, add one as the pool:

```ts
  { id: 'bank-jago', name: 'Bank Jago', accountNumber: '', accountCode: '1-1400', balance: 0, purpose: 'sourcing' },
```

- [ ] **Step 3: Typecheck + reseed**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"` (expect baseline). Then in the browser click "RESET + SIMULASI" and confirm the three accounts appear in Cash & Bank with correct purpose/owner.

- [ ] **Step 4: Commit**

```bash
git add src/lib/simulation.ts src/lib/constants.ts
git commit -m "chore(pocket): seed Bank Jago pool + sourcer pockets in simulation"
```

---

## Final verification

- [ ] **Full typecheck no regressions**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: == baseline recorded at the start.

- [ ] **Full flow, one pass, in the browser**

Finance top-up pool → Hilman tarik (guard test above-pool) → belanja cash → Tutup Hari (pocket→0) → Finance monitor shows the closed day with correct ditarik/belanja/disetor. Also confirm Tempo/Online items still route to AP/BCA (unchanged) and HPP per item is intact.

- [ ] **Update the remove-advance spec progress**

Mark P2b/P3 progress in `docs/superpowers/specs/2026-07-03-remove-advance-design.md` (note this plan implements the pocket model; courier P4 + dead-code P5 still pending). Commit.

---

## Out of scope (do NOT do here)

- Courier pockets (remove-advance P4) — same pattern, later.
- Deleting advance-wallet dead code: `ADVANCE_WALLETS`, `USER_WALLETS`, `getAdvanceWallet*`, `recordAdvanceExpense`, `recordAdvanceReturn`, `recordOperationalAdvanceTransfer` (P5). Leave intact until courier is migrated so nothing else breaks.
- Finance-side per-PO sourcing settlement (`finance/approvals` sourcing-settlement, `recordReconciliationSettlement`): the daily pocket model makes cash reconciliation account-based, but ripping out the old settlement tab is a separate, risky change. Verify it still runs; do its removal in a dedicated follow-up.
- HPP / margin per PO — unchanged by design.

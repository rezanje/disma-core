# COA per Bank Account (Paket A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every bank/cash account its own dedicated 1:1 Chart-of-Accounts (COA) entry — auto-created on add, name-synced on rename, unique-coded — and repair existing banks that share a code.

**Architecture:** A pure helper (`src/lib/coa.ts`) computes the next free bank COA code. The Zustand store (`src/lib/store.ts`) gains `updateCoa` + `createBankWithCoa` and rename-syncs the linked COA. The Cash & Bank page (`src/app/finance/cash-bank/page.tsx`) drops the "link to existing COA" picker in favor of auto-code + an Advanced editor, and renders "code - name". A standalone, dry-run-first script repairs existing data.

**Tech Stack:** Next.js + TypeScript, Zustand store with `syncTable`/`logHistory` persistence to Supabase, shadcn `Select`, `sonner` toasts, `@supabase/supabase-js` for the migration script. No unit-test framework exists in this repo; verification is `npx tsc --noEmit`, `npx eslint`, the migration script's `--dry-run`, and a manual UI checklist (matching repo conventions like `scripts/fix-advance-source.js`).

**Note on testing:** Because the repo has no test runner, the one piece of pure logic (`nextBankCoaCode`) is verified by a tiny throwaway Node script using `node --test` on a JS mirror committed under `scripts/`, then the real TS function is type-checked. This keeps verification honest without introducing a framework dependency.

---

### Task 1: Pure helper `nextBankCoaCode`

**Files:**
- Create: `src/lib/coa.ts`
- Create (verification only, throwaway): `scripts/coa-codegen.test.mjs`

- [ ] **Step 1: Write the helper**

Create `src/lib/coa.ts`:

```ts
import type { ChartOfAccount } from "@/types"

/**
 * Bank/cash COAs occupy 1-1000 … 1-1900 (step 100). Returns the lowest free
 * code in that band; if the band is full, scans finer 1-1xy0 slots.
 * Throws if no 1-1xxx slot remains (90+ slots — practically never).
 */
export function nextBankCoaCode(coas: Pick<ChartOfAccount, "accountCode">[]): string {
  const used = new Set(coas.map((c) => c.accountCode))
  for (let h = 0; h <= 9; h++) {
    const code = `1-1${h}00`
    if (!used.has(code)) return code
  }
  for (let x = 0; x <= 9; x++) {
    for (let y = 1; y <= 9; y++) {
      const code = `1-1${x}${y}0`
      if (!used.has(code)) return code
    }
  }
  throw new Error("No free bank COA code available in the 1-1xxx range")
}
```

- [ ] **Step 2: Write a JS mirror test (throwaway, proves the algorithm)**

Create `scripts/coa-codegen.test.mjs` (mirrors the algorithm so it runs under plain Node without TS tooling):

```js
import { test } from "node:test"
import assert from "node:assert/strict"

function nextBankCoaCode(coas) {
  const used = new Set(coas.map((c) => c.accountCode))
  for (let h = 0; h <= 9; h++) {
    const code = `1-1${h}00`
    if (!used.has(code)) return code
  }
  for (let x = 0; x <= 9; x++) {
    for (let y = 1; y <= 9; y++) {
      const code = `1-1${x}${y}0`
      if (!used.has(code)) return code
    }
  }
  throw new Error("No free bank COA code available in the 1-1xxx range")
}

test("returns 1-1100 given the production seed set", () => {
  const seed = ["1-1000", "1-1200", "1-1300", "1-1400", "1-1500"].map((c) => ({ accountCode: c }))
  assert.equal(nextBankCoaCode(seed), "1-1100")
})

test("skips to next free hundred when 1-1100 taken", () => {
  const seed = ["1-1000", "1-1100", "1-1200", "1-1300", "1-1400", "1-1500"].map((c) => ({ accountCode: c }))
  assert.equal(nextBankCoaCode(seed), "1-1600")
})

test("falls back to finer slots when all hundreds are used", () => {
  const seed = []
  for (let h = 0; h <= 9; h++) seed.push({ accountCode: `1-1${h}00` })
  assert.equal(nextBankCoaCode(seed), "1-1010")
})
```

- [ ] **Step 3: Run the test, expect PASS**

Run: `node --test scripts/coa-codegen.test.mjs`
Expected: `tests 3` / `pass 3` / `fail 0`.

- [ ] **Step 4: Typecheck the real helper**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "coa.ts"; echo done`
Expected: no errors for `coa.ts` (only `done` prints).

- [ ] **Step 5: Commit**

```bash
git add src/lib/coa.ts scripts/coa-codegen.test.mjs
git commit -m "feat(coa): add nextBankCoaCode helper for bank COA allocation"
```

---

### Task 2: Store — `updateCoa` + `createBankWithCoa`

**Files:**
- Modify: `src/lib/store.ts` (interface near `addCoa` line ~318 and `addBankAccount` line ~428; implementations near lines ~1373 and ~2345)

- [ ] **Step 1: Add the two methods to the store interface**

Near the existing `addCoa: (coa: ChartOfAccount) => void;` (line ~318) add:

```ts
  updateCoa: (id: string, data: Partial<ChartOfAccount>) => Promise<void>;
```

Near `addBankAccount` / `updateBankAccount` (lines ~428-429) add:

```ts
  createBankWithCoa: (acc: BankAccount, coaName: string) => Promise<void>;
```

- [ ] **Step 2: Implement `updateCoa`**

Immediately after the existing `addCoa` implementation (line ~1373-1376) add:

```ts
      updateCoa: async (id, data) => {
        const before = get().coas.find((c) => c.id === id);
        set((state) => ({
          coas: state.coas.map((c) => (c.id === id ? { ...c, ...data } : c)),
        }));
        const updated = get().coas.find((c) => c.id === id);
        if (updated) {
          await get().syncTable('coas', updated);
          if (before) await get().logHistory({ table: 'coas', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
```

- [ ] **Step 3: Implement `createBankWithCoa`**

Immediately after the existing `addBankAccount` implementation (line ~2345-2348) add:

```ts
      createBankWithCoa: async (acc, coaName) => {
        await get().addCoa({
          id: uuidv4(),
          accountCode: acc.accountCode,
          accountName: coaName,
          accountType: 'Asset',
        });
        await get().addBankAccount(acc);
      },
```

(`uuidv4` is already imported in this file — confirm with `grep "uuidv4" src/lib/store.ts | head -1`.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "store.ts"; echo done`
Expected: no errors for `store.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat(store): add updateCoa and createBankWithCoa"
```

---

### Task 3: Store — rename bank syncs its COA name

**Files:**
- Modify: `src/lib/store.ts` (`updateBankAccount`, lines ~2349-2359)

- [ ] **Step 1: Add COA name sync inside `updateBankAccount`**

Replace the existing `updateBankAccount` body (lines ~2349-2359) with:

```ts
      updateBankAccount: async (id: string, data: Partial<BankAccount>) => {
        const before = get().bankAccounts.find(b => b.id === id);
        set((state) => ({
          bankAccounts: state.bankAccounts.map(b => b.id === id ? { ...b, ...data } : b)
        }));
        const updated = get().bankAccounts.find(b => b.id === id);
        if (updated) {
          await get().syncTable('bank_accounts', updated);
          // 1:1 coupling — keep the linked COA name in sync when the bank is renamed
          if (data.name && before && data.name !== before.name) {
            const coa = get().coas.find(c => c.accountCode === updated.accountCode);
            if (coa) await get().updateCoa(coa.id, { accountName: data.name });
          }
          if (before) await get().logHistory({ table: 'bank_accounts', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "store.ts"; echo done`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat(store): rename bank account syncs linked COA name"
```

---

### Task 4: Create-bank modal — auto code + Advanced editor

**Files:**
- Modify: `src/app/finance/cash-bank/page.tsx` (bankForm state line ~62; open handler; `handleCreateBank` lines ~108-161; create-modal COA section lines ~523-536)

- [ ] **Step 1: Extend `bankForm` state with `coaName` and pull store helpers**

Change the state initializer (line ~62) to:

```ts
  const [bankForm, setBankForm] = useState({ name: '', number: '', balance: 0, accountCode: '', coaName: '' })
```

Near the other store selectors (where `addBankAccount` is selected) add:

```ts
  const createBankWithCoa = useAppStore(state => state.createBankWithCoa)
```

And add the import at the top of the file:

```ts
import { nextBankCoaCode } from "@/lib/coa"
```

- [ ] **Step 2: Prefill code + name when the add modal opens**

Find the trigger that sets `setIsAddBankOpen(true)` (the "Daftar Bank Baru" button). Replace its `onClick` with a handler that prefills:

```tsx
onClick={() => {
  const code = nextBankCoaCode(coas)
  setBankForm({ name: '', number: '', balance: 0, accountCode: code, coaName: '' })
  setIsAddBankOpen(true)
}}
```

- [ ] **Step 3: Replace the COA picker with an Advanced disclosure**

Replace the create-modal COA block (lines ~523-536, the `<div className="space-y-1">` containing "Link ke Buku Besar (COA)") with:

```tsx
                    <details className="rounded-xl bg-slate-50 px-3 py-2">
                       <summary className="text-[10px] font-black uppercase text-slate-400 tracking-widest cursor-pointer">
                          Lanjutan: Akun Buku Besar (COA)
                       </summary>
                       <div className="mt-2 space-y-2">
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-slate-400">Kode COA</label>
                             <Input value={bankForm.accountCode}
                                onChange={(e) => setBankForm({ ...bankForm, accountCode: e.target.value })}
                                className="h-10 rounded-xl" />
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-slate-400">Nama COA (kosong = nama bank)</label>
                             <Input value={bankForm.coaName}
                                onChange={(e) => setBankForm({ ...bankForm, coaName: e.target.value })}
                                placeholder={bankForm.name}
                                className="h-10 rounded-xl" />
                          </div>
                       </div>
                    </details>
```

(`Input` is already imported in this file — confirm with `grep "import.*Input" src/app/finance/cash-bank/page.tsx`.)

- [ ] **Step 4: Enforce uniqueness + use `createBankWithCoa` in `handleCreateBank`**

In `handleCreateBank`, replace the guard line (line ~112 `if (!bankForm.name) ...`) and the `addBankAccount({...})` call (lines ~117-123) with:

```ts
    if (!bankForm.name) return toast.error("Nama bank harus diisi!")
    if (!bankForm.accountCode) return toast.error("Kode COA tidak boleh kosong.")
    if (coas.some(c => c.accountCode === bankForm.accountCode)) {
      return toast.error(`Kode COA ${bankForm.accountCode} sudah dipakai. Ganti kode di bagian Lanjutan.`)
    }
    setIsSubmitting(true)
    const loadingToast = toast.loading("Mendaftarkan akun bank baru...")
    try {
      const bankId = `bank-${Date.now()}`
      await createBankWithCoa({
        id: bankId,
        name: bankForm.name,
        accountNumber: bankForm.number,
        accountCode: bankForm.accountCode,
        balance: bankForm.balance
      }, bankForm.coaName.trim() || bankForm.name)
```

Then update the reset line (~154) to:

```ts
      setBankForm({ name: '', number: '', balance: 0, accountCode: '', coaName: '' })
```

(The opening-balance journal block at lines ~125-151 is unchanged — it already posts to `bankForm.accountCode`, which now resolves to the freshly created COA.)

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "cash-bank"; echo done`
Run: `npx eslint src/app/finance/cash-bank/page.tsx`
Expected: no errors.

- [ ] **Step 6: Manual check**

Run `npm run dev`, open `/finance/cash-bank`, click "Daftar Bank Baru". Confirm: no COA dropdown; "Lanjutan" shows a prefilled code (e.g. `1-1100`); create a bank "Test Bank"; confirm it saves and a COA `1-1100 - Test Bank` exists (visible in `/finance/ledger` or the edit modal). Delete the test bank afterward.

- [ ] **Step 7: Commit**

```bash
git add src/app/finance/cash-bank/page.tsx
git commit -m "feat(cash-bank): auto-create dedicated COA when adding a bank"
```

---

### Task 5: Edit-bank modal — show "code - name", edit code safely

**Files:**
- Modify: `src/app/finance/cash-bank/page.tsx` (`handleUpdateBank` lines ~163-238; edit-modal COA section lines ~839-853)

- [ ] **Step 1: Replace the edit-modal COA section with a display + Advanced code editor**

Replace lines ~839-853 (the `<div className="space-y-1">` with "Link ke Buku Besar (COA)" `Select`) with:

```tsx
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 text-center block">Akun Buku Besar (COA)</label>
              <p className="text-center font-bold text-slate-700">
                {editingBank?.accountCode} - {coas.find(c => c.accountCode === editingBank?.accountCode)?.accountName || '—'}
              </p>
              <details className="rounded-xl bg-slate-50 px-3 py-2">
                <summary className="text-[10px] font-black uppercase text-slate-400 tracking-widest cursor-pointer">Ubah kode COA</summary>
                <Input
                  value={editingBank?.accountCode || ''}
                  onChange={(e) => setEditingBank({ ...editingBank, accountCode: e.target.value })}
                  className="h-10 rounded-xl mt-2"
                />
              </details>
            </div>
```

- [ ] **Step 2: Persist a COA code change (and uniqueness) in `handleUpdateBank`**

At the very start of `handleUpdateBank` body, right after the `if (!original) return` (line ~166), add the code-change handling:

```ts
    const newCode = editingBank.accountCode
    if (newCode !== original.accountCode) {
      if (coas.some(c => c.accountCode === newCode)) {
        return toast.error(`Kode COA ${newCode} sudah dipakai bank lain.`)
      }
      const linkedCoa = coas.find(c => c.accountCode === original.accountCode)
      if (linkedCoa) await updateCoa(linkedCoa.id, { accountCode: newCode })
    }
```

Add the store selector near the others:

```ts
  const updateCoa = useAppStore(state => state.updateCoa)
```

(The existing `updateBankAccount(editingBank.id, { name, accountNumber, accountCode })` call at lines ~231-235 then persists the bank's new `accountCode`, and the rename-sync from Task 3 handles the name. No further change needed there.)

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "cash-bank"; echo done`
Run: `npx eslint src/app/finance/cash-bank/page.tsx`
Expected: no errors.

- [ ] **Step 4: Manual check**

In `/finance/cash-bank`, edit a bank: the COA shows `code - name`; rename the bank and save → reopen, COA name follows the new bank name; open "Ubah kode COA", set it to an already-used code → save is blocked with a toast.

- [ ] **Step 5: Commit**

```bash
git add src/app/finance/cash-bank/page.tsx
git commit -m "feat(cash-bank): edit modal shows COA code+name and edits code safely"
```

---

### Task 6: Display "code - name" in the create-modal selected value (cleanup)

**Files:**
- Modify: `src/app/finance/cash-bank/page.tsx`

- [ ] **Step 1: Verify no remaining bare-code COA display**

Run: `grep -n "Link ke Buku Besar\|SelectValue placeholder=\"Pilih Akun\"" src/app/finance/cash-bank/page.tsx; echo done`
Expected: after Tasks 4-5 there should be **no** matches for "Link ke Buku Besar" (both COA pickers replaced). If any `Select`-based COA picker remains anywhere in the file, replace its `<SelectItem>` text and selected display to render `{c.accountCode} - {c.accountName}` and ensure the closed `<SelectValue>` resolves the name from `coas`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "cash-bank"; echo done`
Expected: no errors.

- [ ] **Step 3: Commit (only if changes were needed)**

```bash
git add src/app/finance/cash-bank/page.tsx
git commit -m "fix(cash-bank): render COA as code - name everywhere"
```

If Step 1 found nothing to change, skip this commit.

---

### Task 7: One-pass repair script for existing banks

**Files:**
- Create: `scripts/repair-bank-coa.js`

- [ ] **Step 1: Write the repair script**

Create `scripts/repair-bank-coa.js`:

```js
#!/usr/bin/env node
/**
 * repair-bank-coa.js — one-pass fix so every bank owns a unique, dedicated COA.
 *
 * Rules:
 *  - For a COA code shared by >=2 banks: the bank whose name matches the COA's
 *    account_name keeps it (else the first by id). Every other bank on that code
 *    is reassigned a fresh code (nextBankCoaCode) + a new COA row (name = bank name).
 *  - The keeper's COA account_name is set to the keeper bank's name.
 *  - Any bank whose account_code has no COA row gets one minted.
 *
 * Does NOT touch balances or historical journal lines (that is Paket B).
 *
 * Creds from env (production by default):
 *   NEXT_PUBLIC_SUPABASE_URL_PRODUCTION  (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY_PRODUCTION (or SUPABASE_SERVICE_ROLE_KEY)
 *
 * Usage:
 *   node scripts/repair-bank-coa.js            # DRY RUN
 *   node scripts/repair-bank-coa.js --commit   # APPLY
 */
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

const COMMIT = process.argv.includes('--commit');
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION || process.env.SUPABASE_SERVICE_ROLE_KEY;
function die(m) { console.error('\n❌ ' + m + '\n'); process.exit(1); }
if (!URL || !KEY) die('Set NEXT_PUBLIC_SUPABASE_URL_PRODUCTION and SUPABASE_SERVICE_ROLE_KEY_PRODUCTION in your shell.');

function nextBankCoaCode(usedSet) {
  for (let h = 0; h <= 9; h++) { const c = `1-1${h}00`; if (!usedSet.has(c)) return c; }
  for (let x = 0; x <= 9; x++) for (let y = 1; y <= 9; y++) { const c = `1-1${x}${y}0`; if (!usedSet.has(c)) return c; }
  throw new Error('No free bank COA code in 1-1xxx');
}

const s = createClient(URL, KEY, { auth: { persistSession: false } });

(async () => {
  console.log(`\n=== repair-bank-coa  [${COMMIT ? 'COMMIT' : 'DRY RUN'}] ===`);
  console.log('Target:', URL, '\n');

  const { data: banks, error: be } = await s.from('bank_accounts').select('id,name,account_code,balance');
  if (be) die('read banks: ' + be.message);
  const { data: coas, error: ce } = await s.from('coas').select('id,account_code,account_name,account_type');
  if (ce) die('read coas: ' + ce.message);

  const used = new Set(coas.map(c => c.account_code));
  const byCode = new Map();
  banks.forEach(b => { if (!byCode.has(b.account_code)) byCode.set(b.account_code, []); byCode.get(b.account_code).push(b); });

  const plan = []; // {kind, ...}

  for (const [code, group] of byCode) {
    const coa = coas.find(c => c.account_code === code);
    if (group.length > 1) {
      // pick keeper
      let keeper = group.find(b => coa && b.name === coa.account_name) || group.slice().sort((a, b) => a.id.localeCompare(b.id))[0];
      for (const b of group) {
        if (b.id === keeper.id) continue;
        const newCode = nextBankCoaCode(used); used.add(newCode);
        plan.push({ kind: 'reassign', bank: b, oldCode: code, newCode, coaId: randomUUID(), coaName: b.name });
      }
      if (coa && coa.account_name !== keeper.name) plan.push({ kind: 'rename-coa', coaId: coa.id, from: coa.account_name, to: keeper.name });
    }
    if (!coa) {
      // bank with no COA row at all
      for (const b of group) plan.push({ kind: 'mint', bank: b, code, coaId: randomUUID(), coaName: b.name });
    }
  }

  if (!plan.length) { console.log('✅ Nothing to repair — every bank already owns a unique COA.\n'); process.exit(0); }

  console.log('--- PLAN ---');
  plan.forEach(p => {
    if (p.kind === 'reassign') console.log(`  reassign  ${p.bank.name} (${p.bank.id}): ${p.oldCode} -> ${p.newCode}  + new COA "${p.coaName}"`);
    if (p.kind === 'rename-coa') console.log(`  rename COA ${p.coaId}: "${p.from}" -> "${p.to}"`);
    if (p.kind === 'mint') console.log(`  mint COA  ${p.code} "${p.coaName}" for bank ${p.bank.name}`);
  });

  if (!COMMIT) { console.log('\nDRY RUN — nothing written. Re-run with --commit.\n'); process.exit(0); }

  console.log('\nApplying...');
  for (const p of plan) {
    if (p.kind === 'reassign') {
      let r = await s.from('coas').insert({ id: p.coaId, account_code: p.newCode, account_name: p.coaName, account_type: 'Asset' });
      if (r.error) die(`insert coa ${p.newCode}: ${r.error.message}`);
      r = await s.from('bank_accounts').update({ account_code: p.newCode }).eq('id', p.bank.id);
      if (r.error) die(`update bank ${p.bank.id}: ${r.error.message}`);
    } else if (p.kind === 'rename-coa') {
      const r = await s.from('coas').update({ account_name: p.to }).eq('id', p.coaId);
      if (r.error) die(`rename coa ${p.coaId}: ${r.error.message}`);
    } else if (p.kind === 'mint') {
      const r = await s.from('coas').insert({ id: p.coaId, account_code: p.code, account_name: p.coaName, account_type: 'Asset' });
      if (r.error) die(`mint coa ${p.code}: ${r.error.message}`);
    }
  }
  console.log(`\n✅ Applied ${plan.length} change(s). Re-run dry to confirm idempotency.\n`);
})().catch(e => die(e.message || String(e)));
```

- [ ] **Step 2: Dry-run against the dev DB to prove it parses and reads**

Run (dev creds — the same project used by `scripts/fix-advance-source.js`):

```bash
NEXT_PUBLIC_SUPABASE_URL="https://plzkrzzmqatjgsitvmfd.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<dev-service-key-from-force-zero-bank.js>" \
node scripts/repair-bank-coa.js
```

Expected: prints banks/coas, then either a PLAN or "Nothing to repair". (The dev DB has unique codes, so likely "Nothing to repair" — that proves the read path + idempotency guard work.)

- [ ] **Step 3: Commit**

```bash
git add scripts/repair-bank-coa.js
git commit -m "feat(scripts): one-pass repair so each bank owns a unique COA"
```

- [ ] **Step 4: Production run (manual, by the user — NOT automated)**

Document in the PR description: the user runs, with production creds exported in their shell:

```bash
node scripts/repair-bank-coa.js            # review the PLAN (Bank Jago: 1-1000 -> 1-1100)
node scripts/repair-bank-coa.js --commit   # apply
```

Do **not** run this against production from the implementation session — production creds are not available here.

---

## Self-Review

**Spec coverage:**
- New bank auto COA + editable → Task 4. ✓
- Existing conflicting banks repaired → Task 7. ✓
- 1:1 coupling / rename syncs COA → Task 3 + Task 5. ✓
- Display "code - name" → Task 5 (edit) + Task 6 (sweep). ✓
- `updateCoa` added → Task 2. ✓
- Code generation rule → Task 1. ✓
- Out of scope (balances, historical journal) → not implemented here; Task 7 Step 4 notes Paket B. ✓

**Placeholder scan:** No "TBD"/"handle edge cases". The one `<dev-service-key-from-force-zero-bank.js>` is an explicit instruction to copy a known value, not a code placeholder.

**Type consistency:** `nextBankCoaCode(coas)` signature consistent across Tasks 1/4/7; `createBankWithCoa(acc, coaName)` consistent Tasks 2/4; `updateCoa(id, data)` consistent Tasks 2/3/5. Store selectors `createBankWithCoa`/`updateCoa` added before use.

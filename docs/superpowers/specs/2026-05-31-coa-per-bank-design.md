# Design Spec: COA per Bank Account (Paket A)

Each bank/cash account owns exactly one dedicated Chart-of-Accounts (COA) entry.
A new bank auto-creates its COA; renaming the bank renames the COA; existing banks
that share or mis-map a COA code are repaired once. This removes the class of bugs
where two accounts collide on one ledger code (e.g. Bank Jago and Kas Tunai both
mapped to `1-1000`).

This is **Paket A** of a larger effort. Paket B ("Edit Transaksi beneral / type-aware")
is a separate spec and fixes the historical/journal mis-postings (including the
Bank Jago negative balance). Paket A only fixes the *structure* of bank↔COA going forward.

## Problem Description

On `/finance/cash-bank`:

1. **Shared/duplicate COA codes.** When adding a bank, the user picks an `accountCode`
   from a dropdown of *existing* asset COAs (`coas.filter(Asset && code starts "1-1")`).
   Nothing prevents two banks from selecting the same code. In production, **Bank Jago
   and Kas Tunai both map to `1-1000`**, so Bank Jago's ledger postings land on Kas
   Tunai's account.
2. **No way to create a COA per bank.** The create/edit flow can only *link* to a
   pre-existing COA, not mint a new dedicated one. The store has `addCoa` but no
   `updateCoa`.
3. **COA display shows code only in practice.** The dropdown options render
   `code - name`, but the selected/closed value and the user's mental model is just a
   bare code (`1-1000`), which is meaningless to a non-accountant.

## Decisions (from brainstorming)

- New bank → **auto-generated** next-free code, name = bank name, **editable** (advanced).
- Existing conflicting banks → **repaired in one pass** (auto-assign new dedicated COA).
- Bank ↔ COA are **1:1 and coupled**: rename bank renames its COA; no manual
  "link to existing COA" picker. Code editable but uniqueness enforced.

## Data Model

`ChartOfAccount` (table `coas`): `{ id, accountCode, accountName, accountType }`.
`BankAccount` (table `bank_accounts`): has `accountCode` linking to a COA.

Invariant after this work: for every `BankAccount` there is exactly one `coas` row
where `coas.accountCode === bankAccount.accountCode`, `accountType === 'Asset'`, and no
other bank account shares that code.

**Balance note:** `bank_accounts.balance` is DB-authoritative (not derived from journal
lines). Paket A does **not** touch balances or historical journal lines. Reassigning a
bank's code affects only *future* postings; historical GL repair is Paket B's job.

## Code Generation Rule

Bank/cash COAs live in `1-1000` … `1-1900`, stepping by 100 (existing seed:
`1-1000` Kas Tunai, `1-1200` BCA, `1-1300` Mandiri, `1-1400` BRI, `1-1500` Kas Sourcing).

`nextBankCoaCode()`:
- Collect all `coas.accountCode` matching `/^1-1\d00$/`.
- Walk `1-1000, 1-1100, … 1-1900`; return the first not present.
- If the band is exhausted, fall back to scanning `1-1010, 1-1020, …` for any free
  `1-1xxx` slot. (Throw a clear error if truly none remain — 90 slots is ample.)

## Proposed Changes

### 1. Store (`src/lib/store.ts`)

- Add `updateCoa(id, data: Partial<ChartOfAccount>)` mirroring `updateBankAccount`
  (optimistic set + `syncTable('coas', updated)` + `logHistory`).
- Add a helper `createBankWithCoa(acc: BankAccount, coaName: string)` OR keep the
  orchestration in the page (see note). It must, in order:
  1. mint COA via `addCoa({ id: uuid, accountCode: acc.accountCode, accountName: coaName, accountType: 'Asset' })`
  2. `addBankAccount(acc)`
  Keeping orchestration in the page is acceptable since `addCoa`/`addBankAccount`
  already exist; a thin store helper is preferred for testability. **Decision: add the
  store helper `createBankWithCoa` so the invariant lives in one place.**
- `updateBankAccount`: when `name` changes, also `updateCoa` the linked COA's
  `accountName` to match (look up COA by the bank's current `accountCode`).

### 2. Create-bank modal (`cash-bank/page.tsx`, `handleCreateBank` + form)

- Remove the "Link ke Buku Besar (COA)" **picker of existing COAs**.
- On open, prefill `bankForm.accountCode = nextBankCoaCode()`.
- Show an **Advanced/Lanjutan** disclosure containing an editable code field and an
  editable COA-name field (default = bank name). Most users never open it.
- Validate code uniqueness against existing `coas` before save; toast error on clash.
- On save: call `createBankWithCoa(...)`, then post the opening-balance journal exactly
  as today (debit bank COA code, credit `3-1000`).

### 3. Edit-bank modal (`cash-bank/page.tsx`, `editingBank` + `handleSaveBank`)

- Keep the COA section but as a **read-mostly** "kode - nama" display with an
  Advanced toggle to edit the code (uniqueness-checked).
- Remove the "link to any existing COA" dropdown semantics; the field edits *this
  bank's own* COA only.
- On save, `updateBankAccount` (which now syncs the COA name on rename). If the code
  was changed, persist both `bank_accounts.accountCode` and the `coas.accountCode`
  (via `updateCoa`) so they stay paired.

### 4. Display (`cash-bank/page.tsx` and any COA `<SelectValue>`)

- Ensure the closed/selected value renders `code - name`, not just the code, by giving
  `<SelectValue>` explicit children that resolve the COA name from `coas`.

### 5. One-pass repair for existing banks

A migration script `scripts/repair-bank-coa.js` (env-credentialed, dry-run-first,
idempotent — same conventions as `scripts/fix-advance-source.js`):

- Load `bank_accounts` + `coas`.
- For each COA code shared by ≥2 banks: the bank whose `name` matches the COA's
  `accountName` keeps the code; if none match, the first (stable order) keeps it.
  Every other bank on that code is **reassigned**: mint a new COA via
  `nextBankCoaCode()` (name = bank name), set the bank's `accountCode` to it.
- For the keeper, set its COA `accountName = bank.name` (so Kas Tunai stays Kas Tunai).
- For any bank whose `accountCode` has **no** COA row, mint one.
- Dry-run prints the full before/after table; `--commit` applies.

Expected on production: Bank Jago → new `1-1100` (COA "Bank Jago"); Kas Tunai keeps
`1-1000`. Bank Jago's *balance* and past journal lines are untouched here (Paket B).

## Out of Scope (Paket B)

- Fixing the Bank Jago negative balance.
- Re-pointing historical journal lines / cash transactions.
- Type-aware transaction editing (Masuk/Keluar/Pindah).

## Testing

- Unit: `nextBankCoaCode()` returns `1-1100` given the seed set; returns next after
  filling; errors when band exhausted.
- Store: `createBankWithCoa` creates exactly one COA + one bank with matching code;
  `updateBankAccount` rename propagates to COA name.
- Manual: add a bank → COA appears in ledger, code unique, dropdown shows "kode - nama";
  rename bank → COA name follows; edit code to a taken value → blocked with toast.
- Migration on a seeded copy: Bank Jago ends on `1-1100`, Kas Tunai on `1-1000`,
  every bank has a unique dedicated COA; re-running makes no further changes.

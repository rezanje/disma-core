# Tukar Faktur (TF) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement weekly batch invoice exchange document (Tukar Faktur) per client with auto-period detection (cross-month split), atomic Issue/Delete RPCs, anti-double FK lock, and full UI (list + detail + generate modal + cross-link badge).

**Architecture:** New `tukar_faktur` table 1:N with `invoices` via nullable `tukar_faktur_id` FK. Period algorithm in pure helper module. Atomic state transitions via Postgres RPC (FOR UPDATE re-validation). Auto-paid trigger fires when all linked invoices become Paid.

**Tech Stack:** Next.js 16.1, React 19, Supabase JS, Postgres RPC, Zustand (existing store), Tailwind, lucide-react. Profile dispatch via existing `resolveSupabaseEnv`. No automated test framework — helper tests run via standalone node scripts in `scripts/`.

**Spec:** `docs/superpowers/specs/2026-05-27-tukar-faktur-design.md`

---

## File Structure

| File | Status | Purpose |
|---|---|---|
| `supabase/migrations/20260527_tukar_faktur.sql` | Create | DDL + RPC pair + auto-paid trigger |
| `src/types/index.ts` | Modify | Add `TukarFakturStatus`, `TukarFaktur`, `invoice.tukarFakturId` |
| `src/lib/tukar-faktur.ts` | Create | Pure helpers: `mondayOf`, `sundayOf`, `lastDayOfMonth`, `tfPeriodFor`, `getISOWeek`, `generateTfNumber` |
| `scripts/test-tukar-faktur.js` | Create | Standalone node test runner for helpers |
| `src/lib/store.ts` | Modify | Add `tukarFakturs` slice + CRUD (`addTukarFaktur`, `updateTukarFaktur`, `deleteTukarFaktur`, `issueTukarFaktur`) |
| `src/lib/navigation.tsx` | Modify | Add menu entry under Finance |
| `src/app/finance/tukar-faktur/page.tsx` | Create | List page (filters + KPIs + table + Generate button) |
| `src/components/tukar-faktur/GenerateTfModal.tsx` | Create | Client select + period detect + invoice checkbox list + Save/Issue |
| `src/app/finance/tukar-faktur/[id]/page.tsx` | Create | Detail page (header + invoice list + inline edit dueDate + bulk override + tanda terima + print) |
| `src/app/finance/invoices/page.tsx` | Modify | Badge column + lock dueDate when linked to Issued+ TF |
| `src/components/tukar-faktur/PrintTfTemplate.tsx` | Create | Printable cover sheet |

---

## Task 1: Create Migration File

**Files:**
- Create: `supabase/migrations/20260527_tukar_faktur.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260527_tukar_faktur.sql
-- Tukar Faktur (weekly invoice exchange document per client)

create table if not exists public.tukar_faktur (
  id uuid primary key default gen_random_uuid(),
  tf_number text unique not null,
  client_id text not null references public.clients(id),
  period_start date not null,
  period_end date not null,
  issue_date date not null,
  status text not null default 'Draft' check (status in ('Draft','Issued','Received','Paid')),
  total_amount numeric not null default 0,
  notes text,
  issued_by text,
  received_at timestamptz,
  received_by text,
  created_at timestamptz not null default now()
);

create index if not exists tukar_faktur_client_period_idx on public.tukar_faktur(client_id, period_start);
create index if not exists tukar_faktur_status_idx on public.tukar_faktur(status);

alter table public.tukar_faktur disable row level security;

alter table public.invoices
  add column if not exists tukar_faktur_id uuid references public.tukar_faktur(id) on delete set null;
create index if not exists invoices_tukar_faktur_id_idx on public.invoices(tukar_faktur_id);

-- RPC: atomic issue. Re-validates each invoice still unlinked under FOR UPDATE,
-- then links them and recomputes due_date = issue_date + client.payment_term_days.
create or replace function public.issue_tukar_faktur(
  p_tf_id uuid,
  p_invoice_ids text[],
  p_issue_date date,
  p_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_term_days int;
  v_total numeric := 0;
  v_conflict text;
  v_inv record;
begin
  select client_id into v_client_id from public.tukar_faktur where id = p_tf_id for update;
  if v_client_id is null then
    raise exception 'tukar_faktur % not found', p_tf_id;
  end if;

  select payment_term_days into v_term_days from public.clients where id = v_client_id;
  if v_term_days is null then v_term_days := 30; end if;

  for v_inv in
    select id, total_amount, tukar_faktur_id, client_id
    from public.invoices
    where id = any(p_invoice_ids)
    for update
  loop
    if v_inv.tukar_faktur_id is not null and v_inv.tukar_faktur_id <> p_tf_id then
      raise exception 'Invoice % sudah di TF lain (%).', v_inv.id, v_inv.tukar_faktur_id;
    end if;
    if v_inv.client_id <> v_client_id then
      raise exception 'Invoice % bukan milik klien TF ini.', v_inv.id;
    end if;
    v_total := v_total + coalesce(v_inv.total_amount, 0);
  end loop;

  update public.invoices
     set tukar_faktur_id = p_tf_id,
         due_date = (p_issue_date + (v_term_days || ' days')::interval)::date::text
   where id = any(p_invoice_ids);

  update public.tukar_faktur
     set status = 'Issued',
         issue_date = p_issue_date,
         issued_by = p_user_id,
         total_amount = v_total
   where id = p_tf_id;

  return jsonb_build_object('ok', true, 'tf_id', p_tf_id, 'total', v_total, 'invoice_count', array_length(p_invoice_ids, 1));
end;
$$;

-- RPC: atomic delete. Draft drops directly. Issued reverts invoice links + due_date.
create or replace function public.delete_tukar_faktur(p_tf_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_client_id text;
  v_term_days int;
begin
  select status, client_id into v_status, v_client_id
    from public.tukar_faktur where id = p_tf_id for update;
  if v_status is null then
    raise exception 'tukar_faktur % not found', p_tf_id;
  end if;
  if v_status not in ('Draft', 'Issued') then
    raise exception 'TF status % tidak bisa dihapus (hanya Draft/Issued).', v_status;
  end if;

  select payment_term_days into v_term_days from public.clients where id = v_client_id;
  if v_term_days is null then v_term_days := 30; end if;

  update public.invoices
     set tukar_faktur_id = null,
         due_date = (issue_date::date + (v_term_days || ' days')::interval)::date::text
   where tukar_faktur_id = p_tf_id;

  delete from public.tukar_faktur where id = p_tf_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Trigger: when an invoice goes fully Paid, check if its TF is fully paid and auto-promote.
create or replace function public.tf_check_auto_paid() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unpaid_count int;
begin
  if NEW.tukar_faktur_id is null then return NEW; end if;
  if NEW.status <> 'Paid' then return NEW; end if;

  select count(*) into v_unpaid_count
    from public.invoices
   where tukar_faktur_id = NEW.tukar_faktur_id
     and status <> 'Paid';

  if v_unpaid_count = 0 then
    update public.tukar_faktur set status = 'Paid' where id = NEW.tukar_faktur_id and status <> 'Paid';
  end if;
  return NEW;
end;
$$;

drop trigger if exists invoices_tf_auto_paid on public.invoices;
create trigger invoices_tf_auto_paid
  after update of status on public.invoices
  for each row
  when (NEW.tukar_faktur_id is not null and NEW.status = 'Paid')
  execute function public.tf_check_auto_paid();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260527_tukar_faktur.sql
git commit -m "feat(tf): migration for tukar_faktur table + RPC + auto-paid trigger"
```

---

## Task 2: Apply Migration to Local DB

**Files:**
- Read: `supabase/migrations/20260527_tukar_faktur.sql`

- [ ] **Step 1: Apply migration via supabase-js admin client**

Run this exact command (writes nothing to repo, just executes the SQL on local DB):

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL_LOCAL, process.env.SUPABASE_SERVICE_ROLE_KEY_LOCAL);
(async () => {
  const sql = fs.readFileSync('supabase/migrations/20260527_tukar_faktur.sql', 'utf8');
  const { data, error } = await sb.rpc('exec_sql', { sql_text: sql });
  if (error) { console.error('FAILED', error); process.exit(1); }
  console.log('OK', data);
})();
"
```

Expected: `OK ...`. If `exec_sql` RPC missing on local, fall back to Supabase SQL editor — paste the migration file content there and run.

- [ ] **Step 2: Verify schema**

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL_LOCAL, process.env.SUPABASE_SERVICE_ROLE_KEY_LOCAL);
(async () => {
  const { data, error } = await sb.from('tukar_faktur').select('id').limit(0);
  console.log('tukar_faktur table:', error ? 'ERR ' + error.message : 'OK');
  const { error: e2 } = await sb.from('invoices').select('tukar_faktur_id').limit(1);
  console.log('invoices.tukar_faktur_id column:', e2 ? 'ERR ' + e2.message : 'OK');
})();
"
```

Expected: both `OK`.

---

## Task 3: Apply Migration to Production

**Files:**
- Read: `supabase/migrations/20260527_tukar_faktur.sql`

- [ ] **Step 1: Apply same migration to production**

Same node one-liner but swap `_LOCAL` → `_PRODUCTION`:

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION, process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION);
(async () => {
  const sql = fs.readFileSync('supabase/migrations/20260527_tukar_faktur.sql', 'utf8');
  const { data, error } = await sb.rpc('exec_sql', { sql_text: sql });
  if (error) { console.error('FAILED', error); process.exit(1); }
  console.log('OK', data);
})();
"
```

If `exec_sql` not present in production, use Supabase Studio SQL editor for the production project (ckkohudfuisgzlrjipev) and paste the file contents.

- [ ] **Step 2: Verify production schema**

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION, process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION);
(async () => {
  const { error } = await sb.from('tukar_faktur').select('id').limit(0);
  console.log('prod tukar_faktur table:', error ? 'ERR ' + error.message : 'OK');
})();
"
```

Expected: `OK`.

---

## Task 4: Write `tfPeriodFor` Helper

**Files:**
- Create: `src/lib/tukar-faktur.ts`

- [ ] **Step 1: Write the helper module**

```ts
// src/lib/tukar-faktur.ts
// Pure helpers for Tukar Faktur period detection + numbering.
// No I/O, no React, no Supabase — safe to unit test from node.

export interface TfPeriod {
  periodStart: Date;
  periodEnd: Date;
  issueDate: Date;
}

export function mondayOf(d: Date): Date {
  const day = d.getDay() || 7; // Sunday (0) → 7
  const m = new Date(d);
  m.setDate(d.getDate() - (day - 1));
  m.setHours(0, 0, 0, 0);
  return m;
}

export function sundayOf(d: Date): Date {
  const m = mondayOf(d);
  m.setDate(m.getDate() + 6);
  return m;
}

export function lastDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function tfPeriodFor(deliveryDate: Date): TfPeriod {
  const d = new Date(deliveryDate);
  d.setHours(0, 0, 0, 0);
  const weekStart = mondayOf(d);
  const weekEnd = sundayOf(d);
  const crossesMonth = weekStart.getMonth() !== weekEnd.getMonth();

  if (!crossesMonth) {
    const issue = new Date(weekEnd);
    issue.setDate(issue.getDate() + 1);
    return { periodStart: weekStart, periodEnd: weekEnd, issueDate: issue };
  }

  const isInFirstMonth = d.getMonth() === weekStart.getMonth();
  if (isInFirstMonth) {
    const segEnd = lastDayOfMonth(weekStart);
    return { periodStart: weekStart, periodEnd: segEnd, issueDate: segEnd };
  }
  const segStart = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), 1);
  const issue = new Date(weekEnd);
  issue.setDate(issue.getDate() + 1);
  return { periodStart: segStart, periodEnd: weekEnd, issueDate: issue };
}

export function getISOWeek(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function generateTfNumber(
  clientId: string,
  period: TfPeriod,
  existingCount: number
): string {
  const year = period.periodEnd.getFullYear();
  const isMonthEndSegment =
    period.periodEnd.getTime() === lastDayOfMonth(period.periodEnd).getTime();
  const label = isMonthEndSegment
    ? String(period.periodEnd.getMonth() + 1).padStart(2, '0')
    : `W${String(getISOWeek(period.periodEnd)).padStart(2, '0')}`;
  const seq = String(existingCount + 1).padStart(2, '0');
  return `TF-${year}-${label}-${clientId.slice(0, 6).toUpperCase()}-${seq}`;
}

export function periodKey(period: TfPeriod): string {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return `${iso(period.periodStart)}_${iso(period.periodEnd)}`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "tukar-faktur" || echo "no tf errors"
```

Expected: `no tf errors`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tukar-faktur.ts
git commit -m "feat(tf): period detection + TF number helpers"
```

---

## Task 5: Write Helper Tests

**Files:**
- Create: `scripts/test-tukar-faktur.js`

- [ ] **Step 1: Write the test runner**

```js
#!/usr/bin/env node
// scripts/test-tukar-faktur.js
// Standalone tests for src/lib/tukar-faktur.ts helpers.
// Run: node scripts/test-tukar-faktur.js

require('ts-node/register/transpile-only');
const {
  mondayOf,
  sundayOf,
  lastDayOfMonth,
  tfPeriodFor,
  getISOWeek,
  generateTfNumber,
} = require('../src/lib/tukar-faktur.ts');

let pass = 0;
let fail = 0;
function assert(label, cond) {
  if (cond) { pass++; console.log('  ✓', label); }
  else      { fail++; console.error('  ✗', label); }
}
function eqDate(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

console.log('mondayOf / sundayOf');
{
  const wed = new Date(2026, 4, 6); // Wed 6 May 2026
  assert('monday of Wed 6 May = Mon 4 May', eqDate(mondayOf(wed), new Date(2026, 4, 4)));
  assert('sunday of Wed 6 May = Sun 10 May', eqDate(sundayOf(wed), new Date(2026, 4, 10)));
  const sun = new Date(2026, 4, 10); // Sun 10 May
  assert('monday of Sun 10 May = Mon 4 May', eqDate(mondayOf(sun), new Date(2026, 4, 4)));
}

console.log('lastDayOfMonth');
{
  assert('Apr 2026 → 30', eqDate(lastDayOfMonth(new Date(2026, 3, 15)), new Date(2026, 3, 30)));
  assert('Feb 2024 (leap) → 29', eqDate(lastDayOfMonth(new Date(2024, 1, 1)), new Date(2024, 1, 29)));
  assert('Dec 2025 → 31', eqDate(lastDayOfMonth(new Date(2025, 11, 1)), new Date(2025, 11, 31)));
}

console.log('tfPeriodFor — normal week');
{
  const p = tfPeriodFor(new Date(2026, 4, 5)); // Tue 5 May 2026
  assert('period start = Mon 4 May', eqDate(p.periodStart, new Date(2026, 4, 4)));
  assert('period end = Sun 10 May', eqDate(p.periodEnd, new Date(2026, 4, 10)));
  assert('issueDate = Mon 11 May', eqDate(p.issueDate, new Date(2026, 4, 11)));
}

console.log('tfPeriodFor — cross-month first segment (Apr week containing 30 Apr)');
{
  // Mon 27 Apr 2026 - Sun 3 May 2026 (cross-month, 30 Apr = Thu)
  const p = tfPeriodFor(new Date(2026, 3, 28)); // Tue 28 Apr (still in April)
  assert('period start = Mon 27 Apr', eqDate(p.periodStart, new Date(2026, 3, 27)));
  assert('period end = Thu 30 Apr', eqDate(p.periodEnd, new Date(2026, 3, 30)));
  assert('issueDate = Thu 30 Apr', eqDate(p.issueDate, new Date(2026, 3, 30)));
}

console.log('tfPeriodFor — cross-month second segment');
{
  const p = tfPeriodFor(new Date(2026, 4, 1)); // Fri 1 May (in May, same week)
  assert('period start = Fri 1 May', eqDate(p.periodStart, new Date(2026, 4, 1)));
  assert('period end = Sun 3 May', eqDate(p.periodEnd, new Date(2026, 4, 3)));
  assert('issueDate = Mon 4 May', eqDate(p.issueDate, new Date(2026, 4, 4)));
}

console.log('tfPeriodFor — year boundary (Dec 31 = Wed)');
{
  // 2025-12-31 = Wed. Week: Mon 29 Dec 2025 - Sun 4 Jan 2026.
  const p1 = tfPeriodFor(new Date(2025, 11, 30)); // Tue 30 Dec
  assert('Dec segment end = Wed 31 Dec', eqDate(p1.periodEnd, new Date(2025, 11, 31)));
  assert('Dec segment issue = Wed 31 Dec', eqDate(p1.issueDate, new Date(2025, 11, 31)));
  const p2 = tfPeriodFor(new Date(2026, 0, 2)); // Fri 2 Jan 2026
  assert('Jan segment start = Thu 1 Jan', eqDate(p2.periodStart, new Date(2026, 0, 1)));
  assert('Jan segment end = Sun 4 Jan', eqDate(p2.periodEnd, new Date(2026, 0, 4)));
  assert('Jan segment issue = Mon 5 Jan', eqDate(p2.issueDate, new Date(2026, 0, 5)));
}

console.log('getISOWeek');
{
  assert('Mon 4 May 2026 = week 19', getISOWeek(new Date(2026, 4, 4)) === 19);
  assert('Mon 5 Jan 2026 = week 2', getISOWeek(new Date(2026, 0, 5)) === 2);
}

console.log('generateTfNumber');
{
  const weeklyPeriod = {
    periodStart: new Date(2026, 4, 4),
    periodEnd: new Date(2026, 4, 10),
    issueDate: new Date(2026, 4, 11),
  };
  const n1 = generateTfNumber('CLIENT001', weeklyPeriod, 0);
  assert('weekly format = TF-2026-W19-CLIENT-01', n1 === 'TF-2026-W19-CLIENT-01');

  const monthEndPeriod = {
    periodStart: new Date(2026, 3, 27),
    periodEnd: new Date(2026, 3, 30),
    issueDate: new Date(2026, 3, 30),
  };
  const n2 = generateTfNumber('CLIENT001', monthEndPeriod, 0);
  assert('month-end format = TF-2026-04-CLIENT-01', n2 === 'TF-2026-04-CLIENT-01');

  const n3 = generateTfNumber('CLIENT001', weeklyPeriod, 4);
  assert('sequence increments = TF-2026-W19-CLIENT-05', n3 === 'TF-2026-W19-CLIENT-05');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Install ts-node if missing**

```bash
npm list ts-node >/dev/null 2>&1 || npm install --save-dev ts-node
```

- [ ] **Step 3: Run tests**

```bash
node scripts/test-tukar-faktur.js
```

Expected: all `✓`, final line `XX passed, 0 failed`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/test-tukar-faktur.js package.json package-lock.json
git commit -m "test(tf): standalone node tests for period helpers"
```

---

## Task 6: Add TypeScript Types

**Files:**
- Modify: `src/types/index.ts` (around the existing `Invoice` interface near line 230 and 410)

- [ ] **Step 1: Locate the Invoice interface and current AR-related types**

```bash
grep -n "interface Invoice\|interface ARPiutang\|dueDate" src/types/index.ts | head -10
```

- [ ] **Step 2: Add the TukarFaktur types after the Invoice interface**

Find the line that closes the primary `Invoice` interface (the one in the `Invoice` block around line 230). Immediately after the closing `}`, insert:

```ts
export type TukarFakturStatus = 'Draft' | 'Issued' | 'Received' | 'Paid';

export interface TukarFaktur {
  id: string;
  tfNumber: string;
  clientId: string;
  periodStart: string;
  periodEnd: string;
  issueDate: string;
  status: TukarFakturStatus;
  totalAmount: number;
  notes?: string;
  issuedBy?: string;
  receivedAt?: string;
  receivedBy?: string;
  createdAt: string;
}
```

- [ ] **Step 3: Add `tukarFakturId?: string` to the Invoice interface**

Inside the primary `Invoice` interface body, add this line right after `dueDate`:

```ts
  tukarFakturId?: string;
```

- [ ] **Step 4: Verify typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: no errors related to TukarFaktur or tukarFakturId.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(tf): add TukarFaktur types + invoice.tukarFakturId"
```

---

## Task 7: Add Store Slice + CRUD

**Files:**
- Modify: `src/lib/store.ts` (locate the area where `invoices`/`addInvoice` is defined and append after)

- [ ] **Step 1: Locate insertion point**

```bash
grep -n "addInvoice\|updateInvoice\|invoices: \[" src/lib/store.ts | head -10
```

Note the line where `addInvoice` / `updateInvoice` are defined.

- [ ] **Step 2: Add imports at the top of store.ts (only if missing)**

Find the existing `import type { ... } from '@/types'` (or similar). Add `TukarFaktur` to the import list.

- [ ] **Step 3: Add state field + CRUD methods**

Insert the following block immediately after the `updateInvoice` implementation (mirror the existing patterns for state slot + Supabase sync):

```ts
      tukarFakturs: [] as TukarFaktur[],

      addTukarFaktur: async (tf: TukarFaktur) => {
        set((state) => ({ tukarFakturs: [...state.tukarFakturs, tf] }));
        await get().syncTable('tukar_faktur', tf);
      },

      updateTukarFaktur: async (id: string, data: Partial<TukarFaktur>) => {
        const before = get().tukarFakturs.find(t => t.id === id);
        set((state) => ({
          tukarFakturs: state.tukarFakturs.map(t => t.id === id ? { ...t, ...data } : t)
        }));
        const updated = get().tukarFakturs.find(t => t.id === id);
        if (updated) {
          await get().syncTable('tukar_faktur', updated);
          if (before) await get().logHistory({ table: 'tukar_faktur', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },

      deleteTukarFaktur: async (id: string) => {
        const before = get().tukarFakturs.find(t => t.id === id);
        // Atomic delete via RPC (reverts invoice links + due_date)
        const { createClient } = await import('@supabase/supabase-js');
        const { resolveSupabaseEnv } = await import('@/lib/supabase-env');
        const env = resolveSupabaseEnv();
        const sb = createClient(env.url, env.anonKey);
        const { error } = await sb.rpc('delete_tukar_faktur', { p_tf_id: id });
        if (error) throw new Error(`Delete TF gagal: ${error.message}`);

        set((state) => ({
          tukarFakturs: state.tukarFakturs.filter(t => t.id !== id),
          invoices: state.invoices.map(inv => inv.tukarFakturId === id ? { ...inv, tukarFakturId: undefined } : inv),
        }));

        if (before) await get().logHistory({ table: 'tukar_faktur', recordId: id, action: 'delete', oldData: before, newData: null });
      },

      issueTukarFaktur: async (tfId: string, invoiceIds: string[], issueDate: string, userId: string) => {
        const { createClient } = await import('@supabase/supabase-js');
        const { resolveSupabaseEnv } = await import('@/lib/supabase-env');
        const env = resolveSupabaseEnv();
        const sb = createClient(env.url, env.anonKey);
        const { data, error } = await sb.rpc('issue_tukar_faktur', {
          p_tf_id: tfId,
          p_invoice_ids: invoiceIds,
          p_issue_date: issueDate,
          p_user_id: userId,
        });
        if (error) throw new Error(`Issue TF gagal: ${error.message}`);

        // Re-fetch fresh state for invoices + tf (server is the truth)
        const [{ data: tfRow }, { data: invRows }] = await Promise.all([
          sb.from('tukar_faktur').select('*').eq('id', tfId).single(),
          sb.from('invoices').select('*').in('id', invoiceIds),
        ]);
        if (tfRow) {
          const camelTf: TukarFaktur = {
            id: tfRow.id,
            tfNumber: tfRow.tf_number,
            clientId: tfRow.client_id,
            periodStart: tfRow.period_start,
            periodEnd: tfRow.period_end,
            issueDate: tfRow.issue_date,
            status: tfRow.status,
            totalAmount: Number(tfRow.total_amount) || 0,
            notes: tfRow.notes || undefined,
            issuedBy: tfRow.issued_by || undefined,
            receivedAt: tfRow.received_at || undefined,
            receivedBy: tfRow.received_by || undefined,
            createdAt: tfRow.created_at,
          };
          set(state => ({
            tukarFakturs: state.tukarFakturs.map(t => t.id === tfId ? camelTf : t),
          }));
        }
        if (invRows) {
          set(state => ({
            invoices: state.invoices.map(inv => {
              const fresh = invRows.find((r: { id: string }) => r.id === inv.id);
              if (!fresh) return inv;
              return { ...inv, tukarFakturId: fresh.tukar_faktur_id || undefined, dueDate: fresh.due_date };
            }),
          }));
        }
        return data;
      },
```

- [ ] **Step 4: Add `tukar_faktur` to the initial fetch list**

```bash
grep -n "fetchTable\|loadInitial\|hydrateFromServer" src/lib/store.ts | head -5
```

In the function that bulk-fetches tables on startup (search for `fetchTable('invoices')`), add an analogous fetch for `tukar_faktur` and store the camelCased result into `tukarFakturs`. Mirror the existing pattern exactly. Example to splice in:

```ts
const { data: tfRows } = await sb.from('tukar_faktur').select('*');
const tukarFakturs: TukarFaktur[] = (tfRows || []).map((r) => ({
  id: r.id,
  tfNumber: r.tf_number,
  clientId: r.client_id,
  periodStart: r.period_start,
  periodEnd: r.period_end,
  issueDate: r.issue_date,
  status: r.status,
  totalAmount: Number(r.total_amount) || 0,
  notes: r.notes || undefined,
  issuedBy: r.issued_by || undefined,
  receivedAt: r.received_at || undefined,
  receivedBy: r.received_by || undefined,
  createdAt: r.created_at,
}));
set({ tukarFakturs });
```

Also extend the existing `Partial<AppState>` type or store interface in the same file to declare:

```ts
tukarFakturs: TukarFaktur[];
addTukarFaktur: (tf: TukarFaktur) => Promise<void>;
updateTukarFaktur: (id: string, data: Partial<TukarFaktur>) => Promise<void>;
deleteTukarFaktur: (id: string) => Promise<void>;
issueTukarFaktur: (tfId: string, invoiceIds: string[], issueDate: string, userId: string) => Promise<unknown>;
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "store|tukar" | head -20
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat(tf): store slice + CRUD + atomic issue/delete RPC wiring"
```

---

## Task 8: Add Navigation Entry

**Files:**
- Modify: `src/lib/navigation.tsx`

- [ ] **Step 1: Read current Finance nav items**

```bash
sed -n '48,57p' src/lib/navigation.tsx
```

- [ ] **Step 2: Insert TF entry after `finance_cash_bank`**

After the line containing `key: 'finance_cash_bank'`, add:

```tsx
  { key: 'finance_tukar_faktur', title: 'Tukar Faktur', href: '/finance/tukar-faktur', icon: <FileSpreadsheet className="h-4 w-4" />, category: 'Finance' },
```

Note: re-use `FileSpreadsheet` icon (already imported). If you prefer a distinct icon, import `Receipt` from `lucide-react` and use it instead.

- [ ] **Step 3: Verify**

```bash
grep -n "tukar_faktur\|Tukar Faktur" src/lib/navigation.tsx
```

Expected: 2 hits (your new line).

- [ ] **Step 4: Commit**

```bash
git add src/lib/navigation.tsx
git commit -m "feat(tf): add Tukar Faktur menu item under Finance"
```

---

## Task 9: List Page

**Files:**
- Create: `src/app/finance/tukar-faktur/page.tsx`

- [ ] **Step 1: Write the list page**

```tsx
// src/app/finance/tukar-faktur/page.tsx
"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useAppStore } from "@/lib/store"
import type { TukarFakturStatus } from "@/types"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, FileSpreadsheet, Eye } from "lucide-react"
import { GenerateTfModal } from "@/components/tukar-faktur/GenerateTfModal"

const STATUS_TONE: Record<TukarFakturStatus, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Issued: "bg-amber-100 text-amber-700",
  Received: "bg-blue-100 text-blue-700",
  Paid: "bg-emerald-100 text-emerald-700",
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0)
}

function formatDate(iso: string) {
  if (!iso) return "-"
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

export default function TukarFakturListPage() {
  const tukarFakturs = useAppStore(s => s.tukarFakturs)
  const clients = useAppStore(s => s.clients)
  const invoices = useAppStore(s => s.invoices)

  const [openGenerate, setOpenGenerate] = useState(false)
  const [filterClient, setFilterClient] = useState<string>("")
  const [filterStatus, setFilterStatus] = useState<string>("")
  const [search, setSearch] = useState("")

  const rows = useMemo(() => {
    return tukarFakturs
      .filter(t => !filterClient || t.clientId === filterClient)
      .filter(t => !filterStatus || t.status === filterStatus)
      .filter(t => !search || t.tfNumber.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
  }, [tukarFakturs, filterClient, filterStatus, search])

  const invoiceCountByTf = useMemo(() => {
    const m = new Map<string, number>()
    invoices.forEach(inv => {
      if (!inv.tukarFakturId) return
      m.set(inv.tukarFakturId, (m.get(inv.tukarFakturId) || 0) + 1)
    })
    return m
  }, [invoices])

  const kpi = useMemo(() => {
    const draft = tukarFakturs.filter(t => t.status === "Draft").length
    const issuedUnpaid = tukarFakturs.filter(t => t.status === "Issued" || t.status === "Received").length
    const outstanding = tukarFakturs
      .filter(t => t.status === "Issued" || t.status === "Received")
      .reduce((sum, t) => sum + t.totalAmount, 0)
    return { draft, issuedUnpaid, outstanding }
  }, [tukarFakturs])

  return (
    <div className="p-6 md:p-10 space-y-8">
      <header className="flex flex-col md:flex-row justify-between gap-4 md:items-end">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">Tukar Faktur</h1>
          <p className="text-sm text-slate-500 mt-1">Batch invoice mingguan per klien — auto-period cross-bulan.</p>
        </div>
        <Button onClick={() => setOpenGenerate(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl px-6 h-12">
          <Plus className="w-4 h-4 mr-2" /> Generate TF
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 rounded-2xl border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Draft</p>
          <p className="text-3xl font-black text-slate-900 mt-2">{kpi.draft}</p>
        </Card>
        <Card className="p-5 rounded-2xl border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Issued / Received</p>
          <p className="text-3xl font-black text-slate-900 mt-2">{kpi.issuedUnpaid}</p>
        </Card>
        <Card className="p-5 rounded-2xl border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Outstanding</p>
          <p className="text-2xl font-black text-emerald-700 mt-2">{formatRupiah(kpi.outstanding)}</p>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <select className="h-11 px-4 rounded-xl border border-slate-200 text-sm bg-white"
                value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="">Semua Klien</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
        </select>
        <select className="h-11 px-4 rounded-xl border border-slate-200 text-sm bg-white"
                value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Semua Status</option>
          <option value="Draft">Draft</option>
          <option value="Issued">Issued</option>
          <option value="Received">Received</option>
          <option value="Paid">Paid</option>
        </select>
        <Input className="h-11 rounded-xl flex-1" placeholder="Cari TF Number…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card className="rounded-2xl overflow-hidden border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">TF Number</th>
              <th className="text-left px-4 py-3">Klien</th>
              <th className="text-left px-4 py-3">Periode</th>
              <th className="text-left px-4 py-3">Issue Date</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-center px-4 py-3">Invoice</th>
              <th className="text-center px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-16 text-slate-400">
                <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 opacity-40" />
                Belum ada TF. Klik <span className="font-bold">Generate TF</span> untuk mulai.
              </td></tr>
            ) : rows.map(t => {
              const client = clients.find(c => c.id === t.clientId)
              return (
                <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold">{t.tfNumber}</td>
                  <td className="px-4 py-3">{client?.companyName || t.clientId}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(t.periodStart)} – {formatDate(t.periodEnd)}</td>
                  <td className="px-4 py-3">{formatDate(t.issueDate)}</td>
                  <td className="px-4 py-3 text-right font-bold">{formatRupiah(t.totalAmount)}</td>
                  <td className="px-4 py-3 text-center">{invoiceCountByTf.get(t.id) || 0}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge className={`${STATUS_TONE[t.status]} border-none font-bold`}>{t.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/finance/tukar-faktur/${t.id}`}>
                      <Button size="sm" variant="ghost" className="rounded-xl"><Eye className="w-4 h-4" /></Button>
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <GenerateTfModal open={openGenerate} onOpenChange={setOpenGenerate} />
    </div>
  )
}
```

- [ ] **Step 2: Commit (yes the modal file doesn't exist yet — the import will error until Task 10. That's fine; commit per task.)**

```bash
git add src/app/finance/tukar-faktur/page.tsx
git commit -m "feat(tf): list page with filter, KPI, generate trigger"
```

---

## Task 10: Generate Modal

**Files:**
- Create: `src/components/tukar-faktur/GenerateTfModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
// src/components/tukar-faktur/GenerateTfModal.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useAppStore } from "@/lib/store"
import type { Invoice, TukarFaktur } from "@/types"
import { tfPeriodFor, generateTfNumber, periodKey, type TfPeriod } from "@/lib/tukar-faktur"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0)
}
function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

interface PeriodGroup {
  key: string
  period: TfPeriod
  invoices: Invoice[]
  total: number
}

interface Props { open: boolean; onOpenChange: (v: boolean) => void }

export function GenerateTfModal({ open, onOpenChange }: Props) {
  const clients = useAppStore(s => s.clients)
  const invoices = useAppStore(s => s.invoices)
  const tukarFakturs = useAppStore(s => s.tukarFakturs)
  const currentUser = useAppStore(s => s.currentUser)
  const addTukarFaktur = useAppStore(s => s.addTukarFaktur)
  const issueTukarFaktur = useAppStore(s => s.issueTukarFaktur)

  const [clientId, setClientId] = useState("")
  const [selectedInvIds, setSelectedInvIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) { setClientId(""); setSelectedInvIds(new Set()) }
  }, [open])

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [open])

  const candidateGroups = useMemo<PeriodGroup[]>(() => {
    if (!clientId) return []
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 14)
    const eligible = invoices.filter(inv =>
      inv.clientId === clientId &&
      !inv.tukarFakturId &&
      inv.status !== "Cancelled" &&
      new Date(inv.issueDate) >= cutoff
    )
    const byKey = new Map<string, PeriodGroup>()
    eligible.forEach(inv => {
      const period = tfPeriodFor(new Date(inv.issueDate))
      const k = periodKey(period)
      if (!byKey.has(k)) byKey.set(k, { key: k, period, invoices: [], total: 0 })
      const g = byKey.get(k)!
      g.invoices.push(inv)
      g.total += inv.totalAmount
    })
    return Array.from(byKey.values()).sort((a, b) => a.period.periodStart.getTime() - b.period.periodStart.getTime())
  }, [clientId, invoices, today])

  // Auto-select invoices in completed periods (periodEnd < today)
  useEffect(() => {
    const next = new Set<string>()
    candidateGroups.forEach(g => {
      if (g.period.periodEnd < today) g.invoices.forEach(i => next.add(i.id))
    })
    setSelectedInvIds(next)
  }, [candidateGroups, today])

  function toggleInvoice(id: string) {
    setSelectedInvIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  // Group selected invoices back to their periods → 1 TF per period
  function groupSelected(): PeriodGroup[] {
    return candidateGroups
      .map(g => ({ ...g, invoices: g.invoices.filter(i => selectedInvIds.has(i.id)) }))
      .filter(g => g.invoices.length > 0)
      .map(g => ({ ...g, total: g.invoices.reduce((s, i) => s + i.totalAmount, 0) }))
  }

  async function runGenerate(mode: "Draft" | "Issue") {
    const groups = groupSelected()
    if (groups.length === 0) { toast.error("Pilih minimal 1 invoice."); return }
    setBusy(true)
    try {
      for (const g of groups) {
        const existingCount = tukarFakturs.filter(t => {
          return t.clientId === clientId && t.periodStart === isoDate(g.period.periodStart)
        }).length
        const tf: TukarFaktur = {
          id: crypto.randomUUID(),
          tfNumber: generateTfNumber(clientId, g.period, existingCount),
          clientId,
          periodStart: isoDate(g.period.periodStart),
          periodEnd: isoDate(g.period.periodEnd),
          issueDate: isoDate(mode === "Issue" ? today : g.period.issueDate),
          status: "Draft",
          totalAmount: g.total,
          createdAt: new Date().toISOString(),
          issuedBy: mode === "Issue" ? (currentUser?.id || "system") : undefined,
        }
        await addTukarFaktur(tf)
        if (mode === "Issue") {
          await issueTukarFaktur(
            tf.id,
            g.invoices.map(i => i.id),
            tf.issueDate,
            currentUser?.id || "system"
          )
        }
      }
      toast.success(`${groups.length} TF berhasil ${mode === "Issue" ? "diterbitkan" : "disimpan sebagai Draft"}.`)
      onOpenChange(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`Generate gagal: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-[2rem] bg-white p-8">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">Generate Tukar Faktur</DialogTitle>
          <DialogDescription className="text-slate-500">
            Pilih klien, periode terdeteksi otomatis (Sen-Min atau dipotong di akhir bulan). Centang invoice yang mau dimasukkan.
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Klien</label>
            <select
              className="mt-2 w-full h-11 rounded-xl border border-slate-200 px-4 text-sm bg-white"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
            >
              <option value="">— Pilih klien —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </select>
          </div>

          {clientId && candidateGroups.length === 0 && (
            <p className="text-sm text-slate-500 italic">Tidak ada invoice klien ini dalam 14 hari terakhir yang belum di-TF.</p>
          )}

          {candidateGroups.map(g => (
            <div key={g.key} className="border border-slate-100 rounded-2xl p-4 bg-slate-50">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <p className="font-bold text-sm">
                    Periode {g.period.periodStart.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })} – {g.period.periodEnd.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
                  </p>
                  <p className="text-xs text-slate-500">
                    Issue default: {g.period.issueDate.toLocaleDateString("id-ID")} · {g.invoices.length} invoice · {formatRupiah(g.total)}
                  </p>
                </div>
                {g.period.periodEnd >= today && (
                  <span className="text-[10px] font-bold uppercase text-amber-600 bg-amber-100 px-2 py-1 rounded-full">Period belum selesai</span>
                )}
              </div>
              <div className="space-y-2">
                {g.invoices.map(inv => (
                  <label key={inv.id} className="flex items-center gap-3 text-sm cursor-pointer">
                    <Checkbox checked={selectedInvIds.has(inv.id)} onCheckedChange={() => toggleInvoice(inv.id)} />
                    <span className="font-medium">{inv.id.slice(0, 8)}</span>
                    <span className="text-slate-500">{formatRupiah(inv.totalAmount)}</span>
                    <span className="text-xs text-slate-400 ml-auto">issued {inv.issueDate.slice(0,10)}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Batal</Button>
          <Button variant="outline" onClick={() => runGenerate("Draft")} disabled={busy || !clientId}>Save as Draft</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => runGenerate("Issue")} disabled={busy || !clientId}>Issue Sekarang</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "GenerateTfModal|tukar-faktur" | head -20
```

Fix any import path errors. Common: `Checkbox` import path — use the same path other pages use (`grep "import { Checkbox }" src/app/finance/approvals/page.tsx`).

- [ ] **Step 3: Commit**

```bash
git add src/components/tukar-faktur/GenerateTfModal.tsx
git commit -m "feat(tf): generate TF modal with auto-period grouping"
```

---

## Task 11: Detail Page

**Files:**
- Create: `src/app/finance/tukar-faktur/[id]/page.tsx`

- [ ] **Step 1: Write the detail page**

```tsx
// src/app/finance/tukar-faktur/[id]/page.tsx
"use client"

import { use, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAppStore } from "@/lib/store"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Send, CheckCircle2, Trash2, Printer } from "lucide-react"
import { toast } from "sonner"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0)
}
function formatDate(iso?: string) {
  if (!iso) return "-"
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

export default function TukarFakturDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const tf = useAppStore(s => s.tukarFakturs.find(t => t.id === id))
  const clients = useAppStore(s => s.clients)
  const invoices = useAppStore(s => s.invoices)
  const currentUser = useAppStore(s => s.currentUser)
  const updateTukarFaktur = useAppStore(s => s.updateTukarFaktur)
  const issueTukarFaktur = useAppStore(s => s.issueTukarFaktur)
  const deleteTukarFaktur = useAppStore(s => s.deleteTukarFaktur)
  const updateInvoice = useAppStore(s => s.updateInvoice)

  const [receivedBy, setReceivedBy] = useState("")
  const [bulkDays, setBulkDays] = useState(0)
  const [busy, setBusy] = useState(false)

  const linkedInvoices = useMemo(() =>
    invoices.filter(inv => inv.tukarFakturId === id),
    [invoices, id]
  )

  if (!tf) {
    return <div className="p-10 text-slate-500">TF tidak ditemukan. <Link href="/finance/tukar-faktur" className="underline">Kembali</Link></div>
  }

  const client = clients.find(c => c.id === tf.clientId)
  const isLocked = tf.status === "Received" || tf.status === "Paid"
  const isDraftish = tf.status === "Draft" || tf.status === "Issued"

  async function handleIssue() {
    setBusy(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      await issueTukarFaktur(id, linkedInvoices.map(i => i.id), today, currentUser?.id || "system")
      toast.success("TF berhasil di-Issue. Jatuh tempo invoice ter-update.")
    } catch (e) {
      toast.error(`Issue gagal: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(false) }
  }

  async function handleMarkReceived() {
    if (!receivedBy.trim()) { toast.error("Isi nama PIC penerima."); return }
    setBusy(true)
    try {
      await updateTukarFaktur(id, {
        status: "Received",
        receivedAt: new Date().toISOString(),
        receivedBy: receivedBy.trim(),
      })
      toast.success("Ditandai diterima klien.")
      setReceivedBy("")
    } catch (e) {
      toast.error(`Update gagal: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(false) }
  }

  async function handleDelete() {
    if (!confirm(`Hapus TF ${tf?.tfNumber}? Invoice akan di-unlink & jatuh tempo direvert.`)) return
    setBusy(true)
    try {
      await deleteTukarFaktur(id)
      toast.success("TF dihapus.")
      router.push("/finance/tukar-faktur")
    } catch (e) {
      toast.error(`Delete gagal: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(false) }
  }

  async function handleEditDueDate(invoiceId: string, newDate: string) {
    try {
      await updateInvoice(invoiceId, { dueDate: newDate })
    } catch (e) {
      toast.error(`Update dueDate gagal: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function handleBulkOverride() {
    if (bulkDays === 0) { toast.error("Isi jumlah hari (boleh negatif)."); return }
    setBusy(true)
    try {
      for (const inv of linkedInvoices) {
        const newDate = new Date(inv.dueDate)
        newDate.setDate(newDate.getDate() + bulkDays)
        await updateInvoice(inv.id, { dueDate: newDate.toISOString().slice(0, 10) })
      }
      toast.success(`${linkedInvoices.length} dueDate digeser ${bulkDays} hari.`)
      setBulkDays(0)
    } catch (e) {
      toast.error(`Bulk override gagal: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(false) }
  }

  return (
    <div className="p-6 md:p-10 space-y-6">
      <Link href="/finance/tukar-faktur" className="text-sm text-slate-500 hover:underline inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Kembali
      </Link>

      <Card className="p-6 rounded-2xl border-slate-100">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{client?.companyName || tf.clientId}</p>
            <h1 className="text-2xl font-black mt-1">{tf.tfNumber}</h1>
            <p className="text-sm text-slate-500 mt-1">
              Periode {formatDate(tf.periodStart)} – {formatDate(tf.periodEnd)} · Issued {formatDate(tf.issueDate)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-slate-100 text-slate-700 border-none font-bold">{tf.status}</Badge>
            <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> Print</Button>
            {tf.status === "Draft" && (
              <Button onClick={handleIssue} disabled={busy || linkedInvoices.length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Send className="w-4 h-4 mr-2" /> Issue
              </Button>
            )}
            {!isLocked && (
              <Button variant="outline" onClick={handleDelete} disabled={busy} className="border-rose-200 text-rose-600 hover:bg-rose-50">
                <Trash2 className="w-4 h-4 mr-2" /> Hapus
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6 rounded-2xl border-slate-100">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-4">Invoice ({linkedInvoices.length})</h2>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-slate-400">
            <tr><th className="text-left py-2">Invoice ID</th><th className="text-right py-2">Nominal</th><th className="text-right py-2">Status</th><th className="text-right py-2">Jatuh Tempo</th></tr>
          </thead>
          <tbody>
            {linkedInvoices.map(inv => (
              <tr key={inv.id} className="border-t border-slate-100">
                <td className="py-2 font-medium">{inv.id.slice(0, 8)}</td>
                <td className="py-2 text-right">{formatRupiah(inv.totalAmount)}</td>
                <td className="py-2 text-right">{inv.status}</td>
                <td className="py-2 text-right">
                  <Input
                    type="date"
                    value={inv.dueDate?.slice(0, 10) || ""}
                    onChange={e => handleEditDueDate(inv.id, e.target.value)}
                    className="h-8 w-40 ml-auto"
                    disabled={isLocked}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200">
              <td className="py-3 font-black">Total</td>
              <td className="py-3 text-right font-black">{formatRupiah(tf.totalAmount)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>

        {isDraftish && (
          <div className="mt-4 flex items-center gap-2 pt-4 border-t border-slate-100">
            <span className="text-xs text-slate-500">Override semua dueDate</span>
            <Input type="number" value={bulkDays} onChange={e => setBulkDays(parseInt(e.target.value) || 0)} className="w-24 h-9" />
            <span className="text-xs text-slate-500">hari</span>
            <Button size="sm" variant="outline" onClick={handleBulkOverride} disabled={busy}>Apply</Button>
          </div>
        )}
      </Card>

      {tf.status === "Issued" && (
        <Card className="p-6 rounded-2xl border-slate-100">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-4">Tanda Terima Klien</h2>
          <div className="flex flex-col md:flex-row gap-3">
            <Input placeholder="Nama PIC penerima" value={receivedBy} onChange={e => setReceivedBy(e.target.value)} className="flex-1" />
            <Button onClick={handleMarkReceived} disabled={busy} className="bg-blue-600 hover:bg-blue-700 text-white">
              <CheckCircle2 className="w-4 h-4 mr-2" /> Tandai Diterima
            </Button>
          </div>
        </Card>
      )}

      {(tf.status === "Received" || tf.status === "Paid") && (
        <Card className="p-6 rounded-2xl border-slate-100 bg-blue-50">
          <p className="text-sm">Diterima oleh <span className="font-bold">{tf.receivedBy}</span> pada {formatDate(tf.receivedAt)}.</p>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "tukar-faktur/\[id\]" | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/finance/tukar-faktur/\[id\]/page.tsx
git commit -m "feat(tf): detail page with Issue/Tandai Diterima/Delete/bulk override"
```

---

## Task 12: Cross-Link Badge + Lock dueDate in Invoice Page

**Files:**
- Modify: `src/app/finance/invoices/page.tsx`

- [ ] **Step 1: Locate the invoice table render + dueDate edit cell**

```bash
grep -n "dueDate\|<tr\|<td\|tukarFakturId" src/app/finance/invoices/page.tsx | head -30
```

Note the line where dueDate is shown / edited per row.

- [ ] **Step 2: Read tukarFakturs slice in component**

Near the top of the component (with other `useAppStore` calls), add:

```tsx
const tukarFakturs = useAppStore(s => s.tukarFakturs)
```

- [ ] **Step 3: Add badge column to header**

Find the `<thead>` row. Insert a new `<th>` before the actions column:

```tsx
<th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-slate-400">TF</th>
```

- [ ] **Step 4: Add badge cell per row**

In the row render (inside `.map(inv => ...)`), insert a new `<td>` in the matching position:

```tsx
<td className="px-3 py-2">
  {inv.tukarFakturId ? (() => {
    const tf = tukarFakturs.find(t => t.id === inv.tukarFakturId)
    if (!tf) return <span className="text-xs text-slate-400">—</span>
    return (
      <Link href={`/finance/tukar-faktur/${tf.id}`} className="text-xs font-bold text-blue-600 hover:underline">
        {tf.tfNumber}
      </Link>
    )
  })() : (
    <span className="text-xs text-slate-400 italic">Belum TF</span>
  )}
</td>
```

If `Link` isn't already imported in this file, add `import Link from "next/link"` at top.

- [ ] **Step 5: Disable dueDate edit when linked to Issued+ TF**

Find the existing dueDate `<Input>` (or similar editable element). Wrap its `disabled` prop:

```tsx
disabled={(() => {
  if (!inv.tukarFakturId) return false
  const tf = tukarFakturs.find(t => t.id === inv.tukarFakturId)
  return tf?.status === "Issued" || tf?.status === "Received" || tf?.status === "Paid"
})()}
```

Add a `title` attribute so user sees why:

```tsx
title={inv.tukarFakturId ? "Edit dueDate dari halaman TF detail" : ""}
```

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "invoices/page" | head -10
```

- [ ] **Step 7: Commit**

```bash
git add src/app/finance/invoices/page.tsx
git commit -m "feat(tf): TF badge column + lock dueDate edit when linked"
```

---

## Task 13: Manual E2E Verification

**Files:**
- None (browser verification)

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Expected: server boots on http://localhost:3000.

- [ ] **Step 2: Login as Super Admin, navigate to Tukar Faktur**

In browser: sidebar > Financial > Tukar Faktur. Expected: empty list page with KPI cards showing 0/0/Rp 0.

- [ ] **Step 3: Pre-create test invoices (skip if existing invoices already cover)**

If no eligible invoices exist for any client in last 14 days, use the Fast Track flow on an SO (from Sales Orders page) to create one. Confirm at least 1 invoice exists with `tukarFakturId IS NULL`.

- [ ] **Step 4: Open Generate modal, pick a client**

Click "Generate TF". Pick a client with eligible invoices. Expected: periods auto-grouped, completed periods checked by default, ongoing periods unchecked with amber "Period belum selesai" badge.

- [ ] **Step 5: Click "Save as Draft"**

Expected: success toast, modal closes, new row appears in list with status `Draft`, invoice count = selected. Database check:

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const env = process.env.NEXT_PUBLIC_SUPABASE_PROFILE === 'production' ? 'PRODUCTION' : 'LOCAL';
const sb = createClient(process.env[\`NEXT_PUBLIC_SUPABASE_URL_\${env}\`], process.env[\`SUPABASE_SERVICE_ROLE_KEY_\${env}\`]);
sb.from('tukar_faktur').select('*').order('created_at',{ascending:false}).limit(3).then(r => console.log(JSON.stringify(r.data, null, 2)));
"
```

Expected: 1 TF row with `status='Draft'`, `total_amount=0` (Draft doesn't link invoices yet, totals computed at Issue time).

- [ ] **Step 6: Open TF detail, click Issue**

Expected: status badge → `Issued`. Verify invoice rows show `tukar_faktur_id` set:

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const env = process.env.NEXT_PUBLIC_SUPABASE_PROFILE === 'production' ? 'PRODUCTION' : 'LOCAL';
const sb = createClient(process.env[\`NEXT_PUBLIC_SUPABASE_URL_\${env}\`], process.env[\`SUPABASE_SERVICE_ROLE_KEY_\${env}\`]);
sb.from('invoices').select('id,due_date,tukar_faktur_id').not('tukar_faktur_id','is',null).then(r => console.log(JSON.stringify(r.data, null, 2)));
"
```

Expected: invoices show `tukar_faktur_id` set, `due_date = issue_date + payment_term_days`.

- [ ] **Step 7: Open Invoices (AR/AP) page**

Expected: linked invoice rows show `TF-...` badge in TF column. dueDate input disabled with tooltip.

- [ ] **Step 8: Tandai Diterima**

Back to TF detail. Fill PIC name. Click "Tandai Diterima". Expected: status → `Received`, info card shows received_by + received_at.

- [ ] **Step 9: Delete a Draft TF (separate)**

Generate another TF as Draft. Click Hapus → confirm. Expected: TF row vanishes, no invoice should have been linked (Draft never links).

- [ ] **Step 10: Anti-double sanity check**

Try generating again for the same client/period. Expected: invoices already linked do NOT appear in the candidate list.

- [ ] **Step 11: Cross-month period verification**

If date allows, create an invoice with `issue_date` near end of month to manually trigger the cross-month split. Open Generate modal — expected 2 separate period groups (segment 1 ends at month-end, segment 2 starts day 1).

If current real-date doesn't span a month boundary, temporarily backdate one invoice via SQL:

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const env = process.env.NEXT_PUBLIC_SUPABASE_PROFILE === 'production' ? 'PRODUCTION' : 'LOCAL';
const sb = createClient(process.env[\`NEXT_PUBLIC_SUPABASE_URL_\${env}\`], process.env[\`SUPABASE_SERVICE_ROLE_KEY_\${env}\`]);
sb.from('invoices').update({issue_date:'2026-04-30'}).eq('id','<invoice-id-here>').then(r => console.log(r));
"
```

After confirming the split UI works, revert the date.

---

## Task 14: Bug-Fix Buffer

**Files:**
- Any of the files above

- [ ] **Step 1: Fix any issues from Task 13**

For each issue found in manual E2E: identify file + line, apply minimum fix, commit with `fix(tf): <issue>`.

- [ ] **Step 2: Final typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | tail -30
```

Expected: 0 errors related to TF code.

- [ ] **Step 3: Lint pass**

```bash
npm run lint 2>&1 | grep -E "tukar-faktur|tukar_faktur" | head -20
```

Fix any lint errors. Re-commit.

---

## Self-Review Checklist

After completing all tasks:

**Spec coverage:**
- ✓ Section 1 (Data Model) → Tasks 1, 2, 3, 6
- ✓ Section 2 (UI Flow) → Tasks 9, 10, 11, 12
- ✓ Section 3 (Auto-Period Logic) → Tasks 4, 5
- ✓ Section 4 (State Machine + RPC) → Tasks 1, 7, 11
- ✓ Section 5 (Testing + Rollout) → Tasks 5, 13, 14
- ⚠ Out of scope per spec: auto-cron, notif, e-sign, multi-client, audit log

**Placeholder scan:** none.

**Type consistency:** `TukarFaktur` shape identical across types, store, modal, list, detail. `TukarFakturStatus` union enforced in DB CHECK constraint matching TS union.

**Migration safety:** `IF NOT EXISTS` on table/column. `ON DELETE SET NULL` for invoice FK. RPCs are `CREATE OR REPLACE` so re-runnable.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-27-tukar-faktur.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.

**Which approach?**

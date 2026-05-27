-- prod-rls.sql — Defense-in-depth RLS for HIGH-sensitivity tables
-- Service-role key (used by API routes via supabaseAdmin) BYPASSES RLS by design.
-- Anon key (browser bundle) is denied all access to these tables.
-- Run AFTER dev-bootstrap.sql in production environment only.

begin;

-- 1. Enable RLS on HIGH-sensitivity tables
alter table public.users             enable row level security;
alter table public.bank_accounts     enable row level security;
alter table public.invoices          enable row level security;
alter table public.journal_entries   enable row level security;
alter table public.journal_lines     enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.expenses          enable row level security;
alter table public.reimbursements    enable row level security;

-- 2. Explicit revoke from anon role (belt-and-suspenders; RLS-on + no-policy already denies)
revoke all on public.users             from anon;
revoke all on public.bank_accounts     from anon;
revoke all on public.invoices          from anon;
revoke all on public.journal_entries   from anon;
revoke all on public.journal_lines     from anon;
revoke all on public.cash_transactions from anon;
revoke all on public.expenses          from anon;
revoke all on public.reimbursements    from anon;

-- 3. No policies created on purpose. RLS-enabled + no-policy = default deny for all non-superuser/non-owner roles.
--    Service-role (used by supabaseAdmin in src/lib/supabase-admin.ts) BYPASSES RLS — all API routes continue working.

commit;

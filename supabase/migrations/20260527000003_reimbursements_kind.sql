-- supabase/migrations/20260527_reimbursements_kind.sql
-- Reimbursement kind discriminator: Manual | Auto-Talangan | Sourcing-Defisit
-- Replaces fragile description string match in recordReimbursementPayment.

alter table public.reimbursements
  add column if not exists kind text check (kind in ('Manual','Auto-Talangan','Sourcing-Defisit'));

create index if not exists reimbursements_kind_idx on public.reimbursements(kind);

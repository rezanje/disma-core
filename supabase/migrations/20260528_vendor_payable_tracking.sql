-- supabase/migrations/20260528_vendor_payable_tracking.sql
-- Migration for Vendor Payable (Accounts Payable) Tracking

-- 1. Drop existing vendor_bill_id if it was created as uuid
alter table public.journal_lines drop column if exists vendor_bill_id;

-- 2. Alter existing tables
alter table public.vendors
  add column if not exists payment_term_days int default 14,
  add column if not exists is_tempo boolean default true;

alter table public.purchase_items
  add column if not exists vendor_id text references public.vendors(id);
create index if not exists purchase_items_vendor_id_idx on public.purchase_items(vendor_id);

alter table public.journal_lines
  add column if not exists vendor_id text references public.vendors(id),
  add column if not exists vendor_bill_id text; -- use type text to match vendor_bills.id

-- 3. Update existing vendor_bills table defaults and constraints
alter table public.vendor_bills 
  alter column status set default 'Pending',
  alter column total_amount set default 0,
  alter column amount_paid set default 0;

-- Add unique constraint on bill_number
alter table public.vendor_bills add constraint vendor_bills_bill_number_key unique (bill_number);

-- Add foreign key constraints on vendor_bills
alter table public.vendor_bills
  add constraint vendor_bills_vendor_id_fkey foreign key (vendor_id) references public.vendors(id),
  add constraint vendor_bills_purchase_id_fkey foreign key (purchase_id) references public.purchases(id);

-- Add indexes on vendor_bills
create index if not exists vendor_bills_vendor_id_idx on public.vendor_bills(vendor_id);
create index if not exists vendor_bills_status_idx on public.vendor_bills(status);
create index if not exists vendor_bills_due_date_idx on public.vendor_bills(due_date) where status <> 'Paid';

-- Add foreign key constraint on journal_lines
alter table public.journal_lines
  add constraint journal_lines_vendor_bill_id_fkey 
  foreign key (vendor_bill_id) references public.vendor_bills(id) on delete set null;

create index if not exists journal_lines_vendor_id_idx on public.journal_lines(vendor_id) where vendor_id is not null;
create index if not exists journal_lines_vendor_bill_id_idx on public.journal_lines(vendor_bill_id) where vendor_bill_id is not null;

-- Disable row level security to match other tables
alter table public.vendor_bills disable row level security;

-- 4. Create/Replace RPC helper to generate vendor bill number
create or replace function public.generate_vendor_bill_number(
  p_vendor_id text,
  p_bill_date date
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text;
  v_month text;
  v_vendor_code text;
  v_count int;
begin
  -- Format date parts
  v_year := to_char(p_bill_date, 'YYYY');
  v_month := to_char(p_bill_date, 'MM');
  
  -- Suffix/Shortcode vendor ID (slice first 6 chars, uppercase)
  v_vendor_code := upper(substring(p_vendor_id from 1 for 6));
  
  -- Acquire an atomic lock on the vendor row to prevent duplicate generation
  perform 1 from public.vendors where id = p_vendor_id for update;

  -- Count existing bills for this vendor in the same month using issue_date
  select count(*)
    into v_count
    from public.vendor_bills
   where vendor_id = p_vendor_id
     and substring(issue_date from 1 for 7) = v_year || '-' || v_month;

  return 'VB-' || v_year || '-' || v_month || '-' || v_vendor_code || '-' || lpad((v_count + 1)::text, 2, '0');
end;
$$;

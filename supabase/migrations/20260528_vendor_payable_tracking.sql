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

-- 5. Create/Replace RPC to support vendor subledger on journal lines
create or replace function public.post_journal_entry(
  p_entry_id text,
  p_transaction_date text,
  p_description text,
  p_reference_type text,
  p_reference_id text,
  p_debits jsonb,
  p_credits jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_debit_lines jsonb := '[]'::jsonb;
  v_credit_lines jsonb := '[]'::jsonb;
  v_all_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_amount numeric;
  v_account_code text;
  v_account_id text;
  v_coa_count integer;
  v_idx integer := 0;
  v_existing_id text;
  v_existing_line_count integer;
  v_existing_entry jsonb;
  v_existing_lines jsonb;
begin
  if nullif(trim(coalesce(p_entry_id, '')), '') is null then
    raise exception 'journal entry id is required';
  end if;

  if nullif(trim(coalesce(p_transaction_date, '')), '') is null then
    raise exception 'transaction date is required';
  end if;

  if nullif(trim(coalesce(p_description, '')), '') is null then
    raise exception 'description is required';
  end if;

  if coalesce(jsonb_typeof(p_debits), 'null') <> 'array' then
    raise exception 'debits must be a JSON array';
  end if;

  if coalesce(jsonb_typeof(p_credits), 'null') <> 'array' then
    raise exception 'credits must be a JSON array';
  end if;

  select id
    into v_existing_id
    from public.journal_entries
   where reference_type is not distinct from p_reference_type
     and reference_id is not distinct from p_reference_id
     and description = p_description
   limit 1;

  if v_existing_id is not null then
    select count(*)
      into v_existing_line_count
      from public.journal_lines
     where journal_entry_id = v_existing_id;

    if v_existing_line_count = 0 then
      raise exception 'existing journal entry % has no lines; repair required', v_existing_id;
    end if;

    select to_jsonb(je)
      into v_existing_entry
      from public.journal_entries je
     where je.id = v_existing_id;

    select coalesce(jsonb_agg(to_jsonb(jl) order by jl.id), '[]'::jsonb)
      into v_existing_lines
      from public.journal_lines jl
     where jl.journal_entry_id = v_existing_id;

    return jsonb_build_object(
      'entry', v_existing_entry,
      'lines', v_existing_lines,
      'inserted', false
    );
  end if;

  for v_line in select value from jsonb_array_elements(p_debits) loop
    v_idx := v_idx + 1;
    v_account_code := nullif(trim(coalesce(v_line->>'accountCode', v_line->>'account_code', '')), '');
    if v_account_code is null then
      raise exception 'debit account code is required';
    end if;

    v_amount := coalesce(nullif(v_line->>'amount', '')::numeric, 0);
    if v_amount < 0 then
      raise exception 'debit amount for account % cannot be negative', v_account_code;
    end if;
    if v_amount = 0 then
      continue;
    end if;

    select count(*), min(id)
      into v_coa_count, v_account_id
      from public.coas
     where account_code = v_account_code;

    if v_coa_count = 0 then
      raise exception 'COA not found for debit account code: %', v_account_code;
    end if;
    if v_coa_count > 1 then
      raise exception 'COA account code % is duplicated; repair required', v_account_code;
    end if;

    v_total_debit := v_total_debit + v_amount;
    v_debit_lines := v_debit_lines || jsonb_build_array(jsonb_build_object(
      'id', coalesce(nullif(v_line->>'id', ''), p_entry_id || '-d-' || v_idx::text),
      'journal_entry_id', p_entry_id,
      'account_id', v_account_id,
      'debit_amount', v_amount,
      'credit_amount', 0,
      'vendor_id', v_line->>'vendorId',
      'vendor_bill_id', v_line->>'vendorBillId'
    ));
  end loop;

  v_idx := 0;
  for v_line in select value from jsonb_array_elements(p_credits) loop
    v_idx := v_idx + 1;
    v_account_code := nullif(trim(coalesce(v_line->>'accountCode', v_line->>'account_code', '')), '');
    if v_account_code is null then
      raise exception 'credit account code is required';
    end if;

    v_amount := coalesce(nullif(v_line->>'amount', '')::numeric, 0);
    if v_amount < 0 then
      raise exception 'credit amount for account % cannot be negative', v_account_code;
    end if;
    if v_amount = 0 then
      continue;
    end if;

    select count(*), min(id)
      into v_coa_count, v_account_id
      from public.coas
     where account_code = v_account_code;

    if v_coa_count = 0 then
      raise exception 'COA not found for credit account code: %', v_account_code;
    end if;
    if v_coa_count > 1 then
      raise exception 'COA account code % is duplicated; repair required', v_account_code;
    end if;

    v_total_credit := v_total_credit + v_amount;
    v_credit_lines := v_credit_lines || jsonb_build_array(jsonb_build_object(
      'id', coalesce(nullif(v_line->>'id', ''), p_entry_id || '-c-' || v_idx::text),
      'journal_entry_id', p_entry_id,
      'account_id', v_account_id,
      'debit_amount', 0,
      'credit_amount', v_amount,
      'vendor_id', v_line->>'vendorId',
      'vendor_bill_id', v_line->>'vendorBillId'
    ));
  end loop;

  if v_total_debit <= 0 or v_total_credit <= 0 then
    raise exception 'journal must have positive debit and credit totals';
  end if;

  if abs(v_total_debit - v_total_credit) > 0.01 then
    raise exception 'journal is not balanced: debit %, credit %', v_total_debit, v_total_credit;
  end if;

  v_all_lines := v_debit_lines || v_credit_lines;

  insert into public.journal_entries (
    id,
    transaction_date,
    description,
    reference_type,
    reference_id
  ) values (
    p_entry_id,
    p_transaction_date,
    p_description,
    p_reference_type,
    p_reference_id
  );

  for v_line in select value from jsonb_array_elements(v_all_lines) loop
    insert into public.journal_lines (
      id,
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      vendor_id,
      vendor_bill_id
    ) values (
      v_line->>'id',
      v_line->>'journal_entry_id',
      v_line->>'account_id',
      (v_line->>'debit_amount')::numeric,
      (v_line->>'credit_amount')::numeric,
      v_line->>'vendor_id',
      v_line->>'vendor_bill_id'
    );
  end loop;

  return jsonb_build_object(
    'entry', jsonb_build_object(
      'id', p_entry_id,
      'transaction_date', p_transaction_date,
      'description', p_description,
      'reference_type', p_reference_type,
      'reference_id', p_reference_id
    ),
    'lines', (
      select coalesce(jsonb_agg(to_jsonb(jl) order by jl.id), '[]'::jsonb)
        from public.journal_lines jl
       where jl.journal_entry_id = p_entry_id
    ),
    'inserted', true
  );
end;
$$;

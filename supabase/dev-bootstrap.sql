begin;

create table if not exists public.users (
  id text primary key,
  name text not null,
  role text not null,
  pin text not null
);

create table if not exists public.clients (
  id text primary key,
  company_name text not null,
  pic_name text not null,
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  payment_term_days integer not null default 30,
  total_order_jan_may numeric not null default 0,
  created_at text not null
);

create table if not exists public.vendors (
  id text primary key,
  company_name text not null,
  pic_name text not null,
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  created_at text not null
);

create table if not exists public.products (
  id text primary key,
  sku_code text not null,
  name text not null,
  uom text not null,
  base_price numeric not null default 0,
  selling_price numeric not null default 0,
  tier1_price numeric not null default 0,
  tier2_price numeric not null default 0,
  tier3_price numeric not null default 0,
  tier4_price numeric not null default 0,
  tier5_price numeric not null default 0,
  current_stock numeric not null default 0,
  price_history jsonb not null default '[]'::jsonb,
  weekly_price_range jsonb not null default '{}'::jsonb,
  category text
);

create table if not exists public.coas (
  id text primary key,
  account_code text not null,
  account_name text not null,
  account_type text not null
);

create table if not exists public.bank_accounts (
  id text primary key,
  name text not null,
  account_number text,
  account_code text,
  balance numeric not null default 0
);

create table if not exists public.sales_orders (
  id text primary key,
  po_number text not null,
  client_id text not null,
  order_date text not null,
  target_delivery_date text not null,
  status text not null,
  archived_surat_jalan_url text,
  archived_ba_url text,
  proof_of_delivery_url text,
  handover_date text,
  handover_by text,
  received_by text,
  courier_signature text,
  client_signature text,
  shopping_list_document_id text,
  shopping_list_compiled_at text,
  shopping_list_compiled_by text
);

create table if not exists public.sales_order_items (
  id text primary key,
  sales_order_id text not null,
  product_id text not null,
  qty numeric not null default 0,
  qty_final numeric,
  unit_price numeric not null default 0,
  subtotal numeric not null default 0,
  subtotal_final numeric,
  qty_adjustment_reason text,
  is_packed boolean not null default false,
  is_handover_checked boolean not null default false
);

create table if not exists public.purchases (
  id text primary key,
  date text not null,
  purchaser_id text not null,
  status text not null,
  budget_amount numeric,
  budget_transfer_date text,
  budget_transfered_by text,
  budget_bank_account_id text,
  operational_spare_amount numeric,
  actual_spent numeric,
  change_returned numeric,
  reconciliation_note text,
  reconciliation_status text,
  reconciliation_proof_url text,
  advance_code text,
  shopping_list_document_id text,
  shopping_list_compiled_by text
);

create table if not exists public.purchase_items (
  id text primary key,
  purchase_id text not null,
  product_id text not null,
  sales_order_id text,
  qty_target numeric not null default 0,
  qty_purchased numeric not null default 0,
  estimated_unit_price numeric not null default 0,
  actual_unit_price numeric not null default 0,
  notes text,
  receipt_url text,
  is_checked boolean not null default false,
  is_qced boolean not null default false,
  purchase_method text,
  online_ref text,
  online_order_date text,
  is_online_ordered boolean not null default false
);

create table if not exists public.deliveries (
  id text primary key,
  sales_order_id text not null,
  courier_id text not null,
  status text not null,
  delivery_date text,
  ba_url text,
  invoice_id text,
  notes text
);

create table if not exists public.invoices (
  id text primary key,
  sales_order_id text,
  sales_order_ids jsonb not null default '[]'::jsonb,
  is_consolidated boolean not null default false,
  consolidated_order_numbers jsonb not null default '[]'::jsonb,
  client_id text not null,
  issue_date text not null,
  due_date text not null,
  total_amount numeric not null default 0,
  amount_paid numeric not null default 0,
  status text not null,
  payments jsonb not null default '[]'::jsonb,
  paid_date text,
  superseded_by_invoice_id text
);

-- Backfill column for existing DBs
alter table public.invoices add column if not exists superseded_by_invoice_id text;

create table if not exists public.vendor_bills (
  id text primary key,
  bill_number text not null,
  vendor_id text not null,
  vendor_name text not null,
  issue_date text not null,
  due_date text not null,
  description text not null,
  category text,
  total_amount numeric not null default 0,
  amount_paid numeric not null default 0,
  status text not null,
  payments jsonb not null default '[]'::jsonb,
  receipt_url text,
  purchase_id text,
  created_at text not null,
  created_by text
);

create table if not exists public.journal_entries (
  id text primary key,
  transaction_date text not null,
  description text not null,
  reference_type text,
  reference_id text
);

create table if not exists public.journal_lines (
  id text primary key,
  journal_entry_id text not null,
  account_id text not null,
  debit_amount numeric not null default 0,
  credit_amount numeric not null default 0
);

create table if not exists public.stock_movements (
  id text primary key,
  date text not null,
  product_id text not null,
  product_name text,
  sku_code text,
  quantity numeric not null default 0,
  stock_delta numeric not null default 0,
  resulting_stock numeric not null default 0,
  direction text not null,
  kind text not null,
  source text not null,
  destination text,
  reference_type text,
  reference_id text,
  purchase_item_id text,
  sales_order_id text,
  note text,
  created_by_user_id text
);

create table if not exists public.leads (
  id text primary key,
  company_name text not null,
  contact_name text not null,
  value numeric not null default 0,
  status text not null,
  notes text,
  created_at text not null
);

create table if not exists public.disma_tasks (
  id text primary key,
  title text not null,
  description text not null default '',
  status text not null,
  priority text not null,
  assigned_to_id text not null,
  created_by_original_id text not null,
  due_date text not null,
  created_at text not null,
  progress numeric,
  comments jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb
);

create table if not exists public.notifications (
  id text primary key,
  user_id text not null,
  title text not null,
  message text not null,
  type text not null,
  link text,
  read boolean not null default false,
  created_at text not null
);

create table if not exists public.employees (
  id text primary key,
  user_id text,
  full_name text not null,
  position text not null,
  department text not null,
  base_salary numeric not null default 0,
  kasbon numeric not null default 0,
  join_date text not null,
  status text not null
);

create table if not exists public.kpis (
  id text primary key,
  assignee_user_id text not null,
  assigned_by_user_id text not null,
  specific text not null,
  measurable text not null,
  achievable text not null,
  relevant text not null,
  time_bound text not null,
  period text not null,
  weight numeric not null default 0,
  target_value numeric not null default 0,
  actual_value numeric not null default 0,
  unit text not null,
  title text not null,
  category text not null,
  status text not null,
  evaluator_note text,
  evaluated_at text,
  evaluated_by text,
  manual_grade text,
  created_at text not null,
  updated_at text
);

create table if not exists public.okr_objectives (
  id text primary key,
  title text not null,
  description text not null,
  period text not null,
  owner_id text not null,
  progress numeric not null default 0
);

create table if not exists public.okr_key_results (
  id text primary key,
  objective_id text not null,
  title text not null,
  target_value numeric not null default 0,
  current_value numeric not null default 0,
  unit text not null,
  linked_kpi_id text,
  linked_task_id text
);

create table if not exists public.expenses (
  id text primary key,
  date text not null,
  reporter_id text not null,
  category text not null,
  amount numeric not null default 0,
  admin_fee numeric,
  shipping_fee numeric,
  description text not null,
  receipt_url text,
  status text not null,
  reference_id text,
  is_journaled boolean not null default false,
  notes text,
  audit_date text,
  audit_note text,
  target_bank_account_id text,
  purchase_id text
);

create table if not exists public.reimbursements (
  id text primary key,
  date text not null,
  user_id text not null,
  title text not null,
  amount numeric not null default 0,
  description text not null,
  receipt_url text,
  status text not null,
  audit_date text,
  audit_note text,
  payment_date text,
  payment_reference text,
  purchase_id text
);

create table if not exists public.cash_transactions (
  id text primary key,
  date text not null,
  type text not null,
  amount numeric not null default 0,
  bank_account_id text not null,
  category text not null,
  description text not null,
  reference_type text,
  reference_id text,
  counterpart_name text,
  receipt_url text
);

create table if not exists public.fixed_assets (
  id text primary key,
  name text not null,
  category text not null,
  purchase_date text not null,
  purchase_price numeric not null default 0,
  economic_life_months integer not null default 0,
  salvage_value numeric not null default 0,
  current_value numeric not null default 0,
  accumulated_depreciation numeric not null default 0,
  status text not null
);

create table if not exists public.pending_returns (
  id text primary key,
  product_id text not null,
  original_so_id text not null,
  qty numeric not null default 0,
  reason text not null,
  date text not null,
  status text not null
);

create table if not exists public.rejected_items (
  id text primary key,
  date text not null,
  product_id text not null,
  qty numeric not null default 0,
  reason text not null,
  source text not null,
  reference_id text,
  reported_by text not null,
  image_url text
);

create table if not exists public.app_settings (
  id text primary key,
  nav_configs jsonb not null default '{}'::jsonb,
  role_permissions jsonb not null default '{}'::jsonb
);

create table if not exists public.client_prices (
  id text primary key,
  client_id text not null,
  product_id text not null,
  agreed_price numeric not null default 0,
  tier text not null,
  last_updated text not null,
  updated_by_user_id text
);

alter table public.users disable row level security;
alter table public.clients disable row level security;
alter table public.vendors disable row level security;
alter table public.products disable row level security;
alter table public.coas disable row level security;
alter table public.bank_accounts disable row level security;
alter table public.sales_orders disable row level security;
alter table public.sales_order_items disable row level security;
alter table public.purchases disable row level security;
alter table public.purchase_items disable row level security;
alter table public.deliveries disable row level security;
alter table public.invoices disable row level security;
alter table public.vendor_bills disable row level security;
alter table public.journal_entries disable row level security;
alter table public.journal_lines disable row level security;
alter table public.stock_movements disable row level security;
alter table public.leads disable row level security;
alter table public.disma_tasks disable row level security;
alter table public.notifications disable row level security;
alter table public.employees disable row level security;
alter table public.kpis disable row level security;
alter table public.okr_objectives disable row level security;
alter table public.okr_key_results disable row level security;
alter table public.expenses disable row level security;
alter table public.reimbursements disable row level security;
alter table public.cash_transactions disable row level security;
alter table public.fixed_assets disable row level security;
alter table public.pending_returns disable row level security;
alter table public.rejected_items disable row level security;
alter table public.app_settings disable row level security;
alter table public.client_prices disable row level security;

create table if not exists public.record_history (
  id                text primary key,
  table_name        text not null,
  record_id         text not null,
  action            text not null,
  changed_fields    jsonb not null default '[]'::jsonb,
  old_data          jsonb,
  new_data          jsonb,
  user_id           text,
  user_name         text,
  user_role         text,
  reason            text,
  parent_history_id text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_record_history_table_record on public.record_history (table_name, record_id, created_at desc);
create index if not exists idx_record_history_user         on public.record_history (user_id, created_at desc);
create index if not exists idx_record_history_created      on public.record_history (created_at desc);

alter table public.record_history disable row level security;

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
      'credit_amount', 0
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
      'credit_amount', v_amount
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
      credit_amount
    ) values (
      v_line->>'id',
      v_line->>'journal_entry_id',
      v_line->>'account_id',
      (v_line->>'debit_amount')::numeric,
      (v_line->>'credit_amount')::numeric
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
    'lines', v_all_lines,
    'inserted', true
  );
end;
$$;

create or replace function public.post_cash_transaction(
  p_transaction jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_date text;
  v_type text;
  v_amount numeric;
  v_bank_account_id text;
  v_category text;
  v_description text;
  v_reference_type text;
  v_reference_id text;
  v_counterpart_name text;
  v_receipt_url text;
  v_delta numeric;
  v_tx jsonb;
  v_bank jsonb;
  v_tx_row public.cash_transactions%rowtype;
  v_bank_row public.bank_accounts%rowtype;
begin
  if coalesce(jsonb_typeof(p_transaction), 'null') <> 'object' then
    raise exception 'cash transaction must be a JSON object';
  end if;

  v_id := nullif(trim(coalesce(p_transaction->>'id', '')), '');
  v_date := nullif(trim(coalesce(p_transaction->>'date', '')), '');
  v_type := nullif(trim(coalesce(p_transaction->>'type', '')), '');
  v_bank_account_id := nullif(trim(coalesce(p_transaction->>'bankAccountId', p_transaction->>'bank_account_id', '')), '');
  v_category := nullif(trim(coalesce(p_transaction->>'category', '')), '');
  v_description := nullif(trim(coalesce(p_transaction->>'description', '')), '');
  v_reference_type := nullif(trim(coalesce(p_transaction->>'referenceType', p_transaction->>'reference_type', '')), '');
  v_reference_id := nullif(trim(coalesce(p_transaction->>'referenceId', p_transaction->>'reference_id', '')), '');
  v_counterpart_name := nullif(trim(coalesce(p_transaction->>'counterpartName', p_transaction->>'counterpart_name', '')), '');
  v_receipt_url := nullif(trim(coalesce(p_transaction->>'receiptUrl', p_transaction->>'receipt_url', '')), '');
  v_amount := coalesce(nullif(p_transaction->>'amount', '')::numeric, 0);

  if v_id is null then
    raise exception 'cash transaction id is required';
  end if;
  if v_date is null then
    raise exception 'cash transaction date is required';
  end if;
  if v_type not in ('In', 'Out') then
    raise exception 'cash transaction type must be In or Out';
  end if;
  if v_amount <= 0 then
    raise exception 'cash transaction amount must be positive';
  end if;
  if v_bank_account_id is null then
    raise exception 'bank account id is required';
  end if;
  if v_category is null then
    raise exception 'cash transaction category is required';
  end if;
  if v_description is null then
    raise exception 'cash transaction description is required';
  end if;

  select to_jsonb(ct)
    into v_tx
    from public.cash_transactions ct
   where ct.id = v_id;

  if v_tx is not null then
    select to_jsonb(ba)
      into v_bank
      from public.bank_accounts ba
     where ba.id = v_bank_account_id;

    return jsonb_build_object(
      'transaction', v_tx,
      'bank_account', v_bank,
      'inserted', false
    );
  end if;

  select to_jsonb(ba)
    into v_bank
    from public.bank_accounts ba
   where ba.id = v_bank_account_id
   for update;

  if v_bank is null then
    raise exception 'bank account not found: %', v_bank_account_id;
  end if;

  v_delta := case when v_type = 'In' then v_amount else -v_amount end;

  insert into public.cash_transactions (
    id,
    date,
    type,
    amount,
    bank_account_id,
    category,
    description,
    reference_type,
    reference_id,
    counterpart_name,
    receipt_url
  ) values (
    v_id,
    v_date,
    v_type,
    v_amount,
    v_bank_account_id,
    v_category,
    v_description,
    v_reference_type,
    v_reference_id,
    v_counterpart_name,
    v_receipt_url
  )
  returning * into v_tx_row;

  v_tx := to_jsonb(v_tx_row);

  update public.bank_accounts
     set balance = balance + v_delta
   where id = v_bank_account_id
  returning * into v_bank_row;

  v_bank := to_jsonb(v_bank_row);

  return jsonb_build_object(
    'transaction', v_tx,
    'bank_account', v_bank,
    'inserted', true
  );
end;
$$;

commit;

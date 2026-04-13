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
  weekly_price_range jsonb not null default '{}'::jsonb
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
  client_signature text
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
  reconciliation_proof_url text
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
  paid_date text
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
  target_bank_account_id text
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
  payment_reference text
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

commit;

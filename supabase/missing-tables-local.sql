-- Apply ke LOCAL Supabase (plzkrzzmqatjgsitvmfd) via SQL Editor di dashboard
-- Tables yang missing: vendor_bills, stock_movements, rejected_items
-- Plus column: invoices.superseded_by_invoice_id

begin;

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

alter table public.invoices add column if not exists superseded_by_invoice_id text;

-- Disable RLS so service role + anon key can read/write freely (dev only)
alter table public.vendor_bills disable row level security;
alter table public.stock_movements disable row level security;
alter table public.rejected_items disable row level security;

commit;

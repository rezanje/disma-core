-- CFO Audit Refactor Migration
-- 1. Create table purchase_requests
CREATE TABLE IF NOT EXISTS public.purchase_requests (
    id text PRIMARY KEY,
    title text NOT NULL,
    description text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    category text NOT NULL,
    status text DEFAULT 'Pending_Finance' NOT NULL,
    requested_by text NOT NULL,
    approved_by_finance text,
    approved_by_cfo text,
    finance_note text,
    cfo_note text,
    reference_id text,
    created_at text NOT NULL
);

-- Enable RLS on purchase_requests
ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON TABLE public.purchase_requests TO postgres;
GRANT ALL ON TABLE public.purchase_requests TO anon;
GRANT ALL ON TABLE public.purchase_requests TO authenticated;
GRANT ALL ON TABLE public.purchase_requests TO service_role;

-- 2. Create stock_movements if it doesn't exist, and add new columns
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id text PRIMARY KEY,
    date text NOT NULL,
    product_id text NOT NULL,
    product_name text,
    sku_code text,
    quantity numeric DEFAULT 0 NOT NULL,
    stock_delta numeric DEFAULT 0 NOT NULL,
    resulting_stock numeric DEFAULT 0 NOT NULL,
    direction text NOT NULL,
    kind text NOT NULL,
    source text NOT NULL,
    destination text,
    reference_type text,
    reference_id text,
    purchase_item_id text,
    sales_order_id text,
    note text,
    created_by_user_id text
);

ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS warehouse_id text DEFAULT 'main' NOT NULL;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS batch_number text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS expiry_date text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS unit_cost numeric DEFAULT 0 NOT NULL;

-- Enable RLS on stock_movements just in case
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- Grant permissions on stock_movements
GRANT ALL ON TABLE public.stock_movements TO postgres;
GRANT ALL ON TABLE public.stock_movements TO anon;
GRANT ALL ON TABLE public.stock_movements TO authenticated;
GRANT ALL ON TABLE public.stock_movements TO service_role;

-- 3. Add column to purchase_items
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS expiry_date text;

-- 4. Add new Chart of Accounts (COA)
INSERT INTO public.coas (id, account_code, account_name, account_type)
VALUES 
  ('coa-ap-accrual', '2-1100', 'Hutang Akrual Belum Ditagih (AP Accrual)', 'Liability'),
  ('coa-persediaan-b2c', '1-3100', 'Persediaan Peralihan B2C', 'Asset')
ON CONFLICT (id) DO NOTHING;


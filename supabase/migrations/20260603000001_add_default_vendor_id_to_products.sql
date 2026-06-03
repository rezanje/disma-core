-- Default ("langganan") vendor per product. Used to auto-assign a vendor when a
-- product enters the shopping/consolidation list, and to show "items supplied"
-- per vendor in Vendor Management.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS default_vendor_id text;

CREATE INDEX IF NOT EXISTS idx_products_default_vendor_id
  ON public.products (default_vendor_id);

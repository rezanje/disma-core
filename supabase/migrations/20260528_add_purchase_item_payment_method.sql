-- Add payment_method to purchase_items table
ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS payment_method text;

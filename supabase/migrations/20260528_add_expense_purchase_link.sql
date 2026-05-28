-- Add missing columns to expenses table in production
-- purchase_id: links expense to a sourcing session (purchase)
-- target_bank_account_id: bank tujuan setoran pengembalian

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS purchase_id text;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS target_bank_account_id text;

-- Keep the selected cash source through transcription and expense approval.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS source_bank_account_id text REFERENCES public.bank_accounts(id);

NOTIFY pgrst, 'reload schema';

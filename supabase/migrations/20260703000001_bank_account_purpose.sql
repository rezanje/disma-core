-- Designate a bank account's role in the sourcing money flow (replaces the
-- Advance virtual wallets). 'sourcing' = the shared pool sourcing self-serves
-- from (e.g. Bank Jago), 'kurir' = courier pool, 'umum' = ordinary account.
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'umum';

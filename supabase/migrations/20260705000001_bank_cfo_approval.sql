-- Per-account CFO approval gate. true = transfers OUT of this account need
-- CFO approval (the strategic accounts: BRI revenue intake, Mandiri savings).
-- Everything else (BCA operational, Bank Jago, cash, pockets) defaults false
-- and is admin-finance-only.
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS cfo_approval_required boolean NOT NULL DEFAULT false;

-- Sourcing pocket: per-sourcer cash-in-hand account owner link + daily-close marker.
-- Pocket = bank_accounts row with purpose='sourcing_pocket' + owner_user_id set.
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS owner_user_id text;

CREATE TABLE IF NOT EXISTS public.tutup_hari_kantong (
    id TEXT PRIMARY KEY,
    sourcer_id TEXT NOT NULL,
    pocket_bank_account_id TEXT NOT NULL,
    date TEXT NOT NULL,
    ditarik NUMERIC NOT NULL DEFAULT 0,
    belanja NUMERIC NOT NULL DEFAULT 0,
    disetor NUMERIC NOT NULL DEFAULT 0,
    defisit NUMERIC NOT NULL DEFAULT 0,
    closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS tutup_hari_kantong_sourcer_date_idx
    ON public.tutup_hari_kantong(sourcer_id, date DESC);

ALTER TABLE public.tutup_hari_kantong ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.tutup_hari_kantong TO postgres;
GRANT ALL ON TABLE public.tutup_hari_kantong TO anon;
GRANT ALL ON TABLE public.tutup_hari_kantong TO authenticated;
GRANT ALL ON TABLE public.tutup_hari_kantong TO service_role;

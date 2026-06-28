-- supabase/migrations/20260628000001_disbursement_requests.sql
-- Migration for Disbursement Request Module
-- Modul terpisah untuk pencatatan pemindahan dana antar rekening bank internal

-- Create disbursement_requests table
CREATE TABLE IF NOT EXISTS public.disbursement_requests (
    id TEXT PRIMARY KEY,
    from_bank_account_id TEXT NOT NULL,
    to_bank_account_id TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    requested_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Pending_CFO', 'Approved', 'Transferred', 'Rejected')),
    cfo_note TEXT,
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    transferred_at TIMESTAMPTZ,
    transferred_by TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS disbursement_requests_status_idx ON public.disbursement_requests(status);
CREATE INDEX IF NOT EXISTS disbursement_requests_requested_at_idx ON public.disbursement_requests(requested_at DESC);

-- Enable Row Level Security
ALTER TABLE public.disbursement_requests ENABLE ROW LEVEL SECURITY;

-- Grant all permissions to Supabase roles
GRANT ALL ON TABLE public.disbursement_requests TO postgres;
GRANT ALL ON TABLE public.disbursement_requests TO anon;
GRANT ALL ON TABLE public.disbursement_requests TO authenticated;
GRANT ALL ON TABLE public.disbursement_requests TO service_role;

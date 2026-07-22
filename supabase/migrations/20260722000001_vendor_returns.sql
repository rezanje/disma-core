-- supabase/migrations/20260722000001_vendor_returns.sql
-- Vendor-return tracking for customer returns sent back to a vendor for swap.
-- Lifecycle: Menunggu Vendor -> Selesai-Ditukar | Selesai-Ditolak

CREATE TABLE IF NOT EXISTS public.vendor_returns (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    qty NUMERIC NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    date TIMESTAMPTZ DEFAULT NOW(),
    original_return_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Menunggu Vendor'
        CHECK (status IN ('Menunggu Vendor', 'Selesai-Ditukar', 'Selesai-Ditolak')),
    resolved_date TIMESTAMPTZ,
    replacement_pass_qty NUMERIC,
    replacement_reject_qty NUMERIC
);

CREATE INDEX IF NOT EXISTS vendor_returns_status_idx ON public.vendor_returns(status);
CREATE INDEX IF NOT EXISTS vendor_returns_vendor_idx ON public.vendor_returns(vendor_id);

ALTER TABLE public.vendor_returns ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.vendor_returns TO postgres;
GRANT ALL ON TABLE public.vendor_returns TO anon;
GRANT ALL ON TABLE public.vendor_returns TO authenticated;
GRANT ALL ON TABLE public.vendor_returns TO service_role;

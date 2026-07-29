-- supabase/migrations/20260730000001_record_history.sql
-- Audit trail behind Activity Log and the rollback dialog.
--
-- The table was only ever declared in supabase/dev-bootstrap.sql, which seeds a
-- fresh local database. Production was migrated table by table and never got it,
-- so every logHistory() write failed with "Could not find the table
-- 'public.record_history'". The writer swallows that error by design (audit must
-- never block a business action), so nothing was recorded and nothing complained:
-- Activity Log stayed empty and rollback had no versions to restore.
--
-- Columns and indexes match dev-bootstrap.sql exactly so both paths agree.

CREATE TABLE IF NOT EXISTS public.record_history (
    id                TEXT PRIMARY KEY,
    table_name        TEXT NOT NULL,
    record_id         TEXT NOT NULL,
    action            TEXT NOT NULL,
    changed_fields    JSONB NOT NULL DEFAULT '[]'::jsonb,
    old_data          JSONB,
    new_data          JSONB,
    user_id           TEXT,
    user_name         TEXT,
    user_role         TEXT,
    reason            TEXT,
    parent_history_id TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-record timeline (rollback dialog), per-user audit, and the unfiltered feed.
CREATE INDEX IF NOT EXISTS idx_record_history_table_record ON public.record_history (table_name, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_record_history_user         ON public.record_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_record_history_created      ON public.record_history (created_at DESC);

-- Reads and writes both go through server routes on the service role
-- (/api/history and /api/db), so RLS stays on with no policy — same as every
-- other table here. No browser client touches this directly.
ALTER TABLE public.record_history ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.record_history TO postgres;
GRANT ALL ON TABLE public.record_history TO anon;
GRANT ALL ON TABLE public.record_history TO authenticated;
GRANT ALL ON TABLE public.record_history TO service_role;

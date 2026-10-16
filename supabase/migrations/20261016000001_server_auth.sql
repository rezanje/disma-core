-- PREPARED ONLY. Apply before enabling server login. No default accounts/PINs.
BEGIN;
CREATE TABLE IF NOT EXISTS public.auth_sessions (
 id text PRIMARY KEY,
 user_id text NOT NULL,
 fingerprint text NOT NULL,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON public.auth_sessions(expires_at);
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.auth_sessions TO service_role;
CREATE TABLE IF NOT EXISTS public.auth_login_attempts (
 key text PRIMARY KEY,
 window_start timestamptz NOT NULL,
 attempts integer NOT NULL
);
ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_login_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.auth_login_attempts TO service_role;
CREATE OR REPLACE FUNCTION public.take_auth_login_attempt(p_key text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE attempt_count integer;
BEGIN
 INSERT INTO public.auth_login_attempts AS limits(key,window_start,attempts)
 VALUES(p_key,clock_timestamp(),1)
 ON CONFLICT(key) DO UPDATE SET
 attempts = CASE WHEN limits.window_start < clock_timestamp()-interval '15 minutes' THEN 1 ELSE limits.attempts+1 END,
 window_start = CASE WHEN limits.window_start < clock_timestamp()-interval '15 minutes' THEN clock_timestamp() ELSE limits.window_start END
 RETURNING attempts INTO attempt_count;
 RETURN attempt_count <= 10;
END;
$$;
REVOKE ALL ON FUNCTION public.take_auth_login_attempt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_auth_login_attempt(text) TO service_role;
COMMIT;

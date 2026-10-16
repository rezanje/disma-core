\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE allowed boolean;
BEGIN
 IF has_table_privilege('anon','public.auth_sessions','SELECT') THEN RAISE EXCEPTION 'anon can read sessions'; END IF;
 IF has_table_privilege('authenticated','public.auth_sessions','INSERT') THEN RAISE EXCEPTION 'browser can forge sessions'; END IF;
 IF has_function_privilege('anon','public.take_auth_login_attempt(text)','EXECUTE') THEN RAISE EXCEPTION 'anon can consume limiter'; END IF;
 IF NOT has_function_privilege('service_role','public.take_auth_login_attempt(text)','EXECUTE') THEN RAISE EXCEPTION 'service limiter unavailable'; END IF;
 FOR i IN 1..10 LOOP
  allowed=public.take_auth_login_attempt('offline-auth-limit-fixture');
  IF NOT allowed THEN RAISE EXCEPTION 'attempt % rejected too early',i; END IF;
 END LOOP;
 IF public.take_auth_login_attempt('offline-auth-limit-fixture') THEN RAISE EXCEPTION '11th attempt accepted'; END IF;
 UPDATE public.auth_login_attempts SET window_start=clock_timestamp()-interval '16 minutes' WHERE key='offline-auth-limit-fixture';
 IF NOT public.take_auth_login_attempt('offline-auth-limit-fixture') THEN RAISE EXCEPTION 'expired limiter window did not reset'; END IF;
END;
$$;
DO $$
DECLARE routine record;
BEGIN
 FOR routine IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('post_cash_transaction','post_journal_entry','issue_tukar_faktur','link_invoices_to_tukar_faktur','delete_tukar_faktur','generate_vendor_bill_number','record_client_receipt','post_financial_event','process_goods_event')
 LOOP
  IF has_function_privilege('anon',routine.signature,'EXECUTE') OR has_function_privilege('authenticated',routine.signature,'EXECUTE') THEN RAISE EXCEPTION 'browser can execute %',routine.signature; END IF;
  IF NOT has_function_privilege('service_role',routine.signature,'EXECUTE') THEN RAISE EXCEPTION 'service cannot execute %',routine.signature; END IF;
 END LOOP;
END;
$$;
ROLLBACK;

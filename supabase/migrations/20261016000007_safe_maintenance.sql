-- PREPARED ONLY: complete, atomic maintenance. Never apply to a connected live DB automatically.
BEGIN;
-- This live-app table was missing from the historical schema migration chain.
CREATE TABLE IF NOT EXISTS public.vendor_prices (
 id text PRIMARY KEY, vendor_id text NOT NULL REFERENCES public.vendors(id),
 product_id text REFERENCES public.products(id), proposed_name text,
 price numeric NOT NULL CHECK(price >= 0), uom text NOT NULL,
 valid_from text NOT NULL, valid_to text NOT NULL, status text NOT NULL,
 source text NOT NULL, notes text, last_updated text NOT NULL, created_at text NOT NULL
);
ALTER TABLE public.vendor_prices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendor_prices FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.vendor_prices TO service_role;
CREATE TABLE IF NOT EXISTS public.maintenance_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, actor_id text NOT NULL,
 manifest jsonb NOT NULL, previous_snapshot jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.maintenance_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.maintenance_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.maintenance_events TO service_role;

CREATE OR REPLACE FUNCTION public.business_backup_tables() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$ SELECT ARRAY['app_settings','users','clients','vendors','products','coas','bank_accounts','employees','leads','budget_plans','budget_categories','budget_sub_categories','budget_adjustments','purchase_requests','purchases','vendor_bills','sales_orders','sales_order_items','purchase_items','tukar_faktur','deliveries','invoices','journal_entries','journal_lines','stock_movements','expenses','reimbursements','cash_transactions','disbursement_requests','tutup_hari_kantong','pending_returns','vendor_returns','rejected_items','fixed_assets','client_prices','vendor_prices','notifications','disma_tasks','kpis','okr_objectives','okr_key_results','record_history','shopping_draft','daily_close','credit_notes','client_receipts','client_receipt_allocations','financial_events','financial_command_events','goods_events','purchase_events','bank_reconciliation_statements','bank_reconciliation_rows','bank_reconciliation_matches','vendor_advances','vendor_advance_allocations','vendor_claim_settlements','financial_reversals']::text[] $$;
REVOKE ALL ON FUNCTION public.business_backup_tables() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_backup_tables() TO service_role;

CREATE OR REPLACE FUNCTION public.snapshot_business_data() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tables text[]:=public.business_backup_tables(); t text; lock_list text;
 rows jsonb; body jsonb:='{}'; counts jsonb:='{}';
BEGIN
 SELECT string_agg(format('public.%I',name),',') INTO lock_list FROM unnest(tables) name;
 -- Lock every business table before reading the first one. A failed/missing table
 -- aborts the complete snapshot; ordinary concurrent writes wait until it ends.
 EXECUTE 'LOCK TABLE '||lock_list||' IN SHARE MODE';
 FOREACH t IN ARRAY tables LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) FROM public.%I r',t) INTO rows;
  body:=body||jsonb_build_object(t,rows);
  counts:=counts||jsonb_build_object(t,jsonb_array_length(rows));
 END LOOP;
 RETURN jsonb_build_object('manifest',jsonb_build_object(
  'format','disma-backup','version',1,'createdAt',clock_timestamp(),
  'tables',to_jsonb(tables),'counts',counts,
  'excludedTables',jsonb_build_array('auth_sessions','auth_login_attempts','maintenance_events')),'data',body);
END $$;
REVOKE ALL ON FUNCTION public.snapshot_business_data() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_business_data() TO service_role;

CREATE OR REPLACE FUNCTION public.restore_business_backup(p_backup jsonb,p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tables text[]:=public.business_backup_tables(); t text; key text; row jsonb;
 rows jsonb; lock_list text; manifest jsonb:=p_backup->'manifest'; expected int; actual int;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor AND role='super_admin') THEN RAISE EXCEPTION 'Super Admin required'; END IF;
 IF jsonb_typeof(p_backup) IS DISTINCT FROM 'object' OR jsonb_typeof(manifest) IS DISTINCT FROM 'object'
  OR manifest->>'format' IS DISTINCT FROM 'disma-backup' OR manifest->'version' IS DISTINCT FROM '1'::jsonb
  OR jsonb_typeof(manifest->'createdAt') IS DISTINCT FROM 'string'
  OR jsonb_typeof(manifest->'counts') IS DISTINCT FROM 'object'
  OR manifest->'tables' IS DISTINCT FROM to_jsonb(tables)
  OR jsonb_typeof(p_backup->'data') IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'Complete versioned backup manifest required'; END IF;
 PERFORM (manifest->>'createdAt')::timestamptz;
 IF (SELECT count(*) FROM jsonb_object_keys(p_backup->'data'))<>cardinality(tables)
  OR (SELECT count(*) FROM jsonb_object_keys(manifest->'counts'))<>cardinality(tables)
 THEN RAISE EXCEPTION 'Backup table manifest incomplete'; END IF;
 SELECT string_agg(format('public.%I',name),',') INTO lock_list FROM unnest(tables) name;
 EXECUTE 'LOCK TABLE '||lock_list||' IN EXCLUSIVE MODE';
 -- Validate every table, count and column before deleting a single business row.
 FOREACH t IN ARRAY tables LOOP
  rows:=p_backup->'data'->t;
  IF jsonb_typeof(rows) IS DISTINCT FROM 'array' OR jsonb_typeof(manifest->'counts'->t) IS DISTINCT FROM 'number'
   OR (manifest->'counts'->t)::text !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Invalid backup table/count: %',t; END IF;
  expected:=(manifest->'counts'->>t)::int;
  IF expected<>jsonb_array_length(rows) THEN RAISE EXCEPTION 'Backup count mismatch: %',t; END IF;
  FOR row IN SELECT value FROM jsonb_array_elements(rows) LOOP
   IF jsonb_typeof(row) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid backup row: %',t; END IF;
   FOR key IN SELECT jsonb_object_keys(row) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=format('public.%I',t)::regclass AND attname=key AND attnum>0 AND NOT attisdropped)
    THEN RAISE EXCEPTION 'Unknown backup column %.%',t,key; END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 FOR actual IN REVERSE cardinality(tables)..1 LOOP
  EXECUTE format('DELETE FROM public.%I',tables[actual]);
 END LOOP;
 FOREACH t IN ARRAY tables LOOP
  rows:=p_backup->'data'->t;
  EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_recordset(NULL::public.%I,$1)',t,t) USING rows;
  GET DIAGNOSTICS actual=ROW_COUNT;
  IF actual<>(manifest->'counts'->>t)::int THEN RAISE EXCEPTION 'Restored count mismatch: %',t; END IF;
 END LOOP;
 -- Runtime sessions are never imported. All existing sessions must reauthenticate.
 UPDATE public.auth_sessions SET revoked_at=coalesce(revoked_at,clock_timestamp());
 INSERT INTO public.maintenance_events(kind,actor_id,manifest) VALUES('restore',p_actor,manifest);
 RETURN jsonb_build_object('success',true,'counts',manifest->'counts');
END $$;
REVOKE ALL ON FUNCTION public.restore_business_backup(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.restore_business_backup(jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.reset_business_data(p_actor text,p_mode text,p_confirmation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE before_backup jsonb; reset_backup jsonb; t text; rows jsonb;
 keep_tables text[]:=ARRAY['app_settings','users','clients','vendors','products','coas','bank_accounts','employees','client_prices','vendor_prices'];
BEGIN
 IF p_mode IS NULL OR p_mode NOT IN ('all','operational') OR p_confirmation IS DISTINCT FROM 'RESET NONPRODUCTION DATA'
 THEN RAISE EXCEPTION 'Explicit reset mode and confirmation required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor AND role='super_admin') THEN RAISE EXCEPTION 'Super Admin required'; END IF;
 before_backup:=public.snapshot_business_data(); reset_backup:=before_backup;
 FOREACH t IN ARRAY public.business_backup_tables() LOOP
  IF p_mode='all' OR NOT(t=ANY(keep_tables)) THEN
   reset_backup:=jsonb_set(reset_backup,ARRAY['data',t],'[]');
   reset_backup:=jsonb_set(reset_backup,ARRAY['manifest','counts',t],'0');
  END IF;
 END LOOP;
 IF p_mode='operational' THEN
  SELECT coalesce(jsonb_agg(value||jsonb_build_object('balance',0)),'[]') INTO rows FROM jsonb_array_elements(reset_backup->'data'->'bank_accounts');
  reset_backup:=jsonb_set(reset_backup,ARRAY['data','bank_accounts'],rows);
  SELECT coalesce(jsonb_agg(value||jsonb_build_object('current_stock',0,'b2c_stock',0)),'[]') INTO rows FROM jsonb_array_elements(reset_backup->'data'->'products');
  reset_backup:=jsonb_set(reset_backup,ARRAY['data','products'],rows);
 END IF;
 PERFORM public.restore_business_backup(reset_backup,p_actor);
 INSERT INTO public.maintenance_events(kind,actor_id,manifest,previous_snapshot) VALUES('reset:'||p_mode,p_actor,before_backup->'manifest',before_backup);
 RETURN jsonb_build_object('success',true,'mode',p_mode);
END $$;
REVOKE ALL ON FUNCTION public.reset_business_data(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reset_business_data(text,text,text) TO service_role;
COMMIT;

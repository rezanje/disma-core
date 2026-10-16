BEGIN;
CREATE TABLE IF NOT EXISTS public.bank_reconciliation_statements (
 id text PRIMARY KEY, bank_account_id text NOT NULL REFERENCES public.bank_accounts(id),
 content_hash text NOT NULL, file_name text NOT NULL, payload jsonb NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(), imported_by text NOT NULL,
 UNIQUE(bank_account_id,content_hash)
);
CREATE TABLE IF NOT EXISTS public.bank_reconciliation_rows (
 id text PRIMARY KEY, statement_id text NOT NULL REFERENCES public.bank_reconciliation_statements(id),
 row_index integer NOT NULL CHECK(row_index>0), date date NOT NULL, description text NOT NULL,
 amount numeric NOT NULL CHECK(amount>0 AND amount::text NOT IN ('NaN','Infinity','-Infinity')),
 type text NOT NULL CHECK(type IN ('CR','DB')), UNIQUE(statement_id,row_index)
);
CREATE TABLE IF NOT EXISTS public.bank_reconciliation_matches (
 id text PRIMARY KEY, statement_id text NOT NULL REFERENCES public.bank_reconciliation_statements(id),
 row_id text NOT NULL UNIQUE REFERENCES public.bank_reconciliation_rows(id),
 journal_line_id text NOT NULL UNIQUE REFERENCES public.journal_lines(id),
 matched_at timestamptz NOT NULL DEFAULT now(), matched_by text NOT NULL
);
ALTER TABLE public.bank_reconciliation_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliation_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliation_matches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_reconciliation_statements,public.bank_reconciliation_rows,public.bank_reconciliation_matches FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.bank_reconciliation_statements,public.bank_reconciliation_rows,public.bank_reconciliation_matches TO service_role;

CREATE OR REPLACE FUNCTION public.bank_reconciliation_snapshot(p_statement_id text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('statement',(SELECT to_jsonb(s) FROM public.bank_reconciliation_statements s WHERE id=p_statement_id),
  'rows',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.row_index) FROM public.bank_reconciliation_rows r WHERE statement_id=p_statement_id),'[]'::jsonb),
  'matches',coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM public.bank_reconciliation_matches m WHERE statement_id=p_statement_id),'[]'::jsonb))
$$;
CREATE OR REPLACE FUNCTION public.import_bank_reconciliation(p_statement jsonb,p_actor_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id text:=p_statement->>'id'; v_bank text:=p_statement->>'bankAccountId'; v_hash text:=p_statement->>'contentHash';
 v_existing public.bank_reconciliation_statements%ROWTYPE; v_row jsonb; v_index integer:=0; v_amount numeric;
BEGIN
 IF nullif(p_actor_id,'') IS NULL OR v_hash !~ '^[a-f0-9]{64}$' OR v_id IS DISTINCT FROM 'statement:'||v_hash OR nullif(v_bank,'') IS NULL
  OR jsonb_typeof(p_statement->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p_statement->'rows') NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Invalid statement import';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_id,0));
 PERFORM id FROM public.bank_accounts WHERE id=v_bank FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bank account not found';END IF;
 SELECT * INTO v_existing FROM public.bank_reconciliation_statements WHERE id=v_id OR (bank_account_id=v_bank AND content_hash=v_hash) FOR UPDATE;
 IF FOUND THEN
  IF v_existing.bank_account_id IS DISTINCT FROM v_bank OR v_existing.payload IS DISTINCT FROM p_statement->'rows' THEN RAISE EXCEPTION 'Statement event conflict'; END IF;
  RETURN public.bank_reconciliation_snapshot(v_existing.id);
 END IF;
 INSERT INTO public.bank_reconciliation_statements(id,bank_account_id,content_hash,file_name,payload,imported_by)
 VALUES(v_id,v_bank,v_hash,left(coalesce(p_statement->>'fileName','statement.csv'),255),p_statement->'rows',p_actor_id);
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_statement->'rows') LOOP
  v_index:=v_index+1;v_amount:=(v_row->>'amount')::numeric;
  IF v_amount IS NULL OR v_amount<=0 OR v_amount::text IN ('NaN','Infinity','-Infinity') OR round(v_amount,2)<>v_amount
   OR v_row->>'type' NOT IN ('CR','DB') OR nullif(v_row->>'date','') IS NULL THEN RAISE EXCEPTION 'Invalid statement row';END IF;
  INSERT INTO public.bank_reconciliation_rows(id,statement_id,row_index,date,description,amount,type)
  VALUES(v_id||':'||v_index,v_id,v_index,(v_row->>'date')::date,coalesce(v_row->>'description',''),v_amount,v_row->>'type');
 END LOOP;
 RETURN public.bank_reconciliation_snapshot(v_id);
END $$;

CREATE OR REPLACE FUNCTION public.match_bank_reconciliation(p_match jsonb,p_actor_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id text:=p_match->>'eventId'; v_statement text:=p_match->>'statementId'; v_row_id text:=p_match->>'rowId';v_line_id text:=p_match->>'journalLineId';
 v_row public.bank_reconciliation_rows%ROWTYPE;v_line public.journal_lines%ROWTYPE;v_statement_row public.bank_reconciliation_statements%ROWTYPE;
 v_existing public.bank_reconciliation_matches%ROWTYPE;v_account_code text;v_transaction_date text;
BEGIN
 IF nullif(v_id,'') IS NULL OR length(v_id)>200 OR nullif(p_actor_id,'') IS NULL THEN RAISE EXCEPTION 'Invalid reconciliation event';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_id,0));
 SELECT * INTO v_existing FROM public.bank_reconciliation_matches WHERE id=v_id;
 IF FOUND THEN
  IF v_existing.statement_id IS DISTINCT FROM v_statement OR v_existing.row_id IS DISTINCT FROM v_row_id OR v_existing.journal_line_id IS DISTINCT FROM v_line_id THEN RAISE EXCEPTION 'Reconciliation event conflict';END IF;
  RETURN public.bank_reconciliation_snapshot(v_statement);
 END IF;
 SELECT * INTO v_row FROM public.bank_reconciliation_rows WHERE id=v_row_id FOR UPDATE;
 IF NOT FOUND OR v_row.statement_id IS DISTINCT FROM v_statement THEN RAISE EXCEPTION 'Statement row membership mismatch';END IF;
 SELECT * INTO v_statement_row FROM public.bank_reconciliation_statements WHERE id=v_statement FOR SHARE;
 SELECT account_code INTO v_account_code FROM public.bank_accounts WHERE id=v_statement_row.bank_account_id FOR SHARE;
 IF nullif(v_account_code,'') IS NULL OR (SELECT count(*) FROM public.bank_accounts WHERE account_code=v_account_code)<>1
  OR (SELECT count(*) FROM public.coas WHERE account_code=v_account_code)<>1 THEN RAISE EXCEPTION 'Bank requires a unique mapped ledger account';END IF;
 SELECT * INTO v_line FROM public.journal_lines WHERE id=v_line_id FOR SHARE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.coas WHERE id=v_line.account_id AND account_code=v_account_code) THEN RAISE EXCEPTION 'Journal line belongs to a different bank';END IF;
 SELECT transaction_date INTO v_transaction_date FROM public.journal_entries WHERE id=v_line.journal_entry_id;
 IF v_transaction_date IS NULL OR abs(v_transaction_date::date-v_row.date)>7 THEN RAISE EXCEPTION 'Journal date differs from statement';END IF;
 IF (v_row.type='CR' AND (coalesce(v_line.debit_amount,0)<>v_row.amount OR coalesce(v_line.credit_amount,0)<>0))
  OR (v_row.type='DB' AND (coalesce(v_line.credit_amount,0)<>v_row.amount OR coalesce(v_line.debit_amount,0)<>0)) THEN RAISE EXCEPTION 'Statement amount or direction differs from journal';END IF;
 INSERT INTO public.bank_reconciliation_matches(id,statement_id,row_id,journal_line_id,matched_by) VALUES(v_id,v_statement,v_row_id,v_line_id,p_actor_id);
 RETURN public.bank_reconciliation_snapshot(v_statement);
END $$;
REVOKE ALL ON FUNCTION public.bank_reconciliation_snapshot(text),public.import_bank_reconciliation(jsonb,text),public.match_bank_reconciliation(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bank_reconciliation_snapshot(text),public.import_bank_reconciliation(jsonb,text),public.match_bank_reconciliation(jsonb,text) TO service_role;
COMMIT;

\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.coas(id,account_code,account_name,account_type) VALUES ('recon-bank-coa','1-1099','Recon Bank','Asset'),('recon-other-coa','1-1098','Other Bank','Asset');
INSERT INTO public.bank_accounts(id,name,account_code,balance) VALUES ('recon-bank','Recon Bank','1-1099',0),('recon-other','Other Bank','1-1098',0);
INSERT INTO public.journal_entries(id,transaction_date,description,reference_type,reference_id) VALUES ('recon-je','2026-10-01','Test bank entry','Manual','recon-source');
INSERT INTO public.journal_lines(id,journal_entry_id,account_id,debit_amount,credit_amount) VALUES ('recon-line','recon-je','recon-bank-coa',100,0),('recon-wrong','recon-je','recon-other-coa',100,0),('recon-withdrawal','recon-je','recon-bank-coa',0,40);
CREATE FUNCTION pg_temp.import_statement(hash text, bank text DEFAULT 'recon-bank') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.import_bank_reconciliation(jsonb_build_object('id','statement:'||hash,'contentHash',hash,'bankAccountId',bank,'fileName','quoted.csv','rows',jsonb_build_array(jsonb_build_object('date','2026-10-01','description','Client, first transfer','amount',100,'type','CR'),jsonb_build_object('date','2026-10-01','description','Withdrawal','amount',40,'type','DB'))),'finance');
$$;
CREATE FUNCTION pg_temp.match_row(event text, hash text, row_index integer, line text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.match_bank_reconciliation(jsonb_build_object('eventId',event,'statementId','statement:'||hash,'rowId','statement:'||hash||':'||row_index,'journalLineId',line),'finance');
$$;
SELECT pg_temp.import_statement(repeat('a',64));
SELECT pg_temp.import_statement(repeat('a',64));
SELECT pg_temp.match_row('recon-match',repeat('a',64),1,'recon-line');
SELECT pg_temp.match_row('recon-match',repeat('a',64),1,'recon-line');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.bank_reconciliation_statements WHERE bank_account_id='recon-bank')<>1 THEN RAISE EXCEPTION 'Import retry duplicated statement'; END IF;
 IF (SELECT count(*) FROM public.bank_reconciliation_matches WHERE id='recon-match')<>1 THEN RAISE EXCEPTION 'Match retry duplicated'; END IF;
 BEGIN PERFORM pg_temp.match_row('recon-conflict',repeat('a',64),2,'recon-line');RAISE EXCEPTION 'Expected row mismatch rejection';EXCEPTION WHEN OTHERS THEN IF SQLERRM='Expected row mismatch rejection' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.match_row('recon-match',repeat('a',64),2,'recon-withdrawal');RAISE EXCEPTION 'Expected conflicting event rejection';EXCEPTION WHEN OTHERS THEN IF SQLERRM='Expected conflicting event rejection' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.match_row('recon-wrong-bank',repeat('a',64),2,'recon-wrong');RAISE EXCEPTION 'Expected wrong bank rejection';EXCEPTION WHEN OTHERS THEN IF SQLERRM='Expected wrong bank rejection' THEN RAISE;END IF;END;
END $$;
SELECT pg_temp.import_statement(repeat('b',64));
DO $$ BEGIN
 BEGIN PERFORM pg_temp.match_row('recon-reuse',repeat('b',64),1,'recon-line');RAISE EXCEPTION 'Expected global ledger reuse rejection';EXCEPTION WHEN OTHERS THEN IF SQLERRM='Expected global ledger reuse rejection' THEN RAISE;END IF;END;
 IF EXISTS(SELECT 1 FROM public.bank_reconciliation_matches WHERE id='recon-reuse') THEN RAISE EXCEPTION 'Failed match left partial state';END IF;
 IF has_table_privilege('anon','public.bank_reconciliation_rows','INSERT') OR has_function_privilege('authenticated','public.match_bank_reconciliation(jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'Untrusted reconciliation access'; END IF;
END $$;
SELECT pg_temp.match_row('recon-out',repeat('a',64),2,'recon-withdrawal');
CREATE FUNCTION pg_temp.recon_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected-recon-failure';END $$;
DO $$
DECLARE target text;rejected boolean;
BEGIN
 FOREACH target IN ARRAY ARRAY['bank_reconciliation_statements','bank_reconciliation_rows'] LOOP
  EXECUTE format('CREATE TRIGGER recon_fault BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION pg_temp.recon_fault()',target);
  rejected:=false;
  BEGIN PERFORM pg_temp.import_statement(repeat('e',64));EXCEPTION WHEN OTHERS THEN rejected:=true;IF SQLERRM NOT LIKE '%injected-recon-failure%' THEN RAISE;END IF;END;
  IF NOT rejected OR EXISTS(SELECT 1 FROM public.bank_reconciliation_statements WHERE id='statement:'||repeat('e',64)) THEN RAISE EXCEPTION 'Failed import left partial header';END IF;
  EXECUTE format('DROP TRIGGER recon_fault ON public.%I',target);
 END LOOP;
END $$;
SELECT pg_temp.import_statement(repeat('e',64));
INSERT INTO public.journal_lines(id,journal_entry_id,account_id,debit_amount,credit_amount) VALUES ('recon-fault-line','recon-je','recon-bank-coa',100,0);
CREATE TRIGGER recon_fault BEFORE INSERT ON public.bank_reconciliation_matches FOR EACH ROW EXECUTE FUNCTION pg_temp.recon_fault();
DO $$ BEGIN
 BEGIN PERFORM pg_temp.match_row('recon-fault',repeat('e',64),1,'recon-fault-line');RAISE EXCEPTION 'Expected injected match failure';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%injected-recon-failure%' THEN RAISE;END IF;END;
 IF EXISTS(SELECT 1 FROM public.bank_reconciliation_matches WHERE id='recon-fault') THEN RAISE EXCEPTION 'Failed match left partial state';END IF;
 IF (SELECT balance FROM public.bank_accounts WHERE id='recon-bank')<>0 THEN RAISE EXCEPTION 'Reconciliation changed money';END IF;
END $$;
ROLLBACK;

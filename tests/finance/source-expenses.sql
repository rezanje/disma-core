\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.users(id,name,role,pin) VALUES('finance','Finance','finance','fixture-finance');
INSERT INTO public.coas(id,account_code,account_name,account_type)
 SELECT 'source-'||code,code,code,CASE WHEN code LIKE '6-%' THEN 'Expense' ELSE 'Asset' END
 FROM unnest(ARRAY['1-1000','2-1100','6-9000','6-1600','6-1700']) code
 WHERE NOT EXISTS(SELECT 1 FROM public.coas WHERE account_code=code);
INSERT INTO public.bank_accounts(id,name,account_code,balance) VALUES ('source-bank','Bank','1-1000',100000);
INSERT INTO public.expenses(id,date,reporter_id,category,amount,description,status,source_bank_account_id)
 VALUES ('source-expense','2026-10-16','performer','Lainnya',1000,'Office','Pending Audit','source-bank'),('source-fail','2026-10-16','performer','Lainnya',1000,'Office','Pending Audit','source-bank');
INSERT INTO public.purchases(id,date,purchaser_id,status) VALUES ('source-purchase','2026-10-16','performer','Pending');
INSERT INTO public.purchase_items(id,purchase_id,product_id,qty_target,purchase_method,payment_method) VALUES ('source-online','source-purchase','product',10,'Online','Transfer');
INSERT INTO public.purchase_requests(id,title,description,amount,category,status,requested_by,created_at)
 VALUES ('source-pr','Office','Office',1000,'Operasional','Approved','performer','2026-10-16');
\o /dev/null
SELECT public.post_financial_event('{"eventId":"source-expense-1","kind":"expense","date":"2026-10-16","bankAccountId":"source-bank","amount":1000,"referenceId":"source-expense"}','finance');
SELECT public.post_financial_event('{"eventId":"source-online-1","kind":"online-purchase","date":"2026-10-16","bankAccountId":"source-bank","amount":1000,"referenceId":"source-online","adminFee":50,"shippingFee":50}','finance');
SELECT public.post_financial_event('{"eventId":"source-pr-1","kind":"pr-expense","date":"2026-10-16","bankAccountId":"source-bank","amount":1000,"referenceId":"source-pr","debitAccountCode":"6-9000"}','finance');
\o
DO $$ DECLARE input jsonb; rejected boolean; BEGIN
 IF (SELECT balance FROM public.bank_accounts WHERE id='source-bank')<>97000 THEN RAISE EXCEPTION 'Source cash balance wrong'; END IF;
 IF NOT (SELECT is_journaled FROM public.expenses WHERE id='source-expense') OR (SELECT status FROM public.expenses WHERE id='source-expense')<>'Approved' THEN RAISE EXCEPTION 'Expense status not committed'; END IF;
 IF NOT (SELECT is_online_audited FROM public.purchase_items WHERE id='source-online') OR (SELECT actual_unit_price FROM public.purchase_items WHERE id='source-online')<>90 OR (SELECT qty_purchased FROM public.purchase_items WHERE id='source-online')<>10 THEN RAISE EXCEPTION 'Online source mismatch'; END IF;
 IF (SELECT disbursed_at FROM public.purchase_requests WHERE id='source-pr') IS NULL THEN RAISE EXCEPTION 'PR source did not finalize'; END IF;
 FOR input IN SELECT value FROM jsonb_array_elements('[{"eventId":"duplicate-expense","kind":"expense","referenceId":"source-expense"},{"eventId":"duplicate-online","kind":"online-purchase","referenceId":"source-online"},{"eventId":"duplicate-pr","kind":"pr-expense","referenceId":"source-pr"}]') LOOP
  rejected:=false;
  BEGIN PERFORM public.post_financial_event(input||'{"date":"2026-10-16","bankAccountId":"source-bank","amount":1000}'::jsonb,'finance'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Source posted twice using different event ID'; END IF;
 END LOOP;
END $$;
CREATE FUNCTION pg_temp.expense_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'source-status-fault'; END $$;
CREATE TRIGGER expense_fault BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION pg_temp.expense_fault();
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM public.post_financial_event('{"eventId":"source-failed","kind":"expense","date":"2026-10-16","bankAccountId":"source-bank","amount":1000,"referenceId":"source-fail"}','finance'); EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%source-status-fault%' THEN RAISE; END IF; END;
 IF NOT rejected OR (SELECT balance FROM public.bank_accounts WHERE id='source-bank')<>97000 OR EXISTS(SELECT 1 FROM public.financial_events WHERE id='source-failed') THEN RAISE EXCEPTION 'Financial legs committed without source status'; END IF;
END $$;
DROP TRIGGER expense_fault ON public.expenses;
INSERT INTO public.coas(id,account_code,account_name,account_type) SELECT 'source-pocket-coa','1-1500','Pocket','Asset' WHERE NOT EXISTS(SELECT 1 FROM public.coas WHERE account_code='1-1500');
INSERT INTO public.bank_accounts(id,name,account_code,balance) VALUES('source-pocket','Pocket','1-1500',5000);
INSERT INTO public.expenses(id,date,reporter_id,category,amount,description,status) VALUES('source-return','2026-10-16','performer','Setoran Pengembalian',500,'Actual returned cash','Pending Audit');
\o /dev/null
SELECT public.post_financial_event('{"eventId":"return1","kind":"transfer","date":"2026-10-16","bankAccountId":"source-pocket","targetBankAccountId":"source-bank","amount":500,"sourceExpenseId":"source-return"}','finance');
\o
DO $$ BEGIN IF NOT (SELECT is_journaled FROM public.expenses WHERE id='source-return') OR (SELECT status FROM public.expenses WHERE id='source-return')<>'Approved' OR (SELECT balance FROM public.bank_accounts WHERE id='source-bank')<>97500 THEN RAISE EXCEPTION 'Return proof was not committed with cash'; END IF; END $$;
UPDATE public.expenses SET status='Pending Audit',is_journaled=false WHERE id='source-return';
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM public.post_financial_event('{"eventId":"return2","kind":"transfer","date":"2026-10-16","bankAccountId":"source-pocket","targetBankAccountId":"source-bank","amount":500,"sourceExpenseId":"source-return"}','finance'); EXCEPTION WHEN unique_violation THEN rejected:=true; END;
 IF NOT rejected OR (SELECT balance FROM public.bank_accounts WHERE id='source-bank')<>97500 THEN RAISE EXCEPTION 'Reopened return paid twice'; END IF;
END $$;
ROLLBACK;
\echo PASS source expense/online fee split/PR status, different-ID source dedupe, status-fault rollback

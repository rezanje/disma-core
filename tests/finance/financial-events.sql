\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.users(id,name,role,pin) VALUES('finance','Finance','finance','fixture-finance');
INSERT INTO public.coas(id,account_code,account_name,account_type) VALUES
 ('test-bank','1-1000','Bank','Asset'),('test-target','1-1500','Pocket','Asset'),('test-ap','2-1000','AP','Liability'),('test-ops','6-9000','Ops','Expense');
INSERT INTO public.coas(id,account_code,account_name,account_type) SELECT 'test-grir','2-1100','GRIR','Liability' WHERE NOT EXISTS(SELECT 1 FROM public.coas WHERE account_code='2-1100');
INSERT INTO public.bank_accounts(id,name,account_code,balance) VALUES ('bank','Bank','1-1000',500000),('target','Pocket','1-1500',0);
INSERT INTO public.vendors(id,company_name,pic_name,created_at) VALUES ('vendor','Vendor','PIC','2026-10-16');
INSERT INTO public.vendor_bills(id,bill_number,vendor_id,vendor_name,issue_date,due_date,description,total_amount,status,created_at)
 VALUES('BILL','VB-1','vendor','Vendor','2026-10-16','2026-10-30','Goods',100000,'Pending','2026-10-16'),
 ('FAIL','VB-F','vendor','Vendor','2026-10-16','2026-10-30','Goods',100000,'Pending','2026-10-16');
CREATE FUNCTION pg_temp.money(id text,kind text,amount numeric,bill text DEFAULT NULL,target text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.post_financial_event(jsonb_build_object('eventId',id,'kind',kind,'date','2026-10-16','bankAccountId','bank','amount',amount,'billId',bill,'targetBankAccountId',target,'description','Test'),'finance');
$$;
\o /dev/null
SELECT pg_temp.money('ap1','vendor-payment',40000,'BILL');
SELECT pg_temp.money('ap2','vendor-payment',60000,'BILL');
SELECT pg_temp.money('ap1','vendor-payment',40000,'BILL');
SELECT pg_temp.money('transfer','transfer',100000,NULL,'target');
SELECT pg_temp.money('transfer','transfer',100000,NULL,'target');
\o
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM pg_temp.money('ap1','vendor-payment',40001,'BILL'); EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%conflict%' THEN RAISE; END IF; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Changed event accepted'; END IF;
 IF (SELECT amount_paid FROM public.vendor_bills WHERE id='BILL')<>100000 OR (SELECT status FROM public.vendor_bills WHERE id='BILL')<>'Paid' THEN RAISE EXCEPTION 'AP installments wrong'; END IF;
 IF (SELECT balance FROM public.bank_accounts WHERE id='bank')<>300000 OR (SELECT balance FROM public.bank_accounts WHERE id='target')<>100000 THEN RAISE EXCEPTION 'Bank transfer wrong'; END IF;
 IF (SELECT sum(debit_amount-credit_amount) FROM public.journal_lines WHERE account_id='test-ap')<>100000 THEN RAISE EXCEPTION 'AP journal wrong'; END IF;
 IF (SELECT count(*) FROM public.cash_transactions)<>4 OR (SELECT count(*) FROM public.financial_events)<>3 THEN RAISE EXCEPTION 'Retry duplicated money'; END IF;
 IF has_function_privilege('anon','public.post_financial_event(jsonb,text)','EXECUTE') OR has_function_privilege('authenticated','public.post_financial_event(jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'Unprivileged execution enabled'; END IF;
END $$;
CREATE FUNCTION pg_temp.money_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected-stage-failure'; END $$;
DO $$ DECLARE target text; rejected boolean; BEGIN
 FOREACH target IN ARRAY ARRAY['financial_events','journal_entries','journal_lines','cash_transactions','bank_accounts','vendor_bills'] LOOP
   EXECUTE format('CREATE TRIGGER money_fault BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION pg_temp.money_fault()',target);
   rejected:=false;
   BEGIN PERFORM pg_temp.money('fail-'||target,'vendor-payment',1000,'FAIL'); EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%injected-stage-failure%' THEN RAISE; END IF; END;
   EXECUTE format('DROP TRIGGER money_fault ON public.%I',target);
   IF NOT rejected OR (SELECT count(*) FROM public.financial_events)<>3 OR (SELECT balance FROM public.bank_accounts WHERE id='bank')<>300000
     OR (SELECT amount_paid FROM public.vendor_bills WHERE id='FAIL')<>0 OR (SELECT count(*) FROM public.cash_transactions)<>4 THEN RAISE EXCEPTION 'Partial AP write at %',target; END IF;
 END LOOP;
END $$;
-- Overpayment, absent bill, self-transfer and insufficient cash all reject
-- before a money fact can commit.
DO $$ DECLARE rejected boolean; ev jsonb; BEGIN
 FOR ev IN SELECT value FROM jsonb_array_elements('[
   {"eventId":"over","kind":"vendor-payment","billId":"FAIL","amount":100001},
   {"eventId":"missing","kind":"vendor-payment","billId":"absent","amount":1000},
   {"eventId":"self","kind":"transfer","targetBankAccountId":"bank","amount":1000},
   {"eventId":"insufficient","kind":"transfer","targetBankAccountId":"target","amount":300001}
 ]'::jsonb) LOOP
   rejected:=false;
   BEGIN PERFORM public.post_financial_event(ev||'{"date":"2026-10-16","bankAccountId":"bank"}'::jsonb,'finance');
   EXCEPTION WHEN OTHERS THEN rejected:=true; END;
   IF NOT rejected OR (SELECT count(*) FROM public.financial_events)<>3 THEN RAISE EXCEPTION 'Invalid event committed'; END IF;
 END LOOP;
END $$;
-- Fail only on transfer's second cash leg: first leg + journal must roll back.
CREATE FUNCTION pg_temp.transfer_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='In' THEN RAISE EXCEPTION 'second-leg-failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER money_fault BEFORE INSERT ON public.cash_transactions FOR EACH ROW EXECUTE FUNCTION pg_temp.transfer_fault();
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM pg_temp.money('broken-transfer','transfer',1000,NULL,'target'); EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%second-leg-failure%' THEN RAISE; END IF; END;
 IF NOT rejected OR (SELECT count(*) FROM public.financial_events)<>3 OR (SELECT balance FROM public.bank_accounts WHERE id='bank')<>300000 OR (SELECT balance FROM public.bank_accounts WHERE id='target')<>100000 THEN RAISE EXCEPTION 'Partial transfer after second-leg failure'; END IF;
END $$;
INSERT INTO public.reimbursements(id,date,user_id,title,amount,description,status) VALUES
 ('REIMB','2026-10-16','performer','Office',1000,'Office','Approved'),
 ('REIMB-FAIL','2026-10-16','performer','Office',1000,'Office','Approved');
\o /dev/null
SELECT public.post_financial_event('{"eventId":"reimb1","kind":"reimbursement","date":"2026-10-16","bankAccountId":"bank","amount":1000,"referenceId":"REIMB","description":"Office"}','finance');
SELECT public.post_financial_event('{"eventId":"reimb1","kind":"reimbursement","date":"2026-10-16","bankAccountId":"bank","amount":1000,"referenceId":"REIMB","description":"Office"}','finance');
SELECT public.post_financial_event('{"eventId":"buy1","kind":"cash-posting","date":"2026-10-16","bankAccountId":"bank","amount":500,"referenceId":"PURCHASE","referenceType":"Purchase","debitAccountCode":"2-1100","description":"Goods","category":"Belanja Sourcing (HPP)"}','finance');
\o
DO $$ DECLARE rejected boolean:=false; BEGIN
 IF (SELECT status FROM public.reimbursements WHERE id='REIMB')<>'Paid' OR (SELECT balance FROM public.bank_accounts WHERE id='bank')<>298500 THEN RAISE EXCEPTION 'Reimbursement/purchase money incorrect'; END IF;
 BEGIN PERFORM public.post_financial_event('{"eventId":"reimb2","kind":"reimbursement","date":"2026-10-16","bankAccountId":"bank","amount":1000,"referenceId":"REIMB"}','finance'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Reimbursement source paid twice'; END IF;
END $$;
CREATE TRIGGER reimb_fault BEFORE UPDATE ON public.reimbursements FOR EACH ROW EXECUTE FUNCTION pg_temp.money_fault();
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM public.post_financial_event('{"eventId":"reimb-fail","kind":"reimbursement","date":"2026-10-16","bankAccountId":"bank","amount":1000,"referenceId":"REIMB-FAIL"}','finance'); EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%injected-stage-failure%' THEN RAISE; END IF; END;
 IF NOT rejected OR (SELECT status FROM public.reimbursements WHERE id='REIMB-FAIL')<>'Approved' OR (SELECT balance FROM public.bank_accounts WHERE id='bank')<>298500 OR EXISTS(SELECT 1 FROM public.financial_events WHERE id='reimb-fail') THEN RAISE EXCEPTION 'Partial reimbursement commit'; END IF;
END $$;
INSERT INTO public.users(id,name,role,pin) VALUES('money-po','Admin PO','admin_po','fixture-po');
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM public.post_financial_event('{"eventId":"po-payment","kind":"vendor-payment","date":"2026-10-16","bankAccountId":"bank","amount":1000,"billId":"FAIL"}','money-po'); EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%Finance role required%' THEN RAISE; END IF; END;
 IF NOT rejected OR EXISTS(SELECT 1 FROM public.financial_events WHERE id='po-payment') THEN RAISE EXCEPTION 'Admin PO spent bank funds through nested RPC'; END IF;
END $$;
ROLLBACK;
\echo PASS real AP/transfer/reimbursement/purchase installments/retry/conflict/all-stage rollback/privileges

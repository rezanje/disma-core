\set ON_ERROR_STOP on
-- Run only in an isolated disposable database. No URLs or application env read.
BEGIN;
INSERT INTO public.users(id,name,role,pin) VALUES('finance','Finance','finance','fixture-finance');
INSERT INTO public.coas(id,account_code,account_name,account_type) VALUES
 ('test-ar','1-2000','AR','Asset'),('test-bank','1-1000','Bank','Asset');
INSERT INTO public.bank_accounts(id,name,account_code,balance) VALUES ('bank','Bank','1-1000',0);
INSERT INTO public.invoices(id,client_id,issue_date,due_date,total_amount,amount_paid,status) VALUES
 ('A','client','2026-10-01','2026-10-15',150000,0,'Unpaid'),
 ('B','client','2026-10-01','2026-10-15',100000,0,'Unpaid'),
 ('C','client','2026-10-01','2026-10-15',50000,0,'Unpaid'),
 ('X','other-client','2026-10-01','2026-10-15',100000,0,'Unpaid'),
 ('FAIL','client','2026-10-01','2026-10-15',100000,0,'Unpaid');
CREATE FUNCTION pg_temp.receipt(id text, amount numeric, allocations jsonb, bank text DEFAULT 'bank') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.record_client_receipt(jsonb_build_object('paymentId',id,'date','2026-10-16','bankAccountId',bank,'amount',amount,'allocations',allocations),'finance');
$$;
CREATE FUNCTION pg_temp.expect_reject(id text, amount numeric, allocations jsonb, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN PERFORM pg_temp.receipt(id,amount,allocations); EXCEPTION WHEN OTHERS THEN
   rejected:=true;
   IF SQLERRM NOT LIKE '%'||expected||'%' THEN RAISE EXCEPTION 'Wrong rejection: % expected %',SQLERRM,expected; END IF;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Expected rejection: %',expected; END IF;
END;
$$;
\o /dev/null
SELECT pg_temp.receipt('p1',60000,'[{"invoiceId":"A","amount":60000}]');
SELECT pg_temp.receipt('p2',90000,'[{"invoiceId":"A","amount":90000}]');
SELECT pg_temp.receipt('p1',60000,'[{"invoiceId":"A","amount":60000}]');
SELECT pg_temp.expect_reject('p1',50000,'[{"invoiceId":"A","amount":50000}]','conflict');
SELECT pg_temp.expect_reject('over',150000,'[{"invoiceId":"B","amount":150000}]','outstanding');
SELECT pg_temp.expect_reject('missing',1000,'[{"invoiceId":"missing","amount":1000}]','not found');
SELECT pg_temp.expect_reject('mixed',2000,'[{"invoiceId":"B","amount":1000},{"invoiceId":"X","amount":1000}]','same client');
SELECT pg_temp.expect_reject('duplicate',2000,'[{"invoiceId":"B","amount":1000},{"invoiceId":"B","amount":1000}]','Duplicate');
SELECT pg_temp.expect_reject('mismatch',2000,'[{"invoiceId":"B","amount":1000}]','total');
SELECT pg_temp.receipt('bulk',150000,'[{"invoiceId":"B","amount":100000},{"invoiceId":"C","amount":50000}]');
SELECT pg_temp.receipt('bulk',150000,'[{"invoiceId":"C","amount":50000},{"invoiceId":"B","amount":100000}]');
\o
DO $$ BEGIN
 IF (SELECT amount_paid FROM public.invoices WHERE id='A') <> 150000 OR (SELECT status FROM public.invoices WHERE id='A') <> 'Paid' THEN RAISE EXCEPTION 'Installment totals wrong'; END IF;
 IF (SELECT balance FROM public.bank_accounts WHERE id='bank') <> 300000 THEN RAISE EXCEPTION 'Bank wrong'; END IF;
 IF (SELECT sum(amount) FROM public.cash_transactions) <> 300000 THEN RAISE EXCEPTION 'Cash wrong'; END IF;
 IF (SELECT sum(credit_amount-debit_amount) FROM public.journal_lines WHERE account_id='test-ar') <> 300000 THEN RAISE EXCEPTION 'AR credit wrong'; END IF;
 IF (SELECT count(*) FROM public.client_receipts) <> 3 THEN RAISE EXCEPTION 'Retry duplicated event'; END IF;
 IF (SELECT count(*) FROM public.client_receipt_allocations) <> 4 THEN RAISE EXCEPTION 'Allocation count wrong'; END IF;
 IF has_function_privilege('anon','public.record_client_receipt(jsonb,text)','EXECUTE') OR has_function_privilege('authenticated','public.record_client_receipt(jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'Unprivileged RPC execution enabled'; END IF;
END $$;
-- A real database trigger injects failure at each write leg. PostgreSQL must
-- roll back all earlier effects, including the header and bank delta.
CREATE FUNCTION pg_temp.fail_receipt_stage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected-stage-failure'; END $$;
DO $$
DECLARE target text; rejected boolean;
BEGIN
 FOREACH target IN ARRAY ARRAY['client_receipts','client_receipt_allocations','journal_entries','journal_lines','cash_transactions','bank_accounts','invoices'] LOOP
   EXECUTE format('CREATE TRIGGER receipt_fault BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_receipt_stage()',target);
   rejected:=false;
   BEGIN PERFORM pg_temp.receipt('fail-'||target,1000,'[{"invoiceId":"FAIL","amount":1000}]'); EXCEPTION WHEN OTHERS THEN
     rejected:=true;
     IF SQLERRM NOT LIKE '%injected-stage-failure%' THEN RAISE; END IF;
   END;
   EXECUTE format('DROP TRIGGER receipt_fault ON public.%I',target);
   IF NOT rejected THEN RAISE EXCEPTION 'Fault did not fire: %',target; END IF;
   IF (SELECT count(*) FROM public.client_receipts) <> 3 OR (SELECT balance FROM public.bank_accounts WHERE id='bank') <> 300000
      OR (SELECT sum(amount) FROM public.cash_transactions) <> 300000
      OR (SELECT amount_paid FROM public.invoices WHERE id='FAIL') <> 0
      OR (SELECT count(*) FROM public.journal_entries) <> 3
      OR (SELECT count(*) FROM public.client_receipt_allocations) <> 4 THEN
      RAISE EXCEPTION 'Partial commit after fault in %',target;
   END IF;
 END LOOP;
END $$;
UPDATE public.invoices SET total_amount='NaN'::numeric WHERE id='FAIL';
\o /dev/null
SELECT pg_temp.expect_reject('nonfinite-invoice',1000,'[{"invoiceId":"FAIL","amount":1000}]','outstanding');
\o
UPDATE public.invoices SET total_amount=100000 WHERE id='FAIL';
UPDATE public.bank_accounts SET balance='NaN'::numeric WHERE id='bank';
\o /dev/null
SELECT pg_temp.expect_reject('nonfinite-bank',1000,'[{"invoiceId":"FAIL","amount":1000}]','mapped COA');
\o
UPDATE public.bank_accounts SET balance=300000 WHERE id='bank';
INSERT INTO public.deliveries(id,sales_order_id,courier_id,status,invoice_id) VALUES('receipt-unposted-delivery','SO','courier','Awaiting Audit','receipt-unposted');
INSERT INTO public.invoices(id,client_id,issue_date,due_date,total_amount,amount_paid,status,delivery_id) VALUES('receipt-unposted','client','2026-10-16','2026-10-30',1000,0,'Unpaid','receipt-unposted-delivery');
\o /dev/null
SELECT pg_temp.expect_reject('before-audit',1000,'[{"invoiceId":"receipt-unposted","amount":1000}]','Finance audit');
\o
UPDATE public.deliveries SET status='Terkirim' WHERE id='receipt-unposted-delivery';
\o /dev/null
SELECT pg_temp.expect_reject('without-revenue',1000,'[{"invoiceId":"receipt-unposted","amount":1000}]','Finance audit');
\o
ROLLBACK;
\echo PASS real receipts installments/bulk/retry/conflict/validation/stage rollback/privileges

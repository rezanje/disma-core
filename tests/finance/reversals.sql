\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.users(id,name,role,pin) VALUES('finance','Finance','finance','fixture-finance');
INSERT INTO public.coas(id,account_code,account_name,account_type) SELECT 'reverse-'||code,code,code,'Asset' FROM unnest(ARRAY['1-1000','1-2000','2-1000']) code WHERE NOT EXISTS(SELECT 1 FROM public.coas WHERE account_code=code);
INSERT INTO public.users(id,name,role,pin) VALUES('reverse-sa','SA','super_admin','9876');
INSERT INTO public.bank_accounts(id,name,account_code,balance) VALUES('reverse-bank','Bank','1-1000',100);
INSERT INTO public.invoices(id,client_id,issue_date,due_date,total_amount,amount_paid,status) VALUES('reverse-invoice','client','2026-10-16','2026-10-30',100,0,'Unpaid'),('reverse-cn','client','2026-10-16','2026-10-30',100,0,'Unpaid'),('reverse-fault','client','2026-10-16','2026-10-30',100,0,'Unpaid');
\o /dev/null
SELECT public.record_client_receipt('{"paymentId":"reverse-receipt","date":"2026-10-16","bankAccountId":"reverse-bank","amount":100,"allocations":[{"invoiceId":"reverse-invoice","amount":100}]}','finance');
SELECT public.reverse_financial_event('{"eventId":"reversal1","date":"2026-10-16","sourceType":"client-receipt","sourceId":"reverse-receipt","reason":"Operator salah catat"}','reverse-sa');
SELECT public.reverse_financial_event('{"eventId":"reversal1","date":"2026-10-16","sourceType":"client-receipt","sourceId":"reverse-receipt","reason":"Operator salah catat"}','reverse-sa');
\o
DO $$ DECLARE rejected boolean:=false; BEGIN
 IF (SELECT amount_paid FROM public.invoices WHERE id='reverse-invoice')<>0 OR (SELECT balance FROM public.bank_accounts WHERE id='reverse-bank')<>100 THEN RAISE EXCEPTION 'Receipt reversal totals wrong'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.client_receipts WHERE id='reverse-receipt') OR NOT EXISTS(SELECT 1 FROM public.cash_transactions WHERE id='receipt:reverse-receipt:cash') THEN RAISE EXCEPTION 'Original payment history deleted'; END IF;
 BEGIN PERFORM public.reverse_financial_event('{"eventId":"duplicate-reverse","date":"2026-10-16","sourceType":"client-receipt","sourceId":"reverse-receipt","reason":"Duplicate test"}','reverse-sa'); EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%already reversed%' THEN RAISE; END IF; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Reversed same source twice'; END IF;
END $$;
INSERT INTO public.vendors(id,company_name,pic_name,created_at) VALUES('reverse-vendor','Vendor','PIC','2026-10-16');
INSERT INTO public.vendor_bills(id,bill_number,vendor_id,vendor_name,issue_date,due_date,description,total_amount,status,created_at) VALUES('reverse-bill','VB-REVERSE','reverse-vendor','Vendor','2026-10-16','2026-10-30','Goods',100,'Pending','2026-10-16');
\o /dev/null
SELECT public.post_financial_event('{"eventId":"reverse-vendor-payment","kind":"vendor-payment","date":"2026-10-16","bankAccountId":"reverse-bank","amount":40,"billId":"reverse-bill"}','finance');
SELECT public.reverse_financial_event('{"eventId":"reversal-ap","date":"2026-10-16","sourceType":"vendor-payment","sourceId":"reverse-vendor-payment","reason":"Operator salah catat"}','reverse-sa');
SELECT public.record_client_receipt('{"paymentId":"reverse-cn-payment","date":"2026-10-16","bankAccountId":"reverse-bank","amount":50,"allocations":[{"invoiceId":"reverse-cn","amount":50}]}','finance');
\o
INSERT INTO public.credit_notes(id,cn_number,invoice_id,date,amount,reason,created_by) VALUES('reverse-cn-note','CN-REVERSE','reverse-cn',now(),10,'Later dependent note','reverse-sa');
DO $$ DECLARE rejected boolean:=false; BEGIN
 IF (SELECT amount_paid FROM public.vendor_bills WHERE id='reverse-bill')<>0 OR (SELECT balance FROM public.bank_accounts WHERE id='reverse-bank')<>150 THEN RAISE EXCEPTION 'AP reversal totals wrong'; END IF;
 BEGIN PERFORM public.reverse_financial_event('{"eventId":"reversal-blocked","date":"2026-10-16","sourceType":"client-receipt","sourceId":"reverse-cn-payment","reason":"Operator salah catat"}','reverse-sa'); EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%Later credit note%' THEN RAISE; END IF; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Later credit note dependency ignored'; END IF;
END $$;
\o /dev/null
SELECT public.record_client_receipt('{"paymentId":"reverse-fault-payment","date":"2026-10-16","bankAccountId":"reverse-bank","amount":30,"allocations":[{"invoiceId":"reverse-fault","amount":30}]}','finance');
\o
CREATE FUNCTION pg_temp.reversal_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'reversal-final-fault'; END $$;
CREATE TRIGGER reversal_fault BEFORE INSERT ON public.financial_reversals FOR EACH ROW EXECUTE FUNCTION pg_temp.reversal_fault();
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM public.reverse_financial_event('{"eventId":"reversal-failed","date":"2026-10-16","sourceType":"client-receipt","sourceId":"reverse-fault-payment","reason":"Operator salah catat"}','reverse-sa'); EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%reversal-final-fault%' THEN RAISE; END IF; END;
 IF NOT rejected OR (SELECT amount_paid FROM public.invoices WHERE id='reverse-fault')<>30 OR (SELECT balance FROM public.bank_accounts WHERE id='reverse-bank')<>180 OR EXISTS(SELECT 1 FROM public.cash_transactions WHERE id='reversal:reversal-failed:cash') THEN RAISE EXCEPTION 'Partial reversal commit'; END IF;
END $$;
DROP TRIGGER reversal_fault ON public.financial_reversals;
INSERT INTO public.clients(id,company_name,pic_name,created_at) VALUES('reverse-client','Client','PIC','2026-10-16');
INSERT INTO public.tukar_faktur(id,tf_number,client_id,period_start,period_end,issue_date,status,total_amount) VALUES('90000000-0000-0000-0000-000000009002','TF-REVERSE','reverse-client','2026-10-01','2026-10-16','2026-10-16','Issued',100);
INSERT INTO public.invoices(id,client_id,issue_date,due_date,total_amount,amount_paid,status,tukar_faktur_id) VALUES('reverse-tf','reverse-client','2026-10-16','2026-10-30',100,0,'Unpaid','90000000-0000-0000-0000-000000009002');
\o /dev/null
SELECT public.record_client_receipt('{"paymentId":"reverse-tf1","date":"2026-10-16","bankAccountId":"reverse-bank","amount":30,"allocations":[{"invoiceId":"reverse-tf","amount":30}]}','finance');
\o
UPDATE public.tukar_faktur SET status='Received',received_at=now(),received_by='Client PIC' WHERE id='90000000-0000-0000-0000-000000009002';
\o /dev/null
SELECT public.record_client_receipt('{"paymentId":"reverse-tf2","date":"2026-10-16","bankAccountId":"reverse-bank","amount":70,"allocations":[{"invoiceId":"reverse-tf","amount":70}]}','finance');
SELECT public.reverse_financial_event('{"eventId":"reversal-tf1","date":"2026-10-16","sourceType":"client-receipt","sourceId":"reverse-tf1","reason":"Operator salah catat"}','reverse-sa');
\o
DO $$ BEGIN IF (SELECT status FROM public.tukar_faktur WHERE id='90000000-0000-0000-0000-000000009002')<>'Received' THEN RAISE EXCEPTION 'Reversal overwrote later TF reception proof'; END IF; END $$;
ROLLBACK;
\echo PASS exact-source receipt/AP reversal, history preserved, dedupe, CN dependency and final-stage rollback

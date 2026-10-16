\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.users(id,name,role,pin) VALUES('finance','Finance','finance','fixture-finance');
INSERT INTO public.coas(id,account_code,account_name,account_type)
 SELECT 'vendor-test-'||code,code,code,'Asset' FROM unnest(ARRAY['1-1000','1-2100','1-2200','1-3000','2-1000','2-1100']) code
 WHERE NOT EXISTS(SELECT 1 FROM public.coas WHERE account_code=code);
INSERT INTO public.bank_accounts(id,name,account_code,balance) VALUES('vendor-bank','Bank','1-1000',10000);
INSERT INTO public.vendors(id,company_name,pic_name,created_at) VALUES('vendor-v','Vendor','PIC','2026-10-16'),('vendor-other','Other','PIC','2026-10-16');
INSERT INTO public.purchases(id,date,purchaser_id,status) VALUES('vendor-purchase','2026-10-16','performer','Pending');
INSERT INTO public.purchase_items(id,purchase_id,product_id,qty_target,estimated_unit_price,purchase_method,payment_method,vendor_id)
 VALUES('vendor-pi','vendor-purchase','product',10,100,'Vendor','Tempo','vendor-v');
\o /dev/null
SELECT public.post_vendor_financial_event('{"eventId":"advance1","kind":"vendor-advance","date":"2026-10-16","bankAccountId":"vendor-bank","amount":400,"purchaseId":"vendor-purchase","vendorId":"vendor-v"}','finance');
SELECT public.post_vendor_financial_event('{"eventId":"advance1","kind":"vendor-advance","date":"2026-10-16","bankAccountId":"vendor-bank","amount":400,"purchaseId":"vendor-purchase","vendorId":"vendor-v"}','finance');
\o
INSERT INTO public.vendor_bills(id,bill_number,vendor_id,vendor_name,issue_date,due_date,description,total_amount,status,purchase_id,created_at)
 VALUES('vendor-bill','VB-TEST','vendor-v','Vendor','2026-10-16','2026-10-30','Goods',1000,'Pending','vendor-purchase','2026-10-16');
\o /dev/null
SELECT public.post_journal_entry('vendor-ap','2026-10-16','Vendor liability','Purchase','source', '[{"accountCode":"2-1100","amount":1000}]','[{"accountCode":"2-1000","amount":1000,"vendorId":"vendor-v","vendorBillId":"vendor-bill"}]');
SELECT public.apply_vendor_advances('vendor-purchase','vendor-v','vendor-bill','2026-10-16','finance');
SELECT public.apply_vendor_advances('vendor-purchase','vendor-v','vendor-bill','2026-10-16','finance');
\o
DO $$ BEGIN
 IF (SELECT amount_paid FROM public.vendor_bills WHERE id='vendor-bill')<>400 OR (SELECT applied_amount FROM public.vendor_advances WHERE id='advance1')<>400 THEN RAISE EXCEPTION 'Advance not allocated once'; END IF;
 IF (SELECT count(*) FROM public.cash_transactions)<>1 THEN RAISE EXCEPTION 'Advance application created cash twice'; END IF;
END $$;
INSERT INTO public.vendor_returns(id,product_id,vendor_id,qty,reason,date,original_return_id,status)
 VALUES('claim-source:vendorreturn','product','vendor-v',2,'Damage',now(),'vendor-pi','Menunggu Vendor'),('claim-fail:vendorreturn','product','vendor-v',2,'Damage',now(),'vendor-pi','Menunggu Vendor');
\o /dev/null
SELECT public.post_journal_entry('claim-source:rejectjournal','2026-10-16','Vendor claim','QC','claim-source','[{"accountCode":"1-2100","amount":200}]','[{"accountCode":"1-3000","amount":200}]');
SELECT public.post_journal_entry('claim-fail:rejectjournal','2026-10-16','Vendor claim','QC','claim-fail','[{"accountCode":"1-2100","amount":200}]','[{"accountCode":"1-3000","amount":200}]');
SELECT public.post_vendor_financial_event('{"eventId":"refund1","kind":"vendor-refund","date":"2026-10-16","bankAccountId":"vendor-bank","amount":80,"vendorReturnId":"claim-source:vendorreturn"}','finance');
SELECT public.post_vendor_financial_event('{"eventId":"netoff1","kind":"vendor-netoff","date":"2026-10-16","amount":120,"vendorReturnId":"claim-source:vendorreturn","billId":"vendor-bill"}','finance');
SELECT public.post_vendor_financial_event('{"eventId":"netoff1","kind":"vendor-netoff","date":"2026-10-16","amount":120,"vendorReturnId":"claim-source:vendorreturn","billId":"vendor-bill"}','finance');
\o
DO $$ BEGIN
 IF (SELECT balance FROM public.bank_accounts WHERE id='vendor-bank')<>9680 THEN RAISE EXCEPTION 'Vendor cash balance incorrect'; END IF;
 IF (SELECT amount_paid FROM public.vendor_bills WHERE id='vendor-bill')<>520 THEN RAISE EXCEPTION 'Vendor netoff AP wrong'; END IF;
 IF (SELECT status FROM public.vendor_returns WHERE id='claim-source:vendorreturn')<>'Selesai-PotongHutang' THEN RAISE EXCEPTION 'Claim final status wrong'; END IF;
 IF (SELECT count(*) FROM public.cash_transactions)<>2 THEN RAISE EXCEPTION 'Netoff fabricated cash'; END IF;
 IF (SELECT sum(s.amount) FROM public.vendor_claim_settlements s WHERE vendor_return_id='claim-source:vendorreturn')<>200 THEN RAISE EXCEPTION 'Claim allocation wrong'; END IF;
END $$;
CREATE FUNCTION pg_temp.vendor_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'vendor-source-fault'; END $$;
CREATE TRIGGER vendor_fault BEFORE UPDATE ON public.vendor_returns FOR EACH ROW EXECUTE FUNCTION pg_temp.vendor_fault();
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM public.post_vendor_financial_event('{"eventId":"failed-refund","kind":"vendor-refund","date":"2026-10-16","bankAccountId":"vendor-bank","amount":200,"vendorReturnId":"claim-fail:vendorreturn"}','finance'); EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%vendor-source-fault%' THEN RAISE; END IF; END;
 IF NOT rejected OR (SELECT balance FROM public.bank_accounts WHERE id='vendor-bank')<>9680 OR EXISTS(SELECT 1 FROM public.financial_events WHERE id='failed-refund') OR EXISTS(SELECT 1 FROM public.vendor_claim_settlements WHERE id='failed-refund') THEN RAISE EXCEPTION 'Partial vendor refund commit'; END IF;
END $$;
ROLLBACK;
\echo PASS vendor advance/ap allocation/refund/netoff retry/no phantom cash/source-failure rollback

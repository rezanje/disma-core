BEGIN;
INSERT INTO users(id,name,role,pin) VALUES('tf-cn-fin','Finance','finance','9758');
INSERT INTO clients(id,company_name,pic_name,created_at) VALUES('tf-cn-client','Client','PIC','2026-10-16');
INSERT INTO coas(id,account_code,account_name,account_type) SELECT 'tf-cn-'||code,code,code,'Asset' FROM(VALUES('1-2000'),('4-1000')) x(code) WHERE NOT EXISTS(SELECT 1 FROM coas WHERE account_code=code);
SELECT commit_finance_command('{"eventId":"tf-cn-origin","kind":"manual-receivable","payload":{"invoice":{"id":"tf-cn-invoice","clientId":"tf-cn-client","issueDate":"2026-10-16","dueDate":"2026-11-16","totalAmount":100,"amountPaid":0,"status":"Unpaid"}}}','tf-cn-fin');
INSERT INTO tukar_faktur(id,tf_number,client_id,period_start,period_end,issue_date) VALUES('00000000-0000-0000-0000-000000009758','TF-CN','tf-cn-client','2026-10-01','2026-10-16','2026-10-16');
DO $$ DECLARE result jsonb; BEGIN
 PERFORM issue_tukar_faktur('00000000-0000-0000-0000-000000009758',ARRAY['tf-cn-invoice'],'2026-10-16','tf-cn-fin');
 result:=commit_finance_command('{"eventId":"tf-cn-credit","kind":"credit-note","payload":{"invoiceId":"tf-cn-invoice","amount":100,"reason":"Full pricing correction","cnNumber":"CN-TF-ZERO","date":"2026-10-16"}}','tf-cn-fin');
 IF (result->'tukar_fakturs'->0->>'status') IS DISTINCT FROM 'Paid' THEN RAISE EXCEPTION 'Command response left TF hydration stale'; END IF;
 IF (SELECT status FROM tukar_faktur WHERE tf_number='TF-CN')<>'Paid' THEN RAISE EXCEPTION 'Fully credited TF remains open despite zero AR'; END IF;
 IF (SELECT total_amount FROM tukar_faktur WHERE tf_number='TF-CN')<>100 THEN RAISE EXCEPTION 'Published TF value was rewritten'; END IF;
END $$;
ROLLBACK;

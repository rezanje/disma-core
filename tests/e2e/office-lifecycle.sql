\set ON_ERROR_STOP on
BEGIN;
-- A real chained office workflow: PO -> plan -> paper -> QC -> delivery -> TF -> installments.
INSERT INTO users(id,name,role,pin) VALUES('life-po','PO admin','admin_po','9751'),('life-fin','Finance','finance','9752'),('life-worker','Field worker','sourcing','9753');
INSERT INTO clients(id,company_name,pic_name,address,created_at) VALUES('life-client','Lifecycle client','Receiving PIC','Original address','2026-10-16');
INSERT INTO vendors(id,company_name,pic_name,created_at) VALUES('life-vendor','Lifecycle supplier','Supplier PIC','2026-10-16');
INSERT INTO coas(id,account_code,account_name,account_type)
 SELECT 'life-'||code,code,code,'Asset' FROM (VALUES('1-1988'),('1-3000'),('2-1100'),('1-2000'),('4-1000'),('5-1000')) x(code)
 WHERE NOT EXISTS(SELECT 1 FROM coas WHERE account_code=code);
INSERT INTO bank_accounts(id,name,account_code,balance) VALUES('life-bank','Lifecycle bank','1-1988',1000000);
INSERT INTO products(id,sku_code,name,uom,base_price,current_stock) VALUES('life-product','LIFE','Apple','kg',10000,0);
INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status) VALUES('life-so','CLIENT-PO-LIFE','life-client','2026-10-16','2026-10-17','Draft');
INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,unit_price,subtotal) VALUES('life-line','life-so','life-product',10,15000,150000);
CREATE FUNCTION pg_temp.life_purchase(e text,s text,id text,p jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT process_purchase_event(jsonb_build_object('eventId',e,'stage',s,'sourceId',id,'payload',p),CASE WHEN s IN('report','plan-release','verify') THEN 'life-fin' ELSE 'life-po' END);
$$;
CREATE FUNCTION pg_temp.life_goods(e text,s text,id text,p jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT process_goods_event(jsonb_build_object('eventId',e,'stage',s,'sourceId',id,'payload',jsonb_build_object('occurredAt','2026-10-16T06:00:00Z','performedBy','life-worker','paperNumber',e)||p),CASE WHEN s='audit' THEN 'life-fin' ELSE 'life-po' END);
$$;
\o /dev/null
SELECT pg_temp.life_purchase('life-compile','compile','life-doc','{"occurredAt":"2026-10-16T04:00:00Z","salesOrderIds":["life-so"],"items":[{"id":"life-pi","productId":"life-product","salesOrderId":"life-so","qtyTarget":10,"estimatedUnitPrice":10000}],"reservations":[],"rejectedIds":[]}');
\o
SET LOCAL ROLE service_role;
UPDATE purchase_items SET purchase_method='Pasar',payment_method='Cash',planned_vendor_id='life-vendor' WHERE id='life-pi';
RESET ROLE;
\o /dev/null
SELECT pg_temp.life_purchase('life-plan','plan-release','life-doc','{}');
\o
UPDATE purchases SET paper_session_id='life-paper' WHERE id='life-doc';
\o /dev/null
SELECT pg_temp.life_purchase('life-paper-release','paper-release','life-paper','{"purchaseIds":["life-doc"],"paperSessionId":"life-paper"}');
SELECT pg_temp.life_purchase('life-report','report','life-paper','{"purchaseIds":["life-doc"],"occurredAt":"2026-10-16T05:00:00Z","onBehalfOfUserId":"life-worker","pocketBankAccountId":"life-bank","transferBankAccountId":"life-bank","lines":[{"id":"life-pi","purchaseId":"life-doc","productId":"life-product","isChecked":true,"qtyPurchased":10,"actualUnitPrice":10000,"vendorId":"life-vendor","paymentMethod":"Cash"}]}');
SELECT pg_temp.life_purchase('life-report','report','life-paper','{"purchaseIds":["life-doc"],"occurredAt":"2026-10-16T05:00:00Z","onBehalfOfUserId":"life-worker","pocketBankAccountId":"life-bank","transferBankAccountId":"life-bank","lines":[{"id":"life-pi","purchaseId":"life-doc","productId":"life-product","isChecked":true,"qtyPurchased":10,"actualUnitPrice":10000,"vendorId":"life-vendor","paymentMethod":"Cash"}]}');
SELECT pg_temp.life_goods('life-qc','qc','life-pi','{"qtyPassToInventory":0,"qtyReject":0,"allocations":[{"soId":"life-so","qty":10}],"rejectAction":"Disposal"}');
SELECT pg_temp.life_purchase('life-verify','verify','life-doc','{}');
SELECT pg_temp.life_goods('life-pack','packing','life-so','{"lines":[{"salesOrderItemId":"life-line","qty":10}]}');
SELECT pg_temp.life_goods('life-release','release','life-so');
SELECT pg_temp.life_goods('life-handover','handover','life-release:delivery');
SELECT pg_temp.life_goods('life-received','receipt','life-release:delivery','{"recipientName":"Receiving PIC","signedPaperChecked":true,"received":[{"salesOrderItemId":"life-line","qtyReceived":10}]}');
SELECT pg_temp.life_goods('life-finalize','acceptance','life-release:delivery','{"soId":"life-so"}');
\o
DO $$ BEGIN
 IF (SELECT status FROM invoices WHERE id='invoice:life-release:delivery')<>'Draft' THEN RAISE EXCEPTION 'Unaudited invoice became billable'; END IF;
END $$;
\o /dev/null
SELECT pg_temp.life_goods('life-audit','audit','life-release:delivery');
\o
INSERT INTO tukar_faktur(id,tf_number,client_id,period_start,period_end,issue_date)
 VALUES('00000000-0000-0000-0000-000000009751','TF-LIFE','life-client','2026-10-01','2026-10-16','2026-10-16');
\o /dev/null
SELECT issue_tukar_faktur('00000000-0000-0000-0000-000000009751',ARRAY['invoice:life-release:delivery'],'2026-10-16','life-fin');
SELECT record_client_receipt('{"paymentId":"life-pay1","date":"2026-10-16","bankAccountId":"life-bank","amount":60000,"allocations":[{"invoiceId":"invoice:life-release:delivery","amount":60000}]}','life-fin');
SELECT record_client_receipt('{"paymentId":"life-pay2","date":"2026-10-17","bankAccountId":"life-bank","amount":90000,"allocations":[{"invoiceId":"invoice:life-release:delivery","amount":90000}]}','life-fin');
SELECT record_client_receipt('{"paymentId":"life-pay2","date":"2026-10-17","bankAccountId":"life-bank","amount":90000,"allocations":[{"invoiceId":"invoice:life-release:delivery","amount":90000}]}','life-fin');
\o
DO $$
DECLARE ar numeric; grir numeric; profit numeric; cash_net numeric;
BEGIN
 IF (SELECT balance FROM bank_accounts WHERE id='life-bank')<>1050000 THEN RAISE EXCEPTION 'Lifecycle bank should net +50000'; END IF;
 IF (SELECT current_stock FROM products WHERE id='life-product')<>0 OR (SELECT qty_delivered FROM sales_order_items WHERE id='life-line')<>10 THEN RAISE EXCEPTION 'Lifecycle fulfillment/stock mismatch'; END IF;
 IF (SELECT amount_paid FROM invoices WHERE id='invoice:life-release:delivery')<>150000 OR (SELECT status FROM invoices WHERE id='invoice:life-release:delivery')<>'Paid' THEN RAISE EXCEPTION 'Lifecycle invoice not paid'; END IF;
 IF (SELECT status FROM tukar_faktur WHERE tf_number='TF-LIFE')<>'Paid' THEN RAISE EXCEPTION 'TF not settled'; END IF;
 SELECT coalesce(sum(l.debit_amount-l.credit_amount),0) INTO ar FROM journal_lines l JOIN coas c ON c.id=l.account_id WHERE c.account_code='1-2000';
 SELECT coalesce(sum(l.debit_amount-l.credit_amount),0) INTO grir FROM journal_lines l JOIN coas c ON c.id=l.account_id WHERE c.account_code='2-1100';
 SELECT coalesce(sum(CASE WHEN c.account_code='4-1000' THEN l.credit_amount-l.debit_amount WHEN c.account_code='5-1000' THEN l.credit_amount-l.debit_amount ELSE 0 END),0) INTO profit FROM journal_lines l JOIN coas c ON c.id=l.account_id;
 IF ar<>0 OR grir<>0 OR profit<>50000 THEN RAISE EXCEPTION 'Lifecycle AR/GRIR/profit mismatch: %, %, %',ar,grir,profit; END IF;
 IF EXISTS(SELECT journal_entry_id FROM journal_lines GROUP BY journal_entry_id HAVING sum(debit_amount)<>sum(credit_amount)) THEN RAISE EXCEPTION 'Unbalanced journal'; END IF;
END $$;
ROLLBACK;
\echo 'PASS chained two-admin paper lifecycle through TF and two installments; cash/stock/AR/GRIR/profit reconcile'

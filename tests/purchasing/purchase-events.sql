\set ON_ERROR_STOP on
BEGIN;
INSERT INTO users(id,name,role,pin) VALUES('pur-admin','Admin','admin_po','pur-admin-fixture'),('pur-finance','Finance','finance','pur-finance-fixture');
INSERT INTO clients(id,company_name,pic_name,created_at) VALUES('pur-client','Client','PIC','2026-10-16');
INSERT INTO vendors(id,company_name,pic_name,created_at) VALUES('pur-vendor','Supplier','PIC','2026-10-16'),('pur-vendor2','Other supplier','PIC','2026-10-16');
INSERT INTO coas(id,account_code,account_name,account_type) SELECT 'pur-'||code,code,code,'Asset' FROM (VALUES('2-1100'),('1-1999'),('6-1600'),('6-1700'),('1-3000'),('2-1000')) x(code) WHERE NOT EXISTS(SELECT 1 FROM coas WHERE account_code=code);
INSERT INTO bank_accounts(id,name,account_code,balance) VALUES('pur-bank','Bank','1-1999',1000000);
INSERT INTO products(id,sku_code,name,uom,base_price,current_stock) VALUES('pur-prod','PUR','Apple','kg',10,5);
INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status) VALUES('pur-a','PUR-A','pur-client','2026-10-16','2026-10-17','Draft'),('pur-b','PUR-B','pur-client','2026-10-16','2026-10-17','Draft');
INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,unit_price,subtotal) VALUES('pur-la','pur-a','pur-prod',10,20,200),('pur-lb','pur-b','pur-prod',10,20,200);
CREATE FUNCTION pg_temp.purch(e text,s text,id text,b jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT process_purchase_event(jsonb_build_object('eventId',e,'stage',s,'sourceId',id,'payload',b),CASE WHEN s IN ('report','online','plan-release','vendor-order','verify') THEN 'pur-finance' ELSE 'pur-admin' END); $$;
CREATE FUNCTION pg_temp.reject_purchase(e text,s text,id text,b jsonb,expected text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE denied boolean:=false; BEGIN BEGIN PERFORM pg_temp.purch(e,s,id,b); EXCEPTION WHEN OTHERS THEN denied:=true; IF SQLERRM NOT LIKE '%'||expected||'%' THEN RAISE; END IF; END; IF NOT denied THEN RAISE EXCEPTION 'Expected purchasing rejection %',expected; END IF; END $$;
CREATE FUNCTION pg_temp.compile_body() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"occurredAt":"2026-10-16T06:00:00Z","advanceCode":"PUR-ADV","salesOrderIds":["pur-a","pur-b"],"items":[{"id":"pur-pia","productId":"pur-prod","salesOrderId":"pur-a","qtyTarget":5,"estimatedUnitPrice":10},{"id":"pur-pib","productId":"pur-prod","salesOrderId":"pur-b","qtyTarget":10,"estimatedUnitPrice":10}],"reservations":[{"salesOrderItemId":"pur-la","qty":5}],"rejectedIds":[]}'::jsonb; $$;
CREATE FUNCTION pg_temp.purchase_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected-purchase-fault'; END $$;
CREATE TRIGGER purchase_fault BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION pg_temp.purchase_fault();
\o /dev/null
SELECT pg_temp.reject_purchase('pur-compile','compile','pur-doc',pg_temp.compile_body(),'injected-purchase-fault');
\o
DO $$ BEGIN IF EXISTS(SELECT 1 FROM purchases WHERE id='pur-doc') OR (SELECT qty_final FROM sales_order_items WHERE id='pur-la') IS NOT NULL OR EXISTS(SELECT 1 FROM purchase_events WHERE id='pur-compile') THEN RAISE EXCEPTION 'Partial compile committed'; END IF; END $$;
DROP TRIGGER purchase_fault ON stock_movements;
\o /dev/null
SELECT pg_temp.purch('pur-compile','compile','pur-doc',pg_temp.compile_body());
SELECT pg_temp.purch('pur-compile','compile','pur-doc',pg_temp.compile_body());
SELECT pg_temp.reject_purchase('pur-compile','compile','pur-doc',pg_temp.compile_body()||'{"advanceCode":"changed"}','conflict');
\o
DO $$ BEGIN IF (SELECT sum(qty_target) FROM purchase_items WHERE purchase_id='pur-doc')<>15 OR (SELECT qty_final FROM sales_order_items WHERE id='pur-la')<>5 OR (SELECT current_stock FROM products WHERE id='pur-prod')<>5 OR (SELECT count(*) FROM stock_movements WHERE kind='BOOKING' AND product_id='pur-prod')<>1 THEN RAISE EXCEPTION 'Shared demand/reservation/retry wrong'; END IF; END $$;
CREATE TRIGGER purchase_fault BEFORE UPDATE ON sales_order_items FOR EACH ROW EXECUTE FUNCTION pg_temp.purchase_fault();
\o /dev/null
SELECT pg_temp.reject_purchase('pur-revise','revise','pur-a','{"lines":[{"id":"pur-la","qty":12,"unitPrice":25,"expectedQty":10,"expectedUnitPrice":20}]}','injected-purchase-fault');
\o
DO $$ BEGIN IF (SELECT qty_target FROM purchase_items WHERE id='pur-pia')<>5 OR (SELECT qty FROM sales_order_items WHERE id='pur-la')<>10 THEN RAISE EXCEPTION 'Partial revision committed'; END IF; END $$;
DROP TRIGGER purchase_fault ON sales_order_items;
\o /dev/null
SELECT pg_temp.purch('pur-revise','revise','pur-a','{"lines":[{"id":"pur-la","qty":12,"unitPrice":25,"expectedQty":10,"expectedUnitPrice":20}]}');
SELECT pg_temp.purch('pur-revise','revise','pur-a','{"lines":[{"id":"pur-la","qty":12,"unitPrice":25,"expectedQty":10,"expectedUnitPrice":20}]}');
SELECT pg_temp.reject_purchase('pur-stale','revise','pur-a','{"lines":[{"id":"pur-la","qty":13,"unitPrice":25,"expectedQty":10,"expectedUnitPrice":20}]}','Stale');
\o
DO $$ BEGIN IF (SELECT qty_target FROM purchase_items WHERE id='pur-pia')<>7 OR (SELECT qty FROM sales_order_items WHERE id='pur-la')<>12 OR (SELECT unit_price FROM sales_order_items WHERE id='pur-la')<>25 THEN RAISE EXCEPTION 'Revision allocation wrong'; END IF; END $$;
UPDATE purchase_items SET purchase_method='Pasar',payment_method='Cash' WHERE purchase_id='pur-doc';
\o /dev/null
SELECT pg_temp.purch('pur-plan','plan-release','pur-doc','{}');
SELECT pg_temp.reject_purchase('pur-lock','revise','pur-a','{"lines":[{"id":"pur-la","qty":13,"unitPrice":25,"expectedQty":12,"expectedUnitPrice":25}]}','locked');
\o
UPDATE purchases SET paper_session_id='pur-paper',change_returned=7 WHERE id='pur-doc';
\o /dev/null
SELECT pg_temp.purch('pur-paper-release','paper-release','pur-paper','{"purchaseIds":["pur-doc"],"paperSessionId":"pur-paper"}');
\o
INSERT INTO purchases(id,date,purchaser_id,status,budget_amount) VALUES('pur-unrelated','2026-10-16','pur-admin','Pending',50);
CREATE FUNCTION pg_temp.report_body() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"purchaseIds":["pur-doc","pur-unrelated"],"occurredAt":"2026-10-16T18:30:00Z","onBehalfOfUserId":"paper-worker","pocketBankAccountId":"pur-bank","transferBankAccountId":"pur-bank","lines":[{"id":"pur-pia","purchaseId":"pur-doc","productId":"pur-prod","isChecked":true,"qtyPurchased":2,"actualUnitPrice":10,"vendorId":"pur-vendor","paymentMethod":"Cash"}]}'::jsonb; $$;
CREATE TRIGGER purchase_fault BEFORE INSERT OR UPDATE ON purchase_items FOR EACH ROW EXECUTE FUNCTION pg_temp.purchase_fault();
\o /dev/null
SELECT pg_temp.reject_purchase('pur-report','report','pur-paper',pg_temp.report_body(),'injected-purchase-fault');
\o
DO $$ BEGIN IF (SELECT balance FROM bank_accounts WHERE id='pur-bank')<>1000000 OR EXISTS(SELECT 1 FROM financial_events WHERE id LIKE '%pur-report%') OR (SELECT count(*) FROM purchase_items WHERE purchase_id='pur-doc')<>2 THEN RAISE EXCEPTION 'Partial money/allocation committed'; END IF; END $$;
DROP TRIGGER purchase_fault ON purchase_items;
\o /dev/null
SELECT pg_temp.purch('pur-report','report','pur-paper',pg_temp.report_body());
SELECT pg_temp.purch('pur-report','report','pur-paper',pg_temp.report_body());
\o
DO $$ BEGIN IF (SELECT transaction_date FROM journal_entries WHERE reference_id='pur-doc' ORDER BY id LIMIT 1)<>'2026-10-17' THEN RAISE EXCEPTION 'Paper financial date must follow actual WIB day'; END IF; IF (SELECT balance FROM bank_accounts WHERE id='pur-bank')<>999980 OR (SELECT status FROM purchases WHERE id='pur-doc')<>'Belanja' OR (SELECT status FROM purchases WHERE id='pur-unrelated')<>'Pending' OR (SELECT change_returned FROM purchases WHERE id='pur-doc')<>7 OR (SELECT qty_target FROM purchase_items WHERE id='pur-pia')<>5 THEN RAISE EXCEPTION 'Partial/unrelated/return/retry semantics wrong'; END IF; END $$;
\o /dev/null
SELECT pg_temp.purch('pur-report2','report','pur-paper',jsonb_set(jsonb_set(pg_temp.report_body(),'{lines,0,qtyPurchased}','3'),'{lines,0,vendorId}','"pur-vendor2"'));
\o
DO $$ BEGIN IF (SELECT count(DISTINCT vendor_id) FROM purchase_items WHERE purchase_id='pur-doc' AND qty_purchased>0)<>2 THEN RAISE EXCEPTION 'Partial supplier allocation overwritten'; END IF; END $$;
-- A later stage failure rolls back both earlier valid allocations and all cash legs.
CREATE TRIGGER purchase_fault BEFORE INSERT ON purchase_events FOR EACH ROW EXECUTE FUNCTION pg_temp.purchase_fault();
\o /dev/null
SELECT pg_temp.reject_purchase('pur-last-fault','report','pur-paper',jsonb_set(pg_temp.report_body(),'{lines,0,qtyPurchased}','1'),'injected-purchase-fault');
\o
DO $$ BEGIN IF (SELECT balance FROM bank_accounts WHERE id='pur-bank')<>999950 OR (SELECT qty_target FROM purchase_items WHERE id='pur-pia')<>2 THEN RAISE EXCEPTION 'Last stage rollback failed'; END IF; END $$;
DROP TRIGGER purchase_fault ON purchase_events;
-- Operational expenses use paper performer/time and commit with purchase allocations.
CREATE TRIGGER purchase_fault BEFORE INSERT ON expenses FOR EACH ROW EXECUTE FUNCTION pg_temp.purchase_fault();
\o /dev/null
SELECT pg_temp.reject_purchase('pur-ops-report','report','pur-paper',jsonb_set(pg_temp.report_body(),'{lines,0,qtyPurchased}','1')||'{"expenses":[{"id":"pur-ops","date":"2026-10-16T18:30:00Z","reporterId":"paper-worker","purchaseId":"pur-doc","sourceBankAccountId":"pur-bank","category":"Bensin","amount":3,"description":"Fuel"}]}','injected-purchase-fault');
\o
DO $$ BEGIN IF (SELECT balance FROM bank_accounts WHERE id='pur-bank')<>999950 OR (SELECT qty_target FROM purchase_items WHERE id='pur-pia')<>2 OR EXISTS(SELECT 1 FROM expenses WHERE id='pur-ops') THEN RAISE EXCEPTION 'Purchase/ops split after failed expense'; END IF; END $$;
DROP TRIGGER purchase_fault ON expenses;
\o /dev/null
SELECT pg_temp.purch('pur-ops-report','report','pur-paper',jsonb_set(pg_temp.report_body(),'{lines,0,qtyPurchased}','1')||'{"expenses":[{"id":"pur-ops","date":"2026-10-16T18:30:00Z","reporterId":"paper-worker","purchaseId":"pur-doc","sourceBankAccountId":"pur-bank","category":"Bensin","amount":3,"description":"Fuel"}]}');
\o
DO $$ BEGIN IF (SELECT reporter_id FROM expenses WHERE id='pur-ops')<>'paper-worker' OR (SELECT date::timestamptz FROM expenses WHERE id='pur-ops')<>'2026-10-16T18:30:00Z'::timestamptz OR (SELECT recorded_by FROM expenses WHERE id='pur-ops')<>'pur-finance' THEN RAISE EXCEPTION 'Expense performer/occurrence versus recorder lost'; END IF; END $$;
-- Mixed document: buying the last market row cannot close an unordered vendor row.
INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,qty_purchased,purchase_method,payment_method,planned_vendor_id) VALUES('pur-mixed-vendor','pur-doc','pur-prod',1,1,'Vendor','Tempo','pur-vendor');
\o /dev/null
SELECT pg_temp.purch('pur-last-market','report','pur-paper',jsonb_set(pg_temp.report_body(),'{lines,0,qtyPurchased}','1'));
\o
DO $$ BEGIN IF (SELECT status FROM purchases WHERE id='pur-doc')<>'Belanja' THEN RAISE EXCEPTION 'Market report closed unordered mixed vendor'; END IF; END $$;
INSERT INTO purchases(id,date,purchaser_id,status) VALUES('pur-online-doc','2026-10-16','pur-admin','Pending');
INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,purchase_method,payment_method,planned_vendor_id) VALUES('pur-online','pur-online-doc','pur-prod',10,'Online','Transfer','pur-vendor');
UPDATE bank_accounts SET balance=1 WHERE id='pur-bank';
\o /dev/null
SELECT pg_temp.reject_purchase('pur-online-event','online','pur-online','{"unitPrice":10,"adminFee":10,"shippingFee":20,"bankAccountId":"pur-bank","ref":"ORDER-1"}','Insufficient');
\o
DO $$ BEGIN IF (SELECT is_online_ordered FROM purchase_items WHERE id='pur-online') OR (SELECT qty_purchased FROM purchase_items WHERE id='pur-online')<>0 THEN RAISE EXCEPTION 'Failed payment set ordered/acquired marker'; END IF; END $$;
UPDATE bank_accounts SET balance=1000 WHERE id='pur-bank';
\o /dev/null
SELECT pg_temp.purch('pur-online-event','online','pur-online','{"unitPrice":10,"adminFee":10,"shippingFee":20,"bankAccountId":"pur-bank","ref":"ORDER-1"}');
SELECT pg_temp.purch('pur-online-event','online','pur-online','{"unitPrice":10,"adminFee":10,"shippingFee":20,"bankAccountId":"pur-bank","ref":"ORDER-1"}');
\o
DO $$ BEGIN IF (SELECT balance FROM bank_accounts WHERE id='pur-bank')<>870 OR (SELECT qty_purchased FROM purchase_items WHERE id='pur-online')<>10 OR NOT (SELECT is_online_ordered FROM purchase_items WHERE id='pur-online') OR (SELECT is_checked FROM purchase_items WHERE id='pur-online') OR (SELECT actual_spent FROM purchases WHERE id='pur-online-doc')<>130 THEN RAISE EXCEPTION 'Online total/fees/source/retry/physical receipt separation wrong'; END IF; END $$;
\o /dev/null
SELECT pg_temp.reject_purchase('pur-verify-early','verify','pur-online-doc','{}','completed');
\o
UPDATE purchase_items SET is_qced=true,qc_processed_qty=qty_purchased WHERE id='pur-online';
INSERT INTO expenses(id,date,reporter_id,category,amount,description,status,reference_id) VALUES('pur-online-placeholder','2026-10-16','paper-worker','Belanja Online',130,'Historical online placeholder','Pending Audit','pur-online');
\o /dev/null
SELECT pg_temp.purch('pur-verify','verify','pur-online-doc','{}');
SELECT pg_temp.purch('pur-verify','verify','pur-online-doc','{}');
\o
DO $$ BEGIN IF (SELECT reconciliation_status FROM purchases WHERE id='pur-online-doc')<>'Terverifikasi' OR (SELECT status FROM expenses WHERE id='pur-online-placeholder')<>'Approved' OR NOT (SELECT is_journaled FROM expenses WHERE id='pur-online-placeholder') OR (SELECT balance FROM bank_accounts WHERE id='pur-bank')<>870 THEN RAISE EXCEPTION 'Source-backed online verification duplicated cash or left placeholder pending'; END IF; END $$;
-- Source-backed vendor credit and transfer verification follows generated AP journals/payments.
INSERT INTO purchases(id,date,purchaser_id,status) VALUES('pur-tempo-doc','2026-10-16','pur-admin','Selesai'),('pur-transfer-doc','2026-10-16','pur-admin','Selesai');
INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,qty_purchased,actual_unit_price,purchase_method,payment_method,vendor_id,is_online_ordered,is_qced) VALUES('pur-tempo','pur-tempo-doc','pur-prod',1,1,10,'Pasar','Tempo','pur-vendor',false,true),('pur-vendor-transfer','pur-transfer-doc','pur-prod',1,1,10,'Vendor','Transfer','pur-vendor',true,false);
\o /dev/null
SELECT pg_temp.reject_purchase('pur-tempo-verify','verify','pur-tempo-doc','{}','AP source');
\o
INSERT INTO vendor_bills(id,bill_number,vendor_id,vendor_name,issue_date,due_date,description,total_amount,status,purchase_id,created_at) VALUES('pur-tempo-bill','PUR-TEMPO','pur-vendor','Supplier','2026-10-16','2026-10-30','Tempo source',10,'Pending','pur-tempo-doc','2026-10-16');
\o /dev/null
SELECT pg_temp.reject_purchase('pur-tempo-verify','verify','pur-tempo-doc','{}','AP source');
SELECT post_journal_entry('pur-tempo-journal','2026-10-16','Tempo source','Purchase','pur-tempo', '[{"accountCode":"2-1100","amount":10}]','[{"accountCode":"2-1000","amount":10,"vendorId":"pur-vendor","vendorBillId":"pur-tempo-bill"}]');
SELECT pg_temp.purch('pur-tempo-verify','verify','pur-tempo-doc','{}');
SELECT process_goods_event('{"eventId":"pur-transfer-arrival","stage":"arrival","sourceId":"pur-vendor-transfer","payload":{"qty":1,"performedBy":"pur-finance","occurredAt":"2026-10-16T06:00:00Z","paperNumber":"pur-transfer-arrival"}}','pur-finance');
SELECT process_goods_event('{"eventId":"pur-transfer-qc","stage":"qc","sourceId":"pur-vendor-transfer","payload":{"qtyPassToInventory":1,"qtyReject":0,"rejectAction":"Disposal","allocations":[],"bankAccountId":"pur-bank","performedBy":"pur-finance","occurredAt":"2026-10-16T06:00:00Z","paperNumber":"pur-transfer-qc"}}','pur-finance');
SELECT pg_temp.purch('pur-transfer-verify','verify','pur-transfer-doc','{}');
\o
DO $$ BEGIN IF (SELECT reconciliation_status FROM purchases WHERE id='pur-tempo-doc')<>'Terverifikasi' OR (SELECT reconciliation_status FROM purchases WHERE id='pur-transfer-doc')<>'Terverifikasi' OR (SELECT balance FROM bank_accounts WHERE id='pur-bank')<>860 THEN RAISE EXCEPTION 'Source-backed AP or transferred vendor verification failed'; END IF; END $$;
INSERT INTO products(id,sku_code,name,uom,base_price,current_stock) VALUES('pur-stockonly','PUR-STOCK','Stock only','kg',10,2);
INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status) VALUES('pur-stockso','PUR-STOCK-PO','pur-client','2026-10-16','2026-10-17','Draft');
INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,unit_price,subtotal) VALUES('pur-stockline','pur-stockso','pur-stockonly',2,20,40);
\o /dev/null
SELECT pg_temp.purch('pur-stock-compile','compile','pur-stock-doc','{"salesOrderIds":["pur-stockso"],"items":[],"reservations":[{"salesOrderItemId":"pur-stockline","qty":2}],"rejectedIds":[]}');
\o
DO $$ BEGIN IF (SELECT status FROM sales_orders WHERE id='pur-stockso')<>'Packing' OR (SELECT qty_final FROM sales_order_items WHERE id='pur-stockline')<>2 OR (SELECT status FROM purchases WHERE id='pur-stock-doc')<>'Selesai' THEN RAISE EXCEPTION 'Stock-only PO must go straight to packing without nonexistent QC or purchasing plan'; END IF; END $$;
INSERT INTO products(id,sku_code,name,uom,base_price,current_stock) VALUES('pur-mixstock','PUR-MIXSTOCK','Stock mix','kg',10,2);
INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status) VALUES('pur-mixa','PUR-MIXA','pur-client','2026-10-16','2026-10-17','Draft'),('pur-mixb','PUR-MIXB','pur-client','2026-10-16','2026-10-17','Draft');
INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,unit_price,subtotal) VALUES('pur-mixla','pur-mixa','pur-mixstock',2,20,40),('pur-mixlb','pur-mixb','pur-mixstock',2,20,40);
\o /dev/null
SELECT pg_temp.purch('pur-mix-compile','compile','pur-mix-doc','{"salesOrderIds":["pur-mixa","pur-mixb"],"items":[{"id":"pur-mixpi","productId":"pur-mixstock","salesOrderId":"pur-mixb","qtyTarget":2,"estimatedUnitPrice":10}],"reservations":[{"salesOrderItemId":"pur-mixla","qty":2}],"rejectedIds":[]}');
\o
DO $$ BEGIN IF (SELECT status FROM sales_orders WHERE id='pur-mixa')<>'Packing' OR (SELECT status FROM sales_orders WHERE id='pur-mixb')<>'Belanja' THEN RAISE EXCEPTION 'Mixed compilation must route each PO according to its own stock/purchase readiness'; END IF; END $$;
DO $$ BEGIN IF has_function_privilege('anon','process_purchase_event(jsonb,text)','EXECUTE') OR has_function_privilege('authenticated','process_purchase_event(jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'RPC exposed to browser roles'; END IF; END $$;
ROLLBACK;
\echo 'PASS atomic purchasing compile/reservation/revision/report rollback, retries, supplier allocations and access'

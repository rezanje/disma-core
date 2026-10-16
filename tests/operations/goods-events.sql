\set ON_ERROR_STOP on
BEGIN;
INSERT INTO users(id,name,role,pin) VALUES('goods-admin','Admin','admin_po','9861'),('goods-finance','Finance','finance','9862'),('goods-worker','Worker','gudang','9863'),('goods-sa','Super','super_admin','9864');
INSERT INTO clients(id,company_name,pic_name,created_at) VALUES('goods-client','Client','PIC','2026-10-16');
INSERT INTO coas(id,account_code,account_name,account_type)
SELECT 'goods-'||x.code,x.code,x.code,'Asset' FROM (VALUES('1-3000'),('2-1100'),('1-2000'),('4-1000'),('5-1000'),('5-2000'),('1-2100'),('1-3100'),('2-1000'),('1-1000'),('4-2000')) x(code)
WHERE NOT EXISTS(SELECT 1 FROM coas WHERE account_code=x.code);
INSERT INTO bank_accounts(id,name,account_code,balance,cfo_approval_required) VALUES('goods-bank','Bank','1-1000',200000,false);
INSERT INTO products(id,sku_code,name,uom,base_price) VALUES('goods-prod','GOODS-TEST','Apple','kg',10000),('goods-zero','GOODS-ZERO','Tomato','kg',5000);
INSERT INTO purchases(id,date,purchaser_id,status) VALUES('goods-purchase','2026-10-15','goods-worker','Selesai');
INSERT INTO purchase_items(id,purchase_id,product_id,qty_purchased,qty_target,actual_unit_price,purchase_method) VALUES('goods-pi','goods-purchase','goods-prod',10,10,10000,'Pasar'),('goods-piz','goods-purchase','goods-zero',10,10,5000,'Pasar');
INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status) VALUES('goods-so','GOODS-PO','goods-client','2026-10-15','2026-10-16','QC');
INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,unit_price,subtotal) VALUES('goods-line','goods-so','goods-prod',10,15000,150000),('goods-linez','goods-so','goods-zero',10,7000,70000);
CREATE FUNCTION pg_temp.goods(id text,stage text,source text,payload jsonb DEFAULT '{}',actor text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
 SELECT process_goods_event(jsonb_build_object('eventId',id,'stage',stage,'sourceId',source,'payload',jsonb_build_object('performedBy','goods-worker','occurredAt','2026-10-15T06:00:00Z','paperNumber',id)||payload),CASE WHEN actor IS NOT NULL THEN actor WHEN stage='opname' THEN 'goods-sa' WHEN stage IN ('audit','dropship') THEN 'goods-finance' ELSE 'goods-admin' END);
$$;
CREATE FUNCTION pg_temp.reject_goods(id text,stage text,source text,payload jsonb,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM pg_temp.goods(id,stage,source,payload); EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%'||expected||'%' THEN RAISE; END IF; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Expected rejection %',expected; END IF;
END $$;
\o /dev/null
SELECT pg_temp.reject_goods('neg','qc','goods-pi','{"qtyPassToInventory":-5,"qtyReject":0,"allocations":[{"soId":"goods-so","qty":15}],"rejectAction":"Disposal"}','tidak negatif');
SELECT pg_temp.reject_goods('over','qc','goods-pi','{"qtyPassToInventory":0,"qtyReject":0,"allocations":[{"soId":"goods-so","qty":11}],"rejectAction":"Disposal","unbalanceReason":"paper"}','melebihi');
SELECT pg_temp.goods('qc6','qc','goods-pi','{"qtyPassToInventory":0,"qtyReject":0,"allocations":[{"soId":"goods-so","qty":6}],"rejectAction":"Disposal","unbalanceReason":"remaining4"}');
SELECT pg_temp.goods('qc6','qc','goods-pi','{"qtyPassToInventory":0,"qtyReject":0,"allocations":[{"soId":"goods-so","qty":6}],"rejectAction":"Disposal","unbalanceReason":"remaining4"}');
SELECT pg_temp.reject_goods('qc6','qc','goods-pi','{"qtyPassToInventory":0,"qtyReject":0,"allocations":[{"soId":"goods-so","qty":5}],"rejectAction":"Disposal","unbalanceReason":"remaining4"}','isi berbeda');
\o
DO $$ BEGIN
 IF (SELECT current_stock FROM products WHERE id='goods-prod')<>6 OR (SELECT qty_final FROM sales_order_items WHERE id='goods-line')<>6 THEN RAISE EXCEPTION 'QC retry duplicated stock/allocation'; END IF;
 IF (SELECT is_qced FROM purchase_items WHERE id='goods-pi') OR (SELECT inbound_status FROM purchase_items WHERE id='goods-pi')<>'partial' THEN RAISE EXCEPTION 'Partial receipt closed'; END IF;
END $$;
\o /dev/null
SELECT pg_temp.goods('qc4','qc','goods-pi','{"qtyPassToInventory":0,"qtyReject":0,"allocations":[{"soId":"goods-so","qty":4}],"rejectAction":"Disposal"}');
SELECT pg_temp.goods('qc-zero','qc','goods-piz','{"qtyPassToInventory":0,"qtyReject":10,"allocations":[{"soId":"goods-so","qty":0}],"rejectAction":"Disposal","rejectReason":"rotten"}');
\o
DO $$ BEGIN
 IF (SELECT current_stock FROM products WHERE id='goods-prod')<>10 OR (SELECT qty_final FROM sales_order_items WHERE id='goods-line')<>10 OR NOT (SELECT is_qced FROM purchase_items WHERE id='goods-pi') THEN RAISE EXCEPTION 'Partial6+4 totals wrong'; END IF;
 IF (SELECT qty_final FROM sales_order_items WHERE id='goods-linez')<>0 OR (SELECT status FROM sales_orders WHERE id='goods-so')<>'Packing' THEN RAISE EXCEPTION 'Explicit zero decision stuck mixed PO'; END IF;
 IF (SELECT sum(debit_amount) FROM journal_lines WHERE journal_entry_id IN ('qc6:journal','qc4:journal'))<>100000 THEN RAISE EXCEPTION 'Partial receipt value not incremental'; END IF;
END $$;
\o /dev/null
SELECT pg_temp.reject_goods('pack-over','packing','goods-so','{"lines":[{"salesOrderItemId":"goods-line","qty":11}]}','melebihi');
SELECT pg_temp.goods('pack6','packing','goods-so','{"lines":[{"salesOrderItemId":"goods-line","qty":6}]}');
SELECT pg_temp.goods('release1','release','goods-so');
SELECT pg_temp.goods('release1','release','goods-so');
SELECT pg_temp.goods('handover1','handover','release1:delivery');
SELECT pg_temp.reject_goods('accepted-over','receipt','release1:delivery','{"recipientName":"Client","signedPaperChecked":true,"received":[{"salesOrderItemId":"goods-line","qtyReceived":7}]}','melebihi');
SELECT pg_temp.reject_goods('receipt-no-signature','receipt','release1:delivery','{"recipientName":"Client","received":[{"salesOrderItemId":"goods-line","qtyReceived":6}]}','bertanda tangan');
SELECT pg_temp.goods('receipt1','receipt','release1:delivery','{"recipientName":"Client","signedPaperChecked":true,"received":[{"salesOrderItemId":"goods-line","qtyReceived":4}],"rejectionReason":"damaged2"}');
SELECT pg_temp.goods('receipt1','receipt','release1:delivery','{"recipientName":"Client","signedPaperChecked":true,"received":[{"salesOrderItemId":"goods-line","qtyReceived":4}],"rejectionReason":"damaged2"}');
SELECT pg_temp.goods('final1','acceptance','release1:delivery','{"soId":"goods-so"}');
SELECT pg_temp.goods('final1','acceptance','release1:delivery','{"soId":"goods-so"}');
SELECT pg_temp.goods('audit1','audit','release1:delivery');
SELECT pg_temp.goods('audit1','audit','release1:delivery');
\o
DO $$ BEGIN
 IF (SELECT current_stock FROM products WHERE id='goods-prod')<>4 OR (SELECT count(*) FROM stock_movements WHERE reference_id='release1:delivery')<>1 THEN RAISE EXCEPTION 'Packed6/QC10 release or retry wrong'; END IF;
 IF (SELECT total_amount FROM invoices WHERE id='invoice:release1:delivery')<>60000 OR (SELECT count(*) FROM invoices WHERE delivery_id='release1:delivery')<>1 THEN RAISE EXCEPTION 'Accepted4 invoice/finalize retry wrong'; END IF;
 IF (SELECT qty_delivered FROM sales_order_items WHERE id='goods-line')<>4 OR (SELECT qty_final FROM sales_order_items WHERE id='goods-line')<>4 THEN RAISE EXCEPTION 'Cumulative/residual quantity wrong'; END IF;
 IF (SELECT qty FROM pending_returns WHERE delivery_id='release1:delivery')<>2 THEN RAISE EXCEPTION 'Return2 missing'; END IF;
 IF (SELECT (line_snapshots->0->>'qty')::numeric FROM deliveries WHERE id='release1:delivery')<>6 OR (SELECT (line_snapshots->0->>'qty')::numeric FROM invoices WHERE id='invoice:release1:delivery')<>4 THEN RAISE EXCEPTION 'Snapshots wrong'; END IF;
END $$;
\o /dev/null
SELECT pg_temp.goods('returnqc','return','receipt1:return:goods-line','{"pass":2,"reject":0,"vendor":0,"reason":"reusable"}');
SELECT pg_temp.goods('returnqc','return','receipt1:return:goods-line','{"pass":2,"reject":0,"vendor":0,"reason":"reusable"}');
\o
DO $$ BEGIN
 IF (SELECT current_stock FROM products WHERE id='goods-prod')<>6 OR (SELECT status FROM pending_returns WHERE id='receipt1:return:goods-line')<>'Processed' THEN RAISE EXCEPTION 'Return QC retry wrong'; END IF;
END $$;

INSERT INTO vendors(id,company_name,pic_name,created_at) VALUES('goods-vendor','Vendor','PIC','2026-10-16');
INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,qty_purchased,actual_unit_price,purchase_method,payment_method,vendor_id,sales_order_id,is_online_ordered) VALUES('goods-drop','goods-purchase','goods-prod',2,2,12000,'Dropship','Tempo','goods-vendor','goods-so',true);
\o /dev/null
SELECT pg_temp.goods('dropship1','dropship','goods-so','{"vendorId":"goods-vendor","lines":[{"purchaseItemId":"goods-drop","qtyReceived":2}],"paperProof":"/proof/signed.pdf"}');
SELECT pg_temp.goods('dropship1','dropship','goods-so','{"vendorId":"goods-vendor","lines":[{"purchaseItemId":"goods-drop","qtyReceived":2}],"paperProof":"/proof/signed.pdf"}');
\o
DO $$ BEGIN
 IF (SELECT qty_delivered FROM sales_order_items WHERE id='goods-line')<>6 OR (SELECT current_stock FROM products WHERE id='goods-prod')<>6 THEN RAISE EXCEPTION 'Dropship must accept2 without warehouse change'; END IF;
 IF (SELECT total_amount FROM invoices WHERE id='invoice:dropship1:delivery')<>30000 OR (SELECT total_amount FROM vendor_bills WHERE id='dropship1:bill')<>24000 THEN RAISE EXCEPTION 'Dropship revenue/AP wrong'; END IF;
 IF (SELECT status FROM sales_orders WHERE id='goods-so')<>'Packing' THEN RAISE EXCEPTION 'Dropship hid ready warehouse allocation'; END IF;
END $$;

INSERT INTO purchase_items(id,purchase_id,product_id,qty_purchased,actual_unit_price,purchase_method,vendor_id,is_online_ordered) VALUES('goods-arrival','goods-purchase','goods-prod',10,10000,'Vendor','goods-vendor',true);
\o /dev/null
SELECT pg_temp.goods('arrived6','arrival','goods-arrival','{"qty":6,"condition":"fresh"}');
SELECT pg_temp.goods('arrivalqc6','qc','goods-arrival','{"qtyPassToInventory":6,"qtyReject":0,"allocations":[],"rejectAction":"Disposal","unbalanceReason":"remaining4"}');
SELECT pg_temp.reject_goods('arrivalqc4-too-early','qc','goods-arrival','{"qtyPassToInventory":4,"qtyReject":0,"allocations":[],"rejectAction":"Disposal"}','penerimaan');
SELECT pg_temp.goods('arrived4','arrival','goods-arrival','{"qty":4,"condition":"fresh"}');
SELECT pg_temp.goods('arrivalqc4','qc','goods-arrival','{"qtyPassToInventory":4,"qtyReject":0,"allocations":[],"rejectAction":"Disposal"}');
\o

INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,qty_purchased,actual_unit_price,purchase_method,payment_method,vendor_id) VALUES('goods-claim','goods-purchase','goods-prod',10,10,10000,'Pasar','Tempo','goods-vendor');
\o /dev/null
SELECT pg_temp.goods('claimqc','qc','goods-claim','{"qtyPassToInventory":8,"qtyReject":2,"allocations":[],"rejectAction":"Return","rejectReason":"replace spoiled"}');
\o
DO $$ BEGIN
 IF (SELECT total_amount FROM vendor_bills WHERE id='claimqc:bill')<>100000 THEN RAISE EXCEPTION 'Replacement claim requires full AP; net AP leaves orphan GRIR'; END IF;
END $$;
\o /dev/null
SELECT pg_temp.goods('claimswap','vendor-return','claimqc:vendorreturn','{"mode":"swap","pass":2,"reject":0}');
SELECT pg_temp.goods('claimswap','vendor-return','claimqc:vendorreturn','{"mode":"swap","pass":2,"reject":0}');
\o
DO $$ BEGIN
 IF (SELECT status FROM vendor_returns WHERE id='claimqc:vendorreturn')<>'Selesai-Ditukar' THEN RAISE EXCEPTION 'Claim swap did not close'; END IF;
 IF (SELECT sum(jl.credit_amount-jl.debit_amount) FROM journal_lines jl JOIN coas c ON c.id=jl.account_id JOIN journal_entries e ON e.id=jl.journal_entry_id WHERE c.account_code='2-1100' AND e.reference_id='claimqc')<>0 THEN RAISE EXCEPTION 'QC GRIR not cleared'; END IF;
END $$;

-- Unshipped reserved4 remains a second immutable delivery after the first round closes.
UPDATE sales_order_items SET unit_price=20000 WHERE id='goods-line';
\o /dev/null
SELECT pg_temp.goods('pack4','packing','goods-so','{"lines":[{"salesOrderItemId":"goods-line","qty":4}]}');
SELECT pg_temp.goods('release2','release','goods-so');
SELECT pg_temp.reject_goods('premature-result','receipt','release2:delivery','{"recipientName":"Client","signedPaperChecked":true,"received":[{"salesOrderItemId":"goods-line","qtyReceived":4}]}','serah terima');
SELECT pg_temp.goods('handover2','handover','release2:delivery');
SELECT pg_temp.goods('receipt2','receipt','release2:delivery','{"recipientName":"Client","signedPaperChecked":true,"received":[{"salesOrderItemId":"goods-line","qtyReceived":4}]}');
SELECT pg_temp.goods('final2','acceptance','release2:delivery','{"soId":"goods-so"}');
\o
DO $$ BEGIN
 IF (SELECT status FROM invoices WHERE id='invoice:release2:delivery')<>'Draft' THEN RAISE EXCEPTION 'Unaudited invoice must remain Draft to block unposted receipts'; END IF;
END $$;
DO $$ DECLARE denied boolean:=false; BEGIN
 BEGIN PERFORM record_client_receipt('{"paymentId":"before-audit","date":"2026-10-16","bankAccountId":"goods-bank","amount":1000,"allocations":[{"invoiceId":"invoice:release2:delivery","amount":1000}]}','goods-finance'); EXCEPTION WHEN OTHERS THEN denied:=true; IF SQLERRM NOT LIKE '%not eligible%' THEN RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'Payment accepted before AR/audit'; END IF;
END $$;
CREATE FUNCTION pg_temp.goods_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected-goods-failure'; END $$;
-- Failure on the HPP journal after revenue was written must roll back revenue too.
CREATE FUNCTION pg_temp.hpp_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.description LIKE 'Pengakuan HPP%' THEN RAISE EXCEPTION 'injected-goods-failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER goods_fault BEFORE INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION pg_temp.hpp_fault();
\o /dev/null
SELECT pg_temp.reject_goods('audit2','audit','release2:delivery','{}','injected-goods-failure');
\o
DROP TRIGGER goods_fault ON journal_entries;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM journal_entries WHERE id='audit2:revenue') OR (SELECT qty_delivered FROM sales_order_items WHERE id='goods-line')<>6 OR (SELECT status FROM deliveries WHERE id='release2:delivery')<>'Awaiting Audit' THEN RAISE EXCEPTION 'Partial audit committed'; END IF;
END $$;
\o /dev/null
SELECT pg_temp.goods('audit2','audit','release2:delivery');
\o
DO $$ BEGIN
 IF (SELECT qty_delivered FROM sales_order_items WHERE id='goods-line')<>10 OR (SELECT total_amount FROM invoices WHERE id='invoice:release2:delivery')<>80000 OR (SELECT total_amount FROM invoices WHERE id='invoice:release1:delivery')<>60000 THEN RAISE EXCEPTION 'Supplemental invoice totals wrong'; END IF;
 IF (SELECT line_snapshots->0->>'unitPrice' FROM invoices WHERE id='invoice:release1:delivery')<>'15000' THEN RAISE EXCEPTION 'Historic first-round price mutated'; END IF;
END $$;
INSERT INTO purchase_items(id,purchase_id,product_id,qty_purchased,actual_unit_price,purchase_method,payment_method,vendor_id) VALUES('goods-fault-pi','goods-purchase','goods-prod',5,10000,'Pasar','Tempo','goods-vendor');
DO $$ DECLARE target text; beforestock numeric; BEGIN
 SELECT current_stock INTO beforestock FROM products WHERE id='goods-prod';
 FOREACH target IN ARRAY ARRAY['goods_events','journal_entries','journal_lines','stock_movements','products','vendor_bills','purchase_items'] LOOP
  EXECUTE format('CREATE TRIGGER goods_fault BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION pg_temp.goods_fault()',target);
  PERFORM pg_temp.reject_goods('fault-'||target,'qc','goods-fault-pi','{"qtyPassToInventory":5,"qtyReject":0,"allocations":[],"rejectAction":"Disposal"}','injected-goods-failure');
  EXECUTE format('DROP TRIGGER goods_fault ON public.%I',target);
  IF (SELECT current_stock FROM products WHERE id='goods-prod')<>beforestock OR EXISTS(SELECT 1 FROM goods_events WHERE id='fault-'||target) OR EXISTS(SELECT 1 FROM stock_movements WHERE purchase_item_id='goods-fault-pi') OR (SELECT is_qced FROM purchase_items WHERE id='goods-fault-pi') THEN RAISE EXCEPTION 'Partial QC write at %',target; END IF;
 END LOOP;
 IF has_function_privilege('anon','public.process_goods_event(jsonb,text)','EXECUTE') OR has_function_privilege('authenticated','public.process_goods_event(jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'Goods RPC exposed to browser roles'; END IF;
END $$;

INSERT INTO products(id,sku_code,name,uom,base_price,current_stock) VALUES('goods-reserve','GOODS-RESERVE','Stock','kg',10000,5);
INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status) VALUES('goods-reserveA','GOODS-RA','goods-client','2026-10-15','2026-10-16','QC'),('goods-reserveB','GOODS-RB','goods-client','2026-10-15','2026-10-16','QC');
INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,unit_price,subtotal) VALUES('goods-reserveLA','goods-reserveA','goods-reserve',10,15000,150000),('goods-reserveLB','goods-reserveB','goods-reserve',10,15000,150000);
\o /dev/null
SELECT pg_temp.goods('reserveA','reserve','goods-reserveA','{"lines":[{"salesOrderItemId":"goods-reserveLA","qty":3}]}');
SELECT pg_temp.goods('reserveA','reserve','goods-reserveA','{"lines":[{"salesOrderItemId":"goods-reserveLA","qty":3}]}');
SELECT pg_temp.reject_goods('reserveB','reserve','goods-reserveB','{"lines":[{"salesOrderItemId":"goods-reserveLB","qty":3}]}','Stok bebas');
\o
DO $$ BEGIN
 IF (SELECT current_stock FROM products WHERE id='goods-reserve')<>5 OR (SELECT qty_final FROM sales_order_items WHERE id='goods-reserveLA')<>3 THEN RAISE EXCEPTION 'Reserve changed stock/doubled allocation'; END IF;
END $$;

\o /dev/null
SELECT pg_temp.goods('late-replace','return-intake','release1:delivery','{"salesOrderItemId":"goods-line","qty":1,"returnDecision":"Replace","reason":"spoiled next day","paperProof":"/proof/return.pdf"}');
SELECT pg_temp.goods('late-replace','return-intake','release1:delivery','{"salesOrderItemId":"goods-line","qty":1,"returnDecision":"Replace","reason":"spoiled next day","paperProof":"/proof/return.pdf"}');
SELECT pg_temp.goods('late-cancel','return-intake','release1:delivery','{"salesOrderItemId":"goods-line","qty":1,"returnDecision":"Cancel","reason":"cancel spoiled","paperProof":"/proof/return.pdf"}');
SELECT pg_temp.reject_goods('late-over','return-intake','release1:delivery','{"salesOrderItemId":"goods-line","qty":3,"returnDecision":"Replace","reason":"over","paperProof":"/proof/return.pdf"}','melebihi');
\o
DO $$ BEGIN
 IF (SELECT qty_delivered FROM sales_order_items WHERE id='goods-line')<>8 OR (SELECT qty_cancelled FROM sales_order_items WHERE id='goods-line')<>1 THEN RAISE EXCEPTION 'Late Replace/Cancel owed wrong'; END IF;
 IF (SELECT unit_price FROM pending_returns WHERE id='late-cancel:return')<>15000 OR (SELECT financial_adjustment_status FROM pending_returns WHERE id='late-cancel:return')<>'Pending Finance' OR (SELECT invoice_id FROM pending_returns WHERE id='late-cancel:return')<>'invoice:release1:delivery' THEN RAISE EXCEPTION 'Late return lost financial source'; END IF;
END $$;

\o /dev/null
SELECT pg_temp.goods('opname1','opname','goods-reserve','{"physicalQty":4,"expectedStock":5,"unitCost":10000,"warehouseId":"main","reason":"counted loss"}');
SELECT pg_temp.goods('opname1','opname','goods-reserve','{"physicalQty":4,"expectedStock":5,"unitCost":10000,"warehouseId":"main","reason":"counted loss"}');
SELECT pg_temp.reject_goods('opname-stale','opname','goods-reserve','{"physicalQty":3,"expectedStock":5,"unitCost":10000,"warehouseId":"main","reason":"stale"}','berubah');
\o
DO $$ BEGIN
 IF (SELECT current_stock FROM products WHERE id='goods-reserve')<>4 OR (SELECT stock_delta FROM stock_movements WHERE id='opname1:adjustment')<>-1 THEN RAISE EXCEPTION 'Opname not once/actual signed delta'; END IF;
END $$;

INSERT INTO purchases(id,date,purchaser_id,status) VALUES('goods-planned','2026-10-15','goods-worker','Siap Cetak');
INSERT INTO purchase_items(id,purchase_id,product_id,qty_purchased,actual_unit_price,purchase_method) VALUES('goods-plannedpi','goods-planned','goods-prod',10,10000,'Vendor');
\o /dev/null
SELECT pg_temp.reject_goods('planned-arrival','arrival','goods-plannedpi','{"qty":10}','dilepas');
\o

-- Source-linked DP40 + Transfer100 = cash100 total, never140.
INSERT INTO products(id,sku_code,name,uom,base_price) VALUES('goods-dpprod','GOODS-DP','DP Goods','kg',10000);
INSERT INTO purchases(id,date,purchaser_id,status) VALUES('goods-dpdoc','2026-10-15','goods-worker','Pending');
INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,qty_purchased,actual_unit_price,purchase_method,payment_method,vendor_id,is_online_ordered) VALUES('goods-dppi','goods-dpdoc','goods-dpprod',10,10,10000,'Vendor','Transfer','goods-vendor',true);
\o /dev/null
SELECT post_vendor_financial_event('{"eventId":"goods-dp40","kind":"vendor-advance","date":"2026-10-15","bankAccountId":"goods-bank","purchaseId":"goods-dpdoc","vendorId":"goods-vendor","amount":40000}','goods-finance');
SELECT pg_temp.goods('dparrival','arrival','goods-dppi','{"qty":10}');
SELECT pg_temp.goods('dpqc','qc','goods-dppi','{"qtyPassToInventory":10,"qtyReject":0,"allocations":[],"rejectAction":"Disposal","bankAccountId":"goods-bank"}','goods-finance');
SELECT pg_temp.goods('dpqc','qc','goods-dppi','{"qtyPassToInventory":10,"qtyReject":0,"allocations":[],"rejectAction":"Disposal","bankAccountId":"goods-bank"}','goods-finance');
\o
DO $$ BEGIN
 IF (SELECT balance FROM bank_accounts WHERE id='goods-bank')<>100000 OR (SELECT applied_amount FROM vendor_advances WHERE id='goods-dp40')<>40000 THEN RAISE EXCEPTION 'DP Transfer paid twice'; END IF;
 IF (SELECT total_amount-amount_paid FROM vendor_bills WHERE id='dpqc:bill')<>0 OR (SELECT current_stock FROM products WHERE id='goods-dpprod')<>10 THEN RAISE EXCEPTION 'DP Transfer receipt/AP not closed'; END IF;
END $$;

INSERT INTO purchases(id,date,purchaser_id,status) VALUES('goods-dpdropdoc','2026-10-15','goods-worker','Pending');
INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status) VALUES('goods-dpdropso','GOODS-DPDROP','goods-client','2026-10-15','2026-10-16','QC');
INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,unit_price,subtotal) VALUES('goods-dpdropline','goods-dpdropso','goods-dpprod',2,15000,30000);
INSERT INTO purchase_items(id,purchase_id,sales_order_id,product_id,qty_target,qty_purchased,actual_unit_price,purchase_method,payment_method,vendor_id,is_online_ordered) VALUES('goods-dpdroppi','goods-dpdropdoc','goods-dpdropso','goods-dpprod',2,2,10000,'Dropship','Transfer','goods-vendor',true);
\o /dev/null
SELECT post_vendor_financial_event('{"eventId":"goods-dpdrop5","kind":"vendor-advance","date":"2026-10-15","bankAccountId":"goods-bank","purchaseId":"goods-dpdropdoc","vendorId":"goods-vendor","amount":5000}','goods-finance');
SELECT pg_temp.goods('dpdrop','dropship','goods-dpdropso','{"vendorId":"goods-vendor","bankAccountId":"goods-bank","lines":[{"purchaseItemId":"goods-dpdroppi","qtyReceived":2}],"paperProof":"/proof/signed.pdf"}');
SELECT pg_temp.goods('dpdrop','dropship','goods-dpdropso','{"vendorId":"goods-vendor","bankAccountId":"goods-bank","lines":[{"purchaseItemId":"goods-dpdroppi","qtyReceived":2}],"paperProof":"/proof/signed.pdf"}');
\o
DO $$ BEGIN
 IF (SELECT balance FROM bank_accounts WHERE id='goods-bank')<>80000 OR (SELECT applied_amount FROM vendor_advances WHERE id='goods-dpdrop5')<>5000 OR (SELECT current_stock FROM products WHERE id='goods-dpprod')<>10 THEN RAISE EXCEPTION 'DP dropship transfer cash/stock wrong'; END IF;
 IF (SELECT total_amount-amount_paid FROM vendor_bills WHERE id='dpdrop:bill')<>0 OR (SELECT total_amount FROM invoices WHERE id='invoice:dpdrop:delivery')<>30000 THEN RAISE EXCEPTION 'DP dropship invoice/AP wrong'; END IF;
END $$;
INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,qty_purchased,actual_unit_price,purchase_method,payment_method,vendor_id) VALUES('goods-finclaim','goods-purchase','goods-prod',2,2,10000,'Pasar','Tempo','goods-vendor');
\o /dev/null
SELECT pg_temp.goods('finclaimqc','qc','goods-finclaim','{"qtyPassToInventory":0,"qtyReject":2,"allocations":[],"rejectAction":"Return","rejectReason":"refund"}');
SELECT post_vendor_financial_event('{"eventId":"goods-vendorpartialrefund","kind":"vendor-refund","date":"2026-10-16","bankAccountId":"goods-bank","vendorReturnId":"finclaimqc:vendorreturn","amount":10000}','goods-finance');
SELECT pg_temp.reject_goods('claimswap-afterrefund','vendor-return','finclaimqc:vendorreturn','{"mode":"swap","pass":2,"reject":0}','finansial');
\o

\o /dev/null
SELECT pg_temp.goods('clientvendorqc','return','late-cancel:return','{"pass":0,"reject":0,"vendor":1,"vendorId":"goods-vendor","reason":"supplier spoiled"}');
\o
DO $$ BEGIN
 IF (SELECT claim_journal_entry_id FROM vendor_returns WHERE id='clientvendorqc:vendorreturn') IS DISTINCT FROM 'clientvendorqc:vendorclaim' THEN RAISE EXCEPTION 'Client return vendor claim lost original journal'; END IF;
 IF (SELECT debit_amount FROM journal_lines l JOIN coas c ON c.id=l.account_id WHERE l.journal_entry_id='clientvendorqc:vendorclaim' AND c.account_code='1-2100')<>10000 THEN RAISE EXCEPTION 'Client return vendor claim value wrong'; END IF;
END $$;
\o /dev/null
SELECT post_vendor_financial_event('{"eventId":"goods-clientvendorrefund","kind":"vendor-refund","date":"2026-10-16","bankAccountId":"goods-bank","vendorReturnId":"clientvendorqc:vendorreturn","amount":10000}','goods-finance');
\o

INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,qty_purchased,actual_unit_price,purchase_method,payment_method,vendor_id,is_online_ordered) VALUES('goods-poqc','goods-dpdoc','goods-dpprod',1,1,10000,'Vendor','Transfer','goods-vendor',true);
DO $$ DECLARE beforebank numeric; BEGIN
 SELECT balance INTO beforebank FROM bank_accounts WHERE id='goods-bank';
 PERFORM pg_temp.goods('poqc-arrival','arrival','goods-poqc','{"qty":1}');
 PERFORM pg_temp.goods('poqc','qc','goods-poqc','{"qtyPassToInventory":1,"qtyReject":0,"allocations":[],"rejectAction":"Disposal","bankAccountId":"goods-bank"}');
 IF (SELECT balance FROM bank_accounts WHERE id='goods-bank')<>beforebank OR (SELECT total_amount-amount_paid FROM vendor_bills WHERE id='poqc:bill')<>10000 THEN RAISE EXCEPTION 'Admin PO QC spent cash instead of leaving Finance payable'; END IF;
END $$;

INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,qty_purchased,actual_unit_price,purchase_method,payment_method,vendor_id) VALUES('goods-fraction','goods-purchase','goods-prod',0.125,0.125,1.23,'Pasar','Tempo','goods-vendor');
\o /dev/null
SELECT pg_temp.goods('fractionqc','qc','goods-fraction','{"qtyPassToInventory":0.125,"qtyReject":0,"allocations":[],"rejectAction":"Disposal"}');
\o
DO $$ BEGIN
 IF (SELECT total_amount FROM vendor_bills WHERE id='fractionqc:bill') IS DISTINCT FROM 0.15 THEN RAISE EXCEPTION 'AP source must be payable at2decimal currency grain'; END IF;
END $$;

INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status) VALUES('goods-fracso','GOODS-FRAC','goods-client','2026-10-15','2026-10-16','QC');
INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,unit_price,subtotal) VALUES('goods-fracline','goods-fracso','goods-prod',0.125,1.23,0.15);
INSERT INTO purchase_items(id,purchase_id,sales_order_id,product_id,qty_target,qty_purchased,actual_unit_price,purchase_method,payment_method,vendor_id,is_online_ordered) VALUES('goods-fracdrop','goods-purchase','goods-fracso','goods-prod',0.125,0.125,1.23,'Dropship','Tempo','goods-vendor',true);
\o /dev/null
SELECT pg_temp.goods('fracdrop','dropship','goods-fracso','{"vendorId":"goods-vendor","lines":[{"purchaseItemId":"goods-fracdrop","qtyReceived":0.125}],"paperProof":"/proof/signed.pdf"}');
SELECT pg_temp.goods('frareturn1','return-intake','fracdrop:delivery','{"salesOrderItemId":"goods-fracline","qty":0.0625,"returnDecision":"Cancel","reason":"returnhalf","paperProof":"/proof/return.pdf"}');
SELECT pg_temp.goods('frareturn2','return-intake','fracdrop:delivery','{"salesOrderItemId":"goods-fracline","qty":0.0625,"returnDecision":"Cancel","reason":"returnrest","paperProof":"/proof/return.pdf"}');
\o
DO $$ BEGIN
 IF (SELECT total_amount FROM invoices WHERE id='invoice:fracdrop:delivery')<>0.15 OR (SELECT total_amount FROM vendor_bills WHERE id='fracdrop:bill')<>0.15 THEN RAISE EXCEPTION 'Fractional money invoice/AP mismatch'; END IF;
 IF (SELECT credit_amount FROM pending_returns WHERE id='frareturn1:return')<>0.08 OR (SELECT credit_amount FROM pending_returns WHERE id='frareturn2:return')<>0.07 OR (SELECT sum(cost_amount) FROM pending_returns WHERE delivery_id='fracdrop:delivery')<>0.15 THEN RAISE EXCEPTION 'Fractional return source allocation left unpayable dust'; END IF;
END $$;

-- Chained late-return -> paid credit -> cash refund must consume the same cents.
DO $$ DECLARE beforebank numeric; BEGIN
 SELECT balance INTO beforebank FROM bank_accounts WHERE id='goods-bank';
 PERFORM record_client_receipt('{"paymentId":"fraction-paid","date":"2026-10-16","bankAccountId":"goods-bank","amount":0.15,"allocations":[{"invoiceId":"invoice:fracdrop:delivery","amount":0.15}]}','goods-finance');
 PERFORM commit_finance_command('{"eventId":"fraction-cn1","kind":"credit-note","payload":{"invoiceId":"invoice:fracdrop:delivery","amount":0.08,"reason":"Return first half","cnNumber":"CN-FRA1","date":"2026-10-16","sourceReturnId":"frareturn1:return"}}','goods-finance');
 PERFORM commit_finance_command('{"eventId":"fraction-cn2","kind":"credit-note","payload":{"invoiceId":"invoice:fracdrop:delivery","amount":0.07,"reason":"Return rest half","cnNumber":"CN-FRA2","date":"2026-10-16","sourceReturnId":"frareturn2:return"}}','goods-finance');
 PERFORM commit_finance_command('{"eventId":"fraction-refund1","kind":"credit-refund","payload":{"creditNoteId":"fraction-cn1","bankAccountId":"goods-bank","amount":0.08,"date":"2026-10-16"}}','goods-finance');
 PERFORM commit_finance_command('{"eventId":"fraction-refund2","kind":"credit-refund","payload":{"creditNoteId":"fraction-cn2","bankAccountId":"goods-bank","amount":0.07,"date":"2026-10-16"}}','goods-finance');
 IF (SELECT total_amount FROM invoices WHERE id='invoice:fracdrop:delivery')<>0 OR (SELECT balance FROM bank_accounts WHERE id='goods-bank')<>beforebank
  OR (SELECT sum(refundable_amount-refunded_amount) FROM credit_notes WHERE id IN('fraction-cn1','fraction-cn2'))<>0 THEN RAISE EXCEPTION 'Fractional paid return left refund dust'; END IF;
END $$;

INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status) VALUES('goods-fraA','GOODS-FRAA','goods-client','2026-10-15','2026-10-16','QC'),('goods-fraB','GOODS-FRAB','goods-client','2026-10-15','2026-10-16','QC');
INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,unit_price,subtotal) VALUES('goods-fraLA','goods-fraA','goods-prod',0.0625,1.23,0.08),('goods-fraLB','goods-fraB','goods-prod',0.0625,1.23,0.08);
INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,qty_purchased,actual_unit_price,purchase_method,payment_method,vendor_id) VALUES('goods-fraAlloc','goods-purchase','goods-prod',0.125,0.125,1.23,'Pasar','Tempo','goods-vendor');
\o /dev/null
SELECT pg_temp.goods('fraAlloc','qc','goods-fraAlloc','{"qtyPassToInventory":0,"qtyReject":0,"allocations":[{"soId":"goods-fraA","qty":0.0625},{"soId":"goods-fraB","qty":0.0625}],"rejectAction":"Disposal"}');
SELECT pg_temp.goods('fraPackA','packing','goods-fraA','{"lines":[{"salesOrderItemId":"goods-fraLA","qty":0.0625}]}');
SELECT pg_temp.goods('fraPackB','packing','goods-fraB','{"lines":[{"salesOrderItemId":"goods-fraLB","qty":0.0625}]}');
SELECT pg_temp.goods('fraReleaseA','release','goods-fraA');
SELECT pg_temp.goods('fraReleaseB','release','goods-fraB');
\o
DO $$ BEGIN
 IF (SELECT sum((line_snapshots->0->>'costTotal')::numeric) FROM deliveries WHERE id IN ('fraReleaseA:delivery','fraReleaseB:delivery'))<>0.15 THEN RAISE EXCEPTION 'Fractional allocation duplicated cost cents across POs'; END IF;
END $$;
-- Current replay rows and client header remain true after later changes.
UPDATE clients SET company_name='Edited Client',address='Edited Address' WHERE id='goods-client';
DO $$ DECLARE replay jsonb; BEGIN
 replay:=pg_temp.goods('qc6','qc','goods-pi','{"qtyPassToInventory":0,"qtyReject":0,"allocations":[{"soId":"goods-so","qty":6}],"rejectAction":"Disposal","unbalanceReason":"remaining4"}');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(replay->'updates'->'salesOrderItems') r WHERE r->>'id'='goods-line' AND (r->>'qty_delivered')::numeric=8) THEN RAISE EXCEPTION 'Replay returned stale cached source state'; END IF;
 IF (SELECT client_snapshot->>'companyName' FROM invoices WHERE id='invoice:release1:delivery') IS DISTINCT FROM 'Client' THEN RAISE EXCEPTION 'Frozen client header changed'; END IF;
END $$;
ROLLBACK;
\echo PASS goods partial6+4/allreject/packing6/accepted4/returns/dropship/supplemental/retries/rollback/privileges

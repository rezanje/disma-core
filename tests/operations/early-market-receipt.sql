\set ON_ERROR_STOP on
BEGIN;
INSERT INTO users(id,name,role,pin) VALUES('early-admin','Admin','admin_po','fixture-admin'),('early-finance','Finance','finance','fixture-finance'),('early-worker','Worker','gudang','fixture-worker');
INSERT INTO clients(id,company_name,pic_name,created_at) VALUES('early-client','Client','PIC','2026-10-17');
INSERT INTO vendors(id,company_name,pic_name,created_at) VALUES('early-vendor','Vendor','PIC','2026-10-17');
INSERT INTO coas(id,account_code,account_name,account_type) SELECT 'early-'||x.code,x.code,x.code,'Asset' FROM (VALUES('1-3000'),('2-1100'),('1-2000'),('4-1000'),('5-1000'),('5-2000'),('1-2100'),('1-3100'),('2-1000'),('1-1000')) x(code) WHERE NOT EXISTS(SELECT 1 FROM coas WHERE account_code=x.code);
INSERT INTO bank_accounts(id,name,account_code,balance,cfo_approval_required) VALUES('early-bank','Pocket','1-1000',1000000,false);
INSERT INTO products(id,sku_code,name,uom,base_price) VALUES('early-prod','EARLY','Leaf','kg',10);
INSERT INTO purchases(id,date,purchaser_id,status,advance_code) VALUES('early-paper','2026-10-17','early-worker','Belanja','ADV-EARLY');
INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status) VALUES('early-so','EARLY-PO','early-client','2026-10-17','2026-10-17','Belanja');
INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,unit_price,subtotal) VALUES('early-line','early-so','early-prod',6,25,150);
INSERT INTO purchase_items(id,purchase_id,product_id,sales_order_id,qty_target,estimated_unit_price,purchase_method,payment_method) VALUES('early-pi','early-paper','early-prod','early-so',10,10,'Pasar','Cash');
CREATE FUNCTION pg_temp.early_goods(id text,stage text,source text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$ SELECT process_goods_event(jsonb_build_object('eventId',id,'stage',stage,'sourceId',source,'payload',jsonb_build_object('performedBy','early-worker','occurredAt','2026-10-17T00:00:00Z','paperNumber',id)||payload),CASE WHEN stage='audit' THEN 'early-finance' ELSE 'early-admin' END); $$;
CREATE FUNCTION pg_temp.early_report(id text,qty numeric,price numeric,method text DEFAULT 'Cash') RETURNS jsonb LANGUAGE sql AS $$ SELECT process_purchase_event(jsonb_build_object('eventId',id,'stage','report','sourceId',id,'payload',jsonb_build_object('purchaseIds',jsonb_build_array('early-paper'),'occurredAt','2026-10-17T03:00:00Z','onBehalfOfUserId','early-worker','pocketBankAccountId','early-bank','lines',jsonb_build_array(jsonb_build_object('id','early-pi','purchaseId','early-paper','productId','early-prod','isChecked',true,'qtyPurchased',qty,'actualUnitPrice',price,'vendorId','early-vendor','paymentMethod',method)))),'early-finance'); $$;
\o /dev/null
SELECT pg_temp.early_goods('early-arrive','arrival','early-pi','{"qty":6}');
SELECT pg_temp.early_goods('early-arrive','arrival','early-pi','{"qty":6}');
\o
DO $$ BEGIN
 IF (SELECT qty_purchased FROM purchase_items WHERE id='early-pi')<>0 OR (SELECT current_stock FROM products WHERE id='early-prod')<>0 THEN RAISE EXCEPTION 'Physical receipt must not invent report or QC stock'; END IF;
 IF (SELECT sum(qty_target) FROM purchase_items WHERE purchase_id='early-paper')<>10 OR (SELECT qty_target FROM purchase_items WHERE id='early-pi')<>6 THEN RAISE EXCEPTION 'Partial arrival lost remaining shopping demand'; END IF;
END $$;
\o /dev/null
SELECT pg_temp.early_goods('early-qc','qc','early-pi','{"qtyPassToInventory":0,"qtyReject":0,"allocations":[{"soId":"early-so","qty":6}],"rejectAction":"Disposal"}');
SELECT pg_temp.early_goods('early-qc','qc','early-pi','{"qtyPassToInventory":0,"qtyReject":0,"allocations":[{"soId":"early-so","qty":6}],"rejectAction":"Disposal"}');
SELECT pg_temp.early_goods('early-pack','packing','early-so','{"lines":[{"salesOrderItemId":"early-line","qty":6}]}');
SELECT pg_temp.early_goods('early-release','release','early-so');
SELECT pg_temp.early_goods('early-hand','handover','early-release:delivery');
SELECT pg_temp.early_goods('early-receipt','receipt','early-release:delivery','{"recipientName":"Client","signedPaperChecked":true,"received":[{"salesOrderItemId":"early-line","qtyReceived":6}]}');
SELECT pg_temp.early_goods('early-accept','acceptance','early-release:delivery','{"soId":"early-so"}');
\o
DO $$ DECLARE denied boolean:=false; BEGIN
 IF (SELECT current_stock FROM products WHERE id='early-prod')<>0 OR (SELECT qty_purchased FROM purchase_items WHERE id='early-pi')<>0 THEN RAISE EXCEPTION 'Morning shipment requires no purchase paper'; END IF;
 BEGIN PERFORM pg_temp.early_goods('early-audit','audit','early-release:delivery'); EXCEPTION WHEN OTHERS THEN denied:=true; IF SQLERRM NOT LIKE '%laporan belanja%' THEN RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'Pending costs must not become final profit'; END IF;
END $$;
\o /dev/null
SELECT pg_temp.early_report('early-paper1',4,12);
SELECT pg_temp.early_report('early-paper1',4,12);
\o
DO $$ BEGIN IF NOT (SELECT cost_pending FROM purchase_items WHERE id='early-pi') THEN RAISE EXCEPTION 'Partial financial paper prematurely finalized cost'; END IF; END $$;
\o /dev/null
SELECT pg_temp.early_report('early-paper2',2,15);
SELECT pg_temp.early_report('early-paper2',2,15);
SELECT pg_temp.early_goods('early-audit','audit','early-release:delivery');
SELECT pg_temp.early_goods('early-audit','audit','early-release:delivery');
\o
DO $$ BEGIN
 IF (SELECT current_stock FROM products WHERE id='early-prod')<>0 OR (SELECT qc_processed_qty FROM purchase_items WHERE id='early-pi')<>6 OR (SELECT qty_final FROM sales_order_items WHERE id='early-line') IS NOT NULL THEN RAISE EXCEPTION 'Late paper duplicated stock or PO allocation'; END IF;
 IF (SELECT balance FROM bank_accounts WHERE id='early-bank')<>999922 THEN RAISE EXCEPTION 'Cash paper must post 48+30 exactly once'; END IF;
 IF (SELECT cost_pending FROM purchase_items WHERE id='early-pi') OR (SELECT qty_purchased FROM purchase_items WHERE id='early-pi')<>6 THEN RAISE EXCEPTION 'Full financial paper failed reconciliation'; END IF;
 IF (SELECT sum(jl.debit_amount-jl.credit_amount) FROM journal_lines jl JOIN coas c ON c.id=jl.account_id WHERE jl.journal_entry_id='early-audit:hpp' AND c.account_code='5-1000')<>78 THEN RAISE EXCEPTION 'HPP must use actual 78, not early estimate 60'; END IF;
 IF (SELECT sum(jl.credit_amount-jl.debit_amount) FROM journal_lines jl JOIN coas c ON c.id=jl.account_id WHERE c.account_code='2-1100')<>0 THEN RAISE EXCEPTION 'Reported receipt clearing must balance'; END IF;
 IF (SELECT (line_snapshots->0->>'unitCost')::numeric FROM deliveries WHERE id='early-release:delivery')<>10 THEN RAISE EXCEPTION 'Late cost must preserve physical dispatch snapshot'; END IF;
 IF (SELECT (line_snapshots->0->>'costTotal')::numeric FROM invoices WHERE id='invoice:early-release:delivery')<>78 THEN RAISE EXCEPTION 'Issued invoice reporting must use finalized actual HPP'; END IF;
 IF (SELECT status FROM purchases WHERE id='early-paper')<>'Belanja' THEN RAISE EXCEPTION 'Unreceived/unreported remainder must remain open'; END IF;
END $$;

-- Free stock from an unpriced physical lot can also serve another PO that morning.
INSERT INTO purchases(id,date,purchaser_id,status) VALUES('early-stock-paper','2026-10-17','early-worker','Belanja');
INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,estimated_unit_price,purchase_method,payment_method) VALUES('early-stock','early-stock-paper','early-prod',6,10,'Pasar','Tempo');
INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status) VALUES('early-stock-so','EARLY-STOCK','early-client','2026-10-17','2026-10-17','Belanja');
INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,unit_price,subtotal) VALUES('early-stock-line','early-stock-so','early-prod',2,25,50);
\o /dev/null
SELECT pg_temp.early_goods('stock-arrive','arrival','early-stock','{"qty":6}');
SELECT pg_temp.early_goods('stock-qc','qc','early-stock','{"qtyPassToInventory":6,"qtyReject":0,"allocations":[],"rejectAction":"Disposal"}');
SELECT pg_temp.early_goods('stock-book','reserve','early-stock-so','{"lines":[{"salesOrderItemId":"early-stock-line","qty":2}]}');
UPDATE sales_orders SET status='Packing' WHERE id='early-stock-so';
SELECT pg_temp.early_goods('stock-pack','packing','early-stock-so','{"lines":[{"salesOrderItemId":"early-stock-line","qty":2}]}');
SELECT pg_temp.early_goods('stock-release','release','early-stock-so');
SELECT pg_temp.early_goods('stock-hand','handover','stock-release:delivery');
SELECT pg_temp.early_goods('stock-receipt','receipt','stock-release:delivery','{"recipientName":"Client","signedPaperChecked":true,"received":[{"salesOrderItemId":"early-stock-line","qtyReceived":2}]}');
SELECT pg_temp.early_goods('stock-accept','acceptance','stock-release:delivery','{"soId":"early-stock-so"}');
\o
DO $$ DECLARE denied boolean:=false; BEGIN
 BEGIN PERFORM pg_temp.early_goods('stock-audit','audit','stock-release:delivery'); EXCEPTION WHEN OTHERS THEN denied:=true; IF SQLERRM NOT LIKE '%laporan belanja%' THEN RAISE; END IF; END;
 IF NOT denied THEN RAISE EXCEPTION 'Unpriced warehouse booking must retain pending cost provenance'; END IF;
END $$;
\o /dev/null
SELECT process_purchase_event('{"eventId":"stock-paper","stage":"report","sourceId":"stock-paper","payload":{"purchaseIds":["early-stock-paper"],"occurredAt":"2026-10-17T03:00:00Z","onBehalfOfUserId":"early-worker","lines":[{"id":"early-stock","purchaseId":"early-stock-paper","productId":"early-prod","isChecked":true,"qtyPurchased":6,"actualUnitPrice":14,"vendorId":"early-vendor","paymentMethod":"Tempo"}]}}','early-finance');
SELECT pg_temp.early_goods('stock-audit','audit','stock-release:delivery');
\o
DO $$ BEGIN
 IF (SELECT current_stock FROM products WHERE id='early-prod')<>4 THEN RAISE EXCEPTION 'Stock purchase paper duplicated physical goods'; END IF;
 IF (SELECT sum(jl.debit_amount-jl.credit_amount) FROM journal_lines jl JOIN coas c ON c.id=jl.account_id WHERE jl.journal_entry_id='stock-audit:hpp' AND c.account_code='5-1000')<>28 THEN RAISE EXCEPTION 'Warehouse booking must resolve actual source HPP'; END IF;
 IF (SELECT sum(total_amount) FROM vendor_bills WHERE purchase_id='early-stock-paper')<>84 THEN RAISE EXCEPTION 'Late tempo report must create full actual AP'; END IF;
END $$;

CREATE FUNCTION pg_temp.early_lot_report(lot text,qty numeric,price numeric,payment text DEFAULT 'Cash') RETURNS jsonb LANGUAGE sql AS $$
 SELECT process_purchase_event(jsonb_build_object('eventId','paper:'||lot,'stage','report','sourceId','paper:'||lot,'payload',jsonb_build_object('purchaseIds',jsonb_build_array(purchase_id),'occurredAt','2026-10-17T03:00:00Z','onBehalfOfUserId','early-worker','pocketBankAccountId','early-bank','lines',jsonb_build_array(jsonb_build_object('id',id,'purchaseId',purchase_id,'productId',product_id,'isChecked',true,'qtyPurchased',qty,'actualUnitPrice',price,'vendorId','early-vendor','paymentMethod',payment)))),'early-finance') FROM purchase_items WHERE id=lot;
$$;
-- Prices may be completely unknown at arrival. A missing estimate cannot stop QC.
INSERT INTO products(id,sku_code,name,uom,base_price) VALUES('early-no-price','EARLY-NO-PRICE','Leaf zero estimate','kg',0);
INSERT INTO purchases(id,date,purchaser_id,status) VALUES('early-zero-doc','2026-10-17','early-worker','Belanja');
INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,estimated_unit_price,purchase_method,payment_method) VALUES('early-zero','early-zero-doc','early-no-price',3,0,'Pasar','Cash');
\o /dev/null
SELECT pg_temp.early_goods('zero-arrive','arrival','early-zero','{"qty":3}');
SELECT pg_temp.early_goods('zero-qc','qc','early-zero','{"qtyPassToInventory":3,"qtyReject":0,"allocations":[],"rejectAction":"Disposal"}');
\o
DO $$ BEGIN IF (SELECT current_stock FROM products WHERE id='early-no-price')<>3 OR NOT (SELECT cost_pending FROM purchase_items WHERE id='early-zero') THEN RAISE EXCEPTION 'Unknown cost cannot block measured QC'; END IF; END $$;
-- A report failure after the money leg rolls the entire transaction back.
CREATE FUNCTION pg_temp.fail_early_cost() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='zero-qc:journal' THEN RAISE EXCEPTION 'injected-early-valuation-fault'; END IF; RETURN NEW; END $$;
CREATE TRIGGER early_cost_fault BEFORE INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_early_cost();
DO $$ DECLARE denied boolean:=false; before_balance numeric; BEGIN
 SELECT balance INTO before_balance FROM bank_accounts WHERE id='early-bank';
 BEGIN PERFORM pg_temp.early_lot_report('early-zero',3,9); EXCEPTION WHEN OTHERS THEN denied:=true; IF SQLERRM NOT LIKE '%injected-early-valuation-fault%' THEN RAISE; END IF; END;
 IF NOT denied OR (SELECT balance FROM bank_accounts WHERE id='early-bank')<>before_balance OR EXISTS(SELECT 1 FROM purchase_events WHERE id='paper:early-zero') OR (SELECT qty_purchased FROM purchase_items WHERE id='early-zero')<>0 THEN RAISE EXCEPTION 'Late valuation failure leaked financial writes'; END IF;
END $$;
DROP TRIGGER early_cost_fault ON journal_entries;
\o /dev/null
SELECT pg_temp.early_lot_report('early-zero',3,9);
SELECT pg_temp.early_lot_report('early-zero',3,9);
\o
-- All three physical reject dispositions acquire actual costs without a second receipt.
DO $$ DECLARE mode text; lot text; payload jsonb; BEGIN
 FOREACH mode IN ARRAY ARRAY['Disposal','B2C','Return'] LOOP
  lot:='early-'||mode;
  INSERT INTO purchases(id,date,purchaser_id,status) VALUES(lot||':doc','2026-10-17','early-worker','Belanja');
  INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,estimated_unit_price,purchase_method,payment_method) VALUES(lot,lot||':doc','early-prod',6,10,'Pasar','Tempo');
  PERFORM pg_temp.early_goods(lot||':arrival','arrival',lot,'{"qty":6}');
  payload:=jsonb_build_object('qtyPassToInventory',5,'qtyReject',1,'allocations','[]'::jsonb,'rejectAction',mode,'rejectReason','spoiled','rejectVendorId','early-vendor');
  IF mode='B2C' THEN PERFORM pg_temp.early_lot_report(lot,6,14,'Tempo'); END IF;
  PERFORM pg_temp.early_goods(lot||':qc','qc',lot,payload);
  IF mode<>'B2C' THEN PERFORM pg_temp.early_lot_report(lot,6,14,'Tempo'); END IF;
  IF (SELECT sum(total_amount) FROM vendor_bills WHERE purchase_id=lot||':doc')<>84 OR (SELECT cost_pending FROM purchase_items WHERE id=lot) THEN RAISE EXCEPTION 'Reject % lost actual cost/AP',mode; END IF;
  IF (SELECT sum(jl.debit_amount) FROM journal_lines jl WHERE journal_entry_id=lot||':qc:rejectjournal')<>14 THEN RAISE EXCEPTION 'Reject % must acquire actual loss/claim/B2C value',mode; END IF;
 END LOOP;
END $$;
ROLLBACK;

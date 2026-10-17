\o /dev/null
BEGIN;
INSERT INTO users(id,name,role,pin) VALUES('sp-admin','Admin','admin_po','fixture-admin'),('sp-finance','Finance','finance','fixture-finance'),('sp-qc','QC','gudang','fixture-qc'),('sp-courier','Courier','kurir','fixture-courier');
INSERT INTO products(id,sku_code,name,uom,base_price,current_stock) VALUES('sp-product','SP','Spare leaf','kg',10,0);
INSERT INTO purchases(id,date,purchaser_id,status) VALUES('sp-paper','2026-10-18','sp-qc','Belanja');
INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,estimated_unit_price,purchase_method,payment_method) VALUES('sp-pi','sp-paper','sp-product',6,10,'Pasar','Tempo');
INSERT INTO vendors(id,company_name,pic_name,created_at) VALUES('sp-vendor','Vendor','PIC','2026-10-18');
INSERT INTO coas(id,account_code,account_name,account_type) SELECT 'sp-'||x.code,x.code,x.code,'Asset' FROM (VALUES('1-3000'),('2-1100'),('5-2000'),('2-1000')) x(code) WHERE NOT EXISTS(SELECT 1 FROM coas WHERE account_code=x.code);
SELECT process_goods_event('{"eventId":"sp-arrive","stage":"arrival","sourceId":"sp-pi","payload":{"qty":6,"performedBy":"sp-qc","occurredAt":"2026-10-17T22:00:00Z","paperNumber":"SP-QC"}}','sp-admin');
SELECT process_goods_event('{"eventId":"sp-qc-event","stage":"qc","sourceId":"sp-pi","payload":{"qtyPassToInventory":6,"qtyReject":0,"allocations":[],"rejectAction":"Disposal","performedBy":"sp-qc","occurredAt":"2026-10-17T23:00:00Z","paperNumber":"SP-QC"}}','sp-admin');
SELECT process_paper_operation('{"eventId":"sp-out","stage":"transcribe","payload":{"qc":[],"dispatches":[],"spares":[{"productId":"sp-product","courierId":"sp-courier","qty":4,"evidence":{"performedBy":"sp-qc","occurredAt":"2026-10-18T01:00:00Z","paperNumber":"SP-BA","signedPaperChecked":true}}]}}','sp-admin');
DO $$ DECLARE src jsonb; BEGIN
 IF NOT (SELECT cost_pending FROM courier_spares WHERE id='sp-out:spare:1') THEN RAISE EXCEPTION 'Early spare cost prematurely final'; END IF;
 src:=market_inventory_sources('sp-product',2,2);
 IF (SELECT sum((x->>'qty')::numeric) FROM jsonb_array_elements(src) x)<>2 THEN RAISE EXCEPTION 'Spare custody must be excluded from free lot source'; END IF;
END $$;
SELECT process_paper_operation('{"eventId":"sp-back","stage":"spare-settle","payload":{"id":"sp-out:spare:1","used":1,"damaged":1,"returned":2,"reason":"Susut dan rusak","evidence":{"performedBy":"sp-courier","occurredAt":"2026-10-18T04:00:00Z","paperNumber":"SP-HASIL"}}}','sp-admin');
DO $$ DECLARE src jsonb; BEGIN
 IF (SELECT current_stock FROM products WHERE id='sp-product')<>4 OR EXISTS(SELECT 1 FROM journal_entries WHERE id='sp-out:spare:1:loss') THEN RAISE EXCEPTION 'Physical spare return must not wait for late costs or book provisional loss'; END IF;
 src:=market_inventory_sources('sp-product',4,4);
 IF (SELECT sum((x->>'qty')::numeric) FROM jsonb_array_elements(src) x)<>4 THEN RAISE EXCEPTION 'Returned spare must restore unpriced lot provenance'; END IF;
END $$;
SELECT process_purchase_event('{"eventId":"sp-report","stage":"report","sourceId":"sp-report","payload":{"purchaseIds":["sp-paper"],"occurredAt":"2026-10-18T03:00:00Z","onBehalfOfUserId":"sp-qc","lines":[{"id":"sp-pi","purchaseId":"sp-paper","productId":"sp-product","isChecked":true,"qtyPurchased":6,"actualUnitPrice":14,"vendorId":"sp-vendor","paymentMethod":"Tempo"}]}}','sp-finance');
SELECT process_purchase_event('{"eventId":"sp-report","stage":"report","sourceId":"sp-report","payload":{"purchaseIds":["sp-paper"],"occurredAt":"2026-10-18T03:00:00Z","onBehalfOfUserId":"sp-qc","lines":[{"id":"sp-pi","purchaseId":"sp-paper","productId":"sp-product","isChecked":true,"qtyPurchased":6,"actualUnitPrice":14,"vendorId":"sp-vendor","paymentMethod":"Tempo"}]}}','sp-finance');
DO $$ BEGIN
 IF (SELECT cost_pending FROM courier_spares WHERE id='sp-out:spare:1') OR (SELECT final_unit_cost FROM courier_spares WHERE id='sp-out:spare:1')<>14 THEN RAISE EXCEPTION 'Late paper must finalize spare cost automatically'; END IF;
 IF (SELECT sum(debit_amount) FROM journal_lines WHERE journal_entry_id='sp-out:spare:1:loss')<>28 THEN RAISE EXCEPTION 'Loss must use actual 2 kg *14 once'; END IF;
 IF (SELECT current_stock FROM products WHERE id='sp-product')<>4 THEN RAISE EXCEPTION 'Late spare pricing duplicated stock'; END IF;
END $$;
-- A partly released PO still reserves its unshipped balance.
INSERT INTO clients(id,company_name,pic_name,created_at) VALUES('sp-client','Outlet','PIC','2026-10-18');
INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status) VALUES('sp-so','SP-PO','sp-client','2026-10-18','2026-10-18','Dikirim');
INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,qty_final,qty_dispatched,unit_price,subtotal) VALUES('sp-line','sp-so','sp-product',6,6,3,20,120);
INSERT INTO deliveries(id,sales_order_id,courier_id,status,line_snapshots) VALUES('sp-delivery','sp-so','sp-courier','Dikirim','[{"salesOrderItemId":"sp-line","qty":3}]');
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM process_paper_operation('{"eventId":"sp-stolen","stage":"transcribe","payload":{"qc":[],"dispatches":[],"spares":[{"productId":"sp-product","courierId":"sp-courier","qty":2,"evidence":{"performedBy":"sp-qc","occurredAt":"2026-10-18T01:00:00Z","paperNumber":"SP-BA","signedPaperChecked":true}}]}}','sp-admin'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected OR (SELECT current_stock FROM products WHERE id='sp-product')<>4 THEN RAISE EXCEPTION 'Spare stole unshipped stock from active delivery'; END IF;
END $$;
-- Ordinary priced warehouse stock uses its recorded cost, not the catalogue estimate.
INSERT INTO products(id,sku_code,name,uom,base_price,current_stock) VALUES('sp-priced','SP-PRICE','Priced product','kg',10,0);
SELECT goods_stock('sp-priced-in','sp-priced',3,3,'QC_INVENTORY','priced-lot','QC',null,null,17,'2026-10-18T00:00:00Z','sp-admin');
SELECT process_paper_operation('{"eventId":"sp-priced-out","stage":"transcribe","payload":{"qc":[],"dispatches":[],"spares":[{"productId":"sp-priced","courierId":"sp-courier","qty":1,"evidence":{"performedBy":"sp-qc","occurredAt":"2026-10-18T01:00:00Z","paperNumber":"SP-PRICED","signedPaperChecked":true}}]}}','sp-admin');
DO $$ BEGIN IF (SELECT final_unit_cost FROM courier_spares WHERE id='sp-priced-out:spare:1')<>17 THEN RAISE EXCEPTION 'Spare must use recorded warehouse cost, not catalogue estimate'; END IF; END $$;
ROLLBACK;
\o

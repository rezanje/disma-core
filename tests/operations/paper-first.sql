\o /dev/null
BEGIN;
DO $$ BEGIN IF to_regprocedure('public.process_paper_operation(jsonb,text)') IS NULL THEN RAISE EXCEPTION 'Missing paper-first command: combined transcription and courier custody are not implemented'; END IF; END $$;
INSERT INTO users(id,name,role,pin) VALUES('paper-admin','Admin','admin_po','fixture-admin'),('paper-finance','Finance','finance','fixture-finance'),('paper-qc','QC','gudang','fixture-qc'),('paper-courier','Rivai','kurir','fixture-courier');
INSERT INTO clients(id,company_name,pic_name,created_at) VALUES('paper-client','Outlet','PIC','2026-10-17');
INSERT INTO products(id,sku_code,name,uom,base_price,selling_price,current_stock) VALUES('paper-prod','PAPER','Leaf','kg',10,25,20);
INSERT INTO coas(id,account_code,account_name,account_type) SELECT 'paper-'||x.code,x.code,x.code,'Asset' FROM (VALUES('1-3000'),('2-1100'),('5-2000')) x(code) WHERE NOT EXISTS(SELECT 1 FROM coas WHERE account_code=x.code);
INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status) VALUES('paper-so','PAPER-PO','paper-client','2026-10-17','2026-10-18','Packing');
INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,qty_final,unit_price,subtotal) VALUES('paper-line','paper-so','paper-prod',6,6,25,150);
CREATE FUNCTION pg_temp.paper(id text,stage text,body jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT process_paper_operation(jsonb_build_object('eventId',id,'stage',stage,'payload',body),'paper-admin'); $$;
-- Six reserved units cannot be borrowed as spare. A bad final spare rolls back packing/release/handover.
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM pg_temp.paper('paper-bad','transcribe','{"qc":[],"dispatches":[{"soId":"paper-so","courierId":"paper-courier","lines":[{"salesOrderItemId":"paper-line","qty":6}],"evidence":{"performedBy":"paper-qc","occurredAt":"2026-10-18T00:30:00Z","paperNumber":"BA-18"},"handoverAt":"2026-10-18T01:00:00Z","signedPaperChecked":true}],"spares":[{"productId":"paper-prod","courierId":"paper-courier","qty":15,"evidence":{"performedBy":"paper-qc","occurredAt":"2026-10-18T01:00:00Z","paperNumber":"BA-18","signedPaperChecked":true}}]}'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected OR EXISTS(SELECT 1 FROM deliveries WHERE sales_order_id='paper-so') OR (SELECT current_stock FROM products WHERE id='paper-prod')<>20 OR (SELECT is_packed FROM sales_order_items WHERE id='paper-line') THEN RAISE EXCEPTION 'Invalid combined row must roll back the entire operation'; END IF;
END $$;
SELECT pg_temp.paper('paper-good','transcribe','{"qc":[],"dispatches":[{"soId":"paper-so","courierId":"paper-courier","lines":[{"salesOrderItemId":"paper-line","qty":6}],"evidence":{"performedBy":"paper-qc","occurredAt":"2026-10-18T00:30:00Z","paperNumber":"BA-18"},"handoverAt":"2026-10-18T01:00:00Z","signedPaperChecked":true}],"spares":[{"productId":"paper-prod","courierId":"paper-courier","qty":2,"evidence":{"performedBy":"paper-qc","occurredAt":"2026-10-18T01:00:00Z","paperNumber":"BA-18","signedPaperChecked":true}}]}');
SELECT pg_temp.paper('paper-good','transcribe','{"qc":[],"dispatches":[{"soId":"paper-so","courierId":"paper-courier","lines":[{"salesOrderItemId":"paper-line","qty":6}],"evidence":{"performedBy":"paper-qc","occurredAt":"2026-10-18T00:30:00Z","paperNumber":"BA-18"},"handoverAt":"2026-10-18T01:00:00Z","signedPaperChecked":true}],"spares":[{"productId":"paper-prod","courierId":"paper-courier","qty":2,"evidence":{"performedBy":"paper-qc","occurredAt":"2026-10-18T01:00:00Z","paperNumber":"BA-18","signedPaperChecked":true}}]}');
DO $$ BEGIN
 IF (SELECT current_stock FROM products WHERE id='paper-prod')<>12 OR (SELECT count(*) FROM courier_spares WHERE product_id='paper-prod')<>1 THEN RAISE EXCEPTION 'Combined retry duplicated warehouse exit or spare'; END IF;
 IF (SELECT sum((ln->>'qty')::numeric) FROM deliveries d CROSS JOIN LATERAL jsonb_array_elements(d.line_snapshots) ln WHERE d.sales_order_id='paper-so')<>6 THEN RAISE EXCEPTION 'Spare must never inflate billable delivery qty'; END IF;
 IF (SELECT courier_id FROM deliveries WHERE sales_order_id='paper-so')<>'paper-courier' OR (SELECT status FROM sales_orders WHERE id='paper-so')<>'Dikirim' THEN RAISE EXCEPTION 'Combined handover did not record the real courier'; END IF;
 IF NOT EXISTS(SELECT 1 FROM goods_events WHERE stage='handover' AND performed_by='paper-courier' AND occurred_at='2026-10-18T01:00:00Z') THEN RAISE EXCEPTION 'QC and handover need separate actual timestamps and performers'; END IF;
END $$;
-- Re-entry after a browser refresh must not duplicate the same physical spare paper.
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM pg_temp.paper('paper-spare-duplicate','transcribe','{"qc":[],"dispatches":[],"spares":[{"productId":"paper-prod","courierId":"paper-courier","qty":2,"evidence":{"performedBy":"paper-qc","occurredAt":"2026-10-18T01:00:00Z","paperNumber":"BA-18","signedPaperChecked":true}}]}'); EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%sudah disalin%' THEN RAISE; END IF; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Re-entering the same spare paper duplicated custody'; END IF;
END $$;
-- Spare reconciliation conserves custody, does not invoice it, and is retry safe.
DO $$ DECLARE spare_id text; rejected boolean:=false; BEGIN
 SELECT id INTO spare_id FROM courier_spares WHERE product_id='paper-prod';
 BEGIN PERFORM pg_temp.paper('spare-bad','spare-settle',jsonb_build_object('id',spare_id,'used',2,'damaged',1,'returned',0,'reason','Susut','evidence',jsonb_build_object('performedBy','paper-courier','occurredAt','2026-10-18T05:00:00Z','paperNumber','SP-18'))); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Spare must be conserved'; END IF;
 PERFORM pg_temp.paper('spare-good','spare-settle',jsonb_build_object('id',spare_id,'used',0.5,'damaged',0.5,'returned',1,'reason','Susut dan rusak','evidence',jsonb_build_object('performedBy','paper-courier','occurredAt','2026-10-18T05:00:00Z','paperNumber','SP-18')));
 PERFORM pg_temp.paper('spare-good','spare-settle',jsonb_build_object('id',spare_id,'used',0.5,'damaged',0.5,'returned',1,'reason','Susut dan rusak','evidence',jsonb_build_object('performedBy','paper-courier','occurredAt','2026-10-18T05:00:00Z','paperNumber','SP-18')));
 IF (SELECT current_stock FROM products WHERE id='paper-prod')<>13 OR (SELECT status FROM courier_spares WHERE id=spare_id)<>'Selesai' THEN RAISE EXCEPTION 'Return did not restore physical stock exactly once'; END IF;
 IF (SELECT sum(debit_amount) FROM journal_lines WHERE journal_entry_id=spare_id||':loss')<>10 THEN RAISE EXCEPTION 'Spare loss must be actual 1 kg cost, excluding returned stock'; END IF;
END $$;
-- Supplemental order is incremental, linked to immutable original, and deduped by paper/client/date.
SELECT pg_temp.paper('late-good','supplement','{"clientId":"paper-client","parentOrderId":"paper-so","paperNumber":"WA-18-01","occurredAt":"2026-10-17T15:00:00Z","targetDeliveryDate":"2026-10-18","performedBy":"paper-qc","note":"WA outlet tambahan","lines":[{"productId":"paper-prod","qty":3,"unitPrice":25,"buyQty":3}]}');
SELECT pg_temp.paper('late-good','supplement','{"clientId":"paper-client","parentOrderId":"paper-so","paperNumber":"WA-18-01","occurredAt":"2026-10-17T15:00:00Z","targetDeliveryDate":"2026-10-18","performedBy":"paper-qc","note":"WA outlet tambahan","lines":[{"productId":"paper-prod","qty":3,"unitPrice":25,"buyQty":3}]}');
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM pg_temp.paper('late-duplicate','supplement','{"clientId":"paper-client","parentOrderId":"paper-so","paperNumber":"wa-18-01","occurredAt":"2026-10-17T15:00:00Z","targetDeliveryDate":"2026-10-18","performedBy":"paper-qc","note":"WA outlet tambahan","lines":[{"productId":"paper-prod","qty":3,"unitPrice":25,"buyQty":3}]}'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected OR (SELECT count(*) FROM sales_orders WHERE parent_order_id='paper-so')<>1 THEN RAISE EXCEPTION 'Paper duplicate created another supplemental PO'; END IF;
 IF (SELECT qty FROM sales_order_items WHERE id='paper-line')<>6 OR (SELECT status FROM sales_orders WHERE id='paper-so')<>'Dikirim' THEN RAISE EXCEPTION 'Late order mutated original dispatched PO'; END IF;
 IF (SELECT sum(qty) FROM sales_order_items WHERE sales_order_id IN(SELECT id FROM sales_orders WHERE parent_order_id='paper-so'))<>3 THEN RAISE EXCEPTION 'Supplement must contain additional qty only'; END IF;
 IF (SELECT qty_purchased FROM purchase_items WHERE purchase_id='late:late-good:purchase')<>0 OR (SELECT current_stock FROM products WHERE id='paper-prod')<>13 THEN RAISE EXCEPTION 'Creating late demand must not invent purchase report or physical stock'; END IF;
END $$;
-- Late demand can be transcribed through arrival, QC and actual handover in one save.
DO $$ DECLARE payload jsonb; rejected boolean:=false; r jsonb; BEGIN
 payload:='{"qc":[{"sourceId":"late:late-good:buy:1","commands":[{"stage":"arrival","sourceId":"late:late-good:buy:1","payload":{"qty":3,"performedBy":"paper-qc","occurredAt":"2026-10-17T22:00:00Z","paperNumber":"WA-18-01"}},{"stage":"qc","sourceId":"late:late-good:buy:1","payload":{"qtyPassToInventory":0,"qtyReject":0,"allocations":[{"soId":"late:late-good","qty":3}],"rejectAction":"Disposal","performedBy":"paper-qc","occurredAt":"2026-10-17T23:00:00Z","paperNumber":"WA-18-01"}}]}],"dispatches":[{"soId":"late:late-good","courierId":"paper-courier","lines":[{"salesOrderItemId":"late:late-good:line:1","qty":4}],"evidence":{"performedBy":"paper-qc","occurredAt":"2026-10-17T23:00:00Z","paperNumber":"WA-18-01"},"handoverAt":"2026-10-18T01:00:00Z","signedPaperChecked":true}],"spares":[]}';
 BEGIN PERFORM pg_temp.paper('late-send-bad','transcribe',payload); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected OR (SELECT qc_processed_qty FROM purchase_items WHERE id='late:late-good:buy:1')>0 OR (SELECT physical_qty_received FROM purchase_items WHERE id='late:late-good:buy:1') IS NOT NULL OR (SELECT current_stock FROM products WHERE id='paper-prod')<>13 THEN RAISE EXCEPTION 'Bad dispatch must roll back preceding arrival and QC'; END IF;
 payload:=jsonb_set(payload,'{dispatches,0,lines,0,qty}','3');
 r:=pg_temp.paper('late-send','transcribe',payload);
 PERFORM pg_temp.paper('late-send','transcribe',payload);
 IF (SELECT current_stock FROM products WHERE id='paper-prod')<>13 OR (SELECT qty_purchased FROM purchase_items WHERE id='late:late-good:buy:1')<>0 OR (SELECT status FROM sales_orders WHERE id='late:late-good')<>'Dikirim' THEN RAISE EXCEPTION 'Late morning dispatch duplicated goods or waited for financial report'; END IF;
 IF jsonb_array_length(r->'updates'->'deliveries')<>1 OR NOT ((r->'updates'->'purchaseItems'->0->'qc_event_ids') ? 'late-send:goods:2') THEN RAISE EXCEPTION 'Canonical combined snapshot omitted QC source confirmation'; END IF;
END $$;
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM process_paper_operation('{"eventId":"wrong-role","stage":"transcribe","payload":{"qc":[],"dispatches":[],"spares":[]}}','paper-courier'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Field actor must not execute office commands'; END IF;
 IF has_function_privilege('authenticated','public.process_paper_operation(jsonb,text)','execute') OR has_table_privilege('authenticated','courier_spares','insert') THEN RAISE EXCEPTION 'Browser must not bypass authenticated server route'; END IF;
END $$;
ROLLBACK;
\o

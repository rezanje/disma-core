-- Additive office transcription over the existing durable physical-event ledger.
BEGIN;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS parent_order_id text REFERENCES public.sales_orders(id), ADD COLUMN IF NOT EXISTS supplement_reference text, ADD COLUMN IF NOT EXISTS supplement_note text, ADD COLUMN IF NOT EXISTS supplement_recorded_at timestamptz, ADD COLUMN IF NOT EXISTS supplement_recorded_by text;
CREATE UNIQUE INDEX IF NOT EXISTS sales_order_supplement_paper ON public.sales_orders(client_id,target_delivery_date,lower(trim(supplement_reference))) WHERE supplement_reference IS NOT NULL;
CREATE TABLE public.paper_operations (
 id text PRIMARY KEY, stage text NOT NULL, payload jsonb NOT NULL, recorded_by text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(), result jsonb NOT NULL
);
CREATE TABLE public.courier_spares (
 id text PRIMARY KEY, product_id text NOT NULL REFERENCES public.products(id), courier_id text NOT NULL REFERENCES public.users(id), qty numeric NOT NULL CHECK(qty>0),
 used numeric NOT NULL DEFAULT 0 CHECK(used>=0), damaged numeric NOT NULL DEFAULT 0 CHECK(damaged>=0), returned numeric NOT NULL DEFAULT 0 CHECK(returned>=0),
 status text NOT NULL DEFAULT 'Dibawa' CHECK(status IN('Dibawa','Selesai')), reason text,
 occurred_at timestamptz NOT NULL, performed_by text NOT NULL, paper_number text NOT NULL, paper_proof text,
 recorded_by text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz, settlement_paper text,
 cost_snapshot jsonb NOT NULL, cost_pending boolean NOT NULL DEFAULT true, final_unit_cost numeric,
 CHECK((status='Dibawa' AND used+damaged+returned=0) OR (status='Selesai' AND used+damaged+returned=qty))
);
CREATE UNIQUE INDEX courier_spare_paper ON public.courier_spares(courier_id,product_id,(lower(trim(paper_number))),((occurred_at AT TIME ZONE 'Asia/Jakarta')::date));
ALTER TABLE public.paper_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_spares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paper_operations,public.courier_spares FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.paper_operations,public.courier_spares TO service_role;

-- Spare is still owned inventory, but is unavailable to warehouse reservations.
-- Returned spare restores its original cost sources rather than inventing a new lot.
CREATE OR REPLACE FUNCTION public.market_inventory_sources(p_product text,p_qty numeric,p_free numeric)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH lots AS (
  SELECT m.purchase_item_id,sum(m.quantity) AS qty,sum(m.quantity*coalesce(m.final_unit_cost,m.unit_cost))/sum(m.quantity) AS price
  FROM stock_movements m JOIN purchase_items pi ON pi.id=m.purchase_item_id
  WHERE m.product_id=p_product AND m.warehouse_id='main' AND m.kind='QC_INVENTORY' AND pi.physical_before_report GROUP BY 1
 ), booked AS (
  SELECT s->>'purchaseItemId' AS id,sum((s->>'qty')::numeric*CASE WHEN m.kind='SPARE_RETURN' THEN -1 ELSE 1 END) AS qty
  FROM stock_movements m CROSS JOIN LATERAL jsonb_array_elements(coalesce(m.cost_sources,'[]')) s
  WHERE m.product_id=p_product AND m.kind IN('BOOKING','SPARE_OUTBOUND','SPARE_RETURN') GROUP BY 1
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('purchaseItemId',l.purchase_item_id,'qty',p_qty*greatest(0,l.qty-coalesce(b.qty,0))/greatest(p_free,(select sum(greatest(0,l2.qty-coalesce(b2.qty,0))) from lots l2 left join booked b2 on b2.id=l2.purchase_item_id)),'unitCost',l.price)),'[]')
 FROM lots l LEFT JOIN booked b ON b.id=l.purchase_item_id WHERE p_free>0 AND l.qty>coalesce(b.qty,0);
$$;

CREATE FUNCTION public.price_courier_spare(p_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE sp courier_spares%rowtype; total numeric; loss numeric;
BEGIN
 SELECT * INTO STRICT sp FROM courier_spares WHERE id=p_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(sp.cost_snapshot->'costSources','[]')) s JOIN purchase_items pi ON pi.id=s->>'purchaseItemId' WHERE pi.cost_pending OR pi.qty_purchased<pi.physical_qty_received) THEN RETURN; END IF;
 total:=market_line_cost(sp.cost_snapshot); loss:=round(total*(sp.used+sp.damaged)/sp.qty,2);
 UPDATE courier_spares SET final_unit_cost=total/sp.qty,cost_pending=false WHERE id=sp.id;
 UPDATE stock_movements SET final_unit_cost=total/sp.qty WHERE reference_id=sp.id AND kind IN('SPARE_OUTBOUND','SPARE_RETURN');
 IF sp.status='Selesai' AND loss>0 AND NOT EXISTS(SELECT 1 FROM journal_entries WHERE id=sp.id||':loss') THEN
  PERFORM goods_journal(sp.id||':loss',sp.settled_at::text,'Spare kurir terpakai/susut/rusak: '||sp.reason,'QC',sp.id,'5-2000','1-3000',loss);
 END IF;
END $$;
CREATE FUNCTION public.price_pending_courier_spares() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE sp record;
BEGIN
 IF NEW.cost_pending=false AND (OLD.cost_pending OR NEW.actual_unit_price IS DISTINCT FROM OLD.actual_unit_price OR NEW.qty_purchased IS DISTINCT FROM OLD.qty_purchased) THEN
  FOR sp IN SELECT id FROM courier_spares WHERE cost_pending AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(cost_snapshot->'costSources','[]')) s WHERE s->>'purchaseItemId'=NEW.id) ORDER BY id LOOP PERFORM price_courier_spare(sp.id); END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER price_pending_courier_spares AFTER UPDATE OF cost_pending,actual_unit_price,qty_purchased ON public.purchase_items FOR EACH ROW EXECUTE FUNCTION public.price_pending_courier_spares();

CREATE FUNCTION public.paper_operation_snapshot(p_event text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE op paper_operations%rowtype; updates jsonb:='{}'; k text; g text; snapshot jsonb; rows jsonb; ids text[]; prods text[];
BEGIN
 SELECT * INTO STRICT op FROM paper_operations WHERE id=p_event;
 FOREACH k IN ARRAY ARRAY['stockMovements','products','salesOrders','salesOrderItems','purchaseItems','deliveries','invoices','pendingReturns','vendorReturns','rejectedItems','vendorBills','bankAccounts','cashTransactions','journalEntries','journalLines','purchases','courierSpares'] LOOP updates:=jsonb_set(updates,ARRAY[k],'[]'); END LOOP;
 FOR g IN SELECT jsonb_array_elements_text(coalesce(op.result->'goodsEventIds','[]')) LOOP
  snapshot:=goods_snapshot(g);
  FOR k,rows IN SELECT key,value FROM jsonb_each(snapshot) LOOP
   IF updates ? k THEN updates:=jsonb_set(updates,ARRAY[k],(updates->k)||rows); END IF;
  END LOOP;
 END LOOP;
 ids:=array(SELECT jsonb_array_elements_text(coalesce(op.result->'spareIds','[]')));
 prods:=array(SELECT product_id FROM courier_spares WHERE id=ANY(ids));
 updates:=jsonb_set(updates,'{courierSpares}',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM courier_spares t WHERE id=ANY(ids)));
 updates:=jsonb_set(updates,'{products}',(updates->'products')||(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM products t WHERE id=ANY(prods)));
 updates:=jsonb_set(updates,'{stockMovements}',(updates->'stockMovements')||(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM stock_movements t WHERE reference_id=ANY(ids)));
 updates:=jsonb_set(updates,'{journalEntries}',(updates->'journalEntries')||(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM journal_entries t WHERE reference_id=ANY(ids)));
 updates:=jsonb_set(updates,'{journalLines}',(updates->'journalLines')||(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM journal_lines t WHERE journal_entry_id IN(SELECT id FROM journal_entries WHERE reference_id=ANY(ids))));
 IF op.stage='supplement' THEN
  updates:=jsonb_set(updates,'{salesOrders}',(SELECT jsonb_agg(to_jsonb(t)) FROM sales_orders t WHERE id=op.result->>'soId'));
  updates:=jsonb_set(updates,'{salesOrderItems}',(SELECT jsonb_agg(to_jsonb(t)) FROM sales_order_items t WHERE sales_order_id=op.result->>'soId'));
  updates:=jsonb_set(updates,'{purchases}',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM purchases t WHERE id=op.result->>'purchaseId'));
  updates:=jsonb_set(updates,'{purchaseItems}',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM purchase_items t WHERE purchase_id=op.result->>'purchaseId'));
 END IF;
 FOR k,rows IN SELECT key,value FROM jsonb_each(updates) LOOP
  SELECT coalesce(jsonb_agg(v),'[]') INTO rows FROM (SELECT DISTINCT ON(value->>'id') value AS v FROM jsonb_array_elements(rows) ORDER BY value->>'id') q;
  updates:=jsonb_set(updates,ARRAY[k],rows);
 END LOOP;
 RETURN updates;
END $$;

CREATE FUNCTION public.process_paper_operation(p_command jsonb,p_actor text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
#variable_conflict use_variable
DECLARE
 eid text:=trim(p_command->>'eventId'); stage text:=p_command->>'stage'; body jsonb:=p_command->'payload'; old paper_operations%rowtype;
 result jsonb:=jsonb_build_object('ok',true,'goodsEventIds','[]'::jsonb,'spareIds','[]'::jsonb); row jsonb; cmd jsonb; ev jsonb; ln jsonb; sources jsonb; snapshot jsonb;
 idx integer:=0; n integer; gid text; did text; soid text; docid text; ref text; parent text; at_time timestamptz; hand_time timestamptz;
 so sales_orders%rowtype; li sales_order_items%rowtype; pr products%rowtype; sp courier_spares%rowtype;
 q numeric; used_qty numeric; damaged_qty numeric; returned_qty numeric; reserved numeric; price numeric; free_qty numeric; courier text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role IN('admin_po','finance','super_admin')) THEN RAISE EXCEPTION 'Office role required'; END IF;
 IF nullif(eid,'') IS NULL OR length(eid)>64 OR jsonb_typeof(body) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid paper operation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('paper-operation:'||eid,0));
 SELECT * INTO old FROM paper_operations WHERE id=eid;
 IF FOUND THEN
  IF old.stage<>stage OR old.payload<>body THEN RAISE EXCEPTION 'Nomor kejadian dipakai untuk isian berbeda'; END IF;
  RETURN old.result||jsonb_build_object('eventId',eid,'updates',paper_operation_snapshot(eid));
 END IF;
 IF stage='transcribe' THEN
  IF jsonb_typeof(body->'qc') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'qc')>100 OR jsonb_typeof(body->'dispatches') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'dispatches')>50 OR jsonb_typeof(body->'spares') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'spares')>50 OR jsonb_array_length(body->'qc')+jsonb_array_length(body->'dispatches')+jsonb_array_length(body->'spares')=0 THEN RAISE EXCEPTION 'Isi QC, serah terima atau spare terlebih dahulu'; END IF;
  -- Lock selected products in one order before the existing commands take source locks.
  PERFORM id FROM products WHERE id IN(SELECT pi.product_id FROM purchase_items pi WHERE pi.id IN(SELECT value->>'sourceId' FROM jsonb_array_elements(body->'qc')) UNION SELECT si.product_id FROM sales_order_items si WHERE si.sales_order_id IN(SELECT value->>'soId' FROM jsonb_array_elements(body->'dispatches')) UNION SELECT value->>'productId' FROM jsonb_array_elements(body->'spares')) ORDER BY id FOR UPDATE;
  FOR row IN SELECT value FROM jsonb_array_elements(body->'qc') LOOP
   IF jsonb_typeof(row->'commands') IS DISTINCT FROM 'array' OR jsonb_array_length(row->'commands') NOT IN(1,2) THEN RAISE EXCEPTION 'Invalid QC row'; END IF;
   n:=0;
   FOR cmd IN SELECT value FROM jsonb_array_elements(row->'commands') LOOP
    n:=n+1;
    IF cmd->>'sourceId' IS DISTINCT FROM row->>'sourceId' OR cmd->>'stage' IS DISTINCT FROM (CASE WHEN n=jsonb_array_length(row->'commands') THEN 'qc' ELSE 'arrival' END) THEN RAISE EXCEPTION 'Only arrival and QC are allowed'; END IF;
    idx:=idx+1; gid:=eid||':goods:'||idx;
    PERFORM process_goods_event(cmd||jsonb_build_object('eventId',gid),p_actor);
    result:=jsonb_set(result,'{goodsEventIds}',(result->'goodsEventIds')||to_jsonb(gid));
   END LOOP;
  END LOOP;
  IF (SELECT count(*)<>count(DISTINCT value->>'soId') FROM jsonb_array_elements(body->'dispatches')) THEN RAISE EXCEPTION 'PO serah terima berulang'; END IF;
  FOR row IN SELECT value FROM jsonb_array_elements(body->'dispatches') LOOP
   soid:=row->>'soId'; courier:=row->>'courierId'; ev:=row->'evidence';
   IF NOT EXISTS(SELECT 1 FROM users WHERE id=courier AND role='kurir') THEN RAISE EXCEPTION 'Pilih kurir penerima barang'; END IF;
   IF coalesce((row->>'signedPaperChecked')::boolean,false)=false AND nullif(ev->>'paperProof','') IS NULL THEN RAISE EXCEPTION 'Periksa berita acara serah terima bertanda tangan'; END IF;
   hand_time:=(row->>'handoverAt')::timestamptz; at_time:=(ev->>'occurredAt')::timestamptz;
   IF hand_time IS NULL OR at_time IS NULL OR hand_time<at_time THEN RAISE EXCEPTION 'Waktu serah terima harus setelah QC/penyiapan'; END IF;
   SELECT * INTO STRICT so FROM sales_orders WHERE id=soid FOR UPDATE;
   did:=null;
   SELECT id INTO did FROM deliveries WHERE sales_order_id=soid AND status<>'Terkirim';
   IF did IS NULL THEN
    IF jsonb_typeof(row->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(row->'lines')=0 OR (SELECT count(*)<>count(DISTINCT value->>'salesOrderItemId') FROM jsonb_array_elements(row->'lines')) THEN RAISE EXCEPTION 'Isi rincian kiriman tanpa baris ganda'; END IF;
    IF EXISTS(SELECT 1 FROM sales_order_items WHERE sales_order_id=soid AND coalesce(qty_final,0)>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(row->'lines') x WHERE x->>'salesOrderItemId'=sales_order_items.id)) THEN RAISE EXCEPTION 'Isi semua barang lolos untuk PO ini'; END IF;
    UPDATE sales_orders SET assigned_courier_id=courier WHERE id=soid;
    idx:=idx+1; gid:=eid||':goods:'||idx;
    PERFORM process_goods_event(jsonb_build_object('eventId',gid,'stage','packing','sourceId',soid,'payload',ev||jsonb_build_object('lines',row->'lines')),p_actor);
    result:=jsonb_set(result,'{goodsEventIds}',(result->'goodsEventIds')||to_jsonb(gid));
    idx:=idx+1; gid:=eid||':goods:'||idx;
    cmd:=process_goods_event(jsonb_build_object('eventId',gid,'stage','release','sourceId',soid,'payload',ev),p_actor); did:=cmd->>'deliveryId';
    result:=jsonb_set(result,'{goodsEventIds}',(result->'goodsEventIds')||to_jsonb(gid));
   ELSE
    IF NOT EXISTS(SELECT 1 FROM deliveries WHERE id=did AND status='Menunggu') THEN RAISE EXCEPTION 'Kiriman sudah diserahterimakan; salin hasil di tab hasil kiriman'; END IF;
   END IF;
   idx:=idx+1; gid:=eid||':goods:'||idx;
   PERFORM process_goods_event(jsonb_build_object('eventId',gid,'stage','handover','sourceId',did,'payload',ev||jsonb_build_object('performedBy',courier,'occurredAt',hand_time,'signedPaperChecked',true)),p_actor);
   result:=jsonb_set(result,'{goodsEventIds}',(result->'goodsEventIds')||to_jsonb(gid));
  END LOOP;
  FOR row IN SELECT value FROM jsonb_array_elements(body->'spares') LOOP
   q:=goods_qty(row->'qty'); courier:=row->>'courierId'; ev:=row->'evidence'; at_time:=(ev->>'occurredAt')::timestamptz;
   IF q<=0 OR at_time IS NULL OR nullif(trim(ev->>'paperNumber'),'') IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=ev->>'performedBy') OR NOT EXISTS(SELECT 1 FROM users WHERE id=courier AND role='kurir') THEN RAISE EXCEPTION 'Lengkapi jumlah, kurir, pelaksana, waktu dan berkas spare'; END IF;
   IF coalesce((ev->>'signedPaperChecked')::boolean,false)=false AND nullif(ev->>'paperProof','') IS NULL THEN RAISE EXCEPTION 'Periksa berita acara spare bertanda tangan'; END IF;
   SELECT * INTO STRICT pr FROM products WHERE id=row->>'productId' FOR UPDATE;
   IF EXISTS(SELECT 1 FROM courier_spares WHERE product_id=pr.id AND courier_id=courier AND lower(trim(paper_number))=lower(trim(ev->>'paperNumber')) AND (occurred_at AT TIME ZONE 'Asia/Jakarta')::date=(at_time AT TIME ZONE 'Asia/Jakarta')::date) THEN RAISE EXCEPTION 'Spare pada berita acara ini sudah disalin. Periksa hasil kiriman'; END IF;
   SELECT coalesce(sum(greatest(0,coalesce(si.qty_final,0)-coalesce((SELECT sum((x->>'qty')::numeric) FROM deliveries d CROSS JOIN LATERAL jsonb_array_elements(coalesce(d.line_snapshots,'[]')) x WHERE d.sales_order_id=si.sales_order_id AND d.status<>'Terkirim' AND x->>'salesOrderItemId'=si.id),0))),0) INTO reserved FROM sales_order_items si JOIN sales_orders o ON o.id=si.sales_order_id WHERE si.product_id=pr.id AND o.status NOT IN('Batal','Selesai','Terkirim');
   free_qty:=greatest(0,pr.current_stock-reserved); IF q>free_qty THEN RAISE EXCEPTION 'Spare melebihi stok gudang bebas setelah alokasi PO'; END IF;
   sources:=market_inventory_sources(pr.id,q,free_qty);
   -- Match warehouse booking: use measured ledger value, retaining each unpriced
   -- source's original cost basis for the later paper-price correction.
   SELECT sum(stock_delta*coalesce(final_unit_cost,unit_cost))/nullif(sum(stock_delta),0) INTO price FROM stock_movements WHERE product_id=pr.id AND warehouse_id='main';
   price:=coalesce(nullif(price,0),pr.base_price,0);
   snapshot:=jsonb_build_object('qty',q,'unitCost',price,'costTotal',round(q*price,2),'costBasisQty',q,'costSources',sources);
   idx:=idx+1; gid:=eid||':spare:'||idx;
   INSERT INTO courier_spares(id,product_id,courier_id,qty,occurred_at,performed_by,paper_number,paper_proof,recorded_by,cost_snapshot) VALUES(gid,pr.id,courier,q,at_time,ev->>'performedBy',trim(ev->>'paperNumber'),ev->>'paperProof',p_actor,snapshot);
   PERFORM goods_stock(gid||':out',pr.id,q,-q,'SPARE_OUTBOUND',gid,'Gudang ke spare kurir',null,null,price,at_time::text,p_actor);
   UPDATE stock_movements SET cost_sources=sources,destination=courier,reference_type='Transfer' WHERE id=gid||':out';
   PERFORM price_courier_spare(gid);
   result:=jsonb_set(result,'{spareIds}',(result->'spareIds')||to_jsonb(gid));
  END LOOP;
 ELSIF stage='spare-settle' THEN
  SELECT * INTO STRICT sp FROM courier_spares WHERE id=body->>'id' FOR UPDATE;
  IF sp.status<>'Dibawa' THEN RAISE EXCEPTION 'Spare ini sudah diselesaikan'; END IF;
  used_qty:=goods_qty(body->'used'); damaged_qty:=goods_qty(body->'damaged'); returned_qty:=goods_qty(body->'returned'); ev:=body->'evidence'; at_time:=(ev->>'occurredAt')::timestamptz;
  IF used_qty+damaged_qty+returned_qty<>sp.qty THEN RAISE EXCEPTION 'Spare dibawa harus sama dengan terpakai + rusak + kembali'; END IF;
  IF at_time IS NULL OR at_time<sp.occurred_at OR nullif(trim(ev->>'paperNumber'),'') IS NULL OR ev->>'performedBy' IS DISTINCT FROM sp.courier_id OR ((used_qty+damaged_qty)>0 AND nullif(trim(body->>'reason'),'') IS NULL) THEN RAISE EXCEPTION 'Lengkapi waktu, kurir, berkas dan alasan spare'; END IF;
  UPDATE courier_spares SET used=used_qty,damaged=damaged_qty,returned=returned_qty,status='Selesai',settled_at=at_time,settlement_paper=trim(ev->>'paperNumber'),reason=body->>'reason' WHERE id=sp.id;
  IF returned_qty>0 THEN
   PERFORM goods_stock(eid||':return',sp.product_id,returned_qty,returned_qty,'SPARE_RETURN',sp.id,'Spare kurir kembali',null,null,coalesce(sp.final_unit_cost,(sp.cost_snapshot->>'unitCost')::numeric),at_time::text,p_actor);
   SELECT coalesce(jsonb_agg(s||jsonb_build_object('qty',(s->>'qty')::numeric*returned_qty/sp.qty)),'[]') INTO sources FROM jsonb_array_elements(coalesce(sp.cost_snapshot->'costSources','[]')) s;
   UPDATE stock_movements SET cost_sources=sources,reference_type='Transfer' WHERE id=eid||':return';
  END IF;
  PERFORM price_courier_spare(sp.id);
  result:=jsonb_set(result,'{spareIds}',jsonb_build_array(sp.id));
 ELSIF stage='supplement' THEN
  ref:=nullif(trim(body->>'paperNumber'),''); parent:=nullif(body->>'parentOrderId',''); at_time:=(body->>'occurredAt')::timestamptz;
  IF ref IS NULL OR length(ref)>120 OR at_time IS NULL OR nullif(body->>'targetDeliveryDate','') IS NULL OR body->>'targetDeliveryDate' !~ '^\d{4}-\d{2}-\d{2}$' OR NOT EXISTS(SELECT 1 FROM users WHERE id=body->>'performedBy') OR NOT EXISTS(SELECT 1 FROM clients WHERE id=body->>'clientId' AND NOT is_brand) OR nullif(trim(body->>'note'),'') IS NULL THEN RAISE EXCEPTION 'Lengkapi outlet, waktu pesanan, tanggal kirim, penghubung, referensi WA/kertas dan catatan'; END IF;
  PERFORM (body->>'targetDeliveryDate')::date;
  IF parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sales_orders WHERE id=parent AND client_id=body->>'clientId') THEN RAISE EXCEPTION 'PO asal harus milik outlet yang sama'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('supplement:'||(body->>'clientId')||':'||(body->>'targetDeliveryDate')||':'||lower(ref),0));
  IF EXISTS(SELECT 1 FROM sales_orders WHERE client_id=body->>'clientId' AND target_delivery_date=body->>'targetDeliveryDate' AND lower(trim(supplement_reference))=lower(ref)) THEN RAISE EXCEPTION 'Referensi susulan ini sudah disalin. Buka PO susulan yang tersimpan'; END IF;
  IF jsonb_typeof(body->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'lines') NOT BETWEEN 1 AND 100 OR (SELECT count(*)<>count(DISTINCT value->>'productId') FROM jsonb_array_elements(body->'lines')) THEN RAISE EXCEPTION 'Isi 1–100 barang tambahan tanpa barang berulang'; END IF;
  soid:='late:'||eid; docid:=soid||':purchase';
  INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status,parent_order_id,supplement_reference,supplement_note,supplement_recorded_at,supplement_recorded_by,shopping_list_document_id,shopping_list_compiled_at,shopping_list_compiled_by)
  VALUES(soid,'SUS-'||ref,body->>'clientId',at_time::text,body->>'targetDeliveryDate','Belanja',parent,ref,body->>'note',now(),p_actor,docid,now()::text,p_actor);
  INSERT INTO purchases(id,date,purchaser_id,status,advance_code,paper_session_id) VALUES(docid,at_time::text,body->>'performedBy','Belanja','SUS-'||ref,ref);
  n:=0;
  FOR row IN SELECT value FROM jsonb_array_elements(body->'lines') LOOP
   n:=n+1; q:=goods_qty(row->'qty'); price:=goods_qty(row->'unitPrice'); returned_qty:=goods_qty(row->'buyQty');
   IF q<=0 OR price<=0 OR returned_qty>q OR NOT EXISTS(SELECT 1 FROM products WHERE id=row->>'productId') THEN RAISE EXCEPTION 'Jumlah/harga tambahan harus positif, dan beli tidak melebihi pesanan'; END IF;
   INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,unit_price,subtotal) VALUES(soid||':line:'||n,soid,row->>'productId',q,price,q*price);
   IF returned_qty>0 THEN
    INSERT INTO purchase_items(id,purchase_id,product_id,sales_order_id,qty_target,estimated_unit_price,purchase_method,payment_method,notes) VALUES(soid||':buy:'||n,docid,row->>'productId',soid,returned_qty,(SELECT base_price FROM products WHERE id=row->>'productId'),'Pasar','Cash','Susulan '||ref||': laporan biaya menyusul');
   END IF;
   -- Existing warehouse stock is reserved only when explicitly selected as source.
   IF q>returned_qty THEN
    gid:=eid||':reserve:'||n;
    PERFORM process_goods_event(jsonb_build_object('eventId',gid,'stage','reserve','sourceId',soid,'payload',jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('salesOrderItemId',soid||':line:'||n,'qty',q-returned_qty)))),p_actor);
    result:=jsonb_set(result,'{goodsEventIds}',(result->'goodsEventIds')||to_jsonb(gid));
   END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM purchase_items WHERE purchase_id=docid) THEN UPDATE purchases SET status='Selesai' WHERE id=docid; UPDATE sales_orders SET status='Packing' WHERE id=soid; END IF;
  result:=result||jsonb_build_object('soId',soid,'purchaseId',docid);
 ELSE RAISE EXCEPTION 'Tahap kertas tidak dikenal';
 END IF;
 INSERT INTO paper_operations(id,stage,payload,recorded_by,result) VALUES(eid,stage,body,p_actor,result);
 RETURN result||jsonb_build_object('eventId',eid,'updates',paper_operation_snapshot(eid));
END $$;
REVOKE ALL ON FUNCTION public.process_paper_operation(jsonb,text),public.paper_operation_snapshot(text),public.price_courier_spare(text),public.price_pending_courier_spares() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_paper_operation(jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

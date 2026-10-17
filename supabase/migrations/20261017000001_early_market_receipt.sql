-- Physical market receipts can precede the sourcing paper. Existing reported lots
-- retain their original workflow. New unreported arrivals become fixed physical lots,
-- so a partial arrival and a later financial report cannot duplicate a QC allocation.
BEGIN;
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS physical_qty_received numeric;
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS physical_before_report boolean NOT NULL DEFAULT false;
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS cost_pending boolean NOT NULL DEFAULT false;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS final_unit_cost numeric;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS cost_sources jsonb;

-- Estimated dispatch facts remain immutable. Financial audit resolves only the
-- early lot portions against their actual paper prices, without rewriting shipment qty.
CREATE OR REPLACE FUNCTION public.market_line_cost(ln jsonb, require_final boolean DEFAULT true)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s jsonb; pi purchase_items%rowtype; value numeric; factor numeric;
BEGIN
 value:=coalesce((ln->>'costTotal')::numeric,round((ln->>'qty')::numeric*(ln->>'unitCost')::numeric,2));
 factor:=coalesce((ln->>'qty')::numeric/nullif((ln->>'costBasisQty')::numeric,0),1);
 FOR s IN SELECT * FROM jsonb_array_elements(coalesce(ln->'costSources','[]')) LOOP
  SELECT * INTO STRICT pi FROM purchase_items WHERE id=s->>'purchaseItemId';
  IF pi.cost_pending OR pi.qty_purchased<pi.physical_qty_received THEN
   IF require_final AND (ln->>'qty')::numeric>0 THEN RAISE EXCEPTION 'Lengkapi laporan belanja sebelum finalisasi biaya pengiriman'; END IF;
  ELSE value:=value+factor*(s->>'qty')::numeric*(pi.actual_unit_price-(s->>'unitCost')::numeric);
  END IF;
 END LOOP;
 RETURN round(value,2);
END $$;

CREATE OR REPLACE FUNCTION public.market_cost_sources(p_so text,p_product text,p_qty numeric)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH balance AS (
  SELECT sum(CASE WHEN kind='BOOKING' THEN quantity ELSE stock_delta END) AS qty
  FROM stock_movements WHERE sales_order_id=p_so AND product_id=p_product AND warehouse_id='main'
  AND kind IN ('QC_CLIENT_ALLOCATION','DELIVERY_OUTBOUND','BOOKING')
 ), lots AS (
  SELECT incoming.purchase_item_id,sum(incoming.qty) AS qty,sum(incoming.qty*incoming.price)/sum(incoming.qty) AS price FROM (
   SELECT m.purchase_item_id,m.quantity AS qty,coalesce(m.final_unit_cost,m.unit_cost) AS price
   FROM stock_movements m JOIN purchase_items pi ON pi.id=m.purchase_item_id
   WHERE m.sales_order_id=p_so AND m.product_id=p_product AND m.kind='QC_CLIENT_ALLOCATION' AND pi.physical_before_report
   UNION ALL
   SELECT cs->>'purchaseItemId',(cs->>'qty')::numeric,CASE WHEN pi.cost_pending THEN (cs->>'unitCost')::numeric ELSE pi.actual_unit_price END
   FROM stock_movements m CROSS JOIN LATERAL jsonb_array_elements(coalesce(m.cost_sources,'[]')) cs
   JOIN purchase_items pi ON pi.id=cs->>'purchaseItemId'
   WHERE m.sales_order_id=p_so AND m.product_id=p_product AND m.kind='BOOKING'
  ) incoming GROUP BY incoming.purchase_item_id
 ), consumed AS (
  SELECT s->>'purchaseItemId' AS id,sum((s->>'qty')::numeric) AS qty
  FROM deliveries d CROSS JOIN LATERAL jsonb_array_elements(coalesce(d.line_snapshots,'[]')) ln
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(ln->'costSources','[]')) s
  WHERE d.sales_order_id=p_so AND ln->>'productId'=p_product GROUP BY 1
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('purchaseItemId',l.purchase_item_id,'qty',p_qty*greatest(0,l.qty-coalesce(c.qty,0))/b.qty,'unitCost',l.price)),'[]')
 FROM lots l LEFT JOIN consumed c ON c.id=l.purchase_item_id CROSS JOIN balance b
 WHERE b.qty>0 AND l.qty>coalesce(c.qty,0);
$$;

-- Preserve the provenance of unpriced free stock when it is booked to a later PO.
CREATE OR REPLACE FUNCTION public.market_inventory_sources(p_product text,p_qty numeric,p_free numeric)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH lots AS (
  SELECT m.purchase_item_id,sum(m.quantity) AS qty,sum(m.quantity*coalesce(m.final_unit_cost,m.unit_cost))/sum(m.quantity) AS price
  FROM stock_movements m JOIN purchase_items pi ON pi.id=m.purchase_item_id
  WHERE m.product_id=p_product AND m.warehouse_id='main' AND m.kind='QC_INVENTORY' AND pi.physical_before_report GROUP BY 1
 ), booked AS (
  SELECT s->>'purchaseItemId' AS id,sum((s->>'qty')::numeric) AS qty
  FROM stock_movements m CROSS JOIN LATERAL jsonb_array_elements(coalesce(m.cost_sources,'[]')) s
  WHERE m.product_id=p_product AND m.kind='BOOKING' GROUP BY 1
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('purchaseItemId',l.purchase_item_id,'qty',p_qty*greatest(0,l.qty-coalesce(b.qty,0))/greatest(p_free,(select sum(greatest(0,l2.qty-coalesce(b2.qty,0))) from lots l2 left join booked b2 on b2.id=l2.purchase_item_id)),'unitCost',l.price)),'[]')
 FROM lots l LEFT JOIN booked b ON b.id=l.purchase_item_id WHERE p_free>0 AND l.qty>coalesce(b.qty,0);
$$;

-- Value each measured QC lot once, only after its actual purchase price is complete.
-- Receipt/report/QC all hold the same purchase row lock; idempotent journal IDs also
-- protect retries. Neither this function nor the paper handler changes physical stock.
CREATE OR REPLACE FUNCTION public.book_market_receipt_cost(p_pi text,p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE pi purchase_items%rowtype; g goods_events%rowtype; q numeric; rejected numeric; price numeric; claim numeric;
BEGIN
 SELECT * INTO STRICT pi FROM purchase_items WHERE id=p_pi FOR UPDATE;
 IF NOT pi.physical_before_report OR pi.qty_purchased<pi.physical_qty_received OR pi.actual_unit_price<=0 THEN RETURN; END IF;
 PERFORM id FROM products WHERE id=pi.product_id FOR UPDATE;
 price:=pi.actual_unit_price;
 FOR g IN SELECT * FROM goods_events WHERE stage='qc' AND source_id=pi.id ORDER BY id LOOP
  IF EXISTS(SELECT 1 FROM journal_entries WHERE id=g.id||':journal') THEN CONTINUE; END IF;
  q:=(g.payload->>'qtyPassToInventory')::numeric+(g.payload->>'qtyReject')::numeric+
    coalesce((SELECT sum((a->>'qty')::numeric) FROM jsonb_array_elements(g.payload->'allocations') a),0);
  rejected:=(g.payload->>'qtyReject')::numeric;
  PERFORM goods_journal(g.id||':journal',g.occurred_at::text,'QC receipt priced from sourcing paper '||g.id,'QC',g.id,'1-3000','2-1100',round(q*price,2));
  claim:=round(q*price,2)-round((q-rejected)*price,2);
  IF rejected>0 THEN
   PERFORM goods_journal(g.id||':rejectjournal',g.occurred_at::text,'QC reject priced from sourcing paper '||g.id,'QC',CASE WHEN g.payload->>'rejectAction'='Return' THEN g.id||':vendorreturn' ELSE g.id END,
    CASE g.payload->>'rejectAction' WHEN 'B2C' THEN '1-3100' WHEN 'Return' THEN '1-2100' ELSE '5-2000' END,'1-3000',claim);
   UPDATE vendor_returns SET unit_cost=claim/rejected WHERE id=g.id||':vendorreturn';
  END IF;
  UPDATE stock_movements SET final_unit_cost=price WHERE purchase_item_id=pi.id AND reference_id=g.id;
 END LOOP;
 UPDATE purchase_items SET cost_pending=false WHERE id=pi.id;
 -- Keep the measured cost intact and store its later valuation separately.
 UPDATE stock_movements m SET final_unit_cost=market_line_cost(jsonb_build_object('qty',m.quantity,'unitCost',m.unit_cost,'costBasisQty',m.quantity,'costSources',m.cost_sources),false)/m.quantity
 WHERE m.product_id=pi.product_id AND m.kind='BOOKING' AND m.quantity>0 AND m.cost_sources IS NOT NULL;
 UPDATE stock_movements m SET final_unit_cost=market_line_cost(ln,false)/(ln->>'qty')::numeric
 FROM deliveries d CROSS JOIN LATERAL jsonb_array_elements(d.line_snapshots) ln
 WHERE m.reference_id=d.id AND m.product_id=pi.product_id AND m.kind='DELIVERY_OUTBOUND' AND ln->>'productId'=pi.product_id AND (ln->>'qty')::numeric>0;
END $$;
CREATE OR REPLACE FUNCTION public.price_market_qc_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.stage='qc' THEN PERFORM book_market_receipt_cost(NEW.source_id,NEW.recorded_by); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER price_market_qc AFTER INSERT ON public.goods_events FOR EACH ROW EXECUTE FUNCTION public.price_market_qc_event();

-- Patch the existing locked commands with explicit source guards. Fail migration
-- rather than silently modifying an unexpected server function version.
CREATE FUNCTION pg_temp.patch_required(source text,old text,new text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
 IF position(old in source)=0 THEN RAISE EXCEPTION 'Expected command fragment absent: %',left(old,100); END IF;
 RETURN replace(source,old,new);
END $$;
DO $migration$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.process_goods_event(jsonb,text)'::regprocedure);
 definition:=pg_temp.patch_required(definition,$old$  remaining:=pi.qty_purchased-coalesce(pi.qc_processed_qty,0);$old$,$new$  remaining:=CASE WHEN pi.physical_before_report THEN pi.physical_qty_received ELSE pi.qty_purchased END-coalesce(pi.qc_processed_qty,0);$new$);
 definition:=pg_temp.patch_required(definition,$old$   if v_qty<=0 or arrived+v_qty>pi.qty_purchased+0.00000001 then raise exception 'Penerimaan melebihi jumlah pembelian'; end if;$old$,$new$   arrived:=greatest(arrived,coalesce(pi.physical_qty_received,0),coalesce(pi.qc_processed_qty,0));
   if v_qty<=0 then raise exception 'Jumlah penerimaan harus lebih dari nol'; end if;
   if coalesce(pi.purchase_method,'Pasar')='Pasar' and pi.qty_purchased=0 then
    if not exists(select 1 from purchases where id=pi.purchase_id and status in ('Pending','Belanja','Selesai')) then raise exception 'Dokumen belanja belum dilepas'; end if;
    if arrived>0 or v_qty>pi.qty_target+0.00000001 then raise exception 'Penerimaan melebihi sisa daftar belanja'; end if;
    if v_qty<pi.qty_target then
     insert into purchase_items(id,purchase_id,product_id,sales_order_id,qty_target,estimated_unit_price,purchase_method,payment_method,planned_vendor_id,notes)
     values('arrival-remaining:'||eid,pi.purchase_id,pi.product_id,pi.sales_order_id,pi.qty_target-v_qty,pi.estimated_unit_price,pi.purchase_method,pi.payment_method,pi.planned_vendor_id,pi.notes);
    end if;
    update purchase_items set qty_target=v_qty,physical_before_report=true,cost_pending=true where id=pi.id;
   elsif arrived+v_qty>pi.qty_purchased+0.00000001 then raise exception 'Penerimaan melebihi jumlah pembelian';
   end if;
   update purchase_items set physical_qty_received=arrived+v_qty where id=pi.id;$new$);
 definition:=pg_temp.patch_required(definition,$old$    if not exists(select 1 from purchases where id=pi.purchase_id and (status='Selesai' or (status in ('Pending','Belanja') and coalesce(jsonb_array_length(to_jsonb(pi)->'report_event_ids'),0)>0))) then raise exception 'Laporan pembelian belum diterima'; end if;$old$,$new$    if not pi.physical_before_report and not exists(select 1 from purchases where id=pi.purchase_id and (status='Selesai' or (status in ('Pending','Belanja') and coalesce(jsonb_array_length(to_jsonb(pi)->'report_event_ids'),0)>0))) then raise exception 'Laporan pembelian belum diterima'; end if;$new$);
 definition:=pg_temp.patch_required(definition,$old$   if price<=0 then raise exception 'Harga vendor wajib lebih dari nol'; end if;$old$,$new$   if price<=0 and not pi.physical_before_report then raise exception 'Harga vendor wajib lebih dari nol'; end if;$new$);
 definition:=pg_temp.patch_required(definition,$old$   perform goods_journal(eid||':journal',at_text,'QC receipt '||eid,'QC',eid,'1-3000','2-1100',processed*price);$old$,$new$   if not pi.physical_before_report then perform goods_journal(eid||':journal',at_text,'QC receipt '||eid,'QC',eid,'1-3000','2-1100',processed*price); end if;$new$);
 definition:=pg_temp.patch_required(definition,$old$perform goods_journal(eid||':rejectjournal',at_text,'QC B2C '||eid,'QC',eid,'1-3100','1-3000',round(rejected*cost,2));$old$,$new$if not pi.physical_before_report then perform goods_journal(eid||':rejectjournal',at_text,'QC B2C '||eid,'QC',eid,'1-3100','1-3000',round(rejected*cost,2)); end if;$new$);
 definition:=pg_temp.patch_required(definition,$old$perform goods_journal(eid||':rejectjournal',at_text,'QC vendor claim '||eid,'QC',eid||':vendorreturn','1-2100','1-3000',round(rejected*cost,2));$old$,$new$if not pi.physical_before_report then perform goods_journal(eid||':rejectjournal',at_text,'QC vendor claim '||eid,'QC',eid||':vendorreturn','1-2100','1-3000',round(rejected*cost,2)); end if;$new$);
 definition:=pg_temp.patch_required(definition,$old$perform goods_journal(eid||':rejectjournal',at_text,'QC disposal '||eid,'QC',eid,'5-2000','1-3000',round(rejected*cost,2));$old$,$new$if not pi.physical_before_report then perform goods_journal(eid||':rejectjournal',at_text,'QC disposal '||eid,'QC',eid,'5-2000','1-3000',round(rejected*cost,2)); end if;$new$);
 definition:=pg_temp.patch_required(definition,$old$     if pi.vendor_id is null then raise exception 'Vendor retur wajib dipilih'; end if;$old$,$new$     pi.vendor_id:=coalesce(nullif(body->>'rejectVendorId',''),pi.vendor_id,pi.planned_vendor_id);
     if pi.vendor_id is null then raise exception 'Vendor retur wajib dipilih'; end if;$new$);
 definition:=pg_temp.patch_required(definition,$old$   if (pi.payment_method='Tempo' or (pi.purchase_method='Vendor' and pi.payment_method='Transfer')) and net>0 then$old$,$new$   if not pi.physical_before_report and (pi.payment_method='Tempo' or (pi.purchase_method='Vendor' and pi.payment_method='Transfer')) and net>0 then$new$);
 definition:=pg_temp.patch_required(definition,$old$    is_qced=(coalesce(qc_processed_qty,0)+processed>=qty_purchased-0.00000001),$old$,$new$    is_qced=(coalesce(qc_processed_qty,0)+processed>=CASE WHEN physical_before_report THEN physical_qty_received ELSE qty_purchased END-0.00000001),$new$);
 definition:=pg_temp.patch_required(definition,$old$    inbound_status=case when coalesce(qc_processed_qty,0)+processed<qty_purchased-0.00000001 then$old$,$new$    inbound_status=case when coalesce(qc_processed_qty,0)+processed<CASE WHEN physical_before_report THEN physical_qty_received ELSE qty_purchased END-0.00000001 then$new$);
 definition:=pg_temp.patch_required(definition,$old$    actual_unit_price=price,inbound_verified_at=at_text$old$,$new$    actual_unit_price=case when physical_before_report then actual_unit_price else price end,inbound_verified_at=at_text$new$);
 definition:=pg_temp.patch_required(definition,$old$    lines:=lines||jsonb_build_array(jsonb_build_object('salesOrderItemId',li.id,'productId',pr.id,'productName',pr.name,'uom',pr.uom,'qty',v_qty,'unitPrice',li.unit_price,'unitCost',cost,'lineTotal',round(v_qty*li.unit_price,2),'costTotal',round(v_qty*cost,2)));$old$,$new$    lines:=lines||jsonb_build_array(jsonb_build_object('salesOrderItemId',li.id,'productId',pr.id,'productName',pr.name,'uom',pr.uom,'qty',v_qty,'unitPrice',li.unit_price,'unitCost',cost,'lineTotal',round(v_qty*li.unit_price,2),'costTotal',round(v_qty*cost,2),'costBasisQty',v_qty,'costSources',market_cost_sources(sid,li.product_id,v_qty)));$new$);
 definition:=pg_temp.patch_required(definition,$old$stock_delta end)*unit_cost)$old$,$new$stock_delta end)*coalesce(final_unit_cost,unit_cost))$new$);
 definition:=pg_temp.patch_required(definition,$old$sum(stock_delta*unit_cost)$old$,$new$sum(stock_delta*coalesce(final_unit_cost,unit_cost))$new$);
 definition:=pg_temp.patch_required(definition,$old$   update sales_order_items set qty_final=coalesce(qty_final,0)+v_qty,subtotal_final=(coalesce(qty_final,0)+v_qty)*unit_price where id=li.id;$old$,$new$   update stock_movements set cost_sources=market_inventory_sources(pr.id,v_qty,pr.current_stock-reserved) where id=eid||':booking:'||li.id;
   update sales_order_items set qty_final=coalesce(qty_final,0)+v_qty,subtotal_final=(coalesce(qty_final,0)+v_qty)*unit_price where id=li.id;$new$);
 definition:=pg_temp.patch_required(definition,$old$   if inv.total_amount<>revenue then$old$,$new$   select coalesce(sum(market_line_cost(value)),0) into cogs from jsonb_array_elements(dl.accepted_line_snapshots);
   update invoices set line_snapshots=(select jsonb_agg((value-'costSources'-'costBasisQty')||jsonb_build_object('costTotal',market_line_cost(value),'unitCost',case when (value->>'qty')::numeric>0 then market_line_cost(value)/(value->>'qty')::numeric else 0 end)) from jsonb_array_elements(dl.accepted_line_snapshots)) where id=inv.id and exists(select 1 from jsonb_array_elements(dl.accepted_line_snapshots) x where x->'costSources' is not null and jsonb_array_length(x->'costSources')>0);
   if inv.total_amount<>revenue then$new$);
 definition:=pg_temp.patch_required(definition,$old$   cost:=coalesce(ret.cost_amount/nullif(ret.qty,0),ret.unit_cost,pr.base_price);$old$,$new$   if ret.delivery_id is not null then
    select value into ln from deliveries d cross join lateral jsonb_array_elements(d.line_snapshots) x(value) where d.id=ret.delivery_id and value->>'salesOrderItemId'=ret.sales_order_item_id;
    if ln->'costSources' is not null and jsonb_array_length(ln->'costSources')>0 then
     cost:=market_line_cost(ln)/(ln->>'qty')::numeric; ret.cost_amount:=round(ret.qty*cost,2); ret.unit_cost:=cost;
    end if;
   end if;
   cost:=coalesce(ret.cost_amount/nullif(ret.qty,0),ret.unit_cost,pr.base_price);$new$);
 definition:=pg_temp.patch_required(definition,$old$   if found then
    cost:=coalesce(vr.unit_cost$old$,$new$   if found then
    if pi.cost_pending then raise exception 'Lengkapi laporan belanja sebelum penyelesaian biaya retur vendor'; end if;
    cost:=coalesce(vr.unit_cost$new$);
 definition:=pg_temp.patch_required(definition,$old$  into line_amount,cost_amount from jsonb_array_elements(dl.accepted_line_snapshots) x where x->>'salesOrderItemId'=li.id;$old$,$new$  into line_amount,cost_amount from jsonb_array_elements(dl.accepted_line_snapshots) x where x->>'salesOrderItemId'=li.id;
  select sum(market_line_cost(x)) into cost_amount from jsonb_array_elements(dl.accepted_line_snapshots) x where x->>'salesOrderItemId'=li.id;$new$);
 EXECUTE definition;
 definition:=pg_get_functiondef('public.goods_snapshot(text)'::regprocedure);
 definition:=pg_temp.patch_required(definition,$old$ sos:=sos||array(select sales_order_id from deliveries$old$,$new$ pis:=pis||array(select id from purchase_items where purchase_id in(select purchase_id from purchase_items where id=any(pis)));
 sos:=sos||array(select sales_order_id from deliveries$new$);
 EXECUTE definition;
 definition:=pg_get_functiondef('public.process_purchase_event(jsonb,text)'::regprocedure);
 definition:=pg_temp.patch_required(definition,$old$ OR pi.is_qced THEN RAISE EXCEPTION 'Allocation outside selected open market paper'$old$,$new$ OR (pi.is_qced AND NOT pi.physical_before_report) THEN RAISE EXCEPTION 'Allocation outside selected open market paper'$new$);
 definition:=pg_temp.patch_required(definition,$old$    IF qty+pi.qty_purchased<pi.qty_target OR pi.qty_purchased>0 THEN$old$,$new$    IF pi.physical_before_report THEN
     IF EXISTS(SELECT 1 FROM vendor_returns WHERE original_return_id=pi.id AND vendor_id<>ln->>'vendorId') THEN RAISE EXCEPTION 'Vendor laporan berbeda dari berkas retur; cocokkan vendor aktual'; END IF;
     UPDATE purchase_items SET actual_unit_price=(qty_purchased*actual_unit_price+qty*price)/(qty_purchased+qty),qty_purchased=qty_purchased+qty,is_checked=true,vendor_id=ln->>'vendorId',payment_method=coalesce(ln->>'paymentMethod','Cash'),notes=ln->>'notes',over_ceiling_reason=ln->>'overCeilingReason',report_event_ids=coalesce(report_event_ids,'[]')||jsonb_build_array(eid) WHERE id=pi.id;
     IF ln->>'paymentMethod'='Tempo' THEN
      child:='market-bill:'||eid||':'||pi.id;
      INSERT INTO vendor_bills(id,bill_number,vendor_id,vendor_name,issue_date,due_date,description,category,total_amount,amount_paid,status,payments,purchase_id,created_at,created_by) SELECT child,'VB-'||child,id,company_name,at_text,(at_text::timestamptz+coalesce(payment_term_days,14)*interval '1 day')::text,'Kertas belanja '||eid,'Bahan Baku',round(qty*price,2),0,'Pending','[]',pi.purchase_id,now()::text,p_actor FROM vendors WHERE id=ln->>'vendorId';
      PERFORM post_journal_entry(child||':ap',at_text,'Hutang kertas belanja '||eid,'Purchase',pi.purchase_id,jsonb_build_array(jsonb_build_object('accountCode','2-1100','amount',round(qty*price,2))),jsonb_build_array(jsonb_build_object('accountCode','2-1000','amount',round(qty*price,2),'vendorId',ln->>'vendorId','vendorBillId',child)));
      PERFORM apply_vendor_advances(pi.purchase_id,ln->>'vendorId',child,at_text,p_actor);
     END IF;
     PERFORM book_market_receipt_cost(pi.id,p_actor);
    ELSIF qty+pi.qty_purchased<pi.qty_target OR pi.qty_purchased>0 THEN$new$);
 EXECUTE definition;
 definition:=pg_get_functiondef('public.purchase_snapshot(text)'::regprocedure);
 definition:=pg_temp.patch_required(definition,$old$ js:=array(SELECT id FROM journal_entries WHERE reference_id=any(docs) OR reference_id=any(pis));$old$,$new$ js:=array(SELECT id FROM journal_entries WHERE reference_id=any(docs) OR reference_id=any(pis) OR reference_id IN(SELECT id FROM goods_events WHERE source_id=any(pis)) OR reference_id IN(SELECT id||':vendorreturn' FROM goods_events WHERE source_id=any(pis)));
$new$);
 definition:=pg_temp.patch_required(definition,$old$  'expenses',(SELECT$old$,$new$  'vendorBills',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM vendor_bills t WHERE purchase_id=any(docs)),
  'vendorReturns',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM vendor_returns t WHERE original_return_id=any(pis)),
  'expenses',(SELECT$new$);
 definition:=pg_temp.patch_required(definition,$old$FROM stock_movements t WHERE sales_order_id=any(sos)$old$,$new$FROM stock_movements t WHERE sales_order_id=any(sos) OR purchase_item_id=any(pis)$new$);
 EXECUTE definition;
END $migration$;
REVOKE ALL ON FUNCTION public.market_inventory_sources(text,numeric,numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.market_line_cost(jsonb,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.market_cost_sources(text,text,numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.book_market_receipt_cost(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.price_market_qc_event() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

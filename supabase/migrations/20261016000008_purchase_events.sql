BEGIN;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS purchase_request_id text;
ALTER TABLE rejected_items ADD COLUMN IF NOT EXISTS shopping_compiled_at text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recorded_by text, ADD COLUMN IF NOT EXISTS recorded_at timestamptz, ADD COLUMN IF NOT EXISTS performed_by text, ADD COLUMN IF NOT EXISTS channel text;
CREATE TABLE IF NOT EXISTS public.purchase_events (
 id text PRIMARY KEY, stage text NOT NULL, source_id text NOT NULL, payload jsonb NOT NULL,
 recorded_by text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(), result jsonb NOT NULL
);
ALTER TABLE public.purchase_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.purchase_events TO service_role;
-- Retry responses always read current source rows, never replay a stale browser snapshot.
CREATE OR REPLACE FUNCTION public.purchase_snapshot(p_event text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e purchase_events%rowtype; docs text[]:='{}'; sos text[]:='{}'; pis text[]:='{}'; prods text[]:='{}'; js text[]:='{}';
BEGIN
 SELECT * INTO STRICT e FROM purchase_events WHERE id=p_event;
 IF e.stage IN ('compile','plan-release','verify') THEN docs:=array[e.source_id]; END IF;
 IF e.stage='compile' THEN sos:=array(SELECT jsonb_array_elements_text(e.payload->'salesOrderIds')); END IF;
 IF e.stage='revise' THEN sos:=array[e.source_id]; docs:=array(SELECT shopping_list_document_id FROM sales_orders WHERE id=e.source_id); END IF;
 IF e.stage='paper-release' THEN docs:=array(SELECT jsonb_array_elements_text(e.payload->'purchaseIds')); END IF;
 IF e.stage='report' THEN docs:=array(SELECT DISTINCT value->>'purchaseId' FROM jsonb_array_elements(e.payload->'lines')); END IF;
 IF e.stage IN ('online','vendor-order') THEN docs:=array(SELECT purchase_id FROM purchase_items WHERE id=e.source_id); END IF;
 pis:=array(SELECT id FROM purchase_items WHERE purchase_id=any(docs));
 sos:=sos||array(SELECT sales_order_id FROM purchase_items WHERE id=any(pis));
 prods:=array(SELECT product_id FROM purchase_items WHERE id=any(pis))||array(SELECT product_id FROM sales_order_items WHERE sales_order_id=any(sos));
 js:=array(SELECT id FROM journal_entries WHERE reference_id=any(docs) OR reference_id=any(pis));
 RETURN jsonb_build_object(
  'purchases',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM purchases t WHERE id=any(docs)),
  'purchaseItems',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM purchase_items t WHERE id=any(pis)),
  'salesOrders',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM sales_orders t WHERE id=any(sos)),
  'salesOrderItems',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM sales_order_items t WHERE sales_order_id=any(sos)),
  'products',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM products t WHERE id=any(prods)),
  'stockMovements',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM stock_movements t WHERE sales_order_id=any(sos)),
  'notifications',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM notifications t WHERE left(id,length('revision:'||e.id||':'))='revision:'||e.id||':'),
  'purchaseRequests',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM purchase_requests t WHERE id IN(SELECT purchase_request_id FROM purchases WHERE id=any(docs))),
  'rejectedItems',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM rejected_items t WHERE id IN(SELECT jsonb_array_elements_text(coalesce(e.payload->'rejectedIds','[]')))),
  'bankAccounts',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM bank_accounts t WHERE id IN(e.payload->>'bankAccountId',e.payload->>'pocketBankAccountId',e.payload->>'transferBankAccountId')),
  'cashTransactions',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM cash_transactions t WHERE reference_id=any(docs) OR reference_id=any(pis)),
  'journalEntries',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM journal_entries t WHERE id=any(js)),
  'journalLines',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM journal_lines t WHERE journal_entry_id=any(js)),
  'expenses',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM expenses t WHERE reference_id=any(pis) OR purchase_id=any(docs))
 );
END $$;
REVOKE ALL ON FUNCTION public.purchase_snapshot(text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.process_purchase_event(p_command jsonb,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
#variable_conflict use_variable
DECLARE
 eid text:=nullif(trim(p_command->>'eventId'),''); stage text:=p_command->>'stage'; sid text:=p_command->>'sourceId'; body jsonb:=p_command->'payload';
 prior purchase_events%rowtype; doc purchases%rowtype; so sales_orders%rowtype; li sales_order_items%rowtype; pi purchase_items%rowtype;
 ln jsonb; r record; at_text text; vendor text; method text; child text; note text; so_id text;
 qty numeric; price numeric; amount numeric; cash numeric; transfer numeric; remaining numeric; delta numeric; target numeric; owned numeric;
 result jsonb:=jsonb_build_object('ok',true); role_name text;
BEGIN
 SELECT role INTO role_name FROM users WHERE id=p_actor;
 IF role_name IS NULL OR role_name NOT IN ('admin_po','finance','super_admin') THEN RAISE EXCEPTION 'Office role required'; END IF;
 IF eid IS NULL OR length(eid)>120 OR nullif(sid,'') IS NULL OR jsonb_typeof(body) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid purchasing event'; END IF;
 IF stage IN ('report','online','vendor-order','plan-release','verify') AND role_name NOT IN ('finance','super_admin') THEN RAISE EXCEPTION 'Finance role required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('purchase-event:'||eid,0));
 SELECT * INTO prior FROM purchase_events WHERE id=eid;
 IF FOUND THEN
  IF prior.stage<>stage OR prior.source_id<>sid OR prior.payload<>body THEN RAISE EXCEPTION 'Purchasing event payload conflict'; END IF;
  RETURN prior.result||jsonb_build_object('updates',purchase_snapshot(eid));
 END IF;
 at_text:=coalesce(nullif(body->>'occurredAt',''),now()::text);
 PERFORM at_text::timestamptz;
 IF stage='compile' THEN
  -- All selected POs and products lock before any document or reservation is written.
  PERFORM id FROM products WHERE id IN (SELECT value->>'productId' FROM jsonb_array_elements(body->'items') UNION SELECT si.product_id FROM sales_order_items si JOIN jsonb_array_elements(body->'reservations') a ON si.id=a->>'salesOrderItemId') ORDER BY id FOR UPDATE;
  PERFORM id FROM sales_orders WHERE id IN (SELECT jsonb_array_elements_text(body->'salesOrderIds')) ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM purchases WHERE id=sid) THEN RAISE EXCEPTION 'Purchase document already exists'; END IF;
  IF jsonb_typeof(body->'items') IS DISTINCT FROM 'array' OR jsonb_typeof(body->'reservations') IS DISTINCT FROM 'array' OR jsonb_typeof(body->'salesOrderIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Compile arrays required'; END IF;
  IF nullif(body->>'purchaseRequestId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM purchase_requests WHERE id=body->>'purchaseRequestId' AND status='Approved' AND category='Sourcing') THEN RAISE EXCEPTION 'Approved sourcing request required'; END IF;
  IF jsonb_array_length(body->'items')+jsonb_array_length(body->'reservations')=0 THEN RAISE EXCEPTION 'Empty purchase document'; END IF;
  IF (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements_text(body->'salesOrderIds')) THEN RAISE EXCEPTION 'Duplicate PO'; END IF;
  FOR so_id IN SELECT jsonb_array_elements_text(body->'salesOrderIds') LOOP
   SELECT * INTO STRICT so FROM sales_orders WHERE id=so_id;
   IF NOT (so.status='Kurang Kirim' OR (so.status IN ('Draft','Belanja') AND so.shopping_list_compiled_at IS NULL)) THEN RAISE EXCEPTION 'PO already compiled or locked'; END IF;
  END LOOP;
  FOR ln IN SELECT value FROM jsonb_array_elements(body->'items') LOOP
   qty:=goods_qty(ln->'qtyTarget'); price:=goods_qty(ln->'estimatedUnitPrice');
   IF qty<=0 OR nullif(ln->>'id','') IS NULL OR NOT EXISTS(SELECT 1 FROM products WHERE id=ln->>'productId') THEN RAISE EXCEPTION 'Valid product and positive purchase quantity required'; END IF;
   IF nullif(ln->>'salesOrderId','') IS NOT NULL AND NOT (body->'salesOrderIds' ? (ln->>'salesOrderId')) THEN RAISE EXCEPTION 'Item outside selected PO'; END IF;
   IF nullif(ln->>'salesOrderId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sales_order_items WHERE sales_order_id=ln->>'salesOrderId' AND product_id=ln->>'productId') THEN RAISE EXCEPTION 'Purchase product outside PO'; END IF;
  END LOOP;
  IF (SELECT count(*)<>count(DISTINCT value->>'id') FROM jsonb_array_elements(body->'items')) THEN RAISE EXCEPTION 'Duplicate purchase row'; END IF;
  FOR ln IN SELECT value FROM jsonb_array_elements(body->'reservations') LOOP
   qty:=goods_qty(ln->'qty'); IF qty<=0 THEN RAISE EXCEPTION 'Reservation must be positive'; END IF;
   IF NOT EXISTS(SELECT 1 FROM sales_order_items WHERE id=ln->>'salesOrderItemId' AND body->'salesOrderIds' ? sales_order_id) THEN RAISE EXCEPTION 'Reservation outside selected PO'; END IF;
  END LOOP;
  FOR li IN SELECT * FROM sales_order_items WHERE body->'salesOrderIds' ? sales_order_id ORDER BY id FOR UPDATE LOOP
   SELECT coalesce(sum((x->>'qtyTarget')::numeric),0) INTO target FROM jsonb_array_elements(body->'items') x WHERE x->>'salesOrderId'=li.sales_order_id AND x->>'productId'=li.product_id;
   SELECT target+coalesce(sum((x->>'qty')::numeric),0) INTO target FROM jsonb_array_elements(body->'reservations') x WHERE x->>'salesOrderItemId'=li.id;
   SELECT coalesce(sum(greatest(0,qty_target-coalesce(qc_processed_qty,0))),0) INTO owned FROM purchase_items WHERE sales_order_id=li.sales_order_id AND product_id=li.product_id AND NOT is_qced;
   remaining:=greatest(0,li.qty-coalesce(li.qty_cancelled,0)-coalesce(li.qty_delivered,0)-coalesce(li.qty_final,0)-owned);
   IF target>remaining THEN RAISE EXCEPTION 'Stale demand; refresh PO quantities'; END IF;
  END LOOP;
  INSERT INTO purchases(id,date,purchaser_id,status,advance_code,shopping_list_document_id,shopping_list_compiled_by,purchase_request_id)
  VALUES(sid,at_text,'pending',CASE WHEN jsonb_array_length(body->'items')=0 THEN 'Selesai' ELSE 'Menunggu Rencana' END,body->>'advanceCode',sid,p_actor,nullif(body->>'purchaseRequestId',''));
  FOR ln IN SELECT value FROM jsonb_array_elements(body->'items') LOOP
   INSERT INTO purchase_items(id,purchase_id,product_id,sales_order_id,qty_target,estimated_unit_price)
   VALUES(ln->>'id',sid,ln->>'productId',nullif(ln->>'salesOrderId',''),(ln->>'qtyTarget')::numeric,(ln->>'estimatedUnitPrice')::numeric);
  END LOOP;
  FOR r IN SELECT si.sales_order_id,jsonb_agg(x ORDER BY si.id) AS lines FROM jsonb_array_elements(body->'reservations') x JOIN sales_order_items si ON si.id=x->>'salesOrderItemId' GROUP BY si.sales_order_id ORDER BY si.sales_order_id LOOP
   PERFORM process_goods_event(jsonb_build_object('eventId','reserve:'||eid||':'||r.sales_order_id,'stage','reserve','sourceId',r.sales_order_id,'payload',jsonb_build_object('lines',r.lines)),p_actor);
  END LOOP;
  UPDATE sales_orders order_row SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM purchase_items p WHERE p.sales_order_id=order_row.id AND p.qty_target>coalesce(p.qc_processed_qty,0) AND NOT p.is_qced) AND EXISTS(SELECT 1 FROM sales_order_items order_line WHERE order_line.sales_order_id=order_row.id AND order_line.qty_final>0) THEN 'Packing' ELSE 'Belanja' END,shopping_list_document_id=sid,shopping_list_compiled_at=at_text,shopping_list_compiled_by=p_actor WHERE body->'salesOrderIds' ? id;
  UPDATE rejected_items SET shopping_compiled_at=at_text WHERE id IN (SELECT jsonb_array_elements_text(coalesce(body->'rejectedIds','[]')));
 ELSIF stage='revise' THEN
  SELECT * INTO STRICT so FROM sales_orders WHERE id=sid;
  IF so.shopping_list_document_id IS NOT NULL THEN
   SELECT * INTO STRICT doc FROM purchases WHERE id=so.shopping_list_document_id FOR UPDATE;
   IF doc.status<>'Menunggu Rencana' THEN RAISE EXCEPTION 'Purchase plan released; PO revision locked'; END IF;
  ELSIF so.status NOT IN ('Draft','Pending Approval') THEN RAISE EXCEPTION 'PO revision locked'; END IF;
  PERFORM id FROM purchase_items WHERE purchase_id=doc.id ORDER BY id FOR UPDATE;
  SELECT * INTO STRICT so FROM sales_orders WHERE id=sid FOR UPDATE;
  IF doc.id IS DISTINCT FROM so.shopping_list_document_id THEN RAISE EXCEPTION 'Stale PO document; refresh first'; END IF;
  IF EXISTS(SELECT 1 FROM sales_order_items WHERE sales_order_id=sid AND is_packed) THEN RAISE EXCEPTION 'Packed PO revision locked'; END IF;
  IF jsonb_typeof(body->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'lines')=0 THEN RAISE EXCEPTION 'Revision lines required'; END IF;
  IF (SELECT count(*)<>count(DISTINCT value->>'id') FROM jsonb_array_elements(body->'lines')) THEN RAISE EXCEPTION 'Duplicate revision row'; END IF;
  note:='';
  FOR ln IN SELECT value FROM jsonb_array_elements(body->'lines') ORDER BY value->>'id' LOOP
   SELECT * INTO STRICT li FROM sales_order_items WHERE id=ln->>'id' AND sales_order_id=sid FOR UPDATE;
   qty:=goods_qty(ln->'qty'); price:=goods_qty(ln->'unitPrice');
   IF qty<=0 OR price<=0 THEN RAISE EXCEPTION 'Revision quantity and price must be positive'; END IF;
   IF li.qty IS DISTINCT FROM goods_qty(ln->'expectedQty') OR li.unit_price IS DISTINCT FROM goods_qty(ln->'expectedUnitPrice') THEN RAISE EXCEPTION 'Stale PO revision; refresh first'; END IF;
   IF qty<coalesce(li.qty_delivered,0)+coalesce(li.qty_cancelled,0)+coalesce(li.qty_final,0) THEN RAISE EXCEPTION 'Revision below delivered/reserved quantity'; END IF;
   delta:=qty-li.qty;
   IF doc.id IS NOT NULL AND delta<>0 THEN
    FOR pi IN SELECT * FROM purchase_items WHERE purchase_id=doc.id AND sales_order_id=sid AND product_id=li.product_id ORDER BY id FOR UPDATE LOOP
     IF pi.qty_purchased<>0 OR pi.is_qced THEN RAISE EXCEPTION 'Acquired purchase cannot be revised'; END IF;
     IF delta>0 THEN UPDATE purchase_items SET qty_target=qty_target+delta WHERE id=pi.id; delta:=0; EXIT;
     ELSE target:=least(-delta,pi.qty_target); UPDATE purchase_items SET qty_target=qty_target-target WHERE id=pi.id; delta:=delta+target; EXIT WHEN delta=0; END IF;
    END LOOP;
    IF delta>0 THEN INSERT INTO purchase_items(id,purchase_id,sales_order_id,product_id,qty_target,estimated_unit_price) VALUES('revision:'||eid||':'||li.id,doc.id,sid,li.product_id,delta,0); END IF;
    IF delta<0 THEN RAISE EXCEPTION 'Revision exceeds unreserved buy quantity'; END IF;
   END IF;
   UPDATE sales_order_items SET qty=qty,unit_price=price,subtotal=qty*price WHERE id=li.id;
   note:=note||li.product_id||' qty '||li.qty||' → '||qty||', harga '||li.unit_price||' → '||price||E'\n';
  END LOOP;
  IF doc.id IS NOT NULL THEN
   UPDATE purchases SET revised_at=at_text,revised_by=p_actor,revision_note=note||coalesce(revision_note,'') WHERE id=doc.id;
   INSERT INTO notifications(id,user_id,title,message,type,link,created_at)
   SELECT 'revision:'||eid||':'||id,id,'Daftar belanja berubah',coalesce(doc.advance_code,doc.id)||E'\n'||note,'system','/finance/purchase-plan',at_text FROM users WHERE role='finance';
  END IF;
 ELSIF stage IN ('plan-release','paper-release') THEN
  IF stage='plan-release' THEN
   SELECT * INTO STRICT doc FROM purchases WHERE id=sid FOR UPDATE;
   IF doc.status<>'Menunggu Rencana' THEN RAISE EXCEPTION 'Plan already released'; END IF;
   IF body ? 'expectedRevisedAt' AND nullif(body->>'expectedRevisedAt','') IS DISTINCT FROM nullif(doc.revised_at,'') THEN RAISE EXCEPTION 'PO revised since this plan was opened; refresh Finance plan'; END IF;
   FOR pi IN SELECT * FROM purchase_items WHERE purchase_id=sid ORDER BY id FOR UPDATE LOOP
    PERFORM goods_qty(to_jsonb(pi.qty_target)); PERFORM goods_qty(to_jsonb(pi.estimated_unit_price));
    IF pi.qty_target=0 THEN CONTINUE; END IF;
    IF pi.purchase_method IS NULL OR pi.purchase_method NOT IN ('Pasar','Vendor','Online','Dropship') OR pi.payment_method IS NULL OR pi.payment_method NOT IN ('Cash','Tempo','Transfer') OR (pi.purchase_method='Online' AND pi.payment_method<>'Transfer') OR (pi.purchase_method='Dropship' AND pi.payment_method='Cash') THEN RAISE EXCEPTION 'Unsupported purchase/payment combination'; END IF;
    IF pi.purchase_method<>'Pasar' AND pi.planned_vendor_id IS NULL THEN RAISE EXCEPTION 'Planned vendor required'; END IF;
    IF pi.payment_method='Cash' AND pi.estimated_unit_price<=0 THEN RAISE EXCEPTION 'Cash estimate required'; END IF;
   END LOOP;
   SELECT coalesce(sum(qty_target*estimated_unit_price),0) INTO cash FROM purchase_items WHERE purchase_id=sid AND payment_method='Cash' AND purchase_method IN ('Pasar','Vendor');
   UPDATE purchases SET status='Siap Cetak',budget_amount=cash,planned_by=p_actor,planned_at=at_text WHERE id=sid;
   UPDATE purchase_items SET qty_purchased=qty_target WHERE purchase_id=sid AND purchase_method IN ('Vendor','Dropship');
   UPDATE purchase_requests SET amount=cash WHERE id=doc.purchase_request_id AND disbursed_at IS NULL;
  ELSE
   IF jsonb_typeof(body->'purchaseIds') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'purchaseIds')=0 OR (SELECT count(*) FROM purchases WHERE body->'purchaseIds' ? id)<>jsonb_array_length(body->'purchaseIds') THEN RAISE EXCEPTION 'Exact released document selection required'; END IF;
   FOR doc IN SELECT * FROM purchases WHERE body->'purchaseIds' ? id ORDER BY id FOR UPDATE LOOP
    IF doc.status<>'Siap Cetak' THEN RAISE EXCEPTION 'Paper already released'; END IF;
    IF EXISTS(SELECT 1 FROM purchase_items WHERE purchase_id=doc.id AND purchase_method='Pasar' AND qty_target>0) AND (nullif(body->>'paperSessionId','') IS NULL OR doc.paper_session_id IS DISTINCT FROM body->>'paperSessionId') THEN RAISE EXCEPTION 'Print selected paper session before release'; END IF;
    UPDATE purchases SET status='Pending' WHERE id=doc.id;
   END LOOP;
  END IF;
 ELSIF stage='verify' THEN
  SELECT * INTO STRICT doc FROM purchases WHERE id=sid FOR UPDATE;
  PERFORM id FROM purchase_items WHERE purchase_id=sid ORDER BY id FOR UPDATE;
  PERFORM id FROM expenses WHERE purchase_id=sid OR reference_id IN(SELECT id FROM purchase_items WHERE purchase_id=sid) ORDER BY id FOR UPDATE;
  PERFORM id FROM reimbursements WHERE purchase_id=sid ORDER BY id FOR UPDATE;
  IF doc.status<>'Selesai' OR EXISTS(SELECT 1 FROM purchase_items WHERE purchase_id=sid AND qty_target>0 AND (qty_purchased<qty_target OR NOT is_qced)) THEN RAISE EXCEPTION 'All purchase allocations must be acquired and QC/delivery completed before verification'; END IF;
  -- Old online placeholders acknowledge a source posting; they never debit money again.
  UPDATE expenses x SET status='Approved',is_journaled=true,audit_date=now()::date::text
  WHERE x.category='Belanja Online' AND x.status='Pending Audit' AND EXISTS(SELECT 1 FROM purchase_items p JOIN financial_events f ON f.kind='online-purchase' AND f.payload->>'referenceId'=p.id WHERE p.purchase_id=sid AND p.id=x.reference_id AND p.is_online_audited AND (f.payload->>'amount')::numeric>=x.amount);
  IF EXISTS(SELECT 1 FROM expenses WHERE (purchase_id=sid OR reference_id IN(SELECT id FROM purchase_items WHERE purchase_id=sid)) AND (status NOT IN ('Approved','Rejected') OR (status='Approved' AND NOT is_journaled))) THEN RAISE EXCEPTION 'Resolve pending/unposted expenses before verification'; END IF;
  IF EXISTS(SELECT 1 FROM reimbursements WHERE purchase_id=sid AND status NOT IN ('Paid','Rejected')) THEN RAISE EXCEPTION 'Resolve pending reimbursements before verification'; END IF;
  IF EXISTS(SELECT 1 FROM expenses x WHERE x.purchase_id=sid AND x.status='Approved' AND x.category<>'Belanja Online' AND NOT EXISTS(SELECT 1 FROM financial_events f WHERE f.kind='expense' AND f.payload->>'referenceId'=x.id AND (f.payload->>'amount')::numeric>=x.amount)) THEN RAISE EXCEPTION 'Expense payment source is incomplete'; END IF;
  IF EXISTS(SELECT 1 FROM reimbursements x WHERE x.purchase_id=sid AND x.status='Paid' AND NOT EXISTS(SELECT 1 FROM financial_events f WHERE f.kind='reimbursement' AND f.payload->>'referenceId'=x.id AND (f.payload->>'amount')::numeric>=x.amount)) THEN RAISE EXCEPTION 'Reimbursement payment source is incomplete'; END IF;
  FOR r IN SELECT vendor_id,sum((CASE WHEN purchase_method='Dropship' THEN coalesce(inbound_qty_received,0) ELSE qty_purchased END)*actual_unit_price) AS due FROM purchase_items WHERE purchase_id=sid AND (payment_method='Tempo' OR (payment_method='Transfer' AND purchase_method IN('Vendor','Dropship'))) GROUP BY vendor_id LOOP
   SELECT coalesce(sum(total_amount),0) INTO amount FROM vendor_bills vb WHERE vb.purchase_id=sid AND vb.vendor_id=r.vendor_id AND vb.status<>'Cancelled' AND EXISTS(SELECT 1 FROM journal_lines jl JOIN coas c ON c.id=jl.account_id WHERE jl.vendor_bill_id=vb.id AND c.account_code='2-1000' AND jl.credit_amount>=vb.total_amount);
   IF round(amount,2)<round(r.due,2) THEN RAISE EXCEPTION 'Purchase AP source is incomplete'; END IF;
  END LOOP;
  FOR r IN SELECT vendor_id,sum((CASE WHEN purchase_method='Dropship' THEN coalesce(inbound_qty_received,0) ELSE qty_purchased END)*actual_unit_price) AS due FROM purchase_items WHERE purchase_id=sid AND payment_method='Transfer' AND purchase_method IN('Vendor','Dropship') GROUP BY vendor_id LOOP
   SELECT coalesce(sum(vb.amount_paid),0) INTO amount FROM vendor_bills vb WHERE vb.purchase_id=sid AND vb.vendor_id=r.vendor_id AND vb.status<>'Cancelled' AND EXISTS(SELECT 1 FROM goods_events g WHERE left(vb.id,length(g.id)+5)=g.id||':bill' AND ((g.stage='qc' AND g.source_id IN(SELECT id FROM purchase_items WHERE purchase_id=sid AND purchase_method='Vendor' AND payment_method='Transfer')) OR (g.stage='dropship' AND EXISTS(SELECT 1 FROM jsonb_array_elements(g.payload->'lines') x WHERE x->>'purchaseItemId' IN(SELECT id FROM purchase_items WHERE purchase_id=sid AND purchase_method='Dropship' AND payment_method='Transfer')))));
   IF round(amount,2)<round(r.due,2) THEN RAISE EXCEPTION 'Transfer vendor bill source is not fully paid'; END IF;
  END LOOP;
  SELECT coalesce(sum(CASE WHEN p.purchase_method='Online' THEN coalesce((SELECT sum((f.payload->>'amount')::numeric) FROM financial_events f WHERE f.kind='online-purchase' AND f.payload->>'referenceId'=p.id),p.qty_purchased*p.actual_unit_price) ELSE p.qty_purchased*p.actual_unit_price END),0) INTO cash FROM purchase_items p WHERE p.purchase_id=sid AND p.payment_method IN ('Cash','Transfer') AND NOT (p.payment_method='Transfer' AND p.purchase_method IN ('Vendor','Dropship'));
  SELECT coalesce(sum(c.amount),0) INTO amount FROM cash_transactions c WHERE c.type='Out' AND (
   EXISTS(SELECT 1 FROM financial_events f WHERE c.id='financial:'||f.id||':out' AND (f.payload->>'referenceId'=sid OR f.payload->>'referenceId' IN(SELECT id FROM purchase_items WHERE purchase_id=sid)))
   OR EXISTS(SELECT 1 FROM goods_events g WHERE c.id=g.id||':cash' AND (g.source_id IN(SELECT id FROM purchase_items WHERE purchase_id=sid) OR (g.stage='dropship' AND EXISTS(SELECT 1 FROM jsonb_array_elements(g.payload->'lines') x WHERE x->>'purchaseItemId' IN(SELECT id FROM purchase_items WHERE purchase_id=sid)))))
  );
  IF round(amount,2)<round(cash,2) THEN RAISE EXCEPTION 'Purchase cash/transfer source is incomplete'; END IF;
  UPDATE purchases SET reconciliation_status='Terverifikasi' WHERE id=sid;
 ELSIF stage IN ('report','online','vendor-order') THEN
  IF stage='report' THEN
   IF jsonb_typeof(body->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'lines')=0 THEN RAISE EXCEPTION 'Purchase allocations required'; END IF;
   IF nullif(body->>'onBehalfOfUserId','') IS NULL OR nullif(body->>'occurredAt','') IS NULL THEN RAISE EXCEPTION 'Paper performer/time required'; END IF;
   IF (SELECT count(*)<>count(DISTINCT value->>'id') FROM jsonb_array_elements(body->'lines')) THEN RAISE EXCEPTION 'Duplicate purchase allocation'; END IF;
   PERFORM id FROM purchases WHERE id IN (SELECT value->>'purchaseId' FROM jsonb_array_elements(body->'lines')) ORDER BY id FOR UPDATE;
   PERFORM id FROM purchase_items WHERE id IN (SELECT value->>'id' FROM jsonb_array_elements(body->'lines')) ORDER BY id FOR UPDATE;
   -- Validate every allocation before posting any money; transaction also rolls back later faults.
   FOR ln IN SELECT value FROM jsonb_array_elements(body->'lines') LOOP
    SELECT * INTO STRICT pi FROM purchase_items WHERE id=ln->>'id' AND purchase_id=ln->>'purchaseId' AND product_id=ln->>'productId';
    SELECT * INTO STRICT doc FROM purchases WHERE id=pi.purchase_id;
    IF NOT (body->'purchaseIds' ? doc.id) OR doc.status NOT IN ('Pending','Belanja') OR coalesce(pi.purchase_method,'Pasar')<>'Pasar' OR pi.is_qced THEN RAISE EXCEPTION 'Allocation outside selected open market paper'; END IF;
    qty:=goods_qty(ln->'qtyPurchased'); price:=goods_qty(ln->'actualUnitPrice');
    IF qty<=0 OR qty+pi.qty_purchased>pi.qty_target OR price<=0 OR NOT coalesce((ln->>'isChecked')::boolean,false) THEN RAISE EXCEPTION 'Invalid or stale purchased quantity/price'; END IF;
    IF NOT EXISTS(SELECT 1 FROM vendors WHERE id=ln->>'vendorId') THEN RAISE EXCEPTION 'Actual vendor required'; END IF;
    IF coalesce(ln->>'paymentMethod','Cash') NOT IN ('Cash','Transfer','Tempo') THEN RAISE EXCEPTION 'Unsupported payment method'; END IF;
   END LOOP;
   -- Common bank lock order across all money legs avoids cash/transfer lock inversions.
   PERFORM id FROM bank_accounts WHERE id IN (body->>'pocketBankAccountId',body->>'transferBankAccountId') ORDER BY id FOR UPDATE;
   FOR r IN SELECT value->>'purchaseId' AS id FROM jsonb_array_elements(body->'lines') GROUP BY value->>'purchaseId' ORDER BY 1 LOOP
    SELECT coalesce(sum((x->>'qtyPurchased')::numeric*(x->>'actualUnitPrice')::numeric) FILTER(WHERE coalesce(x->>'paymentMethod','Cash')='Cash'),0),coalesce(sum((x->>'qtyPurchased')::numeric*(x->>'actualUnitPrice')::numeric) FILTER(WHERE x->>'paymentMethod'='Transfer'),0) INTO cash,transfer FROM jsonb_array_elements(body->'lines') x WHERE x->>'purchaseId'=r.id;
    IF cash>0 THEN PERFORM post_financial_event(jsonb_build_object('eventId','paper-cash:'||eid||':'||r.id,'kind','cash-posting','date',(at_text::timestamptz AT TIME ZONE 'Asia/Jakarta')::date::text,'bankAccountId',body->>'pocketBankAccountId','amount',round(cash,2),'debitAccountCode','2-1100','referenceType','Purchase','referenceId',r.id,'category','Belanja Sourcing','description','Kertas '||eid),p_actor); END IF;
    IF transfer>0 THEN PERFORM post_financial_event(jsonb_build_object('eventId','paper-transfer:'||eid||':'||r.id,'kind','cash-posting','date',(at_text::timestamptz AT TIME ZONE 'Asia/Jakarta')::date::text,'bankAccountId',body->>'transferBankAccountId','amount',round(transfer,2),'debitAccountCode','2-1100','referenceType','Purchase','referenceId',r.id,'category','Belanja Transfer','description','Kertas '||eid),p_actor); END IF;
   END LOOP;
   FOR ln IN SELECT value FROM jsonb_array_elements(body->'lines') LOOP
    SELECT * INTO STRICT pi FROM purchase_items WHERE id=ln->>'id'; qty:=(ln->>'qtyPurchased')::numeric; price:=(ln->>'actualUnitPrice')::numeric;
    IF qty+pi.qty_purchased<pi.qty_target OR pi.qty_purchased>0 THEN
     child:='allocation:'||eid||':'||pi.id;
     INSERT INTO purchase_items(id,purchase_id,product_id,sales_order_id,qty_target,qty_purchased,estimated_unit_price,actual_unit_price,is_checked,purchase_method,payment_method,vendor_id,planned_vendor_id,notes,over_ceiling_reason,report_event_ids)
     VALUES(child,pi.purchase_id,pi.product_id,pi.sales_order_id,qty,qty,pi.estimated_unit_price,price,true,'Pasar',coalesce(ln->>'paymentMethod','Cash'),ln->>'vendorId',pi.planned_vendor_id,ln->>'notes',ln->>'overCeilingReason',jsonb_build_array(eid));
     UPDATE purchase_items SET qty_target=qty_target-qty,report_event_ids=coalesce(report_event_ids,'[]')||jsonb_build_array(eid) WHERE id=pi.id;
    ELSE
     UPDATE purchase_items SET qty_purchased=qty,is_checked=true,actual_unit_price=price,vendor_id=ln->>'vendorId',payment_method=coalesce(ln->>'paymentMethod','Cash'),notes=ln->>'notes',over_ceiling_reason=ln->>'overCeilingReason',report_event_ids=coalesce(report_event_ids,'[]')||jsonb_build_array(eid) WHERE id=pi.id;
    END IF;
   END LOOP;
   IF jsonb_typeof(coalesce(body->'expenses','[]')) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Expense rows must be an array'; END IF;
   FOR ln IN SELECT value FROM jsonb_array_elements(coalesce(body->'expenses','[]')) LOOP
    amount:=goods_qty(ln->'amount');
    IF amount<=0 OR round(amount,2)<>amount OR nullif(ln->>'id','') IS NULL OR ln->>'reporterId' IS DISTINCT FROM body->>'onBehalfOfUserId' OR (ln->>'date')::timestamptz IS DISTINCT FROM at_text::timestamptz THEN RAISE EXCEPTION 'Expense amount/performer/time must match paper'; END IF;
    IF NOT (body->'purchaseIds' ? (ln->>'purchaseId')) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(body->'lines') x WHERE x->>'purchaseId'=ln->>'purchaseId') THEN RAISE EXCEPTION 'Expense outside selected paper'; END IF;
    IF NOT EXISTS(SELECT 1 FROM bank_accounts WHERE id=ln->>'sourceBankAccountId' AND nullif(account_code,'') IS NOT NULL) THEN RAISE EXCEPTION 'Select mapped bank for each paper expense'; END IF;
    IF ln->>'category' NOT IN ('Bensin','Tol','Parkir','Kuli','Makan','Lainnya') OR nullif(trim(ln->>'description'),'') IS NULL THEN RAISE EXCEPTION 'Expense category/description required'; END IF;
    INSERT INTO expenses(id,date,reporter_id,category,amount,description,receipt_url,status,purchase_id,source_bank_account_id,recorded_by,recorded_at,performed_by,channel,reference_id)
    VALUES(ln->>'id',at_text,body->>'onBehalfOfUserId',ln->>'category',amount,ln->>'description',ln->>'receiptUrl','Pending Audit',ln->>'purchaseId',ln->>'sourceBankAccountId',p_actor,now(),body->>'onBehalfOfUserId','sourcing',eid);
   END LOOP;
   FOR doc IN SELECT * FROM purchases WHERE id IN (SELECT value->>'purchaseId' FROM jsonb_array_elements(body->'lines')) LOOP
    SELECT coalesce(sum(CASE WHEN purchase_method='Online' THEN coalesce((SELECT sum((f.payload->>'amount')::numeric) FROM financial_events f WHERE f.kind='online-purchase' AND f.payload->>'referenceId'=purchase_items.id),qty_purchased*actual_unit_price) ELSE qty_purchased*actual_unit_price END),0),coalesce(sum(qty_purchased*actual_unit_price) FILTER(WHERE payment_method='Cash' AND purchase_method<>'Online'),0),count(*) FILTER(WHERE qty_purchased<qty_target OR (purchase_method IN ('Vendor','Online','Dropship') AND NOT is_online_ordered)) INTO amount,cash,remaining FROM purchase_items WHERE purchase_id=doc.id;
    UPDATE purchases SET status=CASE WHEN remaining=0 THEN 'Selesai' ELSE 'Belanja' END,actual_spent=amount,expected_remainder=greatest(0,coalesce(disbursed_amount,budget_amount,0)+coalesce(operational_spare_amount,0)-cash),purchaser_id=body->>'onBehalfOfUserId',paper_performer_id=body->>'onBehalfOfUserId',paper_occurred_at=at_text,paper_recorded_at=now()::text,reconciliation_note=body->>'reconciliationNote',reconciliation_proof_url=body->>'proofImage',reconciliation_status=CASE WHEN remaining=0 THEN 'Laporan Masuk' ELSE reconciliation_status END WHERE id=doc.id;
   END LOOP;
  ELSE
   SELECT * INTO STRICT pi FROM purchase_items WHERE id=sid;
   SELECT * INTO STRICT doc FROM purchases WHERE id=pi.purchase_id FOR UPDATE;
   SELECT * INTO STRICT pi FROM purchase_items WHERE id=sid FOR UPDATE;
   IF doc.status NOT IN ('Pending','Belanja') OR pi.is_online_ordered THEN RAISE EXCEPTION 'Order already recorded or not released'; END IF;
   price:=goods_qty(body->'unitPrice'); IF price<=0 THEN RAISE EXCEPTION 'Actual unit price required'; END IF;
   IF NOT EXISTS(SELECT 1 FROM vendors WHERE id=coalesce(pi.planned_vendor_id,pi.vendor_id)) THEN RAISE EXCEPTION 'Actual order vendor required'; END IF;
   IF stage='online' THEN
    IF pi.purchase_method<>'Online' OR pi.payment_method<>'Transfer' THEN RAISE EXCEPTION 'Online requires Transfer'; END IF;
    cash:=goods_qty(body->'adminFee'); transfer:=goods_qty(body->'shippingFee'); amount:=round(pi.qty_target*price+cash+transfer,2);
    IF amount<=0 THEN RAISE EXCEPTION 'Positive online total required'; END IF;
    PERFORM post_financial_event(jsonb_build_object('eventId','online:'||eid,'kind','online-purchase','date',(at_text::timestamptz AT TIME ZONE 'Asia/Jakarta')::date::text,'bankAccountId',body->>'bankAccountId','amount',amount,'adminFee',cash,'shippingFee',transfer,'referenceType','Purchase','referenceId',pi.id,'category','Belanja Online','description','Order online '||eid),p_actor);
   ELSE
    IF pi.purchase_method NOT IN ('Vendor','Dropship') OR (pi.purchase_method='Dropship' AND pi.payment_method='Cash') THEN RAISE EXCEPTION 'Unsupported vendor order/payment'; END IF;
    IF pi.payment_method='Cash' THEN PERFORM post_financial_event(jsonb_build_object('eventId','vendor-cash:'||eid,'kind','cash-posting','date',(at_text::timestamptz AT TIME ZONE 'Asia/Jakarta')::date::text,'bankAccountId',body->>'bankAccountId','amount',round(pi.qty_target*price,2),'debitAccountCode','2-1100','referenceType','Purchase','referenceId',pi.purchase_id,'category','Belanja Sourcing','description','Order vendor tunai '||eid),p_actor); END IF;
   END IF;
   UPDATE purchase_items SET is_online_ordered=true,qty_purchased=qty_target,actual_unit_price=price,online_order_date=at_text,online_ref=body->>'ref',vendor_id=coalesce(planned_vendor_id,vendor_id) WHERE id=pi.id;
   SELECT coalesce(sum(CASE WHEN purchase_method='Online' THEN coalesce((SELECT sum((f.payload->>'amount')::numeric) FROM financial_events f WHERE f.kind='online-purchase' AND f.payload->>'referenceId'=purchase_items.id),qty_purchased*actual_unit_price) ELSE qty_purchased*actual_unit_price END),0),count(*) FILTER(WHERE qty_purchased<qty_target OR (purchase_method IN ('Vendor','Online','Dropship') AND NOT is_online_ordered)) INTO amount,remaining FROM purchase_items WHERE purchase_id=doc.id;
   UPDATE purchases SET actual_spent=amount,status=CASE WHEN remaining=0 THEN 'Selesai' ELSE 'Belanja' END,reconciliation_status=CASE WHEN remaining=0 THEN 'Laporan Masuk' ELSE reconciliation_status END WHERE id=doc.id;

  END IF;
 ELSE RAISE EXCEPTION 'Unsupported purchasing stage';
 END IF;
 INSERT INTO purchase_events(id,stage,source_id,payload,recorded_by,result) VALUES(eid,stage,sid,body,p_actor,result);
 RETURN result||jsonb_build_object('updates',purchase_snapshot(eid));
END $$;
REVOKE ALL ON FUNCTION public.process_purchase_event(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_purchase_event(jsonb,text) TO service_role;
COMMIT;

-- PREPARED ONLY. Deploy authenticated API bridges and migrate browser callers
-- before applying this privilege change. Public keys must never invoke these.
BEGIN;
DO $$
DECLARE routine record;
BEGIN
 FOR routine IN
  SELECT p.oid::regprocedure AS signature
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
   'post_journal_entry','post_cash_transaction','generate_vendor_bill_number',
   'issue_tukar_faktur','link_invoices_to_tukar_faktur','delete_tukar_faktur',
   'record_client_receipt','post_financial_event','process_goods_event','take_auth_login_attempt'
  )
 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',routine.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',routine.signature);
 END LOOP;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."issue_tukar_faktur"("p_tf_id" "uuid", "p_invoice_ids" "text"[], "p_issue_date" "date", "p_user_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_client_id text;
  v_status text;
  v_tf public.tukar_faktur%rowtype;
  v_linked text[];
  v_total numeric := 0;
  v_inv record;
begin
  select * into v_tf from public.tukar_faktur where id=p_tf_id for update;
  v_client_id:=v_tf.client_id; v_status:=v_tf.status;
  if v_client_id is null then
    raise exception 'tukar_faktur % not found', p_tf_id;
  end if;

  if coalesce(array_length(p_invoice_ids,1),0)=0 then raise exception 'No invoices selected'; end if;
  if v_status <> 'Draft' then
    select array_agg(id order by id) into v_linked from public.invoices where tukar_faktur_id=p_tf_id;
    if v_status in ('Issued','Received','Paid') and v_tf.issue_date=p_issue_date and v_linked=(select array_agg(id order by id) from unnest(p_invoice_ids) as ids(id)) then
      return jsonb_build_object('ok',true,'replayed',true,'tf_id',p_tf_id,'total',v_tf.total_amount,'invoice_count',cardinality(v_linked),'tf',to_jsonb(v_tf),'invoices',(select jsonb_agg(to_jsonb(i)) from public.invoices i where i.tukar_faktur_id=p_tf_id));
    end if;
    raise exception 'TF issue payload conflict';
  end if;
  if (select count(distinct id) from public.invoices where id=any(p_invoice_ids)) <> cardinality(p_invoice_ids) then raise exception 'Missing or duplicate invoice IDs'; end if;
  if exists(select 1 from public.invoices where tukar_faktur_id=p_tf_id and not(id=any(p_invoice_ids))) then raise exception 'Draft invoice membership differs from selected invoices'; end if;


  for v_inv in
    select *
    from public.invoices
    where id = any(p_invoice_ids)
    for update
  loop
    if v_inv.tukar_faktur_id is not null and v_inv.tukar_faktur_id <> p_tf_id then
      raise exception 'Invoice % sudah di TF lain (%).', v_inv.id, v_inv.tukar_faktur_id;
    end if;
    if v_inv.client_id <> v_client_id then
      raise exception 'Invoice % bukan milik klien TF ini.', v_inv.id;
    end if;
    if v_inv.status not in ('Unpaid','Partial') or v_inv.total_amount <= coalesce(v_inv.amount_paid,0)
       or v_inv.is_consolidated or v_inv.superseded_by_invoice_id is not null
       or exists(select 1 from public.invoices summary where summary.is_consolidated and summary.sales_order_ids ? v_inv.sales_order_id)
    then raise exception 'Invoice % is not eligible for TF',v_inv.id; end if;
    v_total := v_total + coalesce(v_inv.total_amount, 0);
  end loop;

  update public.invoices
     set tukar_faktur_id = p_tf_id
   where id = any(p_invoice_ids);

  update public.tukar_faktur
     set status = 'Issued',
         issue_date = p_issue_date,
         issued_by = p_user_id,
         total_amount = v_total
   where id = p_tf_id;

  return jsonb_build_object('ok', true, 'tf_id', p_tf_id, 'total', v_total, 'invoice_count', array_length(p_invoice_ids, 1),'tf',(select to_jsonb(t) from public.tukar_faktur t where t.id=p_tf_id),'invoices',(select jsonb_agg(to_jsonb(i)) from public.invoices i where i.tukar_faktur_id=p_tf_id));
end;
$$;

CREATE OR REPLACE FUNCTION "public"."delete_tukar_faktur"("p_tf_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_status text;
  v_client_id text;
begin
  select status, client_id into v_status, v_client_id
    from public.tukar_faktur where id = p_tf_id for update;
  if v_status is null then
    raise exception 'tukar_faktur % not found', p_tf_id;
  end if;
  if v_status <> 'Draft' then
    raise exception 'TF status % tidak bisa dihapus (hanya Draft).', v_status;
  end if;


  update public.invoices
     set tukar_faktur_id = null
   where tukar_faktur_id = p_tf_id;

  delete from public.tukar_faktur where id = p_tf_id;
  return jsonb_build_object('ok', true);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."link_invoices_to_tukar_faktur"("p_tf_id" "uuid", "p_invoice_ids" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_client_id text;
  v_status text;
  v_total numeric := 0;
  v_inv record;
begin
  select client_id, status into v_client_id, v_status
    from public.tukar_faktur where id = p_tf_id for update;
  if v_client_id is null then
    raise exception 'tukar_faktur % not found', p_tf_id;
  end if;
  if v_status <> 'Draft' then
    raise exception 'TF % bukan Draft (status=%). Pakai issue_tukar_faktur.', p_tf_id, v_status;
  end if;

  if coalesce(array_length(p_invoice_ids,1),0)=0 then raise exception 'No invoices selected'; end if;
  if (select count(distinct id) from public.invoices where id=any(p_invoice_ids)) <> cardinality(p_invoice_ids) then raise exception 'Missing or duplicate invoice IDs'; end if;

  for v_inv in
    select *
    from public.invoices
    where id = any(p_invoice_ids)
    for update
  loop
    if v_inv.tukar_faktur_id is not null and v_inv.tukar_faktur_id <> p_tf_id then
      raise exception 'Invoice % sudah di TF lain (%).', v_inv.id, v_inv.tukar_faktur_id;
    end if;
    if v_inv.client_id <> v_client_id then
      raise exception 'Invoice % bukan milik klien TF ini.', v_inv.id;
    end if;
    if v_inv.status not in ('Unpaid','Partial') or v_inv.total_amount <= coalesce(v_inv.amount_paid,0)
       or v_inv.is_consolidated or v_inv.superseded_by_invoice_id is not null
       or exists(select 1 from public.invoices summary where summary.is_consolidated and summary.sales_order_ids ? v_inv.sales_order_id)
    then raise exception 'Invoice % is not eligible for TF',v_inv.id; end if;
    v_total := v_total + coalesce(v_inv.total_amount, 0);
  end loop;

  update public.invoices set tukar_faktur_id=null where tukar_faktur_id=p_tf_id and not(id=any(p_invoice_ids));

  update public.invoices
     set tukar_faktur_id = p_tf_id
   where id = any(p_invoice_ids);

  update public.tukar_faktur
     set total_amount = v_total
   where id = p_tf_id;

  return jsonb_build_object('ok', true, 'tf_id', p_tf_id, 'total', v_total, 'invoice_count', array_length(p_invoice_ids, 1));
end;
$$;


-- Generic REST edits serialize with compiled purchase/goods commands by locking
-- the parent PO/document. SECURITY DEFINER source commands retain their owner's
-- authority; the direct service-role REST path must obey these edit boundaries.
CREATE OR REPLACE FUNCTION public.guard_generic_business_edit() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE parent public.sales_orders%rowtype; old_parent public.sales_orders%rowtype; doc public.purchases%rowtype;
BEGIN
 IF current_user NOT IN ('service_role','anon','authenticated') THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='sales_order_items' THEN
  IF TG_OP='UPDATE' THEN
   PERFORM id FROM public.sales_orders WHERE id IN(OLD.sales_order_id,NEW.sales_order_id) ORDER BY id FOR UPDATE;
   SELECT * INTO STRICT old_parent FROM public.sales_orders WHERE id=OLD.sales_order_id;
   IF (old_parent.shopping_list_document_id IS NOT NULL OR old_parent.shopping_list_compiled_at IS NOT NULL OR old_parent.status NOT IN ('Draft','Pending Approval')) AND
    (NEW.qty,NEW.unit_price,NEW.subtotal,NEW.product_id,NEW.sales_order_id) IS DISTINCT FROM (OLD.qty,OLD.unit_price,OLD.subtotal,OLD.product_id,OLD.sales_order_id) THEN RAISE EXCEPTION 'Use PO revision command'; END IF;
  END IF;
  SELECT * INTO STRICT parent FROM public.sales_orders WHERE id=NEW.sales_order_id FOR UPDATE;
  IF TG_OP='INSERT' THEN
   IF parent.status NOT IN ('Draft','Pending Approval') OR parent.shopping_list_document_id IS NOT NULL THEN RAISE EXCEPTION 'Use purchase compile command'; END IF;
  ELSE
   IF (parent.shopping_list_document_id IS NOT NULL OR parent.shopping_list_compiled_at IS NOT NULL OR parent.status NOT IN ('Draft','Pending Approval')) AND
    (NEW.qty,NEW.unit_price,NEW.subtotal,NEW.product_id,NEW.sales_order_id) IS DISTINCT FROM (OLD.qty,OLD.unit_price,OLD.subtotal,OLD.product_id,OLD.sales_order_id) THEN RAISE EXCEPTION 'Use PO revision command'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='purchase_items' THEN
  IF TG_OP='INSERT' THEN RAISE EXCEPTION 'Use purchase compile command'; END IF;
  SELECT * INTO STRICT doc FROM public.purchases WHERE id=OLD.purchase_id FOR UPDATE;
  IF doc.status<>'Menunggu Rencana' AND
   (to_jsonb(NEW)-'notes') IS DISTINCT FROM (to_jsonb(OLD)-'notes') THEN RAISE EXCEPTION 'Purchase planning is closed'; END IF;
 ELSIF TG_TABLE_NAME='reimbursements' THEN
  IF TG_OP='INSERT' THEN RAISE EXCEPTION 'Use paper expense source command'; END IF;
  IF TG_OP='UPDATE' THEN
   IF (NEW.status='Paid' AND OLD.status<>'Paid') OR (OLD.status='Paid' AND (to_jsonb(NEW)-ARRAY['description','title','receipt_url','audit_note']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['description','title','receipt_url','audit_note'])) THEN RAISE EXCEPTION 'Posted reimbursement is immutable'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='expenses' THEN
  IF TG_OP='INSERT' THEN RAISE EXCEPTION 'Use paper expense source command'; END IF;
  IF TG_OP='UPDATE' THEN
   IF ((NEW.status='Approved' OR coalesce(NEW.is_journaled,false)) AND OLD.status<>'Approved' AND NOT coalesce(OLD.is_journaled,false)) OR ((OLD.status='Approved' OR coalesce(OLD.is_journaled,false)) AND (to_jsonb(NEW)-ARRAY['description','notes','receipt_url','audit_note']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['description','notes','receipt_url','audit_note'])) THEN RAISE EXCEPTION 'Posted expense is immutable'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='tukar_faktur' THEN
  IF TG_OP='INSERT' THEN
   IF NEW.status<>'Draft' THEN RAISE EXCEPTION 'Use TF issue command'; END IF;
  ELSE
   IF OLD.status<>'Draft' AND (NEW.tf_number,NEW.client_id,NEW.period_start,NEW.period_end,NEW.issue_date,NEW.total_amount) IS DISTINCT FROM (OLD.tf_number,OLD.client_id,OLD.period_start,OLD.period_end,OLD.issue_date,OLD.total_amount) THEN RAISE EXCEPTION 'Published TF is immutable'; END IF;
   IF NEW.status IS DISTINCT FROM OLD.status AND NOT(OLD.status='Issued' AND NEW.status='Received') THEN RAISE EXCEPTION 'TF status changed while recording receipt'; END IF;
   IF OLD.status IN('Received','Paid') AND (NEW.received_by,NEW.received_at,NEW.received_proof_url) IS DISTINCT FROM (OLD.received_by,OLD.received_at,OLD.received_proof_url) THEN RAISE EXCEPTION 'TF receipt evidence is immutable'; END IF;
   IF OLD.status='Issued' AND NEW.status='Received' AND
    (nullif(trim(NEW.received_by),'') IS NULL OR nullif(trim(NEW.received_proof_url),'') IS NULL OR NEW.received_at IS NULL OR NOT isfinite(NEW.received_at) OR NEW.received_at::date<NEW.issue_date) THEN RAISE EXCEPTION 'Actual TF receipt PIC, date and proof are required'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='bank_accounts' AND TG_OP='UPDATE' THEN
  IF NEW.account_code IS DISTINCT FROM OLD.account_code AND (NEW.account_code IS NULL OR NEW.account_code !~ '^1-1[0-9]{3}$' OR EXISTS(SELECT 1 FROM public.cash_transactions WHERE bank_account_id=OLD.id) OR EXISTS(SELECT 1 FROM public.journal_lines l JOIN public.coas a ON a.id=l.account_id WHERE a.account_code=OLD.account_code)) THEN RAISE EXCEPTION 'Bank account mapping is immutable after posting'; END IF;
 ELSIF TG_TABLE_NAME='purchase_requests' AND TG_OP='UPDATE' THEN
  IF OLD.approved_by_cfo IS NOT NULL AND NEW.approved_by_cfo IS DISTINCT FROM OLD.approved_by_cfo AND EXISTS(SELECT 1 FROM public.users WHERE id=OLD.approved_by_cfo AND role='super_admin' AND is_active=true) THEN RAISE EXCEPTION 'CFO approval is immutable'; END IF;
 ELSIF TG_TABLE_NAME='sales_orders' AND TG_OP='UPDATE' THEN
  IF (OLD.shopping_list_document_id IS NOT NULL OR OLD.shopping_list_compiled_at IS NOT NULL) AND
   (NEW.status,NEW.client_id,NEW.po_number,NEW.target_delivery_date,NEW.order_date) IS DISTINCT FROM
   (OLD.status,OLD.client_id,OLD.po_number,OLD.target_delivery_date,OLD.order_date) THEN RAISE EXCEPTION 'Use source command for compiled PO'; END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_generic_business_edit() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_generic_business_edit ON public.sales_order_items;
CREATE TRIGGER guard_generic_business_edit BEFORE INSERT OR UPDATE ON public.sales_order_items FOR EACH ROW EXECUTE FUNCTION public.guard_generic_business_edit();
DROP TRIGGER IF EXISTS guard_generic_business_edit ON public.purchase_items;
CREATE TRIGGER guard_generic_business_edit BEFORE INSERT OR UPDATE ON public.purchase_items FOR EACH ROW EXECUTE FUNCTION public.guard_generic_business_edit();
DROP TRIGGER IF EXISTS guard_generic_business_edit ON public.sales_orders;
CREATE TRIGGER guard_generic_business_edit BEFORE UPDATE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.guard_generic_business_edit();

DROP TRIGGER IF EXISTS guard_generic_business_edit ON public.bank_accounts;
CREATE TRIGGER guard_generic_business_edit BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.guard_generic_business_edit();
DROP TRIGGER IF EXISTS guard_generic_business_edit ON public.purchase_requests;
CREATE TRIGGER guard_generic_business_edit BEFORE UPDATE ON public.purchase_requests FOR EACH ROW EXECUTE FUNCTION public.guard_generic_business_edit();
-- Abort rollout on ambiguous active office PINs; never silently replace credentials.
CREATE UNIQUE INDEX IF NOT EXISTS users_active_login_pin_key ON public.users(pin)
 WHERE role IN ('admin_po','finance','super_admin') AND is_active=true;

DROP TRIGGER IF EXISTS guard_generic_business_edit ON public.reimbursements;
CREATE TRIGGER guard_generic_business_edit BEFORE INSERT OR UPDATE ON public.reimbursements FOR EACH ROW EXECUTE FUNCTION public.guard_generic_business_edit();
DROP TRIGGER IF EXISTS guard_generic_business_edit ON public.expenses;
CREATE TRIGGER guard_generic_business_edit BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.guard_generic_business_edit();

DROP TRIGGER IF EXISTS guard_generic_business_edit ON public.tukar_faktur;
CREATE TRIGGER guard_generic_business_edit BEFORE INSERT OR UPDATE ON public.tukar_faktur FOR EACH ROW EXECUTE FUNCTION public.guard_generic_business_edit();
COMMIT;

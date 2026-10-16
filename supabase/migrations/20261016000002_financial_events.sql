BEGIN;
-- Authoritative receipts. Apply only after reviewing/testing against a backup.
-- Each RPC invocation is one PostgreSQL transaction, including all linked facts.
CREATE TABLE IF NOT EXISTS public.client_receipts (
  id text PRIMARY KEY,
  date text NOT NULL,
  bank_account_id text NOT NULL REFERENCES public.bank_accounts(id),
  client_id text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0 AND amount <> 'NaN'::numeric),
  payload jsonb NOT NULL,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_receipts ADD COLUMN IF NOT EXISTS tf_states jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS public.client_receipt_allocations (
  receipt_id text NOT NULL REFERENCES public.client_receipts(id),
  invoice_id text NOT NULL REFERENCES public.invoices(id),
  amount numeric NOT NULL CHECK (amount > 0 AND amount <> 'NaN'::numeric),
  PRIMARY KEY (receipt_id, invoice_id)
);
ALTER TABLE public.client_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_receipt_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_receipts, public.client_receipt_allocations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.client_receipts, public.client_receipt_allocations TO service_role;

CREATE OR REPLACE FUNCTION public.record_client_receipt(p_receipt jsonb, p_recorded_by text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id text; v_date text; v_bank_id text; v_amount numeric;
  v_allocations jsonb; v_payload jsonb; v_existing public.client_receipts%rowtype;
  v_invoice public.invoices%rowtype; v_bank public.bank_accounts%rowtype;
  v_allocation record; v_client text; v_count int; v_total numeric;
  v_bank_coa text; v_ar_coa text; v_entry_id text; v_cash_id text;
  v_inserted boolean := false;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_recorded_by AND u.role IN ('finance','super_admin') AND coalesce((to_jsonb(u)->>'is_active')::boolean,true)) THEN RAISE EXCEPTION 'Finance role required for financial posting'; END IF;
  IF jsonb_typeof(p_receipt) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Receipt must be an object'; END IF;
  IF jsonb_typeof(p_receipt->'paymentId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_receipt->'date') IS DISTINCT FROM 'string' OR jsonb_typeof(p_receipt->'bankAccountId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Payment ID, date and bank must be strings'; END IF;
  v_id := nullif(trim(p_receipt->>'paymentId'), '');
  v_date := nullif(trim(p_receipt->>'date'), '');
  v_bank_id := nullif(trim(p_receipt->>'bankAccountId'), '');
  IF v_id IS NULL OR length(v_id) > 160 OR v_bank_id IS NULL OR nullif(trim(p_recorded_by),'') IS NULL THEN
    RAISE EXCEPTION 'Payment ID, bank account and recorder required';
  END IF;
  IF v_date IS NULL OR v_date !~ '^\d{4}-\d{2}-\d{2}$' OR to_char(v_date::date,'YYYY-MM-DD') <> v_date THEN
    RAISE EXCEPTION 'Receipt date must be YYYY-MM-DD';
  END IF;
  IF jsonb_typeof(p_receipt->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Amount must be numeric'; END IF;
  v_amount := (p_receipt->>'amount')::numeric;
  IF v_amount <= 0 OR v_amount::text IN ('NaN','Infinity','-Infinity') OR round(v_amount,2) <> v_amount THEN
    RAISE EXCEPTION 'Amount must be positive with at most two decimal places';
  END IF;
  IF jsonb_typeof(p_receipt->'allocations') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Allocations required'; END IF;
  IF jsonb_array_length(p_receipt->'allocations') = 0 THEN RAISE EXCEPTION 'Allocations required'; END IF;
  FOR v_allocation IN SELECT value AS item FROM jsonb_array_elements(p_receipt->'allocations') LOOP
    IF jsonb_typeof(v_allocation.item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_allocation.item->'invoiceId') IS DISTINCT FROM 'string'
       OR nullif(trim(v_allocation.item->>'invoiceId'),'') IS NULL
       OR jsonb_typeof(v_allocation.item->'amount') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid allocation';
    END IF;
    v_total := (v_allocation.item->>'amount')::numeric;
    IF v_total <= 0 OR v_total::text IN ('NaN','Infinity','-Infinity') OR round(v_total,2) <> v_total THEN RAISE EXCEPTION 'Allocation must be positive with at most two decimal places'; END IF;
  END LOOP;
  SELECT count(*),count(DISTINCT a->>'invoiceId'),sum((a->>'amount')::numeric)
    INTO v_count,v_total,v_amount FROM jsonb_array_elements(p_receipt->'allocations') a;
  IF v_count <> v_total THEN RAISE EXCEPTION 'Duplicate invoice allocation'; END IF;
  IF v_amount <> (p_receipt->>'amount')::numeric THEN RAISE EXCEPTION 'Allocation total must equal receipt amount'; END IF;
  SELECT jsonb_agg(jsonb_build_object('invoiceId', a->>'invoiceId', 'amount',(a->>'amount')::numeric) ORDER BY a->>'invoiceId')
    INTO v_allocations FROM jsonb_array_elements(p_receipt->'allocations') a;
  v_payload := jsonb_build_object('paymentId',v_id,'date',v_date,'bankAccountId',v_bank_id,'amount',v_amount,'allocations',v_allocations);
  -- Serialize retries before reading event existence. Different receipts lock
  -- invoices in the same order, so stale concurrent admins cannot overallocate.
  PERFORM pg_advisory_xact_lock(hashtextextended('client-receipt:' || v_id,0));
  SELECT * INTO v_existing FROM public.client_receipts WHERE id=v_id;
  IF FOUND THEN
    IF v_existing.payload <> v_payload THEN RAISE EXCEPTION 'Payment ID payload conflict'; END IF;
  ELSE
    SELECT * INTO v_bank FROM public.bank_accounts WHERE id=v_bank_id FOR UPDATE;
    IF NOT FOUND OR v_bank.account_code IS NULL OR v_bank.account_code !~ '^1-1[0-9]{3}$' OR v_bank.balance::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Bank account or mapped COA not found'; END IF;
    SELECT min(id),count(*) INTO v_bank_coa,v_count FROM public.coas WHERE account_code=v_bank.account_code;
    IF v_count <> 1 THEN RAISE EXCEPTION 'Bank COA must resolve uniquely'; END IF;
    SELECT min(id),count(*) INTO v_ar_coa,v_count FROM public.coas WHERE account_code='1-2000';
    IF v_count <> 1 THEN RAISE EXCEPTION 'Receivables COA must resolve uniquely'; END IF;
    FOR v_allocation IN SELECT a->>'invoiceId' AS id,(a->>'amount')::numeric AS amount FROM jsonb_array_elements(v_allocations) a ORDER BY a->>'invoiceId' LOOP
      SELECT * INTO v_invoice FROM public.invoices WHERE id=v_allocation.id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Allocated invoice not found: %', v_allocation.id; END IF;
      IF v_invoice.is_consolidated OR v_invoice.superseded_by_invoice_id IS NOT NULL OR v_invoice.status NOT IN ('Unpaid','Partial') THEN
        RAISE EXCEPTION 'Invoice is not eligible for payment: %',v_invoice.id;
      END IF;
      IF v_invoice.delivery_id IS NOT NULL AND (
        NOT EXISTS(SELECT 1 FROM public.deliveries d WHERE d.id=v_invoice.delivery_id AND d.invoice_id=v_invoice.id AND d.status='Terkirim')
        OR NOT EXISTS(SELECT 1 FROM public.journal_entries e JOIN public.journal_lines l ON l.journal_entry_id=e.id JOIN public.coas c ON c.id=l.account_id
          WHERE e.reference_type='Invoice' AND e.reference_id=v_invoice.id AND c.account_code='1-2000' AND l.debit_amount>=v_invoice.total_amount)
      ) THEN RAISE EXCEPTION 'Delivery invoice must complete Finance audit before payment'; END IF;
      IF v_client IS NULL THEN v_client:=v_invoice.client_id; END IF;
      IF v_client IS DISTINCT FROM v_invoice.client_id THEN RAISE EXCEPTION 'Receipt invoices must belong to the same client'; END IF;
      IF v_invoice.total_amount<=0 OR v_invoice.total_amount::text IN ('NaN','Infinity','-Infinity') OR v_invoice.amount_paid::text IN ('NaN','Infinity','-Infinity') OR v_invoice.amount_paid < 0 OR v_allocation.amount > v_invoice.total_amount-v_invoice.amount_paid THEN
        RAISE EXCEPTION 'Allocation exceeds invoice outstanding: %',v_invoice.id;
      END IF;
    END LOOP;
    -- Separate invoices in one TF may be paid into different banks at once.
    -- Serialize their final status checks so both cannot miss the other's commit.
    PERFORM tf.id FROM public.tukar_faktur tf WHERE tf.id IN (
      SELECT i.tukar_faktur_id FROM public.invoices i JOIN jsonb_array_elements(v_allocations) a ON i.id=a->>'invoiceId'
    ) ORDER BY tf.id FOR UPDATE;
    v_entry_id := 'receipt:' || v_id || ':journal';
    v_cash_id := 'receipt:' || v_id || ':cash';
    INSERT INTO public.client_receipts(id,date,bank_account_id,client_id,amount,payload,recorded_by,tf_states)
      VALUES(v_id,v_date,v_bank_id,v_client,v_amount,v_payload,p_recorded_by,coalesce((SELECT jsonb_object_agg(tf.id::text,tf.status) FROM public.tukar_faktur tf WHERE tf.id IN(SELECT i.tukar_faktur_id FROM public.invoices i JOIN jsonb_array_elements(v_allocations) a ON i.id=a->>'invoiceId')),'{}'::jsonb));
    INSERT INTO public.client_receipt_allocations(receipt_id,invoice_id,amount)
      SELECT v_id,a->>'invoiceId',(a->>'amount')::numeric FROM jsonb_array_elements(v_allocations) a;
    INSERT INTO public.journal_entries(id,transaction_date,description,reference_type,reference_id)
      VALUES(v_entry_id,v_date,'Penerimaan pembayaran klien - '||v_id,'Payment',v_id);
    INSERT INTO public.journal_lines(id,journal_entry_id,account_id,debit_amount,credit_amount) VALUES
      (v_entry_id||':debit',v_entry_id,v_bank_coa,v_amount,0),
      (v_entry_id||':credit',v_entry_id,v_ar_coa,0,v_amount);
    INSERT INTO public.cash_transactions(id,date,type,amount,bank_account_id,category,description,reference_type,reference_id)
      VALUES(v_cash_id,v_date,'In',v_amount,v_bank_id,'Sales','Penerimaan pembayaran klien','Payment',v_id);
    UPDATE public.bank_accounts SET balance=balance+v_amount WHERE id=v_bank_id;
    FOR v_allocation IN SELECT a->>'invoiceId' AS id,(a->>'amount')::numeric AS amount FROM jsonb_array_elements(v_allocations) a LOOP
      UPDATE public.invoices SET
        amount_paid=amount_paid+v_allocation.amount,
        status=CASE WHEN amount_paid+v_allocation.amount=total_amount THEN 'Paid' ELSE 'Partial' END,
        paid_date=CASE WHEN amount_paid+v_allocation.amount=total_amount THEN v_date ELSE NULL END,
        payments=coalesce(payments,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',v_id,'date',v_date,'amount',v_allocation.amount,'bankAccountId',v_bank_id))
      WHERE id=v_allocation.id;
    END LOOP;
    v_inserted:=true;
  END IF;
  RETURN jsonb_build_object(
    'receipt',(SELECT to_jsonb(r) FROM public.client_receipts r WHERE id=v_id),
    'allocations',(SELECT jsonb_agg(to_jsonb(a) ORDER BY invoice_id) FROM public.client_receipt_allocations a WHERE receipt_id=v_id),
    'already_posted',NOT v_inserted,
    'tukar_fakturs',coalesce((SELECT jsonb_agg(to_jsonb(tf) ORDER BY tf.id) FROM public.tukar_faktur tf WHERE tf.id IN (
      SELECT i.tukar_faktur_id FROM public.invoices i JOIN public.client_receipt_allocations a ON a.invoice_id=i.id WHERE a.receipt_id=v_id
    )),'[]'::jsonb),
    'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.invoices i JOIN public.client_receipt_allocations a ON a.invoice_id=i.id WHERE a.receipt_id=v_id),
    'bank_accounts',(SELECT jsonb_build_array(to_jsonb(b)) FROM public.bank_accounts b WHERE b.id=v_bank_id),
    'journal_entries',(SELECT jsonb_agg(to_jsonb(e)) FROM public.journal_entries e WHERE e.id='receipt:'||v_id||':journal'),
    'journal_lines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.journal_lines l WHERE l.journal_entry_id='receipt:'||v_id||':journal'),
    'cash_transactions',(SELECT jsonb_agg(to_jsonb(c)) FROM public.cash_transactions c WHERE c.id='receipt:'||v_id||':cash')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_client_receipt(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_client_receipt(jsonb,text) TO service_role;

ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS disbursed_at text;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS disbursed_by text;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS disbursement_type text;

-- Shared checked boundary for cash transfers, AP payments and source expenses.
CREATE TABLE IF NOT EXISTS public.financial_events (
  id text PRIMARY KEY,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.financial_events ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS financial_events_source_once ON public.financial_events(kind,(payload->>'referenceId')) WHERE kind IN ('reimbursement','expense','online-purchase','pr-expense');
CREATE UNIQUE INDEX IF NOT EXISTS financial_events_return_expense_once ON public.financial_events((payload->>'sourceExpenseId')) WHERE kind='transfer' AND payload->>'sourceExpenseId' IS NOT NULL;
REVOKE ALL ON public.financial_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.financial_events TO service_role;
CREATE OR REPLACE FUNCTION public.post_financial_event(p_event jsonb,p_recorded_by text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_id text; v_kind text; v_date text; v_source text; v_target text; v_amount numeric;
 v_ref text; v_ref_type text; v_desc text; v_debit_code text; v_debit text; v_credit text;
 v_bill public.vendor_bills%rowtype; v_reimb public.reimbursements%rowtype;
 v_bank public.bank_accounts%rowtype; v_target_bank public.bank_accounts%rowtype;
 v_existing public.financial_events%rowtype; v_payload jsonb; v_entry text; v_count int;
 v_exp public.expenses%rowtype; v_pi public.purchase_items%rowtype; v_pr public.purchase_requests%rowtype;
 v_debits jsonb; v_line jsonb; v_line_amount numeric; v_sum numeric; v_admin numeric; v_shipping numeric;
 v_inserted boolean:=false; v_vendor text; v_bill_id text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_recorded_by AND u.role IN ('finance','super_admin') AND coalesce((to_jsonb(u)->>'is_active')::boolean,true)) THEN RAISE EXCEPTION 'Finance role required for financial posting'; END IF;
 IF jsonb_typeof(p_event) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Event must be an object'; END IF;
 IF jsonb_typeof(p_event->'eventId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_event->'date') IS DISTINCT FROM 'string' OR jsonb_typeof(p_event->'bankAccountId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Event ID, date and bank must be strings'; END IF;
 v_id:=nullif(trim(p_event->>'eventId'),''); v_kind:=p_event->>'kind';
 v_date:=p_event->>'date'; v_source:=nullif(p_event->>'bankAccountId','');
 v_target:=nullif(p_event->>'targetBankAccountId',''); v_bill_id:=nullif(p_event->>'billId','');
 v_ref:=nullif(p_event->>'referenceId',''); v_ref_type:=nullif(p_event->>'referenceType','');
 v_desc:=nullif(trim(p_event->>'description'),'');
 IF v_id IS NULL OR length(v_id)>160 OR v_source IS NULL OR nullif(trim(p_recorded_by),'') IS NULL THEN RAISE EXCEPTION 'Event ID, source bank and recorder required'; END IF;
 IF v_kind NOT IN ('transfer','vendor-payment','reimbursement','cash-posting','expense','online-purchase','pr-expense') OR v_kind IS NULL THEN RAISE EXCEPTION 'Unsupported financial event'; END IF;
 IF v_date IS NULL OR v_date !~ '^\d{4}-\d{2}-\d{2}$' OR to_char(v_date::date,'YYYY-MM-DD')<>v_date THEN RAISE EXCEPTION 'Event date must be YYYY-MM-DD'; END IF;
 IF jsonb_typeof(p_event->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Amount must be numeric'; END IF;
 v_amount:=(p_event->>'amount')::numeric;
 IF v_amount<=0 OR v_amount::text IN ('NaN','Infinity','-Infinity') OR round(v_amount,2)<>v_amount THEN RAISE EXCEPTION 'Amount must be positive with at most two decimals'; END IF;
 IF v_kind='transfer' AND (v_target IS NULL OR v_source=v_target) THEN RAISE EXCEPTION 'Different destination bank required'; END IF;
 IF v_kind='vendor-payment' AND v_bill_id IS NULL THEN RAISE EXCEPTION 'Vendor bill required'; END IF;
 IF v_kind IN ('reimbursement','cash-posting','expense','online-purchase','pr-expense') AND v_ref IS NULL THEN RAISE EXCEPTION 'Business source reference required'; END IF;
 v_payload:=jsonb_build_object('eventId',v_id,'kind',v_kind,'date',v_date,'bankAccountId',v_source,
   'targetBankAccountId',v_target,'amount',v_amount,'billId',v_bill_id,'referenceId',v_ref,'referenceType',v_ref_type,
   'description',v_desc,'sourceExpenseId',p_event->>'sourceExpenseId','category',p_event->>'category','debitAccountCode',p_event->>'debitAccountCode','note',coalesce(p_event->>'note',''),'adminFee',p_event->'adminFee','shippingFee',p_event->'shippingFee');
 PERFORM pg_advisory_xact_lock(hashtextextended('financial-event:'||v_id,0));
 SELECT * INTO v_existing FROM public.financial_events WHERE id=v_id;
 IF FOUND THEN
   IF v_existing.payload<>v_payload THEN RAISE EXCEPTION 'Event ID payload conflict'; END IF;
 ELSE
   -- Lock cash sources in a common order, including both sides of transfers.
   PERFORM id FROM public.bank_accounts WHERE id=v_source OR id=v_target ORDER BY id FOR UPDATE;
   SELECT * INTO v_bank FROM public.bank_accounts WHERE id=v_source;
   IF NOT FOUND OR v_bank.account_code IS NULL OR v_bank.account_code !~ '^1-1[0-9]{3}$' OR v_bank.balance::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Mapped source bank required'; END IF;
   IF v_bank.balance<v_amount THEN RAISE EXCEPTION 'Insufficient bank balance'; END IF;
   IF v_bank.cfo_approval_required AND v_kind<>'pr-expense' AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_recorded_by AND role='super_admin') THEN RAISE EXCEPTION 'Source bank requires Super Admin approval'; END IF;
   SELECT min(id),count(*) INTO v_credit,v_count FROM public.coas WHERE account_code=v_bank.account_code;
   IF v_count<>1 THEN RAISE EXCEPTION 'Source bank COA must resolve uniquely'; END IF;
   IF v_kind='transfer' THEN
     SELECT * INTO v_target_bank FROM public.bank_accounts WHERE id=v_target;
     IF NOT FOUND OR v_target_bank.account_code IS NULL OR v_target_bank.account_code !~ '^1-1[0-9]{3}$' OR v_target_bank.balance::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Mapped destination bank required'; END IF;
     v_debit_code:=v_target_bank.account_code; v_ref:=coalesce(v_ref,v_id); v_ref_type:='Transfer';
     v_desc:=coalesce(v_desc,'Transfer kas - '||v_id);
     IF nullif(p_event->>'sourceExpenseId','') IS NOT NULL THEN
       SELECT * INTO v_exp FROM public.expenses WHERE id=p_event->>'sourceExpenseId' FOR UPDATE;
       IF NOT FOUND OR v_exp.category<>'Setoran Pengembalian' OR v_exp.status<>'Pending Audit' OR v_exp.is_journaled OR v_exp.amount<>v_amount THEN RAISE EXCEPTION 'Exact pending return expense source required'; END IF;
     END IF;
   ELSIF v_kind='vendor-payment' THEN
     SELECT * INTO v_bill FROM public.vendor_bills WHERE id=v_bill_id FOR UPDATE;
     IF NOT FOUND OR v_bill.status IN ('Cancelled','Paid') THEN RAISE EXCEPTION 'Payable bill not found or closed'; END IF;
     IF v_bill.total_amount<=0 OR v_bill.total_amount::text IN ('NaN','Infinity','-Infinity') OR v_bill.amount_paid::text IN ('NaN','Infinity','-Infinity') OR v_bill.amount_paid<0 OR v_amount>v_bill.total_amount-v_bill.amount_paid THEN RAISE EXCEPTION 'Payment exceeds bill outstanding'; END IF;
     v_debit_code:='2-1000'; v_vendor:=v_bill.vendor_id; v_ref:=v_id; v_ref_type:='Payment';
     v_desc:='Pembayaran hutang vendor - '||v_bill.bill_number;
   ELSIF v_kind='reimbursement' THEN
     SELECT * INTO v_reimb FROM public.reimbursements WHERE id=v_ref FOR UPDATE;
     IF NOT FOUND OR v_reimb.status NOT IN ('Approved','Pending') OR v_amount<>v_reimb.amount THEN RAISE EXCEPTION 'Eligible reimbursement with exact amount required'; END IF;
     v_debit_code:=CASE WHEN v_reimb.kind='Sourcing-Defisit' THEN '2-1500' WHEN v_reimb.kind='Auto-Talangan' THEN '6-1400' ELSE '6-9000' END;
     v_ref_type:='Reimbursement'; v_desc:=coalesce(v_desc,'Pembayaran reimburse - '||v_ref);
   ELSIF v_kind='expense' THEN
     SELECT * INTO v_exp FROM public.expenses WHERE id=v_ref FOR UPDATE;
     IF NOT FOUND OR v_exp.amount<>v_amount OR v_exp.status<>'Pending Audit' OR v_exp.is_journaled THEN RAISE EXCEPTION 'Unposted pending expense with exact amount required'; END IF;
     IF v_exp.source_bank_account_id IS NOT NULL AND v_exp.source_bank_account_id<>v_source THEN RAISE EXCEPTION 'Expense requires its selected source bank'; END IF;
     IF EXISTS(SELECT 1 FROM public.journal_entries WHERE reference_type='Expense' AND reference_id=v_ref) THEN RAISE EXCEPTION 'Legacy expense posting requires source reconciliation'; END IF;
     IF v_exp.category IN ('Belanja Online','Sourcing (HPP)','Setoran Pengembalian') THEN RAISE EXCEPTION 'Use purchase or return source command'; END IF;
     v_debit_code:=CASE WHEN v_exp.category IN ('Bensin','Tol','Parkir') THEN '6-1400' ELSE '6-9000' END;
     v_ref_type:='Expense'; v_desc:=v_exp.description;
   ELSIF v_kind='online-purchase' THEN
     SELECT * INTO v_pi FROM public.purchase_items WHERE id=v_ref FOR UPDATE;
     IF NOT FOUND OR v_pi.purchase_method<>'Online' OR v_pi.is_online_audited OR v_pi.qty_target<=0 OR v_pi.payment_method IS DISTINCT FROM 'Transfer' THEN RAISE EXCEPTION 'Unposted online transfer purchase required'; END IF;
     IF NOT EXISTS(SELECT 1 FROM public.purchases WHERE id=v_pi.purchase_id AND status IN ('Pending','Belanja')) THEN RAISE EXCEPTION 'Online order requires a pending released purchase plan'; END IF;
     IF EXISTS(SELECT 1 FROM public.journal_entries WHERE reference_type='Purchase' AND reference_id=v_ref) THEN RAISE EXCEPTION 'Legacy online posting requires source reconciliation'; END IF;
     v_admin:=coalesce((p_event->>'adminFee')::numeric,0); v_shipping:=coalesce((p_event->>'shippingFee')::numeric,0);
     IF v_admin<0 OR v_shipping<0 OR v_admin::text IN ('NaN','Infinity','-Infinity') OR v_shipping::text IN ('NaN','Infinity','-Infinity') OR v_admin+v_shipping>=v_amount THEN RAISE EXCEPTION 'Invalid online purchase fees'; END IF;
     v_debits:=jsonb_build_array(jsonb_build_object('accountCode','2-1100','amount',v_amount-v_admin-v_shipping));
     IF v_admin>0 THEN v_debits:=v_debits||jsonb_build_array(jsonb_build_object('accountCode','6-1600','amount',v_admin)); END IF;
     IF v_shipping>0 THEN v_debits:=v_debits||jsonb_build_array(jsonb_build_object('accountCode','6-1700','amount',v_shipping)); END IF;
     v_ref_type:='Purchase'; v_desc:=coalesce(v_desc,'Pembelian Online - '||v_ref);
   ELSIF v_kind='pr-expense' THEN
     SELECT * INTO v_pr FROM public.purchase_requests WHERE id=v_ref FOR UPDATE;
     IF NOT FOUND OR v_pr.status<>'Approved' OR v_pr.amount<>v_amount OR v_pr.disbursed_at IS NOT NULL THEN RAISE EXCEPTION 'Approved undisbursed request with exact amount required'; END IF;
     IF v_bank.cfo_approval_required AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=v_pr.approved_by_cfo AND role='super_admin') THEN RAISE EXCEPTION 'Source bank requires CFO approval'; END IF;
     IF EXISTS(SELECT 1 FROM public.journal_entries WHERE reference_type='Expense' AND reference_id=v_ref) THEN RAISE EXCEPTION 'Legacy request posting requires source reconciliation'; END IF;
     v_debit_code:=p_event->>'debitAccountCode';
     IF v_debit_code IS NULL OR NOT(v_debit_code LIKE '6-%' OR v_debit_code LIKE '1-4%') THEN RAISE EXCEPTION 'Expense or fixed asset account required'; END IF;
     v_ref_type:='Expense'; v_desc:=coalesce(v_desc,v_pr.description);
   ELSE
     v_debit_code:=p_event->>'debitAccountCode';
     -- AR/AP settlement and revenue require their own allocated source command.
     IF v_debit_code IS NULL OR NOT (v_debit_code LIKE '6-%' OR v_debit_code IN ('2-1100','2-1500')) THEN RAISE EXCEPTION 'Unsupported cash debit account'; END IF;
     IF v_ref_type IS NULL OR v_desc IS NULL THEN RAISE EXCEPTION 'Source type and description required'; END IF;
   END IF;
   IF v_debits IS NULL THEN v_debits:=jsonb_build_array(jsonb_build_object('accountCode',v_debit_code,'amount',v_amount)); END IF;
   v_sum:=0;
   FOR v_line IN SELECT value FROM jsonb_array_elements(v_debits) LOOP
     SELECT min(id),count(*) INTO v_debit,v_count FROM public.coas WHERE account_code=v_line->>'accountCode';
     IF v_count<>1 THEN RAISE EXCEPTION 'Debit COA must resolve uniquely'; END IF;
     v_sum:=v_sum+(v_line->>'amount')::numeric;
   END LOOP;
   IF v_sum<>v_amount THEN RAISE EXCEPTION 'Debit total must equal cash amount'; END IF;
   v_entry:='financial:'||v_id||':journal';
   INSERT INTO public.financial_events(id,kind,payload,recorded_by) VALUES(v_id,v_kind,v_payload,p_recorded_by);
   INSERT INTO public.journal_entries(id,transaction_date,description,reference_type,reference_id) VALUES(v_entry,v_date,v_desc,v_ref_type,v_ref);
   v_count:=0;
   FOR v_line IN SELECT value FROM jsonb_array_elements(v_debits) LOOP
     v_count:=v_count+1;
     SELECT id INTO STRICT v_debit FROM public.coas WHERE account_code=v_line->>'accountCode';
     INSERT INTO public.journal_lines(id,journal_entry_id,account_id,debit_amount,credit_amount,vendor_id,vendor_bill_id)
       VALUES(v_entry||':debit:'||v_count,v_entry,v_debit,(v_line->>'amount')::numeric,0,v_vendor,v_bill_id);
   END LOOP;
   INSERT INTO public.journal_lines(id,journal_entry_id,account_id,debit_amount,credit_amount,vendor_id,vendor_bill_id)
     VALUES(v_entry||':credit',v_entry,v_credit,0,v_amount,v_vendor,v_bill_id);
   INSERT INTO public.cash_transactions(id,date,type,amount,bank_account_id,category,description,reference_type,reference_id)
     VALUES('financial:'||v_id||':out',v_date,'Out',v_amount,v_source,coalesce(p_event->>'category',v_kind),v_desc,v_ref_type,v_ref);
   UPDATE public.bank_accounts SET balance=balance-v_amount WHERE id=v_source;
   IF v_kind='transfer' THEN
     INSERT INTO public.cash_transactions(id,date,type,amount,bank_account_id,category,description,reference_type,reference_id)
       VALUES('financial:'||v_id||':in',v_date,'In',v_amount,v_target,'Transfer',v_desc,'Transfer',v_ref);
     UPDATE public.bank_accounts SET balance=balance+v_amount WHERE id=v_target;
     IF nullif(p_event->>'sourceExpenseId','') IS NOT NULL THEN UPDATE public.expenses SET status='Approved',is_journaled=true,audit_date=v_date,source_bank_account_id=v_source,target_bank_account_id=v_target WHERE id=p_event->>'sourceExpenseId'; END IF;
   ELSIF v_kind='vendor-payment' THEN
     UPDATE public.vendor_bills SET amount_paid=amount_paid+v_amount,
       status=CASE WHEN amount_paid+v_amount=total_amount THEN 'Paid' ELSE 'PartialPaid' END,
       payments=coalesce(payments,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',v_id,'date',v_date,'amount',v_amount,'bankAccountId',v_source,'note',coalesce(p_event->>'note','')))
       WHERE id=v_bill_id;
   ELSIF v_kind='reimbursement' THEN
     UPDATE public.reimbursements SET status='Paid',payment_date=v_date,payment_reference=v_id WHERE id=v_ref;
   ELSIF v_kind='expense' THEN
     UPDATE public.expenses SET status='Approved',is_journaled=true,audit_date=v_date,source_bank_account_id=v_source WHERE id=v_ref;
   ELSIF v_kind='online-purchase' THEN
     UPDATE public.purchase_items SET is_online_audited=true,is_online_ordered=true,qty_purchased=qty_target,actual_unit_price=(v_amount-v_admin-v_shipping)/qty_target WHERE id=v_ref;
     UPDATE public.expenses SET status='Approved',is_journaled=true,audit_date=v_date,source_bank_account_id=v_source WHERE reference_id=v_ref AND category='Belanja Online' AND status='Pending Audit';
   ELSIF v_kind='pr-expense' THEN
     UPDATE public.purchase_requests SET disbursed_at=v_date,disbursed_by=p_recorded_by,disbursement_type='other' WHERE id=v_ref;
   END IF;
   v_inserted:=true;
 END IF;
 RETURN jsonb_build_object('event',(SELECT to_jsonb(e) FROM public.financial_events e WHERE id=v_id),'already_posted',NOT v_inserted,
   'bank_accounts',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.bank_accounts b WHERE id=v_source OR id=v_target),
   'journal_entries',(SELECT jsonb_agg(to_jsonb(e)) FROM public.journal_entries e WHERE id='financial:'||v_id||':journal'),
   'journal_lines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.journal_lines l WHERE journal_entry_id='financial:'||v_id||':journal'),
   'cash_transactions',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.cash_transactions c WHERE id IN ('financial:'||v_id||':out','financial:'||v_id||':in')),
   'vendor_bills',coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM public.vendor_bills b WHERE id=v_bill_id),'[]'::jsonb),
   'expenses',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM public.expenses e WHERE (e.id=v_ref AND v_kind='expense') OR (e.id=p_event->>'sourceExpenseId' AND v_kind='transfer') OR (e.reference_id=v_ref AND v_kind='online-purchase')),'[]'::jsonb),
   'purchase_items',coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM public.purchase_items i WHERE i.id=v_ref AND v_kind='online-purchase'),'[]'::jsonb),
   'purchase_requests',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.purchase_requests r WHERE r.id=v_ref AND v_kind='pr-expense'),'[]'::jsonb),
   'reimbursements',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.reimbursements r WHERE id=v_ref AND v_kind='reimbursement'),'[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.post_financial_event(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.post_financial_event(jsonb,text) TO service_role;

ALTER TABLE public.vendor_returns ADD COLUMN IF NOT EXISTS claim_journal_entry_id text;
ALTER TABLE public.vendor_returns DROP CONSTRAINT IF EXISTS vendor_returns_status_check;
ALTER TABLE public.vendor_returns ADD CONSTRAINT vendor_returns_status_check CHECK(status IN ('Menunggu Vendor','Selesai-Ditukar','Selesai-Ditolak','Selesai-Dibayar','Selesai-PotongHutang'));

-- Vendor deposits are assets until allocated to an invoiced vendor obligation.
INSERT INTO public.coas(id,account_code,account_name,account_type)
 SELECT 'coa-vendor-advances','1-2200','Uang Muka Vendor','Asset'
 WHERE NOT EXISTS(SELECT 1 FROM public.coas WHERE account_code='1-2200');
CREATE TABLE IF NOT EXISTS public.vendor_advances(
 id text PRIMARY KEY,purchase_id text NOT NULL REFERENCES public.purchases(id),vendor_id text NOT NULL REFERENCES public.vendors(id),
 bank_account_id text NOT NULL REFERENCES public.bank_accounts(id),amount numeric NOT NULL CHECK(amount>0),
 applied_amount numeric NOT NULL DEFAULT 0 CHECK(applied_amount>=0 AND applied_amount<=amount),date text NOT NULL,recorded_by text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.vendor_advance_allocations(
 advance_id text NOT NULL REFERENCES public.vendor_advances(id),bill_id text NOT NULL REFERENCES public.vendor_bills(id),
 amount numeric NOT NULL CHECK(amount>0),event_id text NOT NULL UNIQUE,PRIMARY KEY(advance_id,bill_id)
);
CREATE TABLE IF NOT EXISTS public.vendor_claim_settlements(
 id text PRIMARY KEY,vendor_return_id text NOT NULL REFERENCES public.vendor_returns(id),bill_id text REFERENCES public.vendor_bills(id),
 bank_account_id text REFERENCES public.bank_accounts(id),amount numeric NOT NULL CHECK(amount>0),kind text NOT NULL,date text NOT NULL,recorded_by text NOT NULL
);
ALTER TABLE public.vendor_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_advance_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_claim_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendor_advances,public.vendor_advance_allocations,public.vendor_claim_settlements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.vendor_advances,public.vendor_advance_allocations,public.vendor_claim_settlements TO service_role;

CREATE OR REPLACE FUNCTION public.vendor_claim_amount(p_return_id text) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE origin_id text; source_entry text; value numeric;
BEGIN
 -- Only claims linked to a committed canonical QC source are eligible.
 SELECT claim_journal_entry_id INTO source_entry FROM public.vendor_returns WHERE id=p_return_id;
 IF source_entry IS NULL THEN
  IF p_return_id NOT LIKE '%:vendorreturn' THEN RAISE EXCEPTION 'Historical return requires source reconciliation'; END IF;
  origin_id:=left(p_return_id,length(p_return_id)-length(':vendorreturn'));source_entry:=origin_id||':rejectjournal';
 END IF;
 SELECT coalesce(sum(l.debit_amount-l.credit_amount),0) INTO value
 FROM public.journal_lines l JOIN public.coas c ON c.id=l.account_id JOIN public.journal_entries e ON e.id=l.journal_entry_id
 WHERE e.id=source_entry AND e.reference_type='QC' AND c.account_code='1-2100';
 IF value<=0 OR value::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Return has no posted vendor claim'; END IF;
 RETURN value;
END $$;
REVOKE ALL ON FUNCTION public.vendor_claim_amount(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_claim_amount(text) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_vendor_advances(p_purchase_id text,p_vendor_id text,p_bill_id text,p_date text,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE bill public.vendor_bills%rowtype; advance public.vendor_advances%rowtype; applied numeric; remaining numeric; eid text; total numeric:=0;
BEGIN
 PERFORM id FROM public.purchases WHERE id=p_purchase_id FOR UPDATE;
 SELECT * INTO bill FROM public.vendor_bills WHERE id=p_bill_id FOR UPDATE;
 IF NOT FOUND OR bill.vendor_id<>p_vendor_id OR bill.purchase_id IS DISTINCT FROM p_purchase_id OR bill.status='Cancelled' THEN RAISE EXCEPTION 'Advance allocation bill/purchase/vendor mismatch'; END IF;
 remaining:=bill.total_amount-bill.amount_paid;
 FOR advance IN SELECT * FROM public.vendor_advances WHERE purchase_id=p_purchase_id AND vendor_id=p_vendor_id AND applied_amount<amount ORDER BY date,id FOR UPDATE LOOP
  EXIT WHEN remaining<=0;
  applied:=least(remaining,advance.amount-advance.applied_amount); eid:='advance-apply:'||advance.id||':'||bill.id;
  PERFORM public.post_journal_entry(eid,p_date,'Alokasi uang muka vendor '||advance.id,'Payment',eid,
   jsonb_build_array(jsonb_build_object('accountCode','2-1000','amount',applied,'vendorId',p_vendor_id,'vendorBillId',bill.id)),
   jsonb_build_array(jsonb_build_object('accountCode','1-2200','amount',applied,'vendorId',p_vendor_id,'vendorBillId',bill.id)));
  INSERT INTO public.vendor_advance_allocations(advance_id,bill_id,amount,event_id) VALUES(advance.id,bill.id,applied,eid);
  UPDATE public.vendor_advances SET applied_amount=applied_amount+applied WHERE id=advance.id;
  UPDATE public.vendor_bills SET amount_paid=amount_paid+applied,status=CASE WHEN amount_paid+applied=total_amount THEN 'Paid' ELSE 'PartialPaid' END,
   payments=payments||jsonb_build_array(jsonb_build_object('id',eid,'date',p_date,'amount',applied,'bankAccountId',advance.bank_account_id,'method','Vendor Advance','note','Uang muka '||advance.id)) WHERE id=bill.id;
  remaining:=remaining-applied;total:=total+applied;
 END LOOP;
 RETURN jsonb_build_object('appliedAmount',total);
END $$;
REVOKE ALL ON FUNCTION public.apply_vendor_advances(text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_vendor_advances(text,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.post_vendor_financial_event(p_event jsonb,p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE eid text:=p_event->>'eventId';kind text:=p_event->>'kind';at_text text:=p_event->>'date';amount numeric;
 bankid text:=p_event->>'bankAccountId';purchaseid text:=p_event->>'purchaseId';vendorid text:=p_event->>'vendorId';
 returnid text:=p_event->>'vendorReturnId';billid text:=p_event->>'billId';entryid text;cashid text;payload jsonb;
 previous public.financial_events%rowtype;bank public.bank_accounts%rowtype;bill public.vendor_bills%rowtype;ret public.vendor_returns%rowtype;
 debit text;credit text;claim numeric;settled numeric;planned numeric;coa_id text;coa_count int;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_actor AND u.role IN ('finance','super_admin') AND coalesce((to_jsonb(u)->>'is_active')::boolean,true)) THEN RAISE EXCEPTION 'Finance role required for financial posting'; END IF;
 IF jsonb_typeof(p_event) IS DISTINCT FROM 'object' OR nullif(trim(eid),'') IS NULL OR length(eid)>160 OR nullif(trim(p_actor),'') IS NULL
 OR kind NOT IN ('vendor-advance','vendor-refund','vendor-netoff') OR kind IS NULL THEN RAISE EXCEPTION 'Invalid vendor event'; END IF;
 IF at_text IS NULL OR at_text !~ '^\d{4}-\d{2}-\d{2}$' OR to_char(at_text::date,'YYYY-MM-DD')<>at_text THEN RAISE EXCEPTION 'Vendor date must be YYYY-MM-DD'; END IF;
 IF jsonb_typeof(p_event->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Numeric amount required'; END IF;
 amount:=(p_event->>'amount')::numeric;
 IF amount<=0 OR amount::text IN ('NaN','Infinity','-Infinity') OR round(amount,2)<>amount THEN RAISE EXCEPTION 'Positive finite amount required'; END IF;
 payload:=p_event-'recordedBy'; entryid:='vendor:'||eid||':journal';cashid:='vendor:'||eid||':cash';
 PERFORM pg_advisory_xact_lock(hashtextextended('financial-event:'||eid,0));
 SELECT * INTO previous FROM public.financial_events WHERE id=eid;
 IF FOUND THEN
  IF previous.kind<>kind OR previous.payload<>payload THEN RAISE EXCEPTION 'Event ID payload conflict'; END IF;
 ELSE
  IF kind='vendor-advance' THEN
   billid:=NULL;returnid:=NULL;
   PERFORM id FROM public.purchases WHERE id=purchaseid AND status NOT IN ('Batal','Cancelled') FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Open purchase source required'; END IF;
   SELECT sum(qty_target*greatest(actual_unit_price,estimated_unit_price)) INTO planned FROM public.purchase_items WHERE purchase_id=purchaseid AND coalesce(vendor_id,planned_vendor_id)=vendorid AND payment_method IN ('Tempo','Transfer');
   IF NOT EXISTS(SELECT 1 FROM public.purchase_items WHERE purchase_id=purchaseid AND coalesce(vendor_id,planned_vendor_id)=vendorid AND NOT is_qced AND payment_method IN ('Tempo','Transfer')) THEN RAISE EXCEPTION 'Advance requires goods not yet fully received; pay an existing bill instead'; END IF;
   IF planned IS NULL OR planned<=0 OR planned::text IN ('NaN','Infinity','-Infinity') OR amount+coalesce((SELECT sum(a.amount) FROM public.vendor_advances a WHERE a.purchase_id=purchaseid AND a.vendor_id=vendorid),0)
     +coalesce((SELECT sum(b.amount_paid) FROM public.vendor_bills b WHERE b.purchase_id=purchaseid AND b.vendor_id=vendorid),0)
     -coalesce((SELECT sum(x.amount) FROM public.vendor_advance_allocations x JOIN public.vendor_advances a ON a.id=x.advance_id WHERE a.purchase_id=purchaseid AND a.vendor_id=vendorid),0)>planned THEN RAISE EXCEPTION 'Advance exceeds vendor purchase plan'; END IF;
   debit:='1-2200';
  ELSE
   purchaseid:=NULL;
   IF kind='vendor-refund' THEN billid:=NULL; ELSE bankid:=NULL; END IF;
   SELECT * INTO ret FROM public.vendor_returns WHERE id=returnid FOR UPDATE;
   IF NOT FOUND OR ret.status<>'Menunggu Vendor' THEN RAISE EXCEPTION 'Open vendor claim required'; END IF;
   vendorid:=ret.vendor_id;claim:=public.vendor_claim_amount(returnid);
   SELECT coalesce(sum(s.amount),0) INTO settled FROM public.vendor_claim_settlements s WHERE s.vendor_return_id=returnid;
   IF amount>claim-settled THEN RAISE EXCEPTION 'Settlement exceeds remaining vendor claim'; END IF;
   credit:='1-2100';
  END IF;
  IF kind<>'vendor-netoff' THEN
   SELECT * INTO bank FROM public.bank_accounts WHERE id=bankid FOR UPDATE;
   IF NOT FOUND OR bank.account_code !~ '^1-1[0-9]{3}$' OR bank.balance::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Mapped cash bank required'; END IF;
   IF kind='vendor-advance' AND bank.cfo_approval_required AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor AND role='super_admin') THEN RAISE EXCEPTION 'Source bank requires Super Admin approval'; END IF;
   IF kind='vendor-advance' THEN IF bank.balance<amount THEN RAISE EXCEPTION 'Insufficient bank balance'; END IF;credit:=bank.account_code;
   ELSE debit:=bank.account_code; END IF;
  ELSE
   SELECT * INTO bill FROM public.vendor_bills WHERE id=billid FOR UPDATE;
   IF NOT FOUND OR bill.vendor_id<>vendorid OR bill.status IN ('Cancelled','Paid') OR amount>bill.total_amount-bill.amount_paid THEN RAISE EXCEPTION 'Same-vendor open bill with sufficient outstanding required'; END IF;
   debit:='2-1000';
  END IF;
  FOREACH coa_id IN ARRAY ARRAY[debit,credit] LOOP
   SELECT count(*) INTO coa_count FROM public.coas WHERE account_code=coa_id;
   IF coa_count<>1 THEN RAISE EXCEPTION 'Vendor posting COA must resolve uniquely'; END IF;
  END LOOP;
  PERFORM public.post_journal_entry(entryid,at_text,'Vendor settlement '||eid,'Payment',eid,
   jsonb_build_array(jsonb_build_object('accountCode',debit,'amount',amount,'vendorId',vendorid,'vendorBillId',billid)),
   jsonb_build_array(jsonb_build_object('accountCode',credit,'amount',amount,'vendorId',vendorid,'vendorBillId',billid)));
  IF kind<>'vendor-netoff' THEN
   PERFORM public.post_cash_transaction(jsonb_build_object('id',cashid,'date',at_text,'type',CASE WHEN kind='vendor-advance' THEN 'Out' ELSE 'In' END,
    'amount',amount,'bankAccountId',bankid,'category',kind,'description','Vendor settlement '||eid,'referenceType','Purchase','referenceId',coalesce(purchaseid,returnid)));
  END IF;
  IF kind='vendor-advance' THEN
   INSERT INTO public.vendor_advances(id,purchase_id,vendor_id,bank_account_id,amount,date,recorded_by) VALUES(eid,purchaseid,vendorid,bankid,amount,at_text,p_actor);
  ELSE
   INSERT INTO public.vendor_claim_settlements(id,vendor_return_id,bill_id,bank_account_id,amount,kind,date,recorded_by) VALUES(eid,returnid,billid,bankid,amount,kind,at_text,p_actor);
   IF kind='vendor-netoff' THEN
    UPDATE public.vendor_bills SET amount_paid=amount_paid+amount,status=CASE WHEN amount_paid+amount=total_amount THEN 'Paid' ELSE 'PartialPaid' END,
     payments=payments||jsonb_build_array(jsonb_build_object('id',eid,'date',at_text,'amount',amount,'bankAccountId','','method','Vendor Claim Netoff','note',returnid)) WHERE id=billid;
   END IF;
   IF amount+settled=claim THEN UPDATE public.vendor_returns SET status=CASE WHEN kind='vendor-refund' THEN 'Selesai-Dibayar' ELSE 'Selesai-PotongHutang' END,resolved_date=at_text::timestamptz WHERE id=returnid; END IF;
  END IF;
  INSERT INTO public.financial_events(id,kind,payload,recorded_by) VALUES(eid,kind,payload,p_actor);
 END IF;
 RETURN jsonb_build_object('event',(SELECT to_jsonb(e) FROM public.financial_events e WHERE id=eid),
  'bank_accounts',coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM public.bank_accounts b WHERE b.id=bankid),'[]'),
  'vendor_bills',coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM public.vendor_bills b WHERE b.id=billid),'[]'),
  'vendor_returns',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.vendor_returns r WHERE r.id=returnid),'[]'),
  'journal_entries',(SELECT jsonb_agg(to_jsonb(e)) FROM public.journal_entries e WHERE e.id=entryid),
  'journal_lines',(SELECT jsonb_agg(to_jsonb(l)) FROM public.journal_lines l WHERE l.journal_entry_id=entryid),
  'cash_transactions',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.cash_transactions c WHERE c.id=cashid),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.post_vendor_financial_event(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.post_vendor_financial_event(jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.list_vendor_money_state() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object(
  'advances',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.date,a.id) FROM public.vendor_advances a),'[]'::jsonb),
  'settlements',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.date,s.id) FROM public.vendor_claim_settlements s),'[]'::jsonb),
  'claims',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'vendorId',r.vendor_id,'productId',r.product_id,'qty',r.qty,
   'claimAmount',source.amount,'settledAmount',coalesce(settled.amount,0),'remainingAmount',source.amount-coalesce(settled.amount,0),'status',r.status))
   FROM public.vendor_returns r
   JOIN LATERAL (SELECT sum(l.debit_amount-l.credit_amount) AS amount FROM public.journal_lines l JOIN public.coas c ON c.id=l.account_id
     WHERE l.journal_entry_id=coalesce(r.claim_journal_entry_id,left(r.id,length(r.id)-length(':vendorreturn'))||':rejectjournal') AND c.account_code='1-2100') source ON source.amount>0
   LEFT JOIN LATERAL (SELECT sum(s.amount) AS amount FROM public.vendor_claim_settlements s WHERE s.vendor_return_id=r.id) settled ON true
   WHERE (r.claim_journal_entry_id IS NOT NULL OR r.id LIKE '%:vendorreturn') AND r.status='Menunggu Vendor' AND source.amount>coalesce(settled.amount,0)),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.list_vendor_money_state() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_vendor_money_state() TO service_role;

ALTER TABLE public.client_receipts ADD COLUMN IF NOT EXISTS tf_states jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS public.financial_reversals(
 id text PRIMARY KEY,source_type text NOT NULL,source_id text NOT NULL,date text NOT NULL,reason text NOT NULL,
 payload jsonb NOT NULL,recorded_by text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),UNIQUE(source_type,source_id)
);
ALTER TABLE public.financial_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_reversals FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.financial_reversals TO service_role;
CREATE OR REPLACE FUNCTION public.reverse_financial_event(p_event jsonb,p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
<<reversal_state>>
DECLARE eid text:=p_event->>'eventId';source_type text:=p_event->>'sourceType';source_id text:=p_event->>'sourceId';at_text text:=p_event->>'date';reason text:=trim(p_event->>'reason');
 previous public.financial_reversals%rowtype;receipt public.client_receipts%rowtype;source public.financial_events%rowtype;
 bank public.bank_accounts%rowtype;bill public.vendor_bills%rowtype;invoice public.invoices%rowtype;
 source_entry text;source_cash text;reversal_entry text;reversal_cash text;bank_id text;bill_id text;amount numeric;delta numeric;
 line public.journal_lines%rowtype;allocation record;idx int:=0;debits numeric;credits numeric;invoice_ids text[]:='{}';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE id=p_actor AND role='super_admin' AND coalesce((to_jsonb(u)->>'is_active')::boolean,true)) THEN RAISE EXCEPTION 'Super Admin required for source reversal'; END IF;
 IF jsonb_typeof(p_event) IS DISTINCT FROM 'object' OR nullif(trim(eid),'') IS NULL OR length(eid)>160 OR nullif(source_id,'') IS NULL
 OR source_type NOT IN ('client-receipt','vendor-payment') OR source_type IS NULL OR reason IS NULL OR length(reason)<5 THEN RAISE EXCEPTION 'Source event and reversal reason required'; END IF;
 IF at_text IS NULL OR at_text !~ '^\d{4}-\d{2}-\d{2}$' OR to_char(at_text::date,'YYYY-MM-DD')<>at_text THEN RAISE EXCEPTION 'Reversal date must be YYYY-MM-DD'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('financial-reversal:'||source_type||':'||source_id,0));
 SELECT * INTO previous FROM public.financial_reversals WHERE id=eid;
 IF FOUND THEN
  IF previous.payload<>p_event THEN RAISE EXCEPTION 'Reversal ID payload conflict'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM public.financial_reversals r WHERE r.source_type=reversal_state.source_type AND r.source_id=reversal_state.source_id) THEN RAISE EXCEPTION 'Source event is already reversed'; END IF;
  IF source_type='client-receipt' THEN
   SELECT * INTO receipt FROM public.client_receipts WHERE id=source_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Posted source receipt not found'; END IF;
   amount:=receipt.amount;bank_id:=receipt.bank_account_id;delta:=-amount;source_entry:='receipt:'||source_id||':journal';source_cash:='receipt:'||source_id||':cash';
   invoice_ids:=array(SELECT invoice_id FROM public.client_receipt_allocations WHERE receipt_id=source_id ORDER BY invoice_id);
  ELSE
   SELECT * INTO source FROM public.financial_events WHERE id=source_id AND kind='vendor-payment' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Posted source vendor payment not found'; END IF;
   amount:=(source.payload->>'amount')::numeric;bank_id:=source.payload->>'bankAccountId';bill_id:=source.payload->>'billId';delta:=amount;
   source_entry:='financial:'||source_id||':journal';source_cash:='financial:'||source_id||':out';
  END IF;
  SELECT * INTO bank FROM public.bank_accounts WHERE id=bank_id FOR UPDATE;
  IF NOT FOUND OR (delta<0 AND bank.balance+delta<0) THEN RAISE EXCEPTION 'Reverse dependent spending or reconcile source bank before this receipt'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cash_transactions original_cash WHERE original_cash.id=source_cash AND original_cash.amount=reversal_state.amount AND original_cash.bank_account_id=bank_id) THEN RAISE EXCEPTION 'Original cash leg missing; source reconciliation required'; END IF;
  SELECT sum(debit_amount),sum(credit_amount) INTO debits,credits FROM public.journal_lines WHERE journal_entry_id=source_entry;
  IF debits IS NULL OR debits<>amount OR credits<>amount THEN RAISE EXCEPTION 'Original journal is incomplete or changed'; END IF;
  IF source_type='client-receipt' THEN
   PERFORM id FROM public.invoices WHERE id=ANY(invoice_ids) ORDER BY id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM public.credit_notes WHERE invoice_id=ANY(invoice_ids) AND created_at>=receipt.recorded_at) THEN RAISE EXCEPTION 'Later credit note depends on this receipt; reconcile that document first'; END IF;
   PERFORM id FROM public.tukar_faktur WHERE id IN(SELECT tukar_faktur_id FROM public.invoices WHERE id=ANY(invoice_ids)) ORDER BY id FOR UPDATE;
   FOR allocation IN SELECT * FROM public.client_receipt_allocations WHERE receipt_id=source_id ORDER BY invoice_id LOOP
    SELECT * INTO STRICT invoice FROM public.invoices WHERE id=allocation.invoice_id;
    IF invoice.amount_paid<allocation.amount OR invoice.status='Cancelled' THEN RAISE EXCEPTION 'Invoice has dependent changes requiring reconciliation'; END IF;
    UPDATE public.invoices SET amount_paid=amount_paid-allocation.amount,status=CASE WHEN amount_paid-allocation.amount>0 THEN 'Partial' ELSE 'Unpaid' END,paid_date=NULL,
     payments=payments||jsonb_build_array(jsonb_build_object('id',eid,'date',at_text,'amount',-allocation.amount,'bankAccountId',bank_id,'reversesPaymentId',source_id,'note',reason)) WHERE id=invoice.id;
   END LOOP;
   UPDATE public.tukar_faktur SET status=CASE WHEN received_at IS NOT NULL THEN 'Received' ELSE coalesce(receipt.tf_states->>id::text,'Issued') END
    WHERE status='Paid' AND id IN(SELECT tukar_faktur_id FROM public.invoices WHERE id=ANY(invoice_ids));
  ELSE
   SELECT * INTO bill FROM public.vendor_bills WHERE id=bill_id FOR UPDATE;
   IF NOT FOUND OR bill.amount_paid<amount OR bill.status='Cancelled' THEN RAISE EXCEPTION 'Bill has dependent changes requiring reconciliation'; END IF;
   UPDATE public.vendor_bills SET amount_paid=amount_paid-amount,status=CASE WHEN amount_paid-amount>0 THEN 'PartialPaid' ELSE 'Pending' END,
    payments=payments||jsonb_build_array(jsonb_build_object('id',eid,'date',at_text,'amount',-amount,'bankAccountId',bank_id,'method','Reversal','note',reason,'reversesPaymentId',source_id)) WHERE id=bill.id;
  END IF;
  reversal_entry:='reversal:'||eid||':journal';reversal_cash:='reversal:'||eid||':cash';
  INSERT INTO public.journal_entries(id,transaction_date,description,reference_type,reference_id) VALUES(reversal_entry,at_text,'Pembalikan '||source_id||': '||reason,'Adjustment',eid);
  FOR line IN SELECT * FROM public.journal_lines WHERE journal_entry_id=source_entry ORDER BY id LOOP
   idx:=idx+1;
   INSERT INTO public.journal_lines(id,journal_entry_id,account_id,debit_amount,credit_amount,vendor_id,vendor_bill_id)
    VALUES(reversal_entry||':'||idx,reversal_entry,line.account_id,line.credit_amount,line.debit_amount,line.vendor_id,line.vendor_bill_id);
  END LOOP;
  INSERT INTO public.cash_transactions(id,date,type,amount,bank_account_id,category,description,reference_type,reference_id)
   VALUES(reversal_cash,at_text,CASE WHEN delta>0 THEN 'In' ELSE 'Out' END,amount,bank_id,'Source Reversal','Pembalikan '||source_id||': '||reason,'Manual',eid);
  UPDATE public.bank_accounts SET balance=balance+delta WHERE id=bank_id;
  INSERT INTO public.financial_reversals(id,source_type,source_id,date,reason,payload,recorded_by) VALUES(eid,source_type,source_id,at_text,reason,p_event,p_actor);
 END IF;
 IF source_type='client-receipt' THEN
  SELECT * INTO receipt FROM public.client_receipts WHERE id=source_id;
  bank_id:=receipt.bank_account_id;invoice_ids:=array(SELECT invoice_id FROM public.client_receipt_allocations WHERE receipt_id=source_id);
 ELSE SELECT payload->>'bankAccountId',payload->>'billId' INTO bank_id,bill_id FROM public.financial_events WHERE id=source_id; END IF;
 RETURN jsonb_build_object('event',(SELECT to_jsonb(r) FROM public.financial_reversals r WHERE id=eid),
  'invoices',coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM public.invoices i WHERE id=ANY(invoice_ids)),'[]'),
  'vendor_bills',coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM public.vendor_bills b WHERE id=bill_id),'[]'),
  'bank_accounts',(SELECT jsonb_agg(to_jsonb(b)) FROM public.bank_accounts b WHERE id=bank_id),
  'journal_entries',(SELECT jsonb_agg(to_jsonb(j)) FROM public.journal_entries j WHERE id='reversal:'||eid||':journal'),
  'journal_lines',(SELECT jsonb_agg(to_jsonb(l)) FROM public.journal_lines l WHERE journal_entry_id='reversal:'||eid||':journal'),
  'cash_transactions',(SELECT jsonb_agg(to_jsonb(c)) FROM public.cash_transactions c WHERE id='reversal:'||eid||':cash'),
  'tukar_fakturs',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM public.tukar_faktur t WHERE id IN(SELECT tukar_faktur_id FROM public.invoices WHERE id=ANY(invoice_ids))),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.reverse_financial_event(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_financial_event(jsonb,text) TO service_role;

COMMIT;

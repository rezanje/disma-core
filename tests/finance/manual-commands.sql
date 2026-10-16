\set ON_ERROR_STOP on
-- Disposable fixture only. Every data change is rolled back.
BEGIN;
INSERT INTO public.coas(id,account_code,account_name,account_type) VALUES
 ('manual-bank','1-1000','Cash','Asset'),('manual-ar','1-2000','AR','Asset'),
 ('manual-grir','2-1100','GRIR','Liability'),('manual-ap','2-1000','AP','Liability'),
 ('manual-loan','2-4000','Loan','Liability'),('manual-capital','3-1000','Capital','Equity'),
 ('manual-revenue','4-1000','Revenue','Revenue'),('manual-other','4-2000','Other revenue','Revenue'),
 ('manual-expense','6-9000','Expense','Expense');
INSERT INTO public.bank_accounts(id,name,account_code,balance) VALUES('manual-bank','Manual Cash','1-1000',1000);
INSERT INTO public.clients(id,company_name,pic_name,created_at) VALUES('manual-client','Client','PIC','2026-10-16');
INSERT INTO public.vendors(id,company_name,pic_name,created_at) VALUES('manual-vendor','Vendor','PIC','2026-10-16');
CREATE FUNCTION pg_temp.manual(id text,kind text,payload jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.commit_finance_command(jsonb_build_object('eventId',id,'kind',kind,'payload',payload),'manual-finance');
$$;
CREATE FUNCTION pg_temp.manual_cash(id text,amount numeric,direction text DEFAULT 'Out') RETURNS jsonb LANGUAGE sql AS $$
 SELECT pg_temp.manual(id,'manual-cash',jsonb_build_object('transaction',jsonb_build_object('date','2026-10-16','type',direction,'bankAccountId','manual-bank','amount',amount,'category','Office expense','description','Offline manual test'),'counterAccountCode','6-9000'));
$$;
CREATE FUNCTION pg_temp.manual_reject(id text,kind text,payload jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN PERFORM pg_temp.manual(id,kind,payload); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Invalid manual command committed: %',id; END IF;
END $$;
-- The bank line uses the allowed camelCase key; a forbidden source-account
-- line must never bypass validation through post_journal_entry's legacy alias.
SELECT pg_temp.manual_reject('snake-ar-bypass','manual-cash','{
 "transaction":{"date":"2026-10-16","type":"In","bankAccountId":"manual-bank","amount":100,"category":"Other","description":"Source account bypass"},
 "debits":[{"accountCode":"1-1000","amount":100},{"account_code":"1-2000","amount":100}],
 "credits":[{"accountCode":"4-2000","amount":200}]
}');
DO $$ DECLARE replay jsonb; rejected boolean:=false; BEGIN
 PERFORM pg_temp.manual('opening','bank-opening','{"bank":{"id":"manual-opening-bank","name":"Opening","accountCode":"1-1000","balance":0},"amount":50,"date":"2026-10-16"}');
 PERFORM pg_temp.manual('zero-opening','bank-opening','{"bank":{"id":"manual-zero-bank","name":"Zero","accountCode":"1-1000","balance":0},"amount":0,"date":"2026-10-16"}');
 PERFORM pg_temp.manual('receivable','manual-receivable','{"invoice":{"id":"manual-invoice","clientId":"manual-client","issueDate":"2026-10-16T00:00:00Z","dueDate":"2026-11-16T00:00:00Z","totalAmount":100,"amountPaid":0,"status":"Unpaid","payments":[]}}');
 PERFORM pg_temp.manual('bill','manual-bill','{"bill":{"id":"manual-bill","billNumber":"VB-MANUAL","vendorId":"manual-vendor","issueDate":"2026-10-16","dueDate":"2026-11-16","description":"Office","totalAmount":40,"amountPaid":0,"status":"Pending","payments":[]},"debitAccountCode":"6-9000"}');
 PERFORM pg_temp.manual_cash('cash',10);
 replay:=pg_temp.manual_cash('cash',10);
 IF replay->>'alreadyPosted'<>'true' THEN RAISE EXCEPTION 'Identical cash retry not acknowledged'; END IF;
 BEGIN PERFORM pg_temp.manual_cash('cash',11); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Changed payload reused event ID'; END IF;
 PERFORM pg_temp.manual('credit','credit-note','{"invoiceId":"manual-invoice","amount":20,"reason":"Wrong price","cnNumber":"CN-MANUAL","date":"2026-10-16"}');
 PERFORM pg_temp.manual('credit','credit-note','{"invoiceId":"manual-invoice","amount":20,"reason":"Wrong price","cnNumber":"CN-MANUAL","date":"2026-10-16"}');
 IF (SELECT total_amount FROM public.invoices WHERE id='manual-invoice')<>80
  OR (SELECT amount_paid FROM public.invoices WHERE id='manual-invoice')<>0
  OR (SELECT total_amount FROM public.vendor_bills WHERE id='manual-bill')<>40
  OR (SELECT balance FROM public.bank_accounts WHERE id='manual-bank')<>990
  OR (SELECT balance FROM public.bank_accounts WHERE id='manual-opening-bank')<>50
  OR (SELECT balance FROM public.bank_accounts WHERE id='manual-zero-bank')<>0
  OR (SELECT count(*) FROM public.financial_command_events)<>6
  OR (SELECT count(*) FROM public.cash_transactions)<>2
  OR (SELECT count(*) FROM public.journal_entries)<>5
  OR (SELECT sum(debit_amount-credit_amount) FROM public.journal_lines)<>0 THEN RAISE EXCEPTION 'Manual command totals or replay facts wrong'; END IF;
 IF has_function_privilege('anon','public.commit_finance_command(jsonb,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.commit_finance_command(jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'Browser may execute manual finance'; END IF;
END $$;
-- Malformed/source-bypass attempts must leave no command event or financial leg.
DO $$ DECLARE item jsonb; before_count int:=(SELECT count(*) FROM public.financial_command_events); BEGIN
 FOR item IN SELECT value FROM jsonb_array_elements('[
  {"id":"missing-kind","kind":null,"payload":{}},
  {"id":"fractional","kind":"manual-cash","payload":{"transaction":{"amount":0.001,"date":"2026-10-16","type":"In","bankAccountId":"manual-bank","category":"Other","description":"Fractional"},"counterAccountCode":"3-1000"}},
  {"id":"invalid-date","kind":"bank-opening","payload":{"bank":{"id":"bad-date-bank","name":"Invalid date","accountCode":"1-1000"},"amount":0,"date":"infinity"}},
  {"id":"missing-date","kind":"bank-opening","payload":{"bank":{"id":"missing-date-bank","name":"Missing date","accountCode":"1-1000"},"amount":0}},
  {"id":"paid-bill","kind":"manual-bill","payload":{"bill":{"id":"paid-bill","billNumber":"PAID","vendorId":"manual-vendor","issueDate":"2026-10-16","dueDate":"2026-11-16","description":"Invalid paid state","totalAmount":40,"amountPaid":0,"status":"Paid"},"debitAccountCode":"6-9000"}},
  {"id":"paid-history","kind":"manual-receivable","payload":{"invoice":{"id":"paid-history","clientId":"manual-client","issueDate":"2026-10-16","dueDate":"2026-11-16","totalAmount":100,"payments":[{"id":"fake","amount":100}]}}},
  {"id":"over-credit","kind":"credit-note","payload":{"invoiceId":"manual-invoice","amount":81,"reason":"Too much credit","cnNumber":"OVER","date":"2026-10-16"}},
  {"id":"blocked-ar","kind":"manual-cash","payload":{"transaction":{"amount":10,"date":"2026-10-16","type":"In","bankAccountId":"manual-bank","category":"Other","description":"AR bypass"},"counterAccountCode":"1-2000"}},
  {"id":"line-id","kind":"manual-cash","payload":{"transaction":{"amount":10,"date":"2026-10-16","type":"In","bankAccountId":"manual-bank","category":"Other","description":"Line ID override"},"debits":[{"accountCode":"1-1000","amount":10,"id":"existing-posted-line"}],"credits":[{"accountCode":"3-1000","amount":10}]}},
  {"id":"almost-balanced","kind":"manual-cash","payload":{"transaction":{"amount":10,"date":"2026-10-16","type":"In","bankAccountId":"manual-bank","category":"Other","description":"Unbalanced cent"},"debits":[{"accountCode":"1-1000","amount":10}],"credits":[{"accountCode":"3-1000","amount":9.99}]}}
 ]') LOOP
  PERFORM pg_temp.manual_reject(item->>'id',item->>'kind',item->'payload');
 END LOOP;
 IF (SELECT count(*) FROM public.financial_command_events)<>before_count OR (SELECT balance FROM public.bank_accounts WHERE id='manual-bank')<>990 THEN RAISE EXCEPTION 'Invalid command left financial facts'; END IF;
END $$;
CREATE FUNCTION pg_temp.manual_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'manual-injected-failure'; END $$;
DO $$ DECLARE target text; rejected boolean; BEGIN
 FOREACH target IN ARRAY ARRAY['financial_command_events','journal_entries','journal_lines','cash_transactions','bank_accounts'] LOOP
  EXECUTE format('CREATE TRIGGER manual_fault BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION pg_temp.manual_fault()',target);
  rejected:=false;
  BEGIN PERFORM pg_temp.manual_cash('fault-'||target,1); EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%manual-injected-failure%' THEN RAISE; END IF; END;
  EXECUTE format('DROP TRIGGER manual_fault ON public.%I',target);
  IF NOT rejected OR (SELECT count(*) FROM public.financial_command_events)<>6 OR (SELECT balance FROM public.bank_accounts WHERE id='manual-bank')<>990
   OR (SELECT count(*) FROM public.cash_transactions)<>2 OR (SELECT count(*) FROM public.journal_entries)<>5 THEN RAISE EXCEPTION 'Manual cash partial commit after %',target; END IF;
 END LOOP;
 FOREACH target IN ARRAY ARRAY['financial_command_events','credit_notes','journal_entries','journal_lines','invoices'] LOOP
  EXECUTE format('CREATE TRIGGER manual_fault BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION pg_temp.manual_fault()',target);
  rejected:=false;
  BEGIN PERFORM pg_temp.manual('credit-fault-'||target,'credit-note',jsonb_build_object('invoiceId','manual-invoice','amount',1,'reason','Fault credit','cnNumber','CN-FAULT-'||target,'date','2026-10-16'));
  EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%manual-injected-failure%' THEN RAISE; END IF; END;
  EXECUTE format('DROP TRIGGER manual_fault ON public.%I',target);
  IF NOT rejected OR (SELECT count(*) FROM public.financial_command_events)<>6 OR (SELECT total_amount FROM public.invoices WHERE id='manual-invoice')<>80
   OR (SELECT count(*) FROM public.credit_notes)<>1 OR (SELECT count(*) FROM public.journal_entries)<>5 THEN RAISE EXCEPTION 'Credit note partial commit after %',target; END IF;
 END LOOP;
END $$;
-- Cumulative straight-line depreciation is one source command, never a journal
-- followed by a separately persisted asset value.
INSERT INTO public.coas(id,account_code,account_name,account_type) VALUES
 ('manual-depreciation','6-2000','Depreciation','Expense'),('manual-accumulated','1-4999','Accumulated depreciation','Asset');
INSERT INTO public.fixed_assets(id,name,category,purchase_date,purchase_price,economic_life_months,salvage_value,current_value,accumulated_depreciation,status)
 VALUES('manual-asset','Offline Asset','Peralatan','2026-01-15',1200,12,0,1200,0,'Active');
DO $$ DECLARE result jsonb; BEGIN
 result:=pg_temp.manual('depreciation-2026-03','depreciation','{"assetId":"manual-asset","date":"2026-03-16"}');
 IF (SELECT accumulated_depreciation FROM public.fixed_assets WHERE id='manual-asset')<>200
  OR (SELECT current_value FROM public.fixed_assets WHERE id='manual-asset')<>1000 THEN RAISE EXCEPTION 'Depreciation target not derived on server'; END IF;
 PERFORM pg_temp.manual('depreciation-2026-03','depreciation','{"assetId":"manual-asset","date":"2026-03-16"}');
 result:=pg_temp.manual('depreciation-other-id','depreciation','{"assetId":"manual-asset","date":"2026-03-16"}');
 IF result->>'noFinancialChange'<>'true' OR jsonb_array_length(result->'fixed_assets')<>1 OR jsonb_array_length(result->'journal_entries')<>0 THEN RAISE EXCEPTION 'Depreciation no-op acknowledgement is incomplete'; END IF;
 PERFORM pg_temp.manual('depreciation-2026-04','depreciation','{"assetId":"manual-asset","date":"2026-04-16"}');
 IF (SELECT accumulated_depreciation FROM public.fixed_assets WHERE id='manual-asset')<>300
  OR (SELECT sum(debit_amount) FROM public.journal_lines WHERE account_id='manual-depreciation')<>300 THEN RAISE EXCEPTION 'Depreciation retries or next period duplicated cost'; END IF;
END $$;
-- New return fields from the revised goods migration; IF NOT EXISTS keeps this
-- fixture runnable against the disposable DB loaded before that revision.
ALTER TABLE public.pending_returns ADD COLUMN IF NOT EXISTS invoice_id text;
ALTER TABLE public.pending_returns ADD COLUMN IF NOT EXISTS unit_price numeric;
ALTER TABLE public.pending_returns ADD COLUMN IF NOT EXISTS return_decision text;
ALTER TABLE public.pending_returns ADD COLUMN IF NOT EXISTS financial_adjustment_status text;
INSERT INTO public.invoices(id,client_id,issue_date,due_date,total_amount,amount_paid,status) VALUES
 ('manual-paid-invoice','manual-client','2026-10-16','2026-11-16',100,100,'Paid'),
 ('manual-partial-invoice','manual-client','2026-10-16','2026-11-16',100,70,'Partial');
INSERT INTO public.pending_returns(id,product_id,original_so_id,qty,reason,date,status,invoice_id,unit_price,return_decision,financial_adjustment_status)
 VALUES('manual-return','product','so',0.125,'Returned goods','2026-10-16','Pending QC','manual-paid-invoice',320,'Replace','Pending Finance');
DO $$ DECLARE result jsonb; BEGIN
 PERFORM pg_temp.manual_reject('over-return','credit-note','{"invoiceId":"manual-paid-invoice","amount":41,"reason":"Paid returned goods","cnNumber":"CN-RETURN-OVER","date":"2026-10-16","sourceReturnId":"manual-return"}');
 result:=pg_temp.manual('paid-return-cn','credit-note','{"invoiceId":"manual-paid-invoice","amount":40,"reason":"Paid returned goods","cnNumber":"CN-RETURN","date":"2026-10-16","sourceReturnId":"manual-return"}');
 result:=pg_temp.manual('paid-return-cn','credit-note','{"invoiceId":"manual-paid-invoice","amount":40,"reason":"Paid returned goods","cnNumber":"CN-RETURN","date":"2026-10-16","sourceReturnId":"manual-return"}');
 IF (SELECT amount_paid FROM public.invoices WHERE id='manual-paid-invoice')<>100
  OR (SELECT total_amount FROM public.invoices WHERE id='manual-paid-invoice')<>60
  OR (SELECT refundable_amount FROM public.credit_notes WHERE id='paid-return-cn')<>40
  OR (SELECT financial_adjustment_status FROM public.pending_returns WHERE id='manual-return')<>'Credited'
  OR result#>>'{pending_returns,0,financial_adjustment_status}'<>'Credited' THEN RAISE EXCEPTION 'Paid return credit/replay source linkage incorrect'; END IF;
 PERFORM pg_temp.manual_reject('same-return-again','credit-note','{"invoiceId":"manual-paid-invoice","amount":10,"reason":"Repeated returned goods","cnNumber":"CN-RETURN-AGAIN","date":"2026-10-16","sourceReturnId":"manual-return"}');
 PERFORM pg_temp.manual('partial-cn','credit-note','{"invoiceId":"manual-partial-invoice","amount":50,"reason":"Partial paid credit","cnNumber":"CN-PARTIAL","date":"2026-10-16"}');
 IF (SELECT refundable_amount FROM public.credit_notes WHERE id='partial-cn')<>20
  OR (SELECT sum(credit_amount) FROM public.journal_lines WHERE journal_entry_id='cmd-partial-cn' AND account_id='manual-ar')<>30
  OR (SELECT amount_paid FROM public.invoices WHERE id='manual-partial-invoice')<>70 THEN RAISE EXCEPTION 'Partial paid credit did not split AR/refund liability'; END IF;
 PERFORM pg_temp.manual('refund-first','credit-refund','{"creditNoteId":"paid-return-cn","date":"2026-10-16","bankAccountId":"manual-bank","amount":15}');
 PERFORM pg_temp.manual('refund-first','credit-refund','{"creditNoteId":"paid-return-cn","date":"2026-10-16","bankAccountId":"manual-bank","amount":15}');
 PERFORM pg_temp.manual_reject('refund-over','credit-refund','{"creditNoteId":"paid-return-cn","date":"2026-10-16","bankAccountId":"manual-bank","amount":26}');
 PERFORM pg_temp.manual('refund-last','credit-refund','{"creditNoteId":"paid-return-cn","date":"2026-10-16","bankAccountId":"manual-bank","amount":25}');
 IF (SELECT refunded_amount FROM public.credit_notes WHERE id='paid-return-cn')<>40
  OR (SELECT balance FROM public.bank_accounts WHERE id='manual-bank')<>950
  OR (SELECT amount_paid FROM public.invoices WHERE id='manual-paid-invoice')<>100
  OR (SELECT count(*) FROM public.cash_transactions WHERE category='Refund Klien')<>2
  OR (SELECT sum(credit_amount-debit_amount) FROM public.journal_lines WHERE account_id=(SELECT id FROM public.coas WHERE account_code='2-5000'))<>20 THEN RAISE EXCEPTION 'Refund payment/retry totals or remaining liability incorrect'; END IF;
END $$;
DO $$ DECLARE target text; rejected boolean; before_count int:=(SELECT count(*) FROM public.financial_command_events); BEGIN
 FOREACH target IN ARRAY ARRAY['financial_command_events','journal_entries','journal_lines','cash_transactions','bank_accounts','credit_notes'] LOOP
  EXECUTE format('CREATE TRIGGER manual_fault BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION pg_temp.manual_fault()',target);
  rejected:=false;
  BEGIN PERFORM pg_temp.manual('refund-fault-'||target,'credit-refund',jsonb_build_object('creditNoteId','partial-cn','date','2026-10-16','bankAccountId','manual-bank','amount',1));
  EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%manual-injected-failure%' THEN RAISE; END IF; END;
  EXECUTE format('DROP TRIGGER manual_fault ON public.%I',target);
  IF NOT rejected OR (SELECT count(*) FROM public.financial_command_events)<>before_count OR (SELECT balance FROM public.bank_accounts WHERE id='manual-bank')<>950
   OR (SELECT refunded_amount FROM public.credit_notes WHERE id='partial-cn')<>0 THEN RAISE EXCEPTION 'Refund partial commit after %',target; END IF;
 END LOOP;
 FOREACH target IN ARRAY ARRAY['financial_command_events','journal_entries','journal_lines','fixed_assets'] LOOP
  EXECUTE format('CREATE TRIGGER manual_fault BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION pg_temp.manual_fault()',target);
  rejected:=false;
  BEGIN PERFORM pg_temp.manual('depreciation-fault-'||target,'depreciation',jsonb_build_object('assetId','manual-asset','date','2026-05-16'));
  EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%manual-injected-failure%' THEN RAISE; END IF; END;
  EXECUTE format('DROP TRIGGER manual_fault ON public.%I',target);
  IF NOT rejected OR (SELECT count(*) FROM public.financial_command_events)<>before_count OR (SELECT accumulated_depreciation FROM public.fixed_assets WHERE id='manual-asset')<>300 THEN RAISE EXCEPTION 'Depreciation partial commit after %',target; END IF;
 END LOOP;
END $$;
INSERT INTO public.pending_returns(id,product_id,original_so_id,qty,reason,date,status,invoice_id,unit_price,return_decision,financial_adjustment_status)
 VALUES('manual-return-fault','product','so',1,'Returned goods','2026-10-16','Pending QC','manual-paid-invoice',10,'Cancel','Pending Finance');
CREATE TRIGGER manual_fault BEFORE UPDATE ON public.pending_returns FOR EACH ROW EXECUTE FUNCTION pg_temp.manual_fault();
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN PERFORM pg_temp.manual('source-credit-fault','credit-note','{"invoiceId":"manual-paid-invoice","amount":10,"reason":"Returned source fault","cnNumber":"CN-SOURCE-FAULT","date":"2026-10-16","sourceReturnId":"manual-return-fault"}');
 EXCEPTION WHEN OTHERS THEN rejected:=true; IF SQLERRM NOT LIKE '%manual-injected-failure%' THEN RAISE; END IF; END;
 IF NOT rejected OR EXISTS(SELECT 1 FROM public.credit_notes WHERE id='source-credit-fault')
  OR (SELECT total_amount FROM public.invoices WHERE id='manual-paid-invoice')<>60
  OR (SELECT financial_adjustment_status FROM public.pending_returns WHERE id='manual-return-fault')<>'Pending Finance' THEN RAISE EXCEPTION 'Source-return adjustment partial commit'; END IF;
END $$;
DROP TRIGGER manual_fault ON public.pending_returns;
INSERT INTO public.users(id,name,role,pin,is_active) VALUES('manual-performer','Paper Performer','kurir','7830',false);
DO $$ DECLARE result jsonb; BEGIN
 result:=pg_temp.manual('paper-expense','paper-expense','{"recordType":"expense","id":"paper-expense-row","date":"2026-10-15T06:30:00Z","performedBy":"manual-performer","bankAccountId":"manual-bank","amount":5,"category":"Bensin","description":"Actual paper fuel","receiptUrl":"proof://fuel"}');
 PERFORM pg_temp.manual('paper-expense','paper-expense','{"recordType":"expense","id":"paper-expense-row","date":"2026-10-15T06:30:00Z","performedBy":"manual-performer","bankAccountId":"manual-bank","amount":5,"category":"Bensin","description":"Actual paper fuel","receiptUrl":"proof://fuel"}');
 PERFORM pg_temp.manual('paper-reimbursement','paper-expense','{"recordType":"reimbursement","id":"paper-reimb-row","payeeId":"manual-performer","date":"2026-10-15T06:30:00Z","performedBy":"manual-performer","amount":7,"category":"Parkir","description":"Actually paid personally","receiptUrl":"proof://reimb"}');
 IF (SELECT count(*) FROM expenses WHERE id='paper-expense-row')<>1 OR (SELECT reporter_id FROM expenses WHERE id='paper-expense-row')<>'manual-performer'
  OR (SELECT source_bank_account_id FROM expenses WHERE id='paper-expense-row')<>'manual-bank'
  OR (SELECT recorded_by FROM expenses WHERE id='paper-expense-row')<>'manual-finance'
  OR (SELECT user_id FROM reimbursements WHERE id='paper-reimb-row')<>'manual-performer'
  OR (SELECT status FROM reimbursements WHERE id='paper-reimb-row')<>'Pending'
  OR (SELECT balance FROM bank_accounts WHERE id='manual-bank')<>950
  OR EXISTS(SELECT 1 FROM journal_entries WHERE id IN ('cmd-paper-expense','cmd-paper-reimbursement'))
  OR result->>'noFinancialChange'<>'true' THEN RAISE EXCEPTION 'Paper creation split money or lost performer/recorder facts'; END IF;
 PERFORM pg_temp.manual_reject('paper-no-proof','paper-expense','{"recordType":"reimbursement","id":"paper-no-proof","payeeId":"manual-performer","date":"2026-10-15","performedBy":"manual-performer","amount":7,"category":"Parkir","description":"Missing proof"}');
 PERFORM pg_temp.manual_reject('paper-no-source','paper-expense','{"recordType":"expense","id":"paper-no-source","date":"2026-10-15","performedBy":"manual-performer","amount":7,"category":"Parkir","description":"Missing cash source"}');
END $$;
DO $$ DECLARE target text; denied boolean; eid text; BEGIN
 FOREACH target IN ARRAY ARRAY['expenses','financial_command_events'] LOOP
  eid:='paper-fault-'||target;
  EXECUTE format('CREATE TRIGGER manual_fault BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION pg_temp.manual_fault()',target);
  denied:=false;
  BEGIN PERFORM pg_temp.manual(eid,'paper-expense',jsonb_build_object('recordType','expense','id',eid,'date','2026-10-15','performedBy','manual-performer','bankAccountId','manual-bank','amount',5,'category','Bensin','description','Fault paper','receiptUrl','proof://paper'));
  EXCEPTION WHEN OTHERS THEN denied:=true; IF SQLERRM NOT LIKE '%manual-injected-failure%' THEN RAISE; END IF; END;
  EXECUTE format('DROP TRIGGER manual_fault ON public.%I',target);
  IF NOT denied OR EXISTS(SELECT 1 FROM public.expenses WHERE id=eid) OR EXISTS(SELECT 1 FROM public.financial_command_events WHERE id=eid) THEN RAISE EXCEPTION 'Paper pending row/event partial commit'; END IF;
 END LOOP;
END $$;
UPDATE public.bank_accounts SET cfo_approval_required=true WHERE id='manual-bank';
SELECT pg_temp.manual_reject('cash-cfo-bypass','manual-cash','{"transaction":{"date":"2026-10-16","type":"Out","bankAccountId":"manual-bank","amount":1,"category":"Other","description":"CFO gate"},"counterAccountCode":"6-9000"}');
SELECT pg_temp.manual_reject('refund-cfo-bypass','credit-refund','{"creditNoteId":"partial-cn","date":"2026-10-16","bankAccountId":"manual-bank","amount":1}');
ROLLBACK;
\echo PASS real manual cash/AP/AR/opening/CN/paid-return/refund/depreciation/paper commands, retries/conflicts/malformed source bypass and all-stage rollback

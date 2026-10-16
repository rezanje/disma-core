begin;
create table if not exists public.financial_command_events(
 id text primary key,kind text not null,payload jsonb not null,result jsonb not null,
 actor_id text not null,created_at timestamptz not null default now()
);
alter table public.financial_command_events enable row level security;
revoke all on public.financial_command_events from public,anon,authenticated;
grant select on public.financial_command_events to service_role;

-- Paper transcription preserves the physical performer, personal payee and server recorder.
alter table public.expenses add column if not exists performed_by text;
alter table public.expenses add column if not exists recorded_by text;
alter table public.expenses add column if not exists recorded_at timestamptz;
alter table public.expenses add column if not exists channel text;
alter table public.reimbursements add column if not exists performed_by text;
alter table public.reimbursements add column if not exists recorded_by text;
alter table public.reimbursements add column if not exists recorded_at timestamptz;
alter table public.reimbursements add column if not exists channel text;

-- One source return can receive one financial adjustment. Historical notes stay unlinked.
alter table public.credit_notes add column if not exists source_return_id text;
alter table public.credit_notes add column if not exists refundable_amount numeric not null default 0;
alter table public.credit_notes add column if not exists refunded_amount numeric not null default 0;
insert into public.coas(id,account_code,account_name,account_type)
 select 'coa-customer-refunds','2-5000','Utang Refund Klien','Liability'
 where not exists(select 1 from public.coas where account_code='2-5000');
create unique index if not exists credit_notes_source_return_unique on public.credit_notes(source_return_id) where source_return_id is not null;

create or replace function public.finance_command_amount(v jsonb,allow_zero boolean default false) returns numeric
language plpgsql immutable set search_path=public,pg_temp as $$
declare amount numeric;
begin
 if jsonb_typeof(v) is distinct from 'number' then raise exception 'Amount must be a JSON number'; end if;
 amount:=v::numeric;
 if amount::text in ('NaN','Infinity','-Infinity') or round(amount,2)<>amount or amount<0 or (amount=0 and not allow_zero) then raise exception 'Amount must be finite, positive and have at most two decimal places'; end if;
 return amount;
end $$;
create or replace function public.finance_command_date(v text) returns text
language plpgsql immutable set search_path=public,pg_temp as $$
begin
 if nullif(trim(v),'') is null or not isfinite(v::timestamptz) then raise exception 'A finite transaction date is required'; end if;
 return v;
end $$;
revoke all on function public.finance_command_amount(jsonb,boolean),public.finance_command_date(text) from public,anon,authenticated;
grant execute on function public.finance_command_amount(jsonb,boolean),public.finance_command_date(text) to service_role;

-- A credit note can settle the remaining AR without another cash receipt.
-- Keep the issued TF value, and close its status from current child obligations.
create or replace function public.tf_check_auto_paid() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if NEW.tukar_faktur_id is null then return NEW; end if;
 perform id from public.tukar_faktur where id=NEW.tukar_faktur_id for update;
 if not exists(select 1 from public.invoices where tukar_faktur_id=NEW.tukar_faktur_id
   and (status='Draft' or greatest(total_amount-amount_paid,0)>0)) then
  update public.tukar_faktur set status='Paid' where id=NEW.tukar_faktur_id and status<>'Draft';
 end if;
 return NEW;
end $$;
revoke all on function public.tf_check_auto_paid() from public,anon,authenticated;
drop trigger if exists invoices_tf_auto_paid on public.invoices;
create trigger invoices_tf_auto_paid after update of status,total_amount,amount_paid on public.invoices
 for each row when(NEW.tukar_faktur_id is not null and NEW.status in ('Paid','Cancelled')) execute function public.tf_check_auto_paid();

create or replace function public.commit_finance_command(p_command jsonb,p_actor_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_id text:=nullif(trim(p_command->>'eventId'),''); v_kind text:=p_command->>'kind';
 p jsonb:=p_command->'payload'; v_existing public.financial_command_events%rowtype;
 v_amount numeric; v_date text; v_bank_id text; v_bank public.bank_accounts%rowtype;
 v_invoice_id text; v_bill_id text; v_note_id text; v_source jsonb;
 v_invoice public.invoices%rowtype; v_vendor public.vendors%rowtype;
 v_debits jsonb; v_credits jsonb; v_counter text; v_entry text; v_cash text;
 v_line jsonb; v_bank_net numeric; v_total numeric; v_expected numeric;
 v_result jsonb; v_replayed boolean:=false; v_return_id text; v_return jsonb; v_debit_total numeric; v_credit_total numeric; v_ar_credit numeric; v_refundable numeric;
 v_asset_id text; v_asset public.fixed_assets%rowtype; v_months int; v_target numeric; v_note public.credit_notes%rowtype; v_paper_id text; v_record_type text;
begin
 if jsonb_typeof(p_command) is distinct from 'object' or jsonb_typeof(p) is distinct from 'object'
   or v_id is null or length(v_id)>160 or nullif(trim(p_actor_id),'') is null then raise exception 'Invalid financial command'; end if;
 if v_kind is null or v_kind not in ('credit-note','manual-bill','manual-receivable','manual-cash','bank-opening','depreciation','credit-refund','paper-expense') then raise exception 'Unsupported financial command'; end if;
 perform pg_advisory_xact_lock(hashtextextended('finance-command:'||v_id,0));
 select * into v_existing from public.financial_command_events where id=v_id for update;
 v_entry:='cmd-'||v_id; v_cash:='cmd-cash-'||v_id;
 v_invoice_id:=case v_kind when 'credit-note' then p->>'invoiceId' when 'manual-receivable' then p#>>'{invoice,id}' end;
 v_bill_id:=case when v_kind='manual-bill' then p#>>'{bill,id}' end;
 v_note_id:=case when v_kind='credit-note' then v_id when v_kind='credit-refund' then p->>'creditNoteId' end;
 v_asset_id:=case when v_kind='depreciation' then p->>'assetId' end;
 v_paper_id:=case when v_kind='paper-expense' then p->>'id' end;
 v_record_type:=case when v_kind='paper-expense' then p->>'recordType' end;
 v_return_id:=case when v_kind='credit-note' then nullif(trim(p->>'sourceReturnId'),'') end;
 v_bank_id:=case v_kind when 'manual-cash' then p#>>'{transaction,bankAccountId}' when 'bank-opening' then p#>>'{bank,id}' when 'credit-refund' then p->>'bankAccountId' end;
 if found then
  if v_existing.kind<>v_kind or v_existing.payload<>p then raise exception 'Event ID already used with a different payload'; end if;
  v_replayed:=true;
 else
  if v_kind='credit-note' then
   v_amount:=public.finance_command_amount(p->'amount'); v_date:=public.finance_command_date(p->>'date');
   select * into v_invoice from public.invoices where id=v_invoice_id for update;
   if not found or v_invoice.status not in ('Unpaid','Partial','Paid') or coalesce(v_invoice.is_consolidated,false) or v_invoice.superseded_by_invoice_id is not null then raise exception 'Invoice cannot be credited'; end if;
   if v_amount is null or v_amount::text in ('NaN','Infinity','-Infinity') or v_amount<=0 or v_amount>v_invoice.total_amount or length(trim(coalesce(p->>'reason','')))<5 then raise exception 'Invalid credit amount or reason'; end if;
   v_return_id:=nullif(trim(p->>'sourceReturnId'),'');
   if v_return_id is not null then
    select to_jsonb(r) into v_return from public.pending_returns r where id=v_return_id for update;
    if not found or v_return->>'invoice_id' is distinct from v_invoice_id
     or v_return->>'return_decision' is null or v_return->>'return_decision' not in ('Replace','Cancel')
     or v_return->>'financial_adjustment_status' is distinct from 'Pending Finance' then raise exception 'Source return is not awaiting this invoice credit'; end if;
    if jsonb_typeof(v_return->'qty') is distinct from 'number' or jsonb_typeof(v_return->'unit_price') is distinct from 'number'
     or (v_return->>'qty')::numeric<=0 or (v_return->>'qty') in ('NaN','Infinity','-Infinity')
     or (v_return->>'unit_price')::numeric<0 or (v_return->>'unit_price') in ('NaN','Infinity','-Infinity') then raise exception 'Historical returned quantity/price is invalid'; end if;
    v_expected:=case when v_return->>'credit_amount' is not null then public.finance_command_amount(v_return->'credit_amount',true) else round((v_return->>'qty')::numeric*(v_return->>'unit_price')::numeric,2) end;
    if v_amount<>v_expected then raise exception 'Credit must equal the frozen returned amount'; end if;
   end if;
   insert into public.credit_notes(id,cn_number,invoice_id,client_id,date,amount,invoice_total_before,reason,created_by,source_return_id,refundable_amount,refunded_amount)
    values(v_note_id,p->>'cnNumber',v_invoice.id,v_invoice.client_id,v_date::timestamptz,v_amount,v_invoice.total_amount,trim(p->>'reason'),p_actor_id,v_return_id,greatest(0,v_amount-greatest(0,v_invoice.total_amount-v_invoice.amount_paid)),0);
   v_debits:=jsonb_build_array(jsonb_build_object('accountCode','4-1000','amount',v_amount));
   v_ar_credit:=least(v_amount,greatest(0,v_invoice.total_amount-v_invoice.amount_paid));
   v_refundable:=v_amount-v_ar_credit;
   v_credits:='[]';
   if v_ar_credit>0 then v_credits:=v_credits||jsonb_build_array(jsonb_build_object('accountCode','1-2000','amount',v_ar_credit)); end if;
   if v_refundable>0 then v_credits:=v_credits||jsonb_build_array(jsonb_build_object('accountCode','2-5000','amount',v_refundable)); end if;
   perform public.post_journal_entry(v_entry,v_date,'Credit note '||coalesce(p->>'cnNumber',v_id),'Adjustment',v_id,v_debits,v_credits);
   update public.invoices set total_amount=total_amount-v_amount,
    status=case when total_amount-v_amount<=0 then 'Cancelled' when amount_paid>=total_amount-v_amount then 'Paid' when amount_paid>0 then 'Partial' else 'Unpaid' end
    where id=v_invoice.id;
   if v_return_id is not null then update public.pending_returns set financial_adjustment_status='Credited' where id=v_return_id; end if;
  elsif v_kind='credit-refund' then
   v_amount:=public.finance_command_amount(p->'amount');v_date:=public.finance_command_date(p->>'date');
   select * into v_note from public.credit_notes where id=v_note_id for update;
   if not found or v_amount>v_note.refundable_amount-v_note.refunded_amount then raise exception 'Refund exceeds the remaining source credit liability'; end if;
   v_invoice_id:=v_note.invoice_id;
   select * into v_bank from public.bank_accounts where id=v_bank_id for update;
   if not found or v_bank.balance::text in ('NaN','Infinity','-Infinity') or v_bank.balance<v_amount or v_bank.account_code !~ '^1-1[0-9]{3}$' or nullif(v_bank.account_code,'') is null then raise exception 'Refund bank missing or balance insufficient'; end if;
   if v_bank.cfo_approval_required and not exists(select 1 from public.users where id=p_actor_id and role='super_admin' and is_active=true) then raise exception 'Source bank requires Super Admin approval'; end if;
   perform public.post_journal_entry(v_entry,v_date,'Refund credit note '||v_note.cn_number,'Payment',v_id,
    jsonb_build_array(jsonb_build_object('accountCode','2-5000','amount',v_amount)),jsonb_build_array(jsonb_build_object('accountCode',v_bank.account_code,'amount',v_amount)));
   perform public.post_cash_transaction(jsonb_build_object('id',v_cash,'date',v_date,'type','Out','bankAccountId',v_bank_id,'amount',v_amount,
    'category','Refund Klien','description','Refund credit note '||v_note.cn_number,'referenceType','Manual','referenceId',v_id));
   update public.credit_notes set refunded_amount=refunded_amount+v_amount where id=v_note_id;
  elsif v_kind='paper-expense' then
   v_amount:=public.finance_command_amount(p->'amount');v_date:=public.finance_command_date(p->>'date');
   if v_record_type is null or v_record_type not in ('expense','reimbursement') or nullif(trim(v_paper_id),'') is null
    or not exists(select 1 from public.users where id=p->>'performedBy')
    or nullif(trim(p->>'category'),'') is null or nullif(trim(p->>'description'),'') is null
    or nullif(trim(p->>'receiptUrl'),'') is null then raise exception 'Paper type, identity, actual performer, category, description and receipt proof are required'; end if;
   if p->>'channel' is not null and p->>'channel' not in ('sourcing','kurir') then raise exception 'Invalid paper expense channel'; end if;
   if nullif(p->>'purchaseId','') is not null and not exists(select 1 from public.purchases where id=p->>'purchaseId') then raise exception 'Selected paper purchase not found'; end if;
   if v_record_type='expense' then
    if not exists(select 1 from public.bank_accounts where id=p->>'bankAccountId' and account_code ~ '^1-1[0-9]{3}$') then raise exception 'Select the actual source bank/pocket'; end if;
    if p->>'category' in ('Belanja Online','Sourcing (HPP)','Setoran Pengembalian') then raise exception 'Use the purchase or return source command'; end if;
    insert into public.expenses(id,date,reporter_id,category,amount,description,receipt_url,status,is_journaled,source_bank_account_id,purchase_id,performed_by,recorded_by,recorded_at,channel)
     values(v_paper_id,v_date,p->>'performedBy',p->>'category',v_amount,p->>'description',p->>'receiptUrl','Pending Audit',false,p->>'bankAccountId',nullif(p->>'purchaseId',''),p->>'performedBy',p_actor_id,clock_timestamp(),p->>'channel');
   else
    if not exists(select 1 from public.users where id=p->>'payeeId') then raise exception 'Select the actual reimbursement payee'; end if;
    insert into public.reimbursements(id,date,user_id,title,amount,description,receipt_url,status,purchase_id,kind,performed_by,recorded_by,recorded_at,channel)
     values(v_paper_id,v_date,p->>'payeeId',(p->>'category')||': '||(p->>'description'),v_amount,p->>'description',p->>'receiptUrl','Pending',nullif(p->>'purchaseId',''),'Manual',p->>'performedBy',p_actor_id,clock_timestamp(),p->>'channel');
   end if;
  elsif v_kind='depreciation' then
   v_date:=public.finance_command_date(p->>'date');
   select * into v_asset from public.fixed_assets where id=v_asset_id for update;
   if not found or v_asset.status<>'Active' or v_asset.economic_life_months<=0
    or v_asset.purchase_price::text in ('NaN','Infinity','-Infinity') or v_asset.salvage_value::text in ('NaN','Infinity','-Infinity')
    or v_asset.accumulated_depreciation::text in ('NaN','Infinity','-Infinity')
    or v_asset.purchase_price<0 or v_asset.salvage_value<0 or v_asset.salvage_value>v_asset.purchase_price
    or v_asset.accumulated_depreciation<0 or v_asset.accumulated_depreciation>v_asset.purchase_price-v_asset.salvage_value then raise exception 'Invalid active asset depreciation schedule'; end if;
   perform public.finance_command_date(v_asset.purchase_date);
   v_months:=greatest(0,least(v_asset.economic_life_months,
    (extract(year from v_date::timestamptz)-extract(year from v_asset.purchase_date::timestamptz))::int*12
    +(extract(month from v_date::timestamptz)-extract(month from v_asset.purchase_date::timestamptz))::int));
   v_target:=greatest(v_asset.accumulated_depreciation,round((v_asset.purchase_price-v_asset.salvage_value)*v_months/v_asset.economic_life_months,2));
   v_amount:=v_target-v_asset.accumulated_depreciation;
   if v_amount>0 then
    perform public.post_journal_entry(v_entry,v_date,'Penyusutan aset '||v_asset.name||' - '||to_char(v_date::timestamptz,'YYYY-MM'),'Depreciation',v_id,
     jsonb_build_array(jsonb_build_object('accountCode','6-2000','amount',v_amount)),jsonb_build_array(jsonb_build_object('accountCode','1-4999','amount',v_amount)));
    update public.fixed_assets set accumulated_depreciation=v_target,current_value=purchase_price-v_target where id=v_asset.id;
   end if;
  elsif v_kind='manual-receivable' then
   v_source:=p->'invoice'; v_amount:=public.finance_command_amount(v_source->'totalAmount');v_date:=public.finance_command_date(v_source->>'issueDate');
   if nullif(v_invoice_id,'') is null or v_amount is null or v_amount::text in ('NaN','Infinity','-Infinity') or v_amount<=0 or coalesce((v_source->>'amountPaid')::numeric,0)<>0 or coalesce(v_source->>'status','Unpaid')<>'Unpaid' then raise exception 'Invalid new manual invoice'; end if;
   if (v_source ? 'payments' and v_source->'payments' is distinct from '[]'::jsonb) then raise exception 'New manual invoice cannot include payments'; end if;
   if not exists(select 1 from public.clients where id=v_source->>'clientId') then raise exception 'Client not found'; end if;
   perform public.finance_command_date(v_source->>'dueDate');
   if (v_source->>'dueDate')::timestamptz<v_date::timestamptz then raise exception 'Due date cannot precede issue date'; end if;
   if exists(select 1 from public.invoices where id=v_invoice_id) then raise exception 'Invoice ID already exists'; end if;
   insert into public.invoices(id,client_id,issue_date,due_date,total_amount,amount_paid,status,payments)
    values(v_invoice_id,v_source->>'clientId',v_date,v_source->>'dueDate',v_amount,0,'Unpaid','[]'::jsonb);
   perform public.post_journal_entry(v_entry,v_date,'Manual invoice '||v_invoice_id,'Invoice',v_invoice_id,
    jsonb_build_array(jsonb_build_object('accountCode','1-2000','amount',v_amount)),jsonb_build_array(jsonb_build_object('accountCode','4-1000','amount',v_amount)));
  elsif v_kind='manual-bill' then
   v_source:=p->'bill';v_amount:=public.finance_command_amount(v_source->'totalAmount');v_date:=public.finance_command_date(v_source->>'issueDate');v_counter:=p->>'debitAccountCode';
   select * into v_vendor from public.vendors where id=v_source->>'vendorId';
   if not found then raise exception 'Vendor not found'; end if;
   if nullif(v_bill_id,'') is null or v_amount is null or v_amount::text in ('NaN','Infinity','-Infinity') or v_amount<=0 or coalesce((v_source->>'amountPaid')::numeric,0)<>0 then raise exception 'Invalid new vendor bill'; end if;
   if coalesce(v_source->>'status','Pending')<>'Pending' or (v_source ? 'payments' and v_source->'payments' is distinct from '[]'::jsonb) then raise exception 'New manual bill cannot include paid state'; end if;
   if v_counter='1-3000' then v_counter:='2-1100'; end if;
   if not (v_counter like '6-%' or v_counter like '1-4%' or v_counter='2-1100') then raise exception 'Use goods receipt for inventory/AP source'; end if;
   perform public.finance_command_date(v_source->>'dueDate');
   if (v_source->>'dueDate')::timestamptz<v_date::timestamptz then raise exception 'Due date cannot precede issue date'; end if;
   if exists(select 1 from public.vendor_bills where id=v_bill_id) then raise exception 'Bill ID already exists'; end if;
   insert into public.vendor_bills(id,bill_number,vendor_id,vendor_name,issue_date,due_date,description,category,total_amount,amount_paid,status,payments,created_at,created_by)
    values(v_bill_id,v_source->>'billNumber',v_vendor.id,v_vendor.company_name,v_date,v_source->>'dueDate',v_source->>'description',v_source->>'category',v_amount,0,'Pending','[]'::jsonb,now()::text,p_actor_id);
   perform public.post_journal_entry(v_entry,v_date,'Vendor bill '||v_bill_id,'Purchase',v_bill_id,
    jsonb_build_array(jsonb_build_object('accountCode',v_counter,'amount',v_amount)),
    jsonb_build_array(jsonb_build_object('accountCode','2-1000','amount',v_amount,'vendorId',v_vendor.id,'vendorBillId',v_bill_id)));
  else
   if v_kind='bank-opening' then
    v_source:=p->'bank';v_amount:=public.finance_command_amount(p->'amount',true);v_date:=public.finance_command_date(p->>'date');
    if nullif(trim(v_bank_id),'') is null or nullif(trim(v_source->>'name'),'') is null or coalesce((v_source->>'balance')::numeric,0)<>0 then raise exception 'Invalid new bank'; end if;
    if v_source->>'accountCode' !~ '^1-1[0-9]{3}$' then raise exception 'Bank must use a cash/advance asset account'; end if;
    if (select count(*) from public.coas where account_code=v_source->>'accountCode')<>1 then raise exception 'Bank COA must resolve uniquely'; end if;
    insert into public.bank_accounts(id,name,account_number,account_code,balance,purpose,owner_user_id,cfo_approval_required)
     values(v_bank_id,v_source->>'name',v_source->>'accountNumber',v_source->>'accountCode',0,coalesce(nullif(v_source->>'purpose',''),'umum'),nullif(v_source->>'ownerUserId',''),coalesce((v_source->>'cfoApprovalRequired')::boolean,false));
    v_source:=jsonb_build_object('id',v_cash,'date',v_date,'type','In','bankAccountId',v_bank_id,'amount',v_amount,'category','Saldo Awal','description','Saldo awal rekening','referenceType','Manual','referenceId',v_id);
    v_counter:='3-1000';
   else
    v_source:=p->'transaction';v_amount:=public.finance_command_amount(v_source->'amount');v_date:=public.finance_command_date(v_source->>'date');v_counter:=p->>'counterAccountCode';
    if v_source->>'category' in ('Pelunasan Piutang','Penjualan Tunai','Belanja Barang (HPP)','Refund Vendor','Refund Klien','Bayar Hutang Vendor') then raise exception 'Use the source invoice, vendor payment, purchase or claim command'; end if;
   end if;
   if v_amount is null or v_amount::text in ('NaN','Infinity','-Infinity') or (v_amount<=0 and not(v_kind='bank-opening' and v_amount=0)) then raise exception 'Amount must be finite and positive'; end if;
   if v_source->>'type' is null or v_source->>'type' not in ('In','Out') then raise exception 'Invalid cash direction'; end if;
   perform public.finance_command_date(v_date);
   select * into v_bank from public.bank_accounts where id=v_bank_id for update;
   if not found or nullif(v_bank.account_code,'') is null or v_bank.account_code !~ '^1-1[0-9]{3}$' or v_bank.balance::text in ('NaN','Infinity','-Infinity') then raise exception 'Mapped cash/advance bank not found'; end if;
   if v_amount>0 then
    if v_source->>'type'='Out' and v_bank.cfo_approval_required and not exists(select 1 from public.users where id=p_actor_id and role='super_admin' and is_active=true) then raise exception 'Source bank requires Super Admin approval'; end if;
    if p ? 'debits' or p ? 'credits' then
     v_debits:=p->'debits';v_credits:=p->'credits';
     if jsonb_typeof(v_debits) is distinct from 'array' or jsonb_typeof(v_credits) is distinct from 'array' then raise exception 'Both journal sides are required'; end if;
    elsif v_source->>'type'='In' then
     v_debits:=jsonb_build_array(jsonb_build_object('accountCode',v_bank.account_code,'amount',v_amount));v_credits:=jsonb_build_array(jsonb_build_object('accountCode',v_counter,'amount',v_amount));
    else
     v_debits:=jsonb_build_array(jsonb_build_object('accountCode',v_counter,'amount',v_amount));v_credits:=jsonb_build_array(jsonb_build_object('accountCode',v_bank.account_code,'amount',v_amount));
    end if;
    for v_line in select value from jsonb_array_elements(v_debits||v_credits) loop
     if jsonb_typeof(v_line) is distinct from 'object' or jsonb_typeof(v_line->'accountCode') is distinct from 'string'
      or nullif(trim(v_line->>'accountCode'),'') is null
      or exists(select 1 from jsonb_object_keys(v_line) key where key not in ('accountCode','amount')) then raise exception 'Journal lines require only canonical accountCode and amount'; end if;
     v_counter:=v_line->>'accountCode';v_total:=public.finance_command_amount(v_line->'amount',true);
     if v_total is null or v_total::text in ('NaN','Infinity','-Infinity') or v_total<0 then raise exception 'Invalid journal amount'; end if;
     if v_counter<>v_bank.account_code and not(v_counter like '6-%' or v_counter like '1-4%' or v_counter in ('2-3000','2-4000','3-1000','3-2000','4-2000')) then raise exception 'Use source-linked command for this account'; end if;
    end loop;
    select coalesce(sum((value->>'amount')::numeric),0) into v_debit_total from jsonb_array_elements(v_debits);
    select coalesce(sum((value->>'amount')::numeric),0) into v_credit_total from jsonb_array_elements(v_credits);
    if v_debit_total<>v_credit_total or v_debit_total<=0 then raise exception 'Journal must balance exactly'; end if;
    if (v_source->>'type'='In' and exists(select 1 from jsonb_array_elements(v_credits) where value->>'accountCode'=v_bank.account_code and (value->>'amount')::numeric>0))
     or (v_source->>'type'='Out' and exists(select 1 from jsonb_array_elements(v_debits) where value->>'accountCode'=v_bank.account_code and (value->>'amount')::numeric>0)) then raise exception 'Bank journal cannot contain an opposite-direction leg'; end if;
    select coalesce(sum((value->>'amount')::numeric),0) into v_bank_net from jsonb_array_elements(v_debits) where value->>'accountCode'=v_bank.account_code;
    select v_bank_net-coalesce(sum((value->>'amount')::numeric),0) into v_bank_net from jsonb_array_elements(v_credits) where value->>'accountCode'=v_bank.account_code;
    v_expected:=case when v_source->>'type'='In' then v_amount else -v_amount end;
    if v_bank_net<>v_expected then raise exception 'Bank journal must equal cash movement'; end if;
    if v_source->>'type'='Out' and v_bank.balance<v_amount then raise exception 'Insufficient bank balance'; end if;
    perform public.post_journal_entry(v_entry,v_date,coalesce(v_source->>'description','Kas'),'Adjustment',v_id,v_debits,v_credits);
    perform public.post_cash_transaction(v_source||jsonb_build_object('id',v_cash,'referenceType','Manual','referenceId',v_id));
   end if;
  end if;
  insert into public.financial_command_events(id,kind,payload,result,actor_id)
   values(v_id,v_kind,p,jsonb_build_object('invoiceId',v_invoice_id,'billId',v_bill_id,'bankId',v_bank_id),p_actor_id);
 end if;
 select jsonb_build_object('eventId',v_id,'alreadyPosted',v_replayed,'noFinancialChange',v_kind='paper-expense' or (v_kind='depreciation' and not exists(select 1 from public.journal_entries where id=v_entry)),
  'expenses',coalesce((select jsonb_agg(to_jsonb(e)) from public.expenses e where v_record_type='expense' and e.id=v_paper_id),'[]'::jsonb),
  'reimbursements',coalesce((select jsonb_agg(to_jsonb(r)) from public.reimbursements r where v_record_type='reimbursement' and r.id=v_paper_id),'[]'::jsonb),
  'tukar_fakturs',coalesce((select jsonb_agg(to_jsonb(t)) from public.tukar_faktur t where t.id=(select tukar_faktur_id from public.invoices where id=v_invoice_id)),'[]'::jsonb),
  'fixed_assets',coalesce((select jsonb_agg(to_jsonb(a)) from public.fixed_assets a where a.id=v_asset_id),'[]'::jsonb),
  'invoices',coalesce((select jsonb_agg(to_jsonb(i)) from public.invoices i where i.id=v_invoice_id),'[]'::jsonb),
  'credit_notes',coalesce((select jsonb_agg(to_jsonb(c)) from public.credit_notes c where c.id=v_note_id),'[]'::jsonb),
  'vendor_bills',coalesce((select jsonb_agg(to_jsonb(b)) from public.vendor_bills b where b.id=v_bill_id),'[]'::jsonb),
  'bank_accounts',coalesce((select jsonb_agg(to_jsonb(b)) from public.bank_accounts b where b.id=v_bank_id),'[]'::jsonb),
  'journal_entries',coalesce((select jsonb_agg(to_jsonb(j)) from public.journal_entries j where j.id=v_entry),'[]'::jsonb),
  'journal_lines',coalesce((select jsonb_agg(to_jsonb(l)) from public.journal_lines l where l.journal_entry_id=v_entry),'[]'::jsonb),
  'pending_returns',coalesce((select jsonb_agg(to_jsonb(r)) from public.pending_returns r where r.id=v_return_id),'[]'::jsonb),
  'cash_transactions',coalesce((select jsonb_agg(to_jsonb(c)) from public.cash_transactions c where c.id=v_cash),'[]'::jsonb)) into v_result;
 return v_result;
end;
$$;
revoke all on function public.commit_finance_command(jsonb,text) from public,anon,authenticated;
grant execute on function public.commit_finance_command(jsonb,text) to service_role;
commit;

-- One transaction for each paper stage. Event identity survives a lost HTTP response.
-- No grants to browser roles: only the authenticated server command invokes this RPC.
create table if not exists public.goods_events (
 id text primary key, stage text not null, source_id text not null, payload jsonb not null,
 performed_by text, occurred_at timestamptz not null, recorded_by text not null,
 recorded_at timestamptz not null default now(), result jsonb not null
);
alter table public.goods_events enable row level security;
revoke all on public.goods_events from anon, authenticated;
grant select,insert on public.goods_events to service_role;

-- These fields existed on connected environments but were absent from the old baseline.
alter table public.purchase_items add column if not exists inbound_status text;
alter table public.purchase_items add column if not exists inbound_qty_received numeric;
alter table public.purchase_items add column if not exists inbound_verified_at text;
alter table public.purchase_items add column if not exists inbound_verified_by text;
alter table public.purchase_items add column if not exists inbound_note text;
alter table public.products add column if not exists b2c_stock numeric not null default 0;
alter table public.pending_returns add column if not exists delivery_id text;
alter table public.pending_returns add column if not exists sales_order_item_id text;
alter table public.pending_returns add column if not exists unit_cost numeric;
alter table public.pending_returns add column if not exists unit_price numeric;
alter table public.pending_returns add column if not exists credit_amount numeric;
alter table public.pending_returns add column if not exists cost_amount numeric;
alter table public.pending_returns add column if not exists invoice_id text;
alter table public.pending_returns add column if not exists return_decision text;
alter table public.pending_returns add column if not exists financial_adjustment_status text;
alter table public.sales_order_items add column if not exists qty_cancelled numeric not null default 0;
alter table public.deliveries add column if not exists client_snapshot jsonb;
alter table public.invoices add column if not exists client_snapshot jsonb;
alter table public.vendor_returns add column if not exists unit_cost numeric;
alter table public.vendor_returns add column if not exists claim_journal_entry_id text;

create or replace function public.goods_qty(v jsonb) returns numeric language plpgsql immutable as $$
begin
 if jsonb_typeof(v) is distinct from 'number' or v::text in ('NaN','Infinity','-Infinity') or v::numeric < 0 then
  raise exception 'Jumlah/harga harus angka terbatas dan tidak negatif';
 end if;
 return v::numeric;
end $$;

create or replace function public.goods_stock(p_id text,p_product text,p_qty numeric,p_delta numeric,p_kind text,p_ref text,p_source text,p_so text,p_pi text,p_cost numeric,p_at text,p_actor text,p_b2c boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare pr products%rowtype; resulting numeric;
begin
 select * into strict pr from products where id=p_product for update;
 resulting := (case when p_b2c then pr.b2c_stock else pr.current_stock end) + p_delta;
 if resulting < -0.00000001 then raise exception 'Stok tidak cukup untuk %',pr.name; end if;
 insert into stock_movements(id,date,product_id,product_name,sku_code,quantity,stock_delta,resulting_stock,direction,kind,source,destination,reference_type,reference_id,sales_order_id,purchase_item_id,created_by_user_id,warehouse_id,unit_cost)
 values(p_id,p_at,pr.id,pr.name,pr.sku_code,p_qty,p_delta,resulting,case when p_delta>0 then 'In' when p_delta<0 then 'Out' else 'Info' end,p_kind,p_source,'Goods event',case when p_kind='DELIVERY_OUTBOUND' then 'Delivery' else 'QC' end,p_ref,p_so,p_pi,p_actor,case when p_b2c then 'b2c' else 'main' end,p_cost);
 if p_b2c then update products set b2c_stock=resulting where id=pr.id;
 else update products set current_stock=resulting where id=pr.id; end if;
end $$;

create or replace function public.goods_journal(p_id text,p_date text,p_description text,p_type text,p_ref text,p_debit text,p_credit text,p_amount numeric)
returns void language plpgsql security definer set search_path=public as $$
begin
 p_amount:=round(p_amount,2);
 if p_amount>0 then
  perform post_journal_entry(p_id,p_date,p_description,p_type,p_ref,jsonb_build_array(jsonb_build_object('accountCode',p_debit,'amount',p_amount)),jsonb_build_array(jsonb_build_object('accountCode',p_credit,'amount',p_amount)));
 end if;
end $$;

-- Read the CURRENT rows for this event on every retry. Persisting an old response
-- snapshot in the event ledger would undo later rounds/payments in the browser.
create or replace function public.goods_snapshot(p_event text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e goods_events%rowtype; pis text[]:='{}'; sos text[]:='{}'; prods text[]:='{}'; ds text[]:='{}'; invs text[]:='{}'; rets text[]:='{}'; js text[]:='{}'; bills text[]:='{}'; source text;
begin
 select * into strict e from goods_events where id=p_event;
 if e.stage in ('arrival','qc') then pis:=array[e.source_id]; end if;
 if e.stage='dropship' then select array_agg(value->>'purchaseItemId') into pis from jsonb_array_elements(e.payload->'lines'); end if;
 if e.stage in ('reserve','packing','release','dropship') then sos:=array[e.source_id]; end if;
 if e.stage in ('handover','receipt','acceptance','audit','return-intake') then ds:=array[e.source_id]; end if;
 if e.stage='opname' then prods:=array[e.source_id]; end if;
 if e.stage='return' then
  rets:=array[e.source_id]; select original_so_id into source from pending_returns where id=e.source_id; sos:=sos||source;
 elsif e.stage='vendor-return' then
  select original_return_id into source from vendor_returns where id=e.source_id;
  if exists(select 1 from purchase_items where id=source) then pis:=pis||source;
  else rets:=rets||source; select original_so_id into source from pending_returns where id=source; sos:=sos||source; end if;
 end if;
 if e.stage='qc' then sos:=sos||array(select value->>'soId' from jsonb_array_elements(e.payload->'allocations')); end if;
 sos:=sos||array(select sales_order_id from deliveries where id=any(ds))||array(select sales_order_id from purchase_items where id=any(pis))||array(select sales_order_id from stock_movements where purchase_item_id=any(pis));
 select coalesce(array_agg(distinct x),'{}') into sos from unnest(sos) x where x is not null;
 pis:=pis||array(select id from purchase_items where sales_order_id=any(sos));
 prods:=prods||array(select product_id from purchase_items where id=any(pis))||array(select product_id from sales_order_items where sales_order_id=any(sos))||array(select product_id from pending_returns where id=any(rets));
 ds:=ds||array(select id from deliveries where sales_order_id=any(sos))||coalesce(array[e.result->>'deliveryId'],'{}');
 invs:=array(select id from invoices where delivery_id=any(ds))||coalesce(array[e.result->>'invoiceId'],'{}');
 rets:=rets||array(select id from pending_returns where original_so_id=any(sos));
 bills:=array(select id from vendor_bills where id=e.id||':bill' or purchase_id in(select purchase_id from purchase_items where id=any(pis)));
 js:=array(select id from journal_entries where left(id,length(e.id)+1)=e.id||':' or reference_id=e.id or reference_id=any(ds) or reference_id=any(invs) or id in(select journal_entry_id from journal_lines where vendor_bill_id=any(bills)));
 return jsonb_build_object(
  'stockMovements',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from stock_movements t where sales_order_id=any(sos) or purchase_item_id=any(pis) or reference_id=any(ds) or left(id,length(e.id)+1)=e.id||':'),
  'products',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from products t where id=any(prods)),
  'salesOrders',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from sales_orders t where id=any(sos)),
  'salesOrderItems',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from sales_order_items t where sales_order_id=any(sos)),
  'purchaseItems',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from purchase_items t where id=any(pis)),
  'deliveries',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from deliveries t where id=any(ds)),
  'invoices',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from invoices t where id=any(invs)),
  'pendingReturns',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from pending_returns t where id=any(rets)),
  'vendorReturns',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from vendor_returns t where id=e.source_id or original_return_id=any(pis) or original_return_id=any(rets) or left(id,length(e.id)+1)=e.id||':'),
  'rejectedItems',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from rejected_items t where reference_id=any(pis) or reference_id=any(rets) or left(id,length(e.id)+1)=e.id||':'),
  'vendorBills',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from vendor_bills t where id=any(bills)),
  'bankAccounts',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from bank_accounts t where id=e.payload->>'bankAccountId'),
  'cashTransactions',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from cash_transactions t where id=e.id||':cash' or left(reference_id,length(e.id)+1)=e.id||':'),
  'journalEntries',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from journal_entries t where id=any(js)),
  'journalLines',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from journal_lines t where journal_entry_id=any(js))
 );
end $$;
revoke all on function public.goods_snapshot(text) from public,anon,authenticated;

create or replace function public.process_goods_event(p_command jsonb,p_actor text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 eid text := p_command->>'eventId'; v_stage text := p_command->>'stage'; sid text := p_command->>'sourceId';
 body jsonb := p_command->'payload'; previous goods_events%rowtype; result jsonb;
 performer text; event_at timestamptz; at_text text; paper text;
 pi purchase_items%rowtype; pr products%rowtype; so sales_orders%rowtype; li sales_order_items%rowtype;
 dl deliveries%rowtype; inv invoices%rowtype; vendor vendors%rowtype;
 ret pending_returns%rowtype; vr vendor_returns%rowtype; client_facts jsonb;
 ln jsonb; alloc jsonb; lines jsonb := '[]'; accepted jsonb := '[]';
 v_qty numeric; passed numeric; rejected numeric; processed numeric; remaining numeric; arrived numeric;
 price numeric; cost numeric; revenue numeric :=0; cogs numeric :=0; net numeric; allocated numeric :=0;
 did text; iid text; billid text; disposition text; affected text; shipped numeric; accepted_qty numeric;
 bank bank_accounts%rowtype; cash_id text; term integer; method text; reserved numeric;
 line_amount numeric; cost_amount numeric; original_qty numeric; prior_qty numeric; prior_doc text; cost_running numeric; cost_posted numeric;
begin
 if nullif(eid,'') is null or nullif(sid,'') is null or jsonb_typeof(body) is distinct from 'object' then raise exception 'Invalid goods command'; end if;
 if not exists(select 1 from users where id=p_actor and role in ('admin_po','finance','super_admin')) then raise exception 'Office role required'; end if;
 -- Serialize identical events first, then their source. Concurrent distinct QC tranches
 -- re-read the locked source balance before any allocation, stock or journal write.
 perform pg_advisory_xact_lock(hashtextextended('goods-event:'||eid,0));
 select * into previous from goods_events where id=eid;
 if found then
  if previous.stage<>v_stage or previous.source_id<>sid or previous.payload<>body then raise exception 'Nomor kejadian dipakai untuk isi berbeda'; end if;
  return previous.result||jsonb_build_object('updates',goods_snapshot(eid));
 end if;
 perform pg_advisory_xact_lock(hashtextextended('goods-source:'||sid,0));
 performer := coalesce(nullif(body->>'performedBy',''),nullif(body->>'qcPerformedByUserId',''));
 event_at := coalesce(nullif(body->>'occurredAt','')::timestamptz,now()); at_text:=event_at::text;
 paper := nullif(trim(body->>'paperNumber'),'');
 if v_stage not in ('acceptance','audit','reserve') then
  if performer is null or not exists(select 1 from users where id=performer) then raise exception 'Pilih pelaksana fisik sesuai berkas'; end if;
  if nullif(body->>'occurredAt','') is null or paper is null then raise exception 'Waktu kejadian dan nomor berkas wajib diisi'; end if;
 end if;
 if v_stage='dropship' and not exists(select 1 from users where id=p_actor and role in ('finance','super_admin')) then raise exception 'Finalisasi dropship hanya Finance/Super Admin'; end if;
 if v_stage='audit' and not exists(select 1 from users where id=p_actor and role in ('finance','super_admin')) then raise exception 'Audit invoice hanya Finance/Super Admin'; end if;
 if v_stage in ('arrival','qc') then
  select * into strict pi from purchase_items where id=sid for update;
  if coalesce(pi.purchase_method,'Pasar')='Dropship' then raise exception 'Dropship tidak masuk gudang'; end if;
  if pi.purchase_method in ('Vendor','Online') and (not pi.is_online_ordered or not exists(select 1 from purchases where id=pi.purchase_id and status in ('Pending','Belanja','Selesai'))) then raise exception 'Dokumen/vendor order belum dilepas dan dipesan'; end if;
  select * into strict pr from products where id=pi.product_id for update;
  remaining:=pi.qty_purchased-coalesce(pi.qc_processed_qty,0);
  if v_stage='arrival' then
   v_qty:=goods_qty(body->'qty');
   select coalesce(sum((payload->>'qty')::numeric),0) into arrived from goods_events where stage='arrival' and source_id=sid;
   if v_qty<=0 or arrived+v_qty>pi.qty_purchased+0.00000001 then raise exception 'Penerimaan melebihi jumlah pembelian'; end if;
   update purchase_items set inbound_status='pra_inbound',inbound_note=concat_ws(' | ',body->>'condition',body->>'paperNumber') where id=sid;
   result:=jsonb_build_object('ok',true);
  else
   if pi.is_qced or remaining<=0 then raise exception 'Pembelian sudah selesai QC'; end if;
   if coalesce(pi.purchase_method,'Pasar') in ('Online','Vendor') then
    select coalesce(sum((payload->>'qty')::numeric),0)-coalesce(pi.qc_processed_qty,0) into arrived from goods_events where stage='arrival' and source_id=sid;
    if arrived<=0 then raise exception 'Catat penerimaan barang sebelum QC'; end if;
   else
    if not exists(select 1 from purchases where id=pi.purchase_id and (status='Selesai' or (status in ('Pending','Belanja') and coalesce(jsonb_array_length(to_jsonb(pi)->'report_event_ids'),0)>0))) then raise exception 'Laporan pembelian belum diterima'; end if;
    arrived:=remaining;
   end if;
   passed:=goods_qty(body->'qtyPassToInventory'); rejected:=goods_qty(body->'qtyReject');
   if jsonb_typeof(body->'allocations') is distinct from 'array' then raise exception 'Alokasi wajib diisi'; end if;
   if (select count(*)<>count(distinct value->>'soId') from jsonb_array_elements(body->'allocations')) then raise exception 'Alokasi PO ganda'; end if;
   for alloc in select value from jsonb_array_elements(body->'allocations') loop allocated:=allocated+goods_qty(alloc->'qty'); end loop;
   processed:=passed+rejected+allocated;
   if processed<=0 or processed>remaining+0.00000001 or processed>arrived+0.00000001 then raise exception 'Jumlah QC melebihi penerimaan/sisa pembelian atau kosong'; end if;
   if processed<remaining-0.00000001 and nullif(trim(body->>'unbalanceReason'),'') is null then raise exception 'Alasan penerimaan sebagian wajib diisi'; end if;
   price:=coalesce(nullif(goods_qty(coalesce(body->'vendorUnitPrice','0'::jsonb)),0),nullif(pi.actual_unit_price,0),nullif(pi.estimated_unit_price,0),pr.base_price);
   if price<=0 then raise exception 'Harga vendor wajib lebih dari nol'; end if;
   net:=round(processed*price,2); cost:=net/processed; cost_running:=0; cost_posted:=0;
   disposition:=body->>'rejectAction';
   if rejected>0 and (coalesce(disposition,'') not in ('Disposal','Return','B2C') or nullif(trim(body->>'rejectReason'),'') is null) then raise exception 'Tindakan dan alasan reject wajib diisi'; end if;
   -- Lock all affected PO rows in deterministic order; never trust the browser's owed balance.
   perform 1 from sales_orders where id in(select value->>'soId' from jsonb_array_elements(body->'allocations')) order by id for update;
   for alloc in select value from jsonb_array_elements(body->'allocations') loop
    v_qty:=goods_qty(alloc->'qty');
    select * into strict li from sales_order_items where sales_order_id=alloc->>'soId' and product_id=pi.product_id for update;
    if exists(select 1 from sales_orders where id=li.sales_order_id and status in ('Batal','Selesai','Siap Kirim','Dikirim','Awaiting Audit','Terkirim')) then raise exception 'PO tidak menerima alokasi pada tahap ini'; end if;
    if v_qty>greatest(0,li.qty-coalesce(li.qty_delivered,0)-coalesce(li.qty_cancelled,0)-coalesce(li.qty_final,0))+0.00000001 then raise exception 'Alokasi melebihi sisa PO'; end if;
    update sales_order_items set qty_final=coalesce(qty_final,0)+v_qty,subtotal_final=(coalesce(qty_final,0)+v_qty)*unit_price where id=li.id;
    if v_qty>0 then
     cost_running:=cost_running+v_qty; cost_amount:=round(cost_running/processed*net,2)-cost_posted; cost_posted:=cost_posted+cost_amount;
     perform goods_stock(eid||':allocation:'||li.id,pr.id,v_qty,v_qty,'QC_CLIENT_ALLOCATION',eid,'QC',li.sales_order_id,pi.id,cost_amount/v_qty,at_text,p_actor);
    end if;
   end loop;
   perform goods_stock(eid||':receipt',pr.id,processed,0,'QC_RECEIPT',eid,'Sourcing',null,pi.id,cost,at_text,p_actor);
   if passed>0 then
    cost_running:=cost_running+passed; cost_amount:=round(cost_running/processed*net,2)-cost_posted; cost_posted:=cost_posted+cost_amount;
    perform goods_stock(eid||':inventory',pr.id,passed,passed,'QC_INVENTORY',eid,'QC',null,pi.id,cost_amount/passed,at_text,p_actor);
   end if;
   perform goods_journal(eid||':journal',at_text,'QC receipt '||eid,'QC',eid,'1-3000','2-1100',processed*price);
   if rejected>0 then
    cost:=(net-cost_posted)/rejected;
    insert into rejected_items(id,date,product_id,qty,reason,source,reference_id,reported_by,image_url) values(eid||':reject',at_text,pr.id,rejected,disposition||': '||(body->>'rejectReason'),'QC',pi.id,p_actor,coalesce(body->>'paperProof',body->>'qcPhoto'));
    if disposition='B2C' then
     perform goods_stock(eid||':b2c',pr.id,rejected,rejected,'QC_INVENTORY',eid,'QC Reject',null,pi.id,cost,at_text,p_actor,true);
     perform goods_journal(eid||':rejectjournal',at_text,'QC B2C '||eid,'QC',eid,'1-3100','1-3000',round(rejected*cost,2));
    elsif disposition='Return' then
     if pi.vendor_id is null then raise exception 'Vendor retur wajib dipilih'; end if;
     insert into vendor_returns(id,product_id,vendor_id,qty,reason,date,original_return_id,status,unit_cost,claim_journal_entry_id) values(eid||':vendorreturn',pr.id,pi.vendor_id,rejected,body->>'rejectReason',event_at,pi.id,'Menunggu Vendor',round(rejected*cost,2)/rejected,eid||':rejectjournal');
     perform goods_journal(eid||':rejectjournal',at_text,'QC vendor claim '||eid,'QC',eid||':vendorreturn','1-2100','1-3000',round(rejected*cost,2));
    else
     perform goods_journal(eid||':rejectjournal',at_text,'QC disposal '||eid,'QC',eid,'5-2000','1-3000',round(rejected*cost,2));
    end if;
   end if;
   -- Replacement claims leave the original vendor bill payable in full.
   -- A later supplier credit/refund must clear both payable and claim explicitly.
   net:=round(processed*price,2);
   if (pi.payment_method='Tempo' or (pi.purchase_method='Vendor' and pi.payment_method='Transfer')) and net>0 then
    select * into strict vendor from vendors where id=pi.vendor_id;
    billid:=eid||':bill';
    insert into vendor_bills(id,bill_number,vendor_id,vendor_name,issue_date,due_date,description,category,total_amount,amount_paid,status,payments,purchase_id,created_at,created_by)
    values(billid,'VB-'||billid,vendor.id,vendor.company_name,at_text,(event_at+coalesce(vendor.payment_term_days,14)*interval '1 day')::text,'QC '||eid,'Bahan Baku',net,0,'Pending','[]',pi.purchase_id,now()::text,p_actor);
    perform post_journal_entry(eid||':ap',at_text,'Tempo QC '||eid,'Purchase',eid,jsonb_build_array(jsonb_build_object('accountCode','2-1100','amount',net)),jsonb_build_array(jsonb_build_object('accountCode','2-1000','amount',net,'vendorId',vendor.id,'vendorBillId',billid)));
    perform apply_vendor_advances(pi.purchase_id,vendor.id,billid,at_text,p_actor);
    if pi.payment_method='Transfer' and exists(select 1 from users where id=p_actor and role in ('finance','super_admin')) then
     select total_amount-amount_paid into remaining from vendor_bills where id=billid;
     if remaining>0 then
      perform post_financial_event(jsonb_build_object('eventId',eid||':payment','kind','vendor-payment','date',(event_at AT TIME ZONE 'Asia/Jakarta')::date::text,'bankAccountId',body->>'bankAccountId','amount',remaining,'billId',billid,'description','Vendor QC '||eid),p_actor);
     end if;
    end if;
   end if;
   update stock_movements set batch_number=nullif(body->>'batchNumber',''),expiry_date=nullif(body->>'expiryDate','') where purchase_item_id=pi.id and left(id,length(eid)+1)=eid||':';
   remaining:=pi.qty_purchased-coalesce(pi.qc_processed_qty,0);
   update purchase_items set qc_processed_qty=coalesce(qc_processed_qty,0)+processed,
    qc_event_ids=coalesce(qc_event_ids,'[]'::jsonb)||jsonb_build_array(eid),
    is_qced=(coalesce(qc_processed_qty,0)+processed>=qty_purchased-0.00000001),
    inbound_status=case when coalesce(qc_processed_qty,0)+processed<qty_purchased-0.00000001 then 'partial' when rejected=processed then 'rejected' else 'verified' end,
    inbound_qty_received=coalesce(inbound_qty_received,0)+passed+allocated,
    actual_unit_price=price,inbound_verified_at=at_text,inbound_verified_by=performer,
    qc_occurred_at=at_text,qc_recorded_at=now()::text,qc_recorded_by=p_actor,qc_paper_number=paper,qc_paper_proof=coalesce(body->>'paperProof',body->>'qcPhoto'),
    inbound_note=concat_ws(' | ',body->>'unbalanceReason',body->>'rejectReason'),expiry_date=coalesce(body->>'expiryDate',expiry_date) where id=pi.id;
   for affected in select value->>'soId' from jsonb_array_elements(body->'allocations') loop
    if not exists(select 1 from sales_order_items where sales_order_id=affected and qty_final is null and qty-coalesce(qty_delivered,0)-coalesce(qty_cancelled,0)>0) then
     update sales_orders set status=case when exists(select 1 from sales_order_items where sales_order_id=affected and qty_final>0) then 'Packing' else 'Kurang Kirim' end where id=affected;
    end if;
   end loop;
   result:=jsonb_build_object('ok',true,'processed',processed,'remaining',remaining-processed,'paymentPendingAmount',case when pi.payment_method='Transfer' then (select total_amount-amount_paid from vendor_bills where id=billid) else 0 end);
  end if;
 elsif v_stage='opname' then
  if not exists(select 1 from users where id=p_actor and role='super_admin') then raise exception 'Opname hanya Super Admin'; end if;
  select * into strict pr from products where id=sid for update;
  if coalesce(body->>'warehouseId','') not in ('main','b2c') then raise exception 'Gudang opname tidak valid'; end if;
  v_qty:=goods_qty(body->'physicalQty'); cost:=goods_qty(body->'unitCost');
  passed:=case when body->>'warehouseId'='b2c' then pr.b2c_stock else pr.current_stock end;
  if passed<>goods_qty(body->'expectedStock') then raise exception 'Stok berubah setelah berkas dipilih; muat ulang dan rekonsiliasi hitungan'; end if;
  if cost<=0 or nullif(trim(body->>'reason'),'') is null then raise exception 'Harga pokok dan alasan opname wajib diisi'; end if;
  rejected:=v_qty-passed;
  disposition:=case when body->>'warehouseId'='b2c' then '1-3100' else '1-3000' end;
  perform goods_stock(eid||':adjustment',pr.id,abs(rejected),rejected,'ADJUSTMENT',eid,'Stock Opname',null,null,cost,at_text,p_actor,body->>'warehouseId'='b2c');
  if rejected>0 then perform goods_journal(eid||':journal',at_text,'Stock Opname surplus '||eid,'Adjustment',eid,disposition,'4-2000',rejected*cost);
  elsif rejected<0 then perform goods_journal(eid||':journal',at_text,'Stock Opname deficit '||eid,'Adjustment',eid,'5-2000',disposition,-rejected*cost); end if;
  result:=jsonb_build_object('ok',true,'stock',v_qty,'delta',rejected);
 elsif v_stage='return-intake' then
  select * into strict dl from deliveries where id=sid for update;
  if dl.status<>'Terkirim' or dl.accepted_line_snapshots is null or dl.invoice_id is null then raise exception 'Retur lanjutan memerlukan ronde selesai dengan rincian asli'; end if;
  select * into strict so from sales_orders where id=dl.sales_order_id for update;
  select * into strict li from sales_order_items where id=body->>'salesOrderItemId' and sales_order_id=so.id for update;
  select coalesce(sum((s->>'qty')::numeric),0),max((s->>'unitPrice')::numeric),sum((s->>'qty')::numeric*(s->>'unitCost')::numeric)/nullif(sum((s->>'qty')::numeric),0)
  into original_qty,price,cost from jsonb_array_elements(dl.accepted_line_snapshots) s where s->>'salesOrderItemId'=li.id;
  select coalesce(sum(r.qty),0) into prior_qty from pending_returns r where r.delivery_id=dl.id and r.sales_order_item_id=li.id and r.root_cause='post-delivery';
  v_qty:=goods_qty(body->'qty');
  if v_qty<=0 or v_qty>original_qty-prior_qty or v_qty>coalesce(li.qty_delivered,0) then raise exception 'Retur melebihi jumlah yang diterima pada ronde asli'; end if;
  select coalesce(sum(coalesce((x->>'lineTotal')::numeric,round((x->>'qty')::numeric*(x->>'unitPrice')::numeric,2))),0),coalesce(sum(coalesce((x->>'costTotal')::numeric,round((x->>'qty')::numeric*(x->>'unitCost')::numeric,2))),0)
  into line_amount,cost_amount from jsonb_array_elements(dl.accepted_line_snapshots) x where x->>'salesOrderItemId'=li.id;
  line_amount:=round((prior_qty+v_qty)/original_qty*line_amount,2)-round(prior_qty/original_qty*line_amount,2);
  cost_amount:=round((prior_qty+v_qty)/original_qty*cost_amount,2)-round(prior_qty/original_qty*cost_amount,2);
  if coalesce(body->>'returnDecision','') not in ('Replace','Cancel') or nullif(trim(body->>'reason'),'') is null or nullif(body->>'paperProof','') is null then raise exception 'Isi keputusan ganti/batal, alasan dan bukti retur'; end if;
  insert into pending_returns(id,product_id,original_so_id,qty,reason,date,status,di_number,owner_user_id,due_date,root_cause,delivery_id,sales_order_item_id,invoice_id,unit_cost,unit_price,credit_amount,cost_amount,return_decision,financial_adjustment_status)
  values(eid||':return',li.product_id,so.id,v_qty,body->>'reason',at_text,'Pending QC','DI-'||eid,p_actor,event_at::date+2,'post-delivery',dl.id,li.id,dl.invoice_id,cost,price,line_amount,cost_amount,body->>'returnDecision','Pending Finance');
  -- Original accepted goods had already been expensed; put their original value
  -- back into return inventory before QC chooses restock/write-off/vendor.
  perform goods_journal(eid||':hpp-return',at_text,'Post delivery return '||eid,'Delivery',dl.id,'1-3000','5-1000',cost_amount);
  update sales_order_items set qty_delivered=qty_delivered-v_qty,qty_cancelled=coalesce(qty_cancelled,0)+case when body->>'returnDecision'='Cancel' then v_qty else 0 end where id=li.id;
  if so.status not in ('Siap Kirim','Dikirim','Awaiting Audit') then
   update sales_orders set status=case when not exists(select 1 from sales_order_items where sales_order_id=so.id and qty>coalesce(qty_delivered,0)+coalesce(qty_cancelled,0)) then 'Selesai' when exists(select 1 from sales_order_items where sales_order_id=so.id and qty_final>0) then 'Packing' else 'Kurang Kirim' end where id=so.id;
  end if;
  result:=jsonb_build_object('ok',true,'returnId',eid||':return','invoiceId',dl.invoice_id,'creditAmount',line_amount);
 elsif v_stage='reserve' then
  select * into strict so from sales_orders where id=sid for update;
  select jsonb_build_object('companyName',company_name,'picName',pic_name,'address',address,'phone',phone,'email',email) into client_facts from clients where id=so.client_id;
  if so.status in ('Batal','Selesai','Siap Kirim','Dikirim','Awaiting Audit','Terkirim') then raise exception 'PO tidak dapat menerima reservasi'; end if;
  if jsonb_typeof(body->'lines') is distinct from 'array' then raise exception 'Baris reservasi wajib diisi'; end if;
  if (select count(*)<>count(distinct value->>'salesOrderItemId') from jsonb_array_elements(body->'lines')) then raise exception 'Baris reservasi ganda'; end if;
  perform 1 from products where id in(select product_id from sales_order_items where id in(select value->>'salesOrderItemId' from jsonb_array_elements(body->'lines'))) order by id for update;
  for ln in select value from jsonb_array_elements(body->'lines') order by value->>'salesOrderItemId' loop
   select * into strict li from sales_order_items where id=ln->>'salesOrderItemId' and sales_order_id=sid for update;
   select * into strict pr from products where id=li.product_id;
   v_qty:=goods_qty(ln->'qty');
   if v_qty<=0 or v_qty>li.qty-coalesce(li.qty_delivered,0)-coalesce(li.qty_cancelled,0)-coalesce(li.qty_final,0) then raise exception 'Reservasi melebihi sisa PO'; end if;
   select coalesce(sum(greatest(0,coalesce(i.qty_final,0)-coalesce((select sum((s->>'qty')::numeric) from deliveries d cross join lateral jsonb_array_elements(coalesce(d.line_snapshots,'[]'::jsonb)) s where d.sales_order_id=i.sales_order_id and d.status<>'Terkirim' and s->>'salesOrderItemId'=i.id),0))),0)
   into reserved from sales_order_items i join sales_orders o on o.id=i.sales_order_id where i.product_id=li.product_id and o.status not in ('Batal','Selesai','Terkirim');
   if v_qty>pr.current_stock-reserved+0.00000001 then raise exception 'Stok bebas tidak cukup; pesanan lain telah mereservasi barang'; end if;
   select sum(stock_delta*unit_cost)/nullif(sum(stock_delta),0) into cost from stock_movements where product_id=pr.id and warehouse_id='main';
   cost:=coalesce(nullif(cost,0),pr.base_price);
   perform goods_stock(eid||':booking:'||li.id,pr.id,v_qty,0,'BOOKING',eid,'Stock Reservation',sid,null,cost,at_text,p_actor);
   update sales_order_items set qty_final=coalesce(qty_final,0)+v_qty,subtotal_final=(coalesce(qty_final,0)+v_qty)*unit_price where id=li.id;
  end loop;
  result:=jsonb_build_object('ok',true);
 elsif v_stage='dropship' then
  select * into strict so from sales_orders where id=sid for update;
  select jsonb_build_object('companyName',company_name,'picName',pic_name,'address',address,'phone',phone,'email',email) into client_facts from clients where id=so.client_id;
  if so.status in ('Batal','Selesai','Awaiting Audit','Dikirim','Siap Kirim') then raise exception 'PO tidak menerima dropship pada tahap ini'; end if;
  select * into strict vendor from vendors where id=body->>'vendorId';
  if nullif(body->>'paperProof','') is null then raise exception 'Bukti penerimaan dropship wajib dilampirkan'; end if;
  if jsonb_typeof(body->'lines') is distinct from 'array' or jsonb_array_length(body->'lines')=0 then raise exception 'Baris dropship wajib diisi'; end if;
  if (select count(*)<>count(distinct value->>'purchaseItemId') from jsonb_array_elements(body->'lines')) then raise exception 'Baris dropship ganda'; end if;
  did:=eid||':delivery'; iid:='invoice:'||did;
  for ln in select value from jsonb_array_elements(body->'lines') order by value->>'purchaseItemId' loop
   select * into strict pi from purchase_items where id=ln->>'purchaseItemId' and sales_order_id=so.id and vendor_id=vendor.id and purchase_method='Dropship' for update;
   if pi.is_qced then raise exception 'Baris dropship sudah diproses'; end if;
   if not pi.is_online_ordered or not exists(select 1 from purchases where id=pi.purchase_id and status in ('Pending','Belanja','Selesai')) then raise exception 'Dokumen dropship belum dilepas/dipesan'; end if;
   if pi.payment_method not in ('Tempo','Transfer') or pi.payment_method is null then raise exception 'Dropship hanya mendukung Tempo atau Transfer dengan sumber rekening'; end if;
   if method is not null and method<>pi.payment_method then raise exception 'Pisahkan berkas dropship menurut metode pembayaran'; end if;
   method:=pi.payment_method;
   accepted_qty:=goods_qty(ln->'qtyReceived');
   if accepted_qty>pi.qty_target then raise exception 'Penerimaan dropship melebihi pesanan vendor'; end if;
   select * into strict li from sales_order_items where sales_order_id=so.id and product_id=pi.product_id for update;
   if accepted_qty>li.qty-coalesce(li.qty_delivered,0)-coalesce(li.qty_cancelled,0)-coalesce(li.qty_final,0) then raise exception 'Penerimaan dropship melebihi sisa PO yang belum dialokasikan'; end if;
   select * into strict pr from products where id=pi.product_id;
   cost:=coalesce(nullif(pi.actual_unit_price,0),nullif(pi.estimated_unit_price,0));
   if cost is null then raise exception 'Harga dropship harus ditetapkan sebelum konfirmasi'; end if;
   revenue:=revenue+accepted_qty*li.unit_price; cogs:=cogs+accepted_qty*cost;
   lines:=lines||jsonb_build_array(jsonb_build_object('salesOrderItemId',li.id,'productId',pr.id,'productName',pr.name,'uom',pr.uom,'qty',accepted_qty,'unitPrice',li.unit_price,'unitCost',cost,'purchaseId',pi.purchase_id,'purchaseItemId',pi.id,'lineTotal',round(accepted_qty*li.unit_price,2),'costTotal',round(accepted_qty*cost,2)));
   update purchase_items set is_qced=true,qc_processed_qty=qty_target,inbound_qty_received=accepted_qty,inbound_status=case when accepted_qty=qty_target then 'verified' else 'partial' end,inbound_verified_at=at_text,inbound_verified_by=performer,qc_occurred_at=at_text,qc_recorded_at=now()::text,qc_recorded_by=p_actor,qc_paper_number=paper,qc_paper_proof=body->>'paperProof' where id=pi.id;
   update sales_order_items set qty_delivered=coalesce(qty_delivered,0)+accepted_qty where id=li.id;
  end loop;
  accepted:='[]'::jsonb; prior_doc:=null; cost_running:=0; cost_posted:=0;
  for ln in select value from jsonb_array_elements(lines) order by value->>'purchaseId',value->>'purchaseItemId' loop
   if prior_doc is distinct from ln->>'purchaseId' then cost_running:=0; cost_posted:=0; prior_doc:=ln->>'purchaseId'; end if;
   cost_running:=cost_running+(ln->>'qty')::numeric*(ln->>'unitCost')::numeric;
   cost_amount:=round(cost_running,2)-cost_posted; cost_posted:=round(cost_running,2);
   accepted:=accepted||jsonb_build_array(ln||jsonb_build_object('costTotal',cost_amount));
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('salesOrderItemId',id,'productId',product,'productName',name,'uom',unit,'qty',q,'unitPrice',p,'unitCost',case when q>0 then c/q else 0 end,'lineTotal',round(q*p,2),'costTotal',c)),'[]'::jsonb)
  into lines from (select x->>'salesOrderItemId' id,max(x->>'productId') product,max(x->>'productName') name,max(x->>'uom') unit,sum((x->>'qty')::numeric) q,max((x->>'unitPrice')::numeric) p,sum((x->>'costTotal')::numeric) c from jsonb_array_elements(accepted) x group by x->>'salesOrderItemId') grouped;
  select coalesce(sum((x->>'lineTotal')::numeric),0),coalesce(sum((x->>'costTotal')::numeric),0) into revenue,cogs from jsonb_array_elements(lines) x;
  select coalesce(payment_term_days,30) into term from clients where id=so.client_id;
  insert into deliveries(id,sales_order_id,courier_id,status,line_snapshots,accepted_line_snapshots,delivery_date,invoice_id,notes,ba_url,occurred_at,performed_by,recorded_at,recorded_by,paper_number,paper_proof,client_snapshot)
  values(did,so.id,performer,'Terkirim',lines,lines,at_text,iid,'Dropship: '||coalesce(body->>'note',''),body->>'paperProof',at_text,performer,now()::text,p_actor,paper,body->>'paperProof',client_facts);
  insert into invoices(id,sales_order_id,client_id,issue_date,due_date,total_amount,amount_paid,status,line_snapshots,delivery_id,client_snapshot)
  values(iid,so.id,so.client_id,at_text,(event_at+term*interval '1 day')::text,revenue,0,case when revenue=0 then 'Paid' else 'Unpaid' end,lines,did,client_facts);
  perform goods_journal(eid||':revenue',at_text,'Dropship Invoice '||iid,'Invoice',iid,'1-2000','4-1000',revenue);
  perform goods_journal(eid||':hpp',at_text,'Dropship HPP '||did,'Delivery',did,'5-1000','2-1100',cogs);
  if method in ('Tempo','Transfer') and cogs>0 then
   for affected in select distinct purchase_id from purchase_items where id in(select value->>'purchaseItemId' from jsonb_array_elements(body->'lines')) loop
    select round(sum((x->>'qtyReceived')::numeric*coalesce(nullif(p.actual_unit_price,0),p.estimated_unit_price)),2) into net from purchase_items p join jsonb_array_elements(body->'lines') x on p.id=x->>'purchaseItemId' where p.purchase_id=affected;
    if net<=0 then continue; end if;
    billid:=eid||':bill'||case when (select count(distinct purchase_id) from purchase_items where id in(select value->>'purchaseItemId' from jsonb_array_elements(body->'lines')))>1 then ':'||affected else '' end;
    insert into vendor_bills(id,bill_number,vendor_id,vendor_name,issue_date,due_date,description,category,total_amount,amount_paid,status,payments,purchase_id,created_at,created_by)
    values(billid,'VB-'||billid,vendor.id,vendor.company_name,at_text,(event_at+coalesce(vendor.payment_term_days,14)*interval '1 day')::text,'Dropship '||eid,'Bahan Baku',net,0,'Pending','[]',affected,now()::text,p_actor);
    perform post_journal_entry(eid||':ap:'||affected,at_text,'Dropship Tempo '||eid||' '||affected,'Purchase',eid,jsonb_build_array(jsonb_build_object('accountCode','2-1100','amount',net)),jsonb_build_array(jsonb_build_object('accountCode','2-1000','amount',net,'vendorId',vendor.id,'vendorBillId',billid)));
    perform apply_vendor_advances(affected,vendor.id,billid,at_text,p_actor);
    if method='Transfer' then
     select total_amount-amount_paid into remaining from vendor_bills where id=billid;
     if remaining>0 then
      perform post_financial_event(jsonb_build_object('eventId',eid||':payment:'||affected,'kind','vendor-payment','date',(event_at AT TIME ZONE 'Asia/Jakarta')::date::text,'bankAccountId',body->>'bankAccountId','amount',remaining,'billId',billid,'description','Dropship vendor '||eid),p_actor);
     end if;
    end if;
   end loop;
  end if;
  update sales_orders set status=case when not exists(select 1 from sales_order_items where sales_order_id=so.id and qty>coalesce(qty_delivered,0)+coalesce(qty_cancelled,0)) then 'Selesai' when not exists(select 1 from sales_order_items where sales_order_id=so.id and qty_final is null and qty>coalesce(qty_delivered,0)+coalesce(qty_cancelled,0)) and exists(select 1 from sales_order_items where sales_order_id=so.id and qty_final>0) then 'Packing' else 'Kurang Kirim' end where id=so.id;
  result:=jsonb_build_object('ok',true,'invoiceId',iid,'deliveryId',did,'total',revenue);
 elsif v_stage in ('return','vendor-return') then
  if v_stage='return' then
   select * into strict ret from pending_returns where id=sid for update;
   if ret.status='Processed' then raise exception 'Retur sudah diproses'; end if;
   select * into strict pr from products where id=ret.product_id for update;
   passed:=goods_qty(body->'pass'); rejected:=goods_qty(body->'reject'); allocated:=goods_qty(body->'vendor');
   if abs(passed+rejected+allocated-ret.qty)>0.00000001 then raise exception 'Total QC retur harus sama dengan barang kembali'; end if;
   cost:=coalesce(ret.cost_amount/nullif(ret.qty,0),ret.unit_cost,pr.base_price);
   line_amount:=coalesce(ret.cost_amount,round(ret.qty*cost,2));
   cost_amount:=round(rejected/ret.qty*line_amount,2);
   net:=round((rejected+allocated)/ret.qty*line_amount,2)-cost_amount;
   if passed>0 then perform goods_stock(eid||':restock',pr.id,passed,passed,'RETURN_RESTOCK',sid,'Client Return',null,null,(line_amount-cost_amount-net)/passed,at_text,p_actor); end if;
   if rejected>0 then
    perform goods_journal(eid||':loss',at_text,'Client return loss '||sid,'QC',sid,'5-2000','1-3000',cost_amount);
    insert into rejected_items(id,date,product_id,qty,reason,source,reference_id,reported_by) values(eid||':loss',at_text,pr.id,rejected,coalesce(nullif(body->>'reason',''),ret.reason),'Return',sid,p_actor);
   end if;
   if allocated>0 then
    if not exists(select 1 from vendors where id=body->>'vendorId') then raise exception 'Vendor retur wajib dipilih'; end if;
    insert into vendor_returns(id,product_id,vendor_id,qty,reason,date,original_return_id,status,unit_cost,claim_journal_entry_id) values(eid||':vendorreturn',pr.id,body->>'vendorId',allocated,coalesce(nullif(body->>'reason',''),ret.reason),event_at,ret.id,'Menunggu Vendor',net/allocated,eid||':vendorclaim');
    perform goods_journal(eid||':vendorclaim',at_text,'Client return vendor claim '||eid,'QC',eid||':vendorreturn','1-2100','1-3000',net);
   end if;
   update pending_returns set status='Processed' where id=sid;
  else
   select * into strict vr from vendor_returns where id=sid for update;
   if vr.status<>'Menunggu Vendor' then raise exception 'Retur vendor sudah selesai'; end if;
   if exists(select 1 from vendor_claim_settlements where vendor_return_id=vr.id) then raise exception 'Klaim sudah diselesaikan sebagian secara finansial; lanjutkan refund/potong hutang di Finance'; end if;
   select * into strict pr from products where id=vr.product_id for update;
   select * into pi from purchase_items where id=vr.original_return_id;
   if found then
    cost:=coalesce(vr.unit_cost,nullif(pi.actual_unit_price,0),nullif(pi.estimated_unit_price,0),pr.base_price); disposition:='1-2100';
   else
    select * into ret from pending_returns where id=vr.original_return_id;
    cost:=coalesce(vr.unit_cost,ret.unit_cost,pr.base_price); disposition:=case when vr.claim_journal_entry_id is not null then '1-2100' else '1-3000' end;
   end if;
   if body->>'mode'='swap' then
    passed:=goods_qty(body->'pass'); rejected:=goods_qty(body->'reject');
    if abs(passed+rejected-vr.qty)>0.00000001 then raise exception 'Total QC pengganti harus sama dengan retur'; end if;
   elsif body->>'mode'='reject' then passed:=0; rejected:=vr.qty;
   else raise exception 'Keputusan vendor tidak valid'; end if;
   if vr.claim_journal_entry_id is not null then
    select coalesce(sum(debit_amount-credit_amount),0) into line_amount from journal_lines l join coas c on c.id=l.account_id where journal_entry_id=vr.claim_journal_entry_id and c.account_code='1-2100';
   else line_amount:=round(vr.qty*cost,2); end if;
   cost_amount:=round(case when vr.qty>0 then passed/vr.qty*line_amount else 0 end,2);
   if passed>0 then
    perform goods_stock(eid||':restock',pr.id,passed,passed,'RETURN_RESTOCK',sid,'Vendor Swap',null,null,cost_amount/passed,at_text,p_actor);
    if disposition<>'1-3000' then perform goods_journal(eid||':recovery',at_text,'Vendor return recovery '||sid,'QC',sid,'1-3000',disposition,cost_amount); end if;
   end if;
   if rejected>0 then perform goods_journal(eid||':loss',at_text,'Vendor return loss '||sid,'QC',sid,'5-2000',disposition,line_amount-cost_amount); end if;
   update vendor_returns set status=case when body->>'mode'='swap' then 'Selesai-Ditukar' else 'Selesai-Ditolak' end,resolved_date=event_at,replacement_pass_qty=passed,replacement_reject_qty=rejected where id=sid;
  end if;
  result:=jsonb_build_object('ok',true);
 elsif v_stage in ('packing','release') then
  select * into strict so from sales_orders where id=sid for update;
  select jsonb_build_object('companyName',company_name,'picName',pic_name,'address',address,'phone',phone,'email',email) into client_facts from clients where id=so.client_id;
  if so.status<>'Packing' then raise exception 'PO belum siap packing atau sudah dilepas'; end if;
  if v_stage='packing' then
   if jsonb_typeof(body->'lines') is distinct from 'array' then raise exception 'Baris packing wajib diisi'; end if;
   for ln in select value from jsonb_array_elements(body->'lines') loop
    v_qty:=goods_qty(ln->'qty'); select * into strict li from sales_order_items where id=ln->>'salesOrderItemId' and sales_order_id=sid for update;
    if li.qty_final is null or v_qty>li.qty_final+0.00000001 then raise exception 'Packing melebihi hasil QC'; end if;
    update sales_order_items set is_packed=true,qty_dispatched=v_qty,dispatch_note=ln->>'note' where id=li.id;
   end loop;
   result:=jsonb_build_object('ok',true);
  else
   if exists(select 1 from deliveries where sales_order_id=sid and status<>'Terkirim') then raise exception 'Masih ada pengiriman aktif'; end if;
   did:=eid||':delivery';
   -- Acquire product locks in a consistent order before releasing several SKUs.
   perform 1 from products where id in(select product_id from sales_order_items where sales_order_id=sid) order by id for update;
   for li in select * from sales_order_items where sales_order_id=sid order by id for update loop
    if coalesce(li.qty_final,0)<=0 then continue; end if;
    if not li.is_packed then raise exception 'Catat packing untuk semua barang dahulu'; end if;
    v_qty:=coalesce(li.qty_dispatched,li.qty_final);
    if v_qty<0 or v_qty>li.qty_final or v_qty>greatest(0,li.qty-coalesce(li.qty_delivered,0)-coalesce(li.qty_cancelled,0)) then raise exception 'Jumlah dilepas melebihi QC/sisa PO'; end if;
    if v_qty=0 then continue; end if;
    select * into strict pr from products where id=li.product_id;
    select sum((case when kind='BOOKING' then quantity else stock_delta end)*unit_cost)/nullif(sum(case when kind='BOOKING' then quantity else stock_delta end),0) into cost from stock_movements where sales_order_id=sid and product_id=li.product_id and warehouse_id='main' and kind in ('QC_CLIENT_ALLOCATION','DELIVERY_OUTBOUND','BOOKING');
    cost:=round(v_qty*coalesce(cost,pr.base_price),2)/v_qty;
    lines:=lines||jsonb_build_array(jsonb_build_object('salesOrderItemId',li.id,'productId',pr.id,'productName',pr.name,'uom',pr.uom,'qty',v_qty,'unitPrice',li.unit_price,'unitCost',cost,'lineTotal',round(v_qty*li.unit_price,2),'costTotal',round(v_qty*cost,2)));
    perform goods_stock(eid||':out:'||li.id,pr.id,v_qty,-v_qty,'DELIVERY_OUTBOUND',did,'Inventory',sid,null,cost,at_text,p_actor);
   end loop;
   if jsonb_array_length(lines)=0 then raise exception 'Tidak ada barang yang dilepas'; end if;
   insert into deliveries(id,sales_order_id,courier_id,status,line_snapshots,occurred_at,performed_by,recorded_at,recorded_by,paper_number,paper_proof,client_snapshot)
   values(did,sid,coalesce(so.assigned_courier_id,'pending'),'Menunggu',lines,at_text,performer,now()::text,p_actor,paper,body->>'paperProof',client_facts);
   update sales_orders set status='Siap Kirim',handover_date=at_text,handover_by=performer where id=sid;
   result:=jsonb_build_object('ok',true,'deliveryId',did);
  end if;
 elsif v_stage in ('handover','receipt','acceptance','audit') then
  select * into strict dl from deliveries where id=sid for update;
  select * into strict so from sales_orders where id=dl.sales_order_id for update;
  if v_stage='handover' then
   if dl.status<>'Menunggu' then raise exception 'Pengiriman sudah diserahterimakan'; end if;
   update deliveries set status='Dikirim',courier_id=performer where id=sid;
   update sales_orders set status='Dikirim',received_by=performer where id=so.id;
   update sales_order_items set is_handover_checked=true where sales_order_id=so.id and id in(select value->>'salesOrderItemId' from jsonb_array_elements(dl.line_snapshots));
   result:=jsonb_build_object('ok',true);
  elsif v_stage='receipt' then
   if dl.status not in ('Dikirim','Tunggu Konfirmasi') then raise exception 'Catat serah terima kurir sebelum hasil klien'; end if;
   if dl.line_snapshots is null then raise exception 'Pengiriman lama tanpa rincian: rekonsiliasi berkas diperlukan'; end if;
   if dl.accepted_line_snapshots is not null then raise exception 'Hasil klien sudah dicatat'; end if;
   if nullif(trim(body->>'recipientName'),'') is null then raise exception 'Nama penerima klien wajib diisi'; end if;
   if nullif(body->>'paperProof','') is null and coalesce((body->>'signedPaperChecked')::boolean,false)=false then raise exception 'Periksa berkas bertanda tangan atau unggah buktinya'; end if;
   if jsonb_typeof(body->'received') is distinct from 'array' then raise exception 'Baris penerimaan wajib diisi'; end if;
   if (select count(*)<>count(distinct value->>'salesOrderItemId') from jsonb_array_elements(body->'received')) then raise exception 'Baris penerimaan ganda'; end if;
   if exists(select 1 from jsonb_array_elements(body->'received') r where not exists(select 1 from jsonb_array_elements(dl.line_snapshots) s where s->>'salesOrderItemId'=r->>'salesOrderItemId')) then raise exception 'Baris bukan milik pengiriman'; end if;
   for ln in select value from jsonb_array_elements(dl.line_snapshots) loop
    shipped:=(ln->>'qty')::numeric;
    select value into alloc from jsonb_array_elements(body->'received') where value->>'salesOrderItemId'=ln->>'salesOrderItemId';
    if alloc is null then raise exception 'Isi keputusan untuk setiap baris pengiriman'; end if;
    accepted_qty:=goods_qty(alloc->'qtyReceived');
    if accepted_qty>shipped then raise exception 'Diterima melebihi barang berangkat'; end if;
    line_amount:=coalesce((ln->>'costTotal')::numeric,round(shipped*(ln->>'unitCost')::numeric,2));
    cost_amount:=round(accepted_qty/shipped*line_amount,2);
    accepted:=accepted||jsonb_build_array(jsonb_set(ln,'{qty}',to_jsonb(accepted_qty))||jsonb_build_object('lineTotal',round(accepted_qty*(ln->>'unitPrice')::numeric,2),'costTotal',cost_amount));
    if accepted_qty<shipped then
     if nullif(trim(body->>'rejectionReason'),'') is null then raise exception 'Alasan penolakan klien wajib diisi'; end if;
     insert into pending_returns(id,product_id,original_so_id,qty,reason,date,status,di_number,owner_user_id,due_date,delivery_id,sales_order_item_id,unit_cost,cost_amount)
     values(eid||':return:'||(ln->>'salesOrderItemId'),ln->>'productId',so.id,shipped-accepted_qty,body->>'rejectionReason',at_text,'Pending QC','DI-'||sid||'-'||(ln->>'salesOrderItemId'),p_actor,event_at::date+2,sid,ln->>'salesOrderItemId',(ln->>'unitCost')::numeric,line_amount-cost_amount);
    end if;
   end loop;
   update deliveries set accepted_line_snapshots=accepted,status='Tunggu Konfirmasi',delivery_date=at_text,recipient_name=body->>'recipientName',rejection_reason=body->>'rejectionReason',ba_url=body->>'paperProof' where id=sid;
   result:=jsonb_build_object('ok',true);
  elsif v_stage='acceptance' then
   if body->>'soId' is distinct from so.id then raise exception 'PO bukan milik pengiriman'; end if;
   if dl.accepted_line_snapshots is null then raise exception 'Salin hasil penerimaan klien dahulu'; end if;
   if dl.invoice_id is not null then raise exception 'Pengiriman sudah memiliki invoice'; end if;
   select coalesce(sum(coalesce((value->>'lineTotal')::numeric,round((value->>'qty')::numeric*(value->>'unitPrice')::numeric,2))),0) into revenue from jsonb_array_elements(dl.accepted_line_snapshots);
   select coalesce(payment_term_days,30) into term from clients where id=so.client_id;
   iid:='invoice:'||sid;
   insert into invoices(id,sales_order_id,client_id,issue_date,due_date,total_amount,amount_paid,status,line_snapshots,delivery_id,client_snapshot)
   values(iid,so.id,so.client_id,dl.delivery_date,(dl.delivery_date::timestamptz+term*interval '1 day')::text,revenue,0,'Draft',dl.accepted_line_snapshots,sid,dl.client_snapshot);
   update deliveries set status='Awaiting Audit',invoice_id=iid where id=sid;
   update sales_orders set status='Awaiting Audit' where id=so.id;
   result:=jsonb_build_object('ok',true,'invoiceId',iid,'total',revenue);
  else
   if dl.status<>'Awaiting Audit' or dl.invoice_id is null or dl.accepted_line_snapshots is null then raise exception 'Pengiriman belum siap audit'; end if;
   select * into strict inv from invoices where id=dl.invoice_id for update;
   select coalesce(sum(coalesce((value->>'lineTotal')::numeric,round((value->>'qty')::numeric*(value->>'unitPrice')::numeric,2))),0),coalesce(sum(coalesce((value->>'costTotal')::numeric,round((value->>'qty')::numeric*(value->>'unitCost')::numeric,2))),0) into revenue,cogs from jsonb_array_elements(dl.accepted_line_snapshots);
   if inv.total_amount<>revenue then raise exception 'Nilai invoice berbeda dari rincian penerimaan'; end if;
   perform goods_journal(eid||':revenue',dl.delivery_date,'Invoice Terbit - Ref: '||inv.id,'Invoice',inv.id,'1-2000','4-1000',revenue);
   perform goods_journal(eid||':hpp',dl.delivery_date,'Pengakuan HPP Delivery - Ref: '||sid,'Delivery',sid,'5-1000','1-3000',cogs);
   for ln in select value from jsonb_array_elements(dl.line_snapshots) loop
    select * into strict li from sales_order_items where id=ln->>'salesOrderItemId' and sales_order_id=so.id for update;
    select (value->>'qty')::numeric into accepted_qty from jsonb_array_elements(dl.accepted_line_snapshots) where value->>'salesOrderItemId'=li.id;
    v_qty:=greatest(0,coalesce(li.qty_final,0)-(ln->>'qty')::numeric);
    if coalesce(li.qty_delivered,0)+accepted_qty>li.qty then raise exception 'Penerimaan kumulatif melebihi PO'; end if;
    update sales_order_items set qty_delivered=coalesce(qty_delivered,0)+accepted_qty,qty_final=case when v_qty>0 then v_qty else null end,subtotal_final=v_qty*unit_price,is_packed=false,qty_dispatched=null,is_handover_checked=false where id=li.id;
   end loop;
   update invoices set status=case when total_amount=0 then 'Paid' else 'Unpaid' end where id=inv.id;
   update deliveries set status='Terkirim' where id=sid;
   update sales_orders set status=case when not exists(select 1 from sales_order_items where sales_order_id=so.id and qty>coalesce(qty_delivered,0)+coalesce(qty_cancelled,0)) then 'Selesai' when exists(select 1 from sales_order_items where sales_order_id=so.id and qty_final>0) then 'Packing' else 'Kurang Kirim' end where id=so.id;
   result:=jsonb_build_object('ok',true);
  end if;
 else raise exception 'Tahap barang tidak didukung: %',v_stage;
 end if;
 insert into goods_events(id,stage,source_id,payload,performed_by,occurred_at,recorded_by,result) values(eid,v_stage,sid,body,performer,event_at,p_actor,result);
 return result||jsonb_build_object('updates',goods_snapshot(eid));
end $$;
revoke all on function public.goods_qty(jsonb) from public,anon,authenticated;
revoke all on function public.goods_stock(text,text,numeric,numeric,text,text,text,text,text,numeric,text,text,boolean) from public,anon,authenticated;
revoke all on function public.goods_journal(text,text,text,text,text,text,text,numeric) from public,anon,authenticated;
revoke all on function public.process_goods_event(jsonb,text) from public,anon,authenticated;
grant execute on function public.process_goods_event(jsonb,text) to service_role;

import { SessionError } from './server-session';
import type { Role } from '@/types';
type Row=Record<string,unknown>;
function fail():never {throw new SessionError('Gunakan perintah transaksi sumber; perubahan langsung riwayat keuangan ditolak',403)}
function hasSecret(value:unknown):boolean {
  if(!value || typeof value!=='object') return false;
  return Object.entries(value).some(([key,nested])=>/^(pin|password|fingerprint)$/i.test(key) || hasSecret(nested));
}
function unchanged(row:Row,existing:Row|null,keys:string[]) {
  for(const key of keys) if(key in row && JSON.stringify(row[key] ?? null)!==JSON.stringify(existing?.[key] ?? null)) fail();
}
export function validateProtectedWrite(table:string,row:Row,existing:Row|null,role:Role, context:{salesOrder?:Row;purchase?:Row;bankHasActivity?:boolean;cfoApprovalVerified?:boolean}={}) {
  if(!row || typeof row!=='object' || typeof row.id!=='string' || !row.id) throw new SessionError('Baris tidak valid',400);
  if(['expenses','reimbursements'].includes(table)) {
    if(!existing) fail();
    unchanged(row,existing,['recorded_by','recorded_at','channel']);
  }
  if(table==='users') {
    if(role!=='super_admin') fail();
    const officeRoles=['admin_po','finance','super_admin'];
    const office=officeRoles.includes(String(row.role || existing?.role));
    const promoted=office && !officeRoles.includes(String(existing?.role));
    if(office && (!existing || promoted || row.pin!==undefined) && (typeof row.pin!=='string' || !/^\d{4,6}$/.test(row.pin))) throw new SessionError('PIN baru wajib 4–6 angka',400);
  }
  if(table==='reimbursements') {
    if(row.status==='Paid' && existing?.status!=='Paid') fail();
    if(existing?.status==='Paid') unchanged(row,existing,['status','amount','date','user_id','purchase_id','kind','payment_date','payment_reference']);
  }
  if(table==='expenses') {
    if((row.status==='Approved' || row.is_journaled===true) && existing?.status!=='Approved' && existing?.is_journaled!==true) fail();
    if(existing?.status==='Approved' || existing?.is_journaled===true) unchanged(row,existing,['status','is_journaled','amount','date','category','reporter_id','purchase_id','reference_id','source_bank_account_id']);
  }
  if(table==='fixed_assets') {
    if(existing) unchanged(row,existing,['accumulated_depreciation','current_value','purchase_price','purchase_date','economic_life_months','salvage_value','status']);
    else if(Number(row.accumulated_depreciation || 0)!==0 || Number(row.current_value)!==Number(row.purchase_price)) fail();
  }

  if(table==='bank_accounts') {
    if(role!=='super_admin') unchanged(row,existing,['cfo_approval_required','owner_user_id','purpose']);
    if(row.account_code!==undefined && (typeof row.account_code!=='string' || !/^1-1[0-9]{3}$/.test(row.account_code))) fail();
    if(existing && row.account_code!==undefined && row.account_code!==existing.account_code && context.bankHasActivity) fail();
  }
  if(table==='purchase_requests') {
    if(role!=='super_admin') unchanged(row,existing,['approved_by_cfo','cfo_note']);
    if(row.status==='Approved' && existing?.status!=='Approved' && (role==='admin_po' || (!existing || existing.status==='Pending_CFO') && role!=='super_admin')) fail();
    if(existing?.approved_by_cfo && row.approved_by_cfo!==undefined && row.approved_by_cfo!==existing.approved_by_cfo && !(role==='super_admin' && context.cfoApprovalVerified===false)) fail();
  }
  if(table==='purchases') {
    if(!existing) fail();
    unchanged(row,existing,Object.keys(row).filter(key=>!['id','notes','paper_session_id','revised_at','revised_by','revision_note'].includes(key)));
    if(row.paper_session_id!==undefined && row.paper_session_id!==existing.paper_session_id && existing.status!=='Siap Cetak') fail();
  }
  if(table==='purchase_items') {
    if(!existing) fail();
    const planning=['purchase_method','payment_method','planned_vendor_id','vendor_id','estimated_unit_price'];
    if(role==='admin_po' || context.purchase?.status!=='Menunggu Rencana') unchanged(row,existing,planning);
    unchanged(row,existing,Object.keys(row).filter(key=>!['id','notes',...planning].includes(key)));
  }
  if(table==='sales_order_items') {
    const parent=context.salesOrder;
    if(!existing && (!parent || !['Draft','Pending Approval'].includes(String(parent.status)))) fail();
    if(existing && (!parent || parent.shopping_list_document_id || parent.shopping_list_compiled_at || !['Draft','Pending Approval'].includes(String(parent.status)))) unchanged(row,existing,['sales_order_id','product_id','qty','unit_price','subtotal']);
  }
  if(table==='sales_orders') {
    if(!existing && !['Draft','Pending Approval'].includes(String(row.status))) fail();
    if(existing) {
      const compiled=existing.shopping_list_document_id || existing.shopping_list_compiled_at;
      if(compiled || !['Draft','Pending Approval'].includes(String(existing.status))) unchanged(row,existing,['status','client_id','po_number','target_delivery_date','order_date']);
      else if(row.status && !['Draft','Pending Approval','Belanja','Batal'].includes(String(row.status))) fail();
      unchanged(row,existing,['shopping_list_document_id','shopping_list_compiled_at','shopping_list_compiled_by']);
    }
  }

  if(['deliveries','pending_returns','rejected_items','vendor_returns'].includes(table)) {
    if(!existing) fail();
    const allowed=new Set(['id','notes']);
    unchanged(row,existing,Object.keys(row).filter(key=>!allowed.has(key)));
  }
  const serverFields=['invoices','vendor_bills','bank_accounts','tukar_faktur','fixed_assets'].includes(table) ? undefined : PROTECTED_COLUMNS[table];
  if(serverFields) {
    if(existing) unchanged(row,existing,serverFields);
    else for(const key of serverFields) if(key in row && row[key]!==null && row[key]!==false && row[key]!==0 && row[key]!=='' && !(Array.isArray(row[key]) && (row[key] as unknown[]).length===0)) fail();
  }

  if(table==='record_history' && hasSecret(row)) fail();
  if(table==='bank_accounts') {
    if(role!=='super_admin') unchanged(row,existing,['cfo_approval_required','owner_user_id','purpose']);
    if('current_balance' in row || ('balance' in row && Number(row.balance)!==Number(existing?.balance || 0))) fail();
  }
  if(table==='invoices' || table==='vendor_bills') {
    if(!existing) fail();
    if(existing) unchanged(row,existing,['amount_paid','payments','paid_date','status']);
    else if(Number(row.amount_paid || 0)!==0 || (Array.isArray(row.payments) && row.payments.length>0) || (row.status && row.status!==(table==='invoices'?'Unpaid':'Pending'))) fail();
    if(table==='invoices' && existing) unchanged(row,existing,['client_id','sales_order_id','sales_order_ids','total_amount','issue_date','line_snapshots','delivery_id','tukar_faktur_id','due_date','is_consolidated','superseded_by_invoice_id','consolidated_invoice_ids','client_snapshot']);
    if(table==='vendor_bills' && existing) unchanged(row,existing,['vendor_id','total_amount','purchase_id']);
  }
  if(table==='tukar_faktur') {
    if(!existing && row.status && row.status!=='Draft') fail();
    if(existing && existing.status!=='Draft') unchanged(row,existing,['tf_number','client_id','period_start','period_end','issue_date','total_amount']);
    if(existing && ['Received','Paid'].includes(String(existing.status))) unchanged(row,existing,['received_by','received_at','received_proof_url']);
    if(existing && existing.status==='Issued' && row.status==='Received') {
      const date=typeof row.received_at==='string'?Date.parse(row.received_at):NaN;
      if(typeof row.received_by!=='string'||!row.received_by.trim()||typeof row.received_proof_url!=='string'||!row.received_proof_url.trim()||!Number.isFinite(date)||date<Date.parse(String(existing.issue_date))) fail();
    }
    if(existing && row.status && row.status!==existing.status && !(existing.status==='Issued' && row.status==='Received')) fail();
  }
}

/** These columns are removed from generic UPDATE payloads after validation too,
 * so a concurrent source command cannot be undone by an older browser snapshot. */
export const PROTECTED_COLUMNS:Record<string,string[]>={
 products:['current_stock','b2c_stock'],
 sales_orders:['parent_order_id','supplement_reference','supplement_note','supplement_recorded_at','supplement_recorded_by','shopping_list_document_id','shopping_list_compiled_at','shopping_list_compiled_by'],
 purchases:['status','actual_spent','expected_remainder','paper_occurred_at','paper_performer_id','paper_recorded_at','reconciliation_status','budget_amount','disbursed_amount','disbursed_at','disbursed_by','disbursed_to_bank_account_id'],
 users:[],
 purchase_requests:[],
 reimbursements:[],
 expenses:[],
 fixed_assets:['accumulated_depreciation','current_value','purchase_price','purchase_date','economic_life_months','salvage_value','status'],
 sales_order_items:['qty_final','qty_cancelled','subtotal_final','qty_delivered','qty_dispatched','is_packed','is_handover_checked','dispatch_note','qty_adjustment_reason'],
 purchase_items:['physical_qty_received','physical_before_report','cost_pending','qty_purchased','actual_unit_price','is_checked','is_qced','inbound_status','inbound_qty_received','inbound_verified_at','inbound_verified_by','inbound_note','qc_processed_qty','qc_event_ids','qc_occurred_at','qc_recorded_at','qc_recorded_by','qc_paper_number','qc_paper_proof','report_event_id','report_event_ids','report_complete','is_online_ordered','is_online_audited','online_order_date'],
 deliveries:['status','sales_order_id','courier_id','delivery_date','invoice_id','line_snapshots','accepted_line_snapshots','occurred_at','performed_by','recorded_at','recorded_by','paper_number','paper_proof','recipient_name','rejection_reason','client_snapshot'],
 invoices:['amount_paid','payments','paid_date','status','client_id','sales_order_id','sales_order_ids','total_amount','issue_date','line_snapshots','delivery_id','tukar_faktur_id','due_date','is_consolidated','superseded_by_invoice_id','consolidated_invoice_ids','client_snapshot'],
 vendor_bills:['amount_paid','payments','paid_date','status','vendor_id','total_amount','purchase_id'],
 bank_accounts:['balance','cfo_approval_required','owner_user_id','purpose'],
 tukar_faktur:['tf_number','client_id','period_start','period_end','issue_date','total_amount','issued_by'],
};

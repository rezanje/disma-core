import type { PaperEvidence } from './goods-command';
import type { QcEntryPlan } from './qc-entry';
import { goodsUpdateKeys } from './goods-batch';
import { purchasingQuantity } from './purchase-plan';

export const paperUpdateKeys=[...goodsUpdateKeys,'purchases','courierSpares'] as const;
export type PaperCommand={eventId:string;stage:'transcribe'|'supplement'|'spare-settle';payload:Record<string,any>};
export type DispatchDraft={soId:string;courierId:string;lines:Array<{salesOrderItemId:string;qty:number}>;evidence:PaperEvidence;handoverAt:string;signedPaperChecked:boolean};
export type SpareDraft={productId:string;courierId:string;qty:number;evidence:PaperEvidence};
export type SupplementDraft={clientId:string;parentOrderId?:string;paperNumber:string;occurredAt:string;targetDeliveryDate:string;performedBy:string;note:string;lines:Array<{productId:string;qty:number;unitPrice:number;buyQty:number}>};
const positive=(n:number)=>Number.isFinite(n)&&n>0;
export function jakartaDate(date=new Date()){return date.toLocaleDateString('sv-SE',{timeZone:'Asia/Jakarta'})}
export function localPaperTime(date=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date).replace(' ','T')}
export function paperIso(value:string){
 // datetime-local fields on the office screen always represent WIB, even on another device timezone.
 const dated=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)?value+':00+07:00':value;
 const date=new Date(dated);if(!value||!Number.isFinite(date.getTime()))throw new Error('Waktu kejadian tidak valid.');return date.toISOString();
}
function evidence(value:PaperEvidence):PaperEvidence {
 if(!value.performedBy||!value.paperNumber?.trim())throw new Error('Isi pelaksana dan nomor berkas sesuai kertas.');
 return {performedBy:value.performedBy,paperNumber:value.paperNumber.trim(),occurredAt:paperIso(value.occurredAt||''),paperProof:value.paperProof,recipientName:value.recipientName,rejectionReason:value.rejectionReason,signedPaperChecked:value.signedPaperChecked};
}
function command(eventId:string,stage:PaperCommand['stage'],payload:PaperCommand['payload']):PaperCommand {
 if(!eventId||eventId.length>64)throw new Error('Nomor kejadian tidak valid.');return {eventId,stage,payload};
}
export function preparePaperTranscription(eventId:string,plans:QcEntryPlan[],dispatches:DispatchDraft[],spares:SpareDraft[]):PaperCommand {
 if(!plans.length&&!dispatches.length&&!spares.length)throw new Error('Isi QC atau pilih serah terima / spare terlebih dahulu.');
 if(plans.length>100||dispatches.length>50||spares.length>50)throw new Error('Maksimal 100 QC, 50 PO dan 50 spare sekali simpan.');
 if(new Set(dispatches.map(d=>d.soId)).size!==dispatches.length)throw new Error('PO serah terima berulang.');
 const qc=plans.map(plan=>{
  const {purchaseItemId,eventId:qcId,...payload}=plan.qc;
  const allocations=payload.allocations.map(row=>({...row,qty:purchasingQuantity(row.qty)}));
  const passed=purchasingQuantity(payload.qtyPassToInventory+payload.allocations.reduce((sum,row)=>sum+row.qty,0));
  const allocated=purchasingQuantity(allocations.reduce((sum,row)=>sum+row.qty,0));
  const qtyPassToInventory=purchasingQuantity(Math.max(0,passed-allocated));
  return {sourceId:plan.sourceId,commands:[...(plan.arrival?[{...plan.arrival,payload:{...plan.arrival.payload,qty:purchasingQuantity(Number(plan.arrival.payload.qty)),...evidence(plan.arrival.payload as PaperEvidence)}}]:[]),{eventId:qcId,stage:'qc',sourceId:purchaseItemId,payload:{...payload,allocations,qtyPassToInventory,qtyReject:purchasingQuantity(payload.qtyReject),...evidence(payload)}}]};
 });
 const checked=dispatches.map(d=>{
  const ev=evidence(d.evidence);const handoverAt=paperIso(d.handoverAt);
  if(handoverAt<ev.occurredAt!)throw new Error('Waktu serah terima harus setelah QC / penyiapan.');
  if(!d.signedPaperChecked&&!ev.paperProof)throw new Error('Periksa berita acara dengan tanda tangan sebelum mencatat serah terima.');
  if(!d.soId||!d.courierId||!d.lines.length||d.lines.some(l=>!l.salesOrderItemId||!Number.isFinite(l.qty)||l.qty<0)||new Set(d.lines.map(l=>l.salesOrderItemId)).size!==d.lines.length)throw new Error('Lengkapi kurir dan jumlah barang kiriman.');
  return {...d,lines:d.lines.map(line=>({...line,qty:purchasingQuantity(line.qty)})),evidence:ev,handoverAt};
 });
 const spareRows=spares.map(s=>{
  if(!s.productId||!s.courierId||!positive(s.qty))throw new Error('Isi barang, kurir dan jumlah spare yang valid.');
  if(!s.evidence.signedPaperChecked&&!s.evidence.paperProof)throw new Error('Periksa berita acara dengan tanda tangan sebelum mencatat spare kurir.');
  return {...s,qty:purchasingQuantity(s.qty),evidence:evidence(s.evidence)};
 });
 return command(eventId,'transcribe',{qc,dispatches:checked,spares:spareRows});
}
export function prepareSupplement(eventId:string,draft:SupplementDraft):PaperCommand {
 if(!draft.clientId||!draft.paperNumber.trim()||!draft.note.trim()||!draft.performedBy||!/^\d{4}-\d{2}-\d{2}$/.test(draft.targetDeliveryDate)||!draft.lines.length||draft.lines.length>100)throw new Error('Lengkapi outlet, tanggal, penghubung, referensi dan barang susulan.');
 if(new Set(draft.lines.map(l=>l.productId)).size!==draft.lines.length)throw new Error('Barang susulan berulang. Gabungkan jumlahnya.');
 for(const line of draft.lines){
  if(!line.productId||!positive(line.qty)||!positive(line.unitPrice))throw new Error('Isi barang, jumlah tambahan dan harga jual yang valid.');
  if(!Number.isFinite(line.buyQty)||line.buyQty<0||line.buyQty>line.qty)throw new Error('Jumlah beli harus antara nol dan jumlah tambahan; sisanya diambil dari stok bebas.');
 }
 return command(eventId,'supplement',{...draft,paperNumber:draft.paperNumber.trim(),note:draft.note.trim(),occurredAt:paperIso(draft.occurredAt)});
}
export function prepareSpareSettlement(eventId:string,spare:{id:string;qty:number;courierId:string},used:number,damaged:number,returned:number,reason:string,ev:PaperEvidence):PaperCommand {
 if([used,damaged,returned].some(n=>!Number.isFinite(n)||n<0)||Math.abs(used+damaged+returned-spare.qty)>1e-8)throw new Error('Spare dibawa harus sama dengan terpakai + rusak + kembali.');
 if((used+damaged)>0&&!reason.trim())throw new Error('Isi alasan spare terpakai / rusak.');
 return command(eventId,'spare-settle',{id:spare.id,used,damaged,returned,reason,evidence:evidence({...ev,performedBy:spare.courierId})});
}

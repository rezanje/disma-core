import type { PurchaseItem } from '@/types';
import { arrivalRemaining, qcRemaining, buildFifoAllocations, stillOwed, type OpenOrder, type OrderLine } from './daily-flow';
import { executeGoodsCommand, goodsEventId, type GoodsCommand, type PaperEvidence } from './goods-command';
import { processInboundQC, type QcInput, type RejectAction } from './qc-process';
import type { useAppStore } from './store';

type Store = ReturnType<typeof useAppStore.getState>;
export type QcEntryDraft = {
 incoming:number; passed:number; rejected:number; rejectAction:RejectAction; rejectReason:string;
 allocations?:Array<{soId:string;qty:number}>; note?:string; batchNumber?:string; expiryDate?:string;
 vendorUnitPrice?:number; rejectVendorId?:string; bankAccountId?:string;
};
export type QcEntryPlan = {sourceId:string; arrival?:GoodsCommand; qc:QcInput};
export type QcEntryContext = {eventId:string; needsArrival:boolean; evidence:PaperEvidence; orders:OpenOrder[]; lines:OrderLine[]; actorRole?:string};

/** Validate the whole row before recording its first physical stage. */
export function prepareQcEntry(item:PurchaseItem,draft:QcEntryDraft,context:QcEntryContext):QcEntryPlan {
 const {incoming,passed,rejected}=draft;
 const limit=context.needsArrival?arrivalRemaining(item):qcRemaining(item);
 if([incoming,passed,rejected].some(q=>!Number.isFinite(q)||q<0)||incoming<=0)throw new Error('Isi jumlah dengan angka valid dan masuk lebih dari nol.');
 if(incoming>limit+1e-8)throw new Error('Jumlah masuk melebihi sisa barang pada dokumen.');
 if(Math.abs(incoming-passed-rejected)>1e-8)throw new Error('Masuk harus sama dengan lolos + reject.');
 if(!context.evidence.performedBy)throw new Error('Pilih pemeriksa pada bagian atas tabel.');
 if(!context.evidence.occurredAt||!Number.isFinite(new Date(context.evidence.occurredAt).getTime()))throw new Error('Isi waktu pemeriksaan yang valid.');
 if(!context.evidence.paperNumber?.trim()||!context.eventId)throw new Error('Nomor berkas pemeriksaan belum tersedia.');
 if(rejected>0&&!draft.rejectReason.trim())throw new Error('Isi alasan reject pada rincian barang.');
 if(rejected>0&&!['Disposal','Return','B2C'].includes(draft.rejectAction))throw new Error('Pilih tindakan reject.');
 if(draft.vendorUnitPrice!==undefined&&(!Number.isFinite(draft.vendorUnitPrice)||draft.vendorUnitPrice<0))throw new Error('Harga vendor harus angka valid.');
 if(item.purchaseMethod==='Vendor'&&item.paymentMethod==='Transfer'&&['finance','super_admin'].includes(context.actorRole||'')&&!draft.bankAccountId)throw new Error('Pilih rekening sumber pembayaran pada rincian barang.');
 const rejectVendorId=draft.rejectVendorId||item.vendorId||item.plannedVendorId;
 if(rejected>0&&draft.rejectAction==='Return'&&!rejectVendorId)throw new Error('Pilih vendor tujuan retur pada rincian barang.');
 const automatic=buildFifoAllocations(item.productId,passed,context.orders,context.lines);
 const allocations=draft.allocations||automatic.allocations;
 const allocated=allocations.reduce((s,a)=>s+a.qty,0);
 if(allocations.some(a=>!Number.isFinite(a.qty)||a.qty<0)||allocated>passed+1e-8||new Set(allocations.map(a=>a.soId)).size!==allocations.length)throw new Error('Jumlah alokasi PO tidak valid atau melebihi jumlah lolos.');
 for(const allocation of allocations) {
  const line=context.lines.find(line=>line.salesOrderId===allocation.soId&&line.productId===item.productId);
  if(!line||allocation.qty>stillOwed(line)+1e-8||!automatic.allocations.some(a=>a.soId===allocation.soId))throw new Error('Alokasi PO melebihi sisa kebutuhan atau PO sudah diproses.');
 }
 const unreportedMarket=(!item.purchaseMethod||item.purchaseMethod==='Pasar')&&!item.qtyPurchased;
 const baseRemaining=item.physicalBeforeReport?qcRemaining(item):Math.max(0,item.qtyPurchased-(item.qcProcessedQty||0));
 const note=draft.note?.trim()||(incoming<baseRemaining?`Pemeriksaan bertahap: ${incoming} dari ${baseRemaining}; sisa belum diperiksa.`:undefined);
 const evidence={...context.evidence,paperNumber:context.evidence.paperNumber.trim()};
 return {
  sourceId:item.id,
  arrival:context.needsArrival?{eventId:goodsEventId(context.eventId+':arrival'),stage:'arrival',sourceId:item.id,payload:{qty:incoming,condition:draft.note||'',...evidence}}:undefined,
  qc:{purchaseItemId:item.id,eventId:goodsEventId(context.eventId+':qc'),qtyPassToInventory:Math.max(0,passed-allocated),allocations,qtyReject:rejected,rejectAction:draft.rejectAction,rejectReason:draft.rejectReason,
   rejectVendorId,unbalanceReason:note,batchNumber:draft.batchNumber||undefined,expiryDate:draft.expiryDate||undefined,
   vendorUnitPrice:item.physicalBeforeReport||unreportedMarket?undefined:draft.vendorUnitPrice,bankAccountId:draft.bankAccountId||undefined,...evidence},
 };
}

/** Keep this exact plan on a lost response: each existing stage is idempotent. */
export async function submitQcEntry(getState:()=>Store,plan:QcEntryPlan):Promise<string[]> {
 if(plan.arrival)await executeGoodsCommand(getState,plan.arrival);
 const result=await processInboundQC(getState,plan.qc);
 if(!result.ok)throw new Error((plan.arrival?'Penerimaan tercatat; QC belum selesai. ':'')+result.error);
 return result.warnings;
}

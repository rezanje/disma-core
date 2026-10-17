import type { PurchaseItem } from '@/types';
import { prepareQcEntry,type QcEntryDraft,type QcEntryPlan,type QcEntryContext } from './qc-entry';
import { goodsEventId,type GoodsCommand } from './goods-command';
import { goodsUpdateKeys,isGoodsUpdates,type QcBatchEntry,type GoodsUpdates } from './goods-batch';
import { useAppStore } from './store';

export type QcBatchRow={item:PurchaseItem;draft:QcEntryDraft;needsArrival:boolean};
/** Allocate shared PO demand once across the whole sheet, before any write. */
export function prepareQcBatch(rows:QcBatchRow[],context:QcEntryContext) {
 const plans:QcEntryPlan[]=[];const errors:Record<string,string>={};
 const lines=context.lines.map(line=>({...line}));
 for(const row of rows) {
  try {
   const plan=prepareQcEntry(row.item,row.draft,{...context,lines,eventId:`${context.eventId}:${row.item.id}`,needsArrival:row.needsArrival});
   plans.push(plan);
   for(const allocation of plan.qc.allocations) {
    const line=lines.find(line=>line.salesOrderId===allocation.soId&&line.productId===row.item.productId);
    if(line)line.qtyFinal=(line.qtyFinal||0)+allocation.qty;
   }
  } catch(error){errors[row.item.id]=error instanceof Error?error.message:'Periksa isian barang.';}
 }
 return {plans:Object.keys(errors).length?[]:plans,errors};
}
export function qcBatchEntries(plans:QcEntryPlan[]):QcBatchEntry[] {
 const normalize=(command:GoodsCommand):GoodsCommand=>({...command,eventId:goodsEventId(command.eventId),payload:{...command.payload,occurredAt:new Date(String(command.payload.occurredAt)).toISOString()}});
 return plans.map(plan=>{
  const {eventId,purchaseItemId,...payload}=plan.qc;
  const qc=normalize({eventId:eventId!,stage:'qc',sourceId:purchaseItemId,payload});
  return {sourceId:plan.sourceId,commands:plan.arrival?[normalize(plan.arrival),qc]:[qc]};
 });
}
/** One network round trip and one store update, including confirmed partial progress. */
export async function submitQcBatch(plans:QcEntryPlan[]) {
 const entries=qcBatchEntries(plans);const stamp=useAppStore.getState()._lastLocalMutationAt;
 const response=await fetch('/api/operations/goods/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entries})});
 const result=await response.json();
 if(!response.ok||result?.ok!==true)throw new Error(result?.error||'Simpan bersama belum selesai. Coba ulang dengan isian yang sama.');
 const ids=new Set(plans.map(plan=>plan.sourceId));const eventIds=new Set(entries.flatMap(entry=>entry.commands.map(command=>command.eventId)));
 const completed=result.completedSourceIds as string[];
 if(!isGoodsUpdates(result.updates)||typeof result.complete!=='boolean'||!Array.isArray(completed)||new Set(completed).size!==completed.length||completed.some(id=>!ids.has(id))||!Array.isArray(result.confirmedEventIds)||result.confirmedEventIds.some((id:unknown)=>typeof id!=='string'||!eventIds.has(id))||!Array.isArray(result.warnings)||result.warnings.some((message:unknown)=>typeof message!=='string')||(result.complete?completed.length!==plans.length:!ids.has(result.failedSourceId)||completed.includes(result.failedSourceId)))throw new Error('Konfirmasi simpan bersama belum lengkap. Coba ulang transaksi yang sama.');
 const updates=result.updates as GoodsUpdates;
 for(const id of completed) {
  const plan=plans.find(plan=>plan.sourceId===id)!;
  const source=updates.purchaseItems.find(row=>row.id===id);
  if(!result.confirmedEventIds.includes(plan.qc.eventId)||!Array.isArray(source?.qcEventIds)||!source.qcEventIds.includes(plan.qc.eventId))throw new Error('Server belum mengonfirmasi semua hasil QC. Coba ulang transaksi yang sama.');
 }
 if(useAppStore.getState()._lastLocalMutationAt!==stamp)throw new Error('Data lain berubah saat menyimpan. Coba ulang simpan bersama untuk mengambil hasil terbaru.');
 useAppStore.setState(state=>{
  const patch:Record<string,unknown>={_lastLocalMutationAt:Math.max(Date.now(),state._lastLocalMutationAt+1)};
  for(const key of goodsUpdateKeys){const rows=updates[key];if(!rows.length)continue;const rowIds=new Set(rows.map(row=>row.id));patch[key]=[...rows,...state[key].filter(row=>!rowIds.has(row.id))];}
  return patch;
 });
 return {complete:result.complete,completedSourceIds:completed,failedSourceId:result.failedSourceId as string|undefined,message:result.message as string|undefined,warnings:result.warnings as string[]};
}

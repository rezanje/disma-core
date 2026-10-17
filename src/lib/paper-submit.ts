import { useAppStore } from './store';
import { paperUpdateKeys,type PaperCommand } from './paper-operations';
export class PaperOperationRejected extends Error {}
/** Keep this exact command until confirmed. The entire source transaction is atomic. */
export async function submitPaperOperation(command:PaperCommand) {
 const stamp=useAppStore.getState()._lastLocalMutationAt;
 const response=await fetch('/api/operations/paper',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});
 const result=await response.json();
 if(!response.ok||result?.ok!==true){const message=result?.error||'Belum ada konfirmasi simpan. Coba ulang isian yang sama.';if(response.status===409)throw new PaperOperationRejected(message);throw new Error(message);}
 const updates=result.updates;
 if(result.eventId!==command.eventId||!updates||paperUpdateKeys.some(key=>!Array.isArray(updates[key])||updates[key].some((r:any)=>!r||typeof r.id!=='string'||!r.id)))throw new Error('Konfirmasi server belum lengkap. Ulangi transaksi yang sama.');
 const has=(key:string,id:string)=>typeof id==='string'&&updates[key].some((r:any)=>r.id===id);
 if(command.stage==='supplement'&&(!has('salesOrders',result.soId)||!has('purchases',result.purchaseId)||!updates.salesOrderItems.some((l:any)=>l.salesOrderId===result.soId)))throw new Error('PO susulan belum dikonfirmasi server. Coba ulang isian yang sama.');
 if(command.stage==='spare-settle'&&!updates.courierSpares.some((r:any)=>r.id===command.payload.id&&r.status==='Selesai'))throw new Error('Penyelesaian spare belum dikonfirmasi.');
 if(command.stage==='transcribe'){
  if(!Array.isArray(result.goodsEventIds)||!Array.isArray(result.spareIds)||result.spareIds.length!==command.payload.spares.length)throw new Error('Konfirmasi kejadian belum lengkap.');
  let index=0;
  for(const row of command.payload.qc){index+=row.commands.length;if(!updates.purchaseItems.some((r:any)=>r.id===row.sourceId&&r.qcEventIds?.includes(command.eventId+':goods:'+index)))throw new Error('QC barang belum dikonfirmasi.');}
  for(const row of command.payload.dispatches)if(!updates.deliveries.some((d:any)=>d.salesOrderId===row.soId&&d.courierId===row.courierId&&d.status!=='Menunggu'))throw new Error('Serah terima kurir belum dikonfirmasi.');
  if(result.spareIds.some((id:string)=>!has('courierSpares',id)))throw new Error('Spare kurir belum dikonfirmasi.');
 }
 if(useAppStore.getState()._lastLocalMutationAt!==stamp)throw new Error('Data berubah selama simpan. Ulangi transaksi yang sama untuk memuat hasil terbaru.');
 useAppStore.setState(state=>{
  const patch:Record<string,unknown>={_lastLocalMutationAt:Math.max(Date.now(),state._lastLocalMutationAt+1)};
  for(const key of paperUpdateKeys){const rows=updates[key];if(!rows.length)continue;const ids=new Set(rows.map((r:any)=>r.id));patch[key]=[...rows,...state[key].filter((r:any)=>!ids.has(r.id))];}
  return patch;
 });
 return result as {soId?:string;purchaseId?:string;spareIds?:string[]};
}

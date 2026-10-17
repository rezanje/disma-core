import type { GoodsCommand } from './goods-command';

export const goodsUpdateKeys=['stockMovements','products','salesOrders','salesOrderItems','purchaseItems','deliveries','invoices','pendingReturns','vendorReturns','rejectedItems','vendorBills','bankAccounts','cashTransactions','journalEntries','journalLines'] as const;
type Row={id:string;[key:string]:unknown};
export type GoodsUpdates=Record<typeof goodsUpdateKeys[number],Row[]>;
export type QcBatchEntry={sourceId:string;commands:GoodsCommand[]};
export function isGoodsUpdates(value:unknown):value is GoodsUpdates {
 if(!value||typeof value!=='object')return false;
 const data=value as Record<string,unknown>;
 return goodsUpdateKeys.every(key=>Array.isArray(data[key])&&(data[key] as Row[]).every(row=>row&&typeof row.id==='string'&&!!row.id));
}
export function validateQcBatch(value:unknown):QcBatchEntry[] {
 if(!Array.isArray(value)||!value.length||value.length>100)throw new Error('Isi 1–100 barang untuk disimpan bersama.');
 const ids=new Set<string>();const events=new Set<string>();
 for(const entry of value) {
  if(!entry||typeof entry.sourceId!=='string'||!entry.sourceId||ids.has(entry.sourceId)||!Array.isArray(entry.commands)||!entry.commands.length||entry.commands.length>2)throw new Error('Daftar barang QC tidak valid atau berulang.');
  ids.add(entry.sourceId);
  for(const [index,command] of entry.commands.entries()) {
   const stage=index===entry.commands.length-1?'qc':'arrival';
   if(!command||command.stage!==stage||command.sourceId!==entry.sourceId||typeof command.eventId!=='string'||!command.eventId.trim()||command.eventId.length>96||events.has(command.eventId)||!command.payload||typeof command.payload!=='object'||Array.isArray(command.payload))throw new Error('Simpan bersama hanya menerima penerimaan dan QC dengan nomor kejadian yang unik.');
   events.add(command.eventId);
  }
 }
 return value;
}

/** Reuse locked, durable goods commands; stop at the first unresolved item. */
export async function runQcBatch(entries:QcBatchEntry[],execute:(command:GoodsCommand)=>Promise<{data:unknown;error:{message:string}|null}>) {
 const maps=Object.fromEntries(goodsUpdateKeys.map(key=>[key,new Map<string,Row>()])) as Record<typeof goodsUpdateKeys[number],Map<string,Row>>;
 const completedSourceIds:string[]=[];const confirmedEventIds:string[]=[];const warnings=new Set<string>();
 let failedSourceId:string|undefined;let message:string|undefined;
 for(const entry of entries) {
  try {
   for(const command of entry.commands) {
    const {data,error}=await execute(command);
    if(error)throw new Error(error.message);
    const result=data as {ok?:boolean;updates?:unknown;paymentPendingAmount?:number}|null;
    if(!result?.ok||!isGoodsUpdates(result.updates))throw new Error('Konfirmasi server belum lengkap. Ulangi simpan bersama.');
    const source=result.updates.purchaseItems.find(row=>row.id===entry.sourceId);
    const qcIds=source?.qc_event_ids??source?.qcEventIds;
    if(!source||(command.stage==='qc'&&(!Array.isArray(qcIds)||!qcIds.includes(command.eventId))))throw new Error('Server belum mengonfirmasi hasil QC barang.');
    for(const key of goodsUpdateKeys)for(const row of result.updates[key])maps[key].set(row.id,row);
    confirmedEventIds.push(command.eventId);
    if((result.paymentPendingAmount||0)>0)warnings.add('Sisa hutang vendor menunggu pembayaran Finance.');
   }
   completedSourceIds.push(entry.sourceId);
  } catch(error) {
   failedSourceId=entry.sourceId;message=error instanceof Error?error.message:'Barang belum selesai tersimpan.';break;
  }
 }
 const updates=Object.fromEntries(goodsUpdateKeys.map(key=>[key,[...maps[key].values()]])) as GoodsUpdates;
 return {ok:true,complete:!failedSourceId,completedSourceIds,confirmedEventIds,failedSourceId,message,warnings:[...warnings],updates};
}

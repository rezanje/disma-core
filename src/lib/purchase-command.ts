import {useAppStore} from './store';
export type PurchaseCommand = {
  eventId:string; stage:'compile'|'revise'|'report'|'online'|'vendor-order'|'plan-release'|'paper-release'|'verify'; sourceId:string; payload:Record<string,unknown>;
};
/** One durable server transaction; retry the identical command after a lost response. */
export async function executePurchaseCommand(_getState:()=>unknown,command:PurchaseCommand):Promise<void> {
  const stamp=useAppStore.getState()._lastLocalMutationAt;
  const response=await fetch('/api/operations/purchases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});
  const result=await response.json();
  if(!response.ok || result?.ok!==true) throw new Error(result?.error || 'Pembelian belum tersimpan. Ulangi dengan nomor kejadian yang sama.');
  const keys=['purchases','purchaseItems','salesOrders','salesOrderItems','products','stockMovements','notifications','purchaseRequests','rejectedItems','bankAccounts','cashTransactions','journalEntries','journalLines','expenses'] as const;
  if(result.eventId!==command.eventId || !result.updates || keys.some(key=>!Array.isArray(result.updates[key]) || result.updates[key].some((row:unknown)=>!row || typeof row!=='object' || typeof (row as {id?:unknown}).id!=='string' || !(row as {id:string}).id))) throw new Error('Transaksi mungkin tersimpan, tetapi konfirmasi server belum lengkap. Ulangi nomor kejadian yang sama.');
  const contains=(key:string,id:unknown)=>typeof id==='string' && result.updates[key].some((row:{id:string})=>row.id===id);
  const required:Record<PurchaseCommand['stage'],[string,unknown]>={compile:['purchases',command.sourceId],revise:['salesOrders',command.sourceId],report:['purchaseItems',(command.payload.lines as Array<{id:string}>|undefined)?.[0]?.id],online:['purchaseItems',command.sourceId],'vendor-order':['purchaseItems',command.sourceId],'plan-release':['purchases',command.sourceId],'paper-release':['purchases',(command.payload.purchaseIds as string[]|undefined)?.[0]],verify:['purchases',command.sourceId]};
  const [key,id]=required[command.stage];
  const banks=[command.payload.bankAccountId,command.payload.pocketBankAccountId,command.payload.transferBankAccountId].filter(x=>typeof x==='string' && x);
  const payload=command.payload as {lines?:Array<{id:string}>;items?:Array<{id:string}>;reservations?:Array<{salesOrderItemId:string}>;salesOrderIds?:string[];purchaseIds?:string[];expenses?:Array<{id:string}>};
  const missing = (command.stage==='compile' && ((payload.items || []).some(row=>!contains('purchaseItems',row.id)) || (payload.reservations || []).some(row=>!contains('salesOrderItems',row.salesOrderItemId)) || (payload.salesOrderIds || []).some(id=>!contains('salesOrders',id))))
    || (command.stage==='revise' && (payload.lines || []).some(row=>!contains('salesOrderItems',row.id)))
    || (command.stage==='report' && ((payload.lines || []).some(row=>!contains('purchaseItems',row.id)) || (payload.expenses || []).some(row=>!contains('expenses',row.id))))
    || (command.stage==='paper-release' && (payload.purchaseIds || []).some(id=>!contains('purchases',id)));
  if(missing || !contains(key,id) || banks.some(bank=>!contains('bankAccounts',bank))) throw new Error('Server belum mengonfirmasi seluruh sumber transaksi. Ulangi dengan nomor kejadian yang sama.');
  const money:string[]=[];
  if(command.stage==='report') {
    const lines=command.payload.lines as Array<{purchaseId:string;isChecked:boolean;paymentMethod?:string;qtyPurchased:number;actualUnitPrice:number}>;
    for(const row of lines) if(row.isChecked && row.qtyPurchased*row.actualUnitPrice>0 && ['Cash','Transfer'].includes(row.paymentMethod || 'Cash')) {
      const prefix=`paper-${row.paymentMethod==='Transfer'?'transfer':'cash'}:${command.eventId}:${row.purchaseId}`;
      if(!money.includes(prefix))money.push(prefix);
    }
  }
  if(command.stage==='online')money.push(`online:${command.eventId}`);
  if(command.stage==='vendor-order' && result.updates.purchaseItems.find((row:{id:string})=>row.id===command.sourceId)?.paymentMethod==='Cash')money.push(`vendor-cash:${command.eventId}`);
  if(money.some(prefix=>!contains('cashTransactions',`financial:${prefix}:out`) || !contains('journalEntries',`financial:${prefix}:journal`) || result.updates.journalLines.filter((row:{journalEntryId:string})=>row.journalEntryId===`financial:${prefix}:journal`).length<2)) throw new Error('Konfirmasi sumber keuangan belum lengkap. Ulangi dengan nomor kejadian yang sama.');
  if(command.stage==='compile' && (payload.reservations || []).some(row=>{
    const source=result.updates.salesOrderItems.find((line:{id:string})=>line.id===row.salesOrderItemId);
    return !source || !contains('stockMovements',`reserve:${command.eventId}:${source.salesOrderId}:booking:${row.salesOrderItemId}`);
  })) throw new Error('Konfirmasi booking stok belum lengkap. Ulangi dengan nomor kejadian yang sama.');
  if(useAppStore.getState()._lastLocalMutationAt!==stamp) throw new Error('Transaksi tersimpan, tetapi ada perubahan lain selama memuat rincian. Ulangi nomor kejadian yang sama untuk keadaan terbaru.');
  useAppStore.setState(state=>{
    const patch:Record<string,unknown>={_lastLocalMutationAt:Math.max(Date.now(),state._lastLocalMutationAt+1)};
    for(const key of keys) {const rows=result.updates[key];if(!rows.length)continue;const ids=new Set(rows.map((row:{id:string})=>row.id));patch[key]=[...rows,...state[key].filter((row:{id:string})=>!ids.has(row.id))];}
    return patch;
  });
}

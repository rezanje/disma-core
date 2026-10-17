import {v5 as uuidv5} from 'uuid';
import {useAppStore} from './store';
export class GoodsCommandRejected extends Error {}
/** Every goods stage commits on the server; no client fallback on schema/transport errors. */
export type PaperEvidence = {
  occurredAt?: string;
  performedBy?: string;
  paperNumber?: string;
  paperProof?: string;
  recipientName?: string;
  rejectionReason?: string;
  signedPaperChecked?: boolean;
};
export type GoodsCommand = {
  eventId: string;
  stage: 'arrival' | 'qc' | 'packing' | 'release' | 'handover' | 'receipt' | 'acceptance' | 'audit' | 'return' | 'vendor-return' | 'dropship' | 'reserve' | 'return-intake' | 'opname';
  sourceId: string;
  payload: Record<string, unknown>;
};
/** Keep merged source and supplemental-round keys bounded for nested money events. */
export const goodsEventId=(key:string)=>key.length>96 ? `goods:${uuidv5(key,uuidv5.URL)}` : key;
export async function executeGoodsCommand(
  _getState: () => { init: () => Promise<void> }, command: GoodsCommand,
): Promise<any> {
  command={...command,eventId:goodsEventId(command.eventId)};
  if (typeof command.payload.occurredAt === 'string' && command.payload.occurredAt) {
    const at = new Date(command.payload.occurredAt);
    if (!Number.isFinite(at.getTime())) throw new Error('Waktu kejadian tidak valid.');
    command = {...command,payload:{...command.payload,occurredAt:at.toISOString()}};
  }
  const mutationStamp=useAppStore.getState()._lastLocalMutationAt;
  const response = await fetch('/api/operations/goods', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const message=result.error || 'Pencatatan barang gagal. Berkas belum selesai; ulangi dengan nomor kejadian yang sama.';
    if(response.status===409)throw new GoodsCommandRejected(message);
    throw new Error(message);
  }
  const keys=['stockMovements','products','salesOrders','salesOrderItems','purchaseItems','deliveries','invoices','pendingReturns','vendorReturns','rejectedItems','vendorBills','bankAccounts','cashTransactions','journalEntries','journalLines'] as const;
  if(result.eventId!==command.eventId || !result.updates || keys.some(key=>!Array.isArray(result.updates[key])||result.updates[key].some((row:any)=>!row||typeof row.id!=='string'||!row.id))) throw new Error('Kejadian mungkin sudah tercatat, tetapi rincian server belum lengkap. Ulangi dengan nomor berkas yang sama.');
  const required:Partial<Record<GoodsCommand['stage'],[string,string]>>={
    arrival:['purchaseItems',command.sourceId],qc:['purchaseItems',command.sourceId],packing:['salesOrders',command.sourceId],release:['deliveries',result.deliveryId],
    handover:['deliveries',command.sourceId],receipt:['deliveries',command.sourceId],acceptance:['invoices',result.invoiceId],audit:['deliveries',command.sourceId],
    return:['pendingReturns',command.sourceId],'vendor-return':['vendorReturns',command.sourceId],'return-intake':['pendingReturns',result.returnId],dropship:['invoices',result.invoiceId],opname:['products',command.sourceId],reserve:['salesOrders',command.sourceId],
  };
  const expected=required[command.stage];
  if(!expected||!expected[1]||!result.updates[expected[0]].some((row:any)=>row.id===expected[1])) throw new Error('Server belum mengonfirmasi baris sumber. Ulangi dengan nomor berkas yang sama.');
  if(useAppStore.getState()._lastLocalMutationAt!==mutationStamp) throw new Error('Kejadian sudah tersimpan, tetapi ada perubahan lain saat memuat rincian. Ulangi dengan nomor berkas yang sama untuk memuat keadaan terbaru.');
  useAppStore.setState(state=>{
    const patch:Record<string,unknown>={_lastLocalMutationAt:Math.max(Date.now(),state._lastLocalMutationAt+1)};
    for(const key of keys){const rows=result.updates[key];if(!rows.length)continue;const ids=new Set(rows.map((row:any)=>row.id));patch[key]=[...rows,...state[key].filter(row=>!ids.has(row.id))];}
    return patch;
  });
  return result;
}

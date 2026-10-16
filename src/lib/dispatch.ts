import { executeGoodsCommand, type PaperEvidence } from './goods-command';
import type { useAppStore as StoreType } from './store';
type Store = ReturnType<typeof StoreType.getState>;

/** Uses last CLOSED round id; identical retries keep the same event even after reload. */
export async function releaseForDelivery(getState: () => Store, soId: string, evidence: PaperEvidence = {}): Promise<string> {
  const rounds = getState().deliveries.filter(d => d.salesOrderId === soId && d.status === 'Terkirim');
  const lastRound = rounds[rounds.length - 1];
  const result = await executeGoodsCommand(getState, {
    eventId: `release:${soId}:${lastRound?.id || 'initial'}`, stage: 'release', sourceId: soId, payload: evidence,
  });
  return result.deliveryId;
}
export type ReceivedLine = { salesOrderItemId: string; qtyReceived: number };
export async function applyClientReceipt(getState: () => Store, soId: string, received: ReceivedLine[], evidence: PaperEvidence = {}): Promise<void> {
  if (received.some(l => !Number.isFinite(l.qtyReceived) || l.qtyReceived < 0)) throw new Error('Jumlah diterima harus terbatas dan tidak negatif.');
  const delivery = getState().deliveries.find(d => d.salesOrderId === soId && d.status !== 'Terkirim');
  if (!delivery) throw new Error('Pengiriman aktif tidak ditemukan.');
  await executeGoodsCommand(getState, {
    eventId: `receipt:${delivery.id}`, stage: 'receipt', sourceId: delivery.id, payload: { received, ...evidence },
  });
}
export async function finalizeDeliveryAndInvoice(getState: () => Store, deliveryId: string, soId: string): Promise<{ok:false;error:string}|{ok:true;invoiceId:string;total:number}> {
  try {
    const result = await executeGoodsCommand(getState, {
      eventId: `acceptance:${deliveryId}`, stage: 'acceptance', sourceId: deliveryId, payload: {soId},
    });
    return { ok:true, invoiceId:result.invoiceId, total:result.total };
  } catch (error) {
    return {ok:false,error:error instanceof Error ? error.message : 'Penerbitan invoice gagal.'};
  }
}
export async function recordCourierHandover(getState:()=>Store, deliveryId:string, evidence:PaperEvidence):Promise<void> {
  await executeGoodsCommand(getState,{eventId:`handover:${deliveryId}`,stage:'handover',sourceId:deliveryId,payload:evidence});
}
export async function recordPacking(getState:()=>Store, soId:string, lines:Array<{salesOrderItemId:string;qty:number;note?:string}>, evidence:PaperEvidence):Promise<void> {
  // Packing may be corrected before release; use paper number/revision as event identity.
  await executeGoodsCommand(getState,{eventId:`packing:${soId}:${evidence.paperNumber || 'initial'}`,stage:'packing',sourceId:soId,payload:{lines,...evidence}});
}
export async function recordGoodsArrival(getState:()=>Store, purchaseItemId:string, qty:number, evidence:PaperEvidence & {condition?:string}):Promise<void> {
  await executeGoodsCommand(getState,{eventId:`arrival:${purchaseItemId}:${evidence.paperNumber || 'initial'}`,stage:'arrival',sourceId:purchaseItemId,payload:{qty,...evidence}});
}

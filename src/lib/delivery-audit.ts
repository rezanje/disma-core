import { executeGoodsCommand } from './goods-command';
import type { useAppStore as StoreType } from './store';
type Store = ReturnType<typeof StoreType.getState>;
export type HasilAudit = {ok:false;error:string}|{ok:true};
/** Posting, round closure and cumulative accepted quantity commit in one transaction. */
export async function auditPengiriman(getState:()=>Store, deliveryId:string):Promise<HasilAudit> {
  try {
    await executeGoodsCommand(getState,{eventId:`audit:${deliveryId}`,stage:'audit',sourceId:deliveryId,payload:{}});
    return {ok:true};
  } catch (error) {
    return {ok:false,error:error instanceof Error ? error.message : 'Audit pengiriman gagal.'};
  }
}

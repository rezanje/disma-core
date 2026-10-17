import type {Delivery,PendingReturn,PurchaseItem} from '@/types';
/** Actual shipment provenance takes precedence; prices and planned vendors are not proof of purchase. */
export function returnOriginVendorIds(ret:PendingReturn,state:{deliveries:Delivery[];purchaseItems:PurchaseItem[]}):string[]{
 const delivery=state.deliveries.find(d=>d.id===ret.deliveryId);
 const sources=(delivery?.lineSnapshots||[]).filter(l=>l.productId===ret.productId&&(!ret.salesOrderItemId||l.salesOrderItemId===ret.salesOrderItemId)).flatMap(l=>l.costSources||[]).filter(source=>source.qty>0);
 const sourceIds=new Set(sources.map(source=>source.purchaseItemId));
 const purchases=state.purchaseItems.filter(pi=>pi.productId===ret.productId&&(sources.length?sourceIds.has(pi.id):pi.salesOrderId===ret.originalSoId&&pi.qtyPurchased>0));
 return [...new Set(purchases.map(pi=>pi.vendorId?.trim()).filter((id):id is string=>!!id))];
}

export function returnVendorChoices(ret:PendingReturn,state:Parameters<typeof returnOriginVendorIds>[1]&{vendors:import('@/types').Vendor[]}){
 const ids=returnOriginVendorIds(ret,state);
 return state.vendors.filter(v=>!ids.length||ids.includes(v.id));
}
export function returnPaperNumber(ret:PendingReturn,state:{deliveries:Delivery[]}):string {
 return state.deliveries.find(d=>d.id===ret.deliveryId)?.paperNumber?.trim()||ret.diNumber?.trim()||`RETUR-${ret.id}`;
}

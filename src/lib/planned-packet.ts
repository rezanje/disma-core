import {buildFieldPacket,type PacketState} from './field-packet';
import {gabungBaris,type BarisBelanja} from './belanja-merge';
import {jakartaDate} from './paper-operations';
function selectedDocuments(state:PacketState,ids:string[]){
 const docs=ids.map(id=>state.purchases.find(p=>p.id===id));
 if(!ids.length||docs.some(p=>!p||!['Siap Cetak','Pending','Belanja','Selesai'].includes(p.status)))throw new Error('Pilih dokumen hasil perencanaan yang sudah siap cetak.');
 return docs as PacketState['purchases'];
}
export function plannedDocumentRows(state:Pick<PacketState,'purchaseItems'|'products'|'vendors'>,purchaseId:string):BarisBelanja[]{
 return state.purchaseItems.filter(pi=>pi.purchaseId===purchaseId).map(pi=>{
  const p=state.products.find(p=>p.id===pi.productId);const vendorId=pi.plannedVendorId||null;
  return {purchaseId,productId:pi.productId,productName:p?.name||pi.productId,skuCode:p?.skuCode||'',uom:p?.uom,totalQty:pi.qtyTarget,estimatedPrice:pi.estimatedUnitPrice,purchaseMethod:pi.purchaseMethod,paymentMethod:pi.paymentMethod,vendorId,vendorName:state.vendors.find(v=>v.id===vendorId)?.companyName};
 });
}
/** One selection and grouping policy for the standalone list and complete packet. */
export function plannedShoppingRows(state:PacketState,ids:string[]){
 selectedDocuments(state,ids);
 return gabungBaris(ids.flatMap(id=>plannedDocumentRows(state,id))).filter(row=>(row.purchaseMethod||'Pasar')==='Pasar');
}
export function plannedPacketPages(state:PacketState,ids:string[],assignments:Record<string,string>,reference:string){
 const docs=selectedDocuments(state,ids);const selected=new Set(ids);
 const rows=state.purchaseItems.filter(pi=>selected.has(pi.purchaseId));
 const orders=state.salesOrders.filter(so=>rows.some(pi=>pi.salesOrderId===so.id)||selected.has(so.shoppingListDocumentId||''));
 const docDates=(id:string)=>orders.filter(so=>so.shoppingListDocumentId===id||rows.some(pi=>pi.purchaseId===id&&pi.salesOrderId===so.id)).map(so=>so.targetDeliveryDate.slice(0,10)).filter(Boolean).sort();
 const dates=[...new Set(docs.flatMap(doc=>{const days=docDates(doc.id);return days.length?days:[doc.date?.slice(0,10)||jakartaDate()]}))].sort();
 return dates.flatMap(date=>{
  const dateRows=rows.filter(pi=>pi.salesOrderId?orders.some(so=>so.id===pi.salesOrderId&&so.targetDeliveryDate.slice(0,10)===date):(docDates(pi.purchaseId)[0]||docs.find(d=>d.id===pi.purchaseId)?.date?.slice(0,10)||jakartaDate())===date);
  return buildFieldPacket({...state,salesOrders:orders,purchaseItems:dateRows},date,assignments,`${reference}-${date}`,[...new Set(dateRows.map(pi=>pi.purchaseId))]);
 });
}

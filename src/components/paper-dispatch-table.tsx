"use client"
import type {Delivery,SalesOrderItem} from '@/types';
import type {PaperEvidence} from '@/lib/goods-command';
import type {DispatchDraft,SpareDraft} from '@/lib/paper-operations';
import {purchasingQuantity} from '@/lib/purchase-plan';
import {localPaperTime} from '@/lib/paper-operations';
import {useAppStore} from '@/lib/store';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
export type DispatchSheet={orders:Record<string,{selected:boolean;courierId:string;quantities:Record<string,number>}>;spares:Array<{productId:string;courierId:string;qty:number;salesOrderId?:string;salesOrderItemId?:string}>;handoverAt:string;paperNumber:string;signed:boolean};
export const emptyDispatchSheet=():DispatchSheet=>({orders:{},spares:[],handoverAt:localPaperTime(),paperNumber:'',signed:false});
export function setDispatchOrder(sheet:DispatchSheet,soId:string,patch:Partial<DispatchSheet['orders'][string]>):DispatchSheet {
 const order={...(sheet.orders[soId]||{selected:false,courierId:'',quantities:{}}),...patch};
 return {...sheet,orders:{...sheet.orders,[soId]:order},spares:sheet.spares.filter(row=>row.salesOrderId!==soId||(order.selected&&!!order.courierId&&(order.quantities[row.salesOrderItemId||'']??1)>0)).map(row=>row.salesOrderId===soId?{...row,courierId:order.courierId}:row)};
}
export function setItemSpare(sheet:DispatchSheet,soId:string,lineId:string,productId:string,qty:number):DispatchSheet {
 const order=sheet.orders[soId];
 const spares=sheet.spares.filter(row=>row.salesOrderId!==soId||row.salesOrderItemId!==lineId);
 if(qty!==0&&order?.selected&&order.courierId)spares.push({salesOrderId:soId,salesOrderItemId:lineId,productId,courierId:order.courierId,qty});
 return {...sheet,spares};
}
export function dispatchSheetCount(sheet:DispatchSheet){return Object.values(sheet.orders).filter(o=>o.selected).length+sheet.spares.filter(s=>s.qty!==0).length}
/** Spare follows positive quantities in the selected courier handovers, never the product catalogue. */
export function spareProductIds(sheet:DispatchSheet,lines:SalesOrderItem[],deliveries:Delivery[],courierId:string):Set<string> {
 const products=new Set<string>();
 if(!courierId)return products;
 for(const [soId,order] of Object.entries(sheet.orders)) {
  if(!order.selected||order.courierId!==courierId)continue;
  const active=deliveries.find(d=>d.salesOrderId===soId&&d.status==='Menunggu');
  if(active?.lineSnapshots){for(const line of active.lineSnapshots)if(line.qty>0)products.add(line.productId);}
  else for(const line of lines.filter(l=>l.salesOrderId===soId&&(l.qtyFinal||0)>0))if((order.quantities[line.id]??line.qtyFinal??0)>0)products.add(line.productId);
 }
 return products;
}
export function dispatchSheetRows(sheet:DispatchSheet,lines:SalesOrderItem[],qcEvidence:PaperEvidence):{dispatches:DispatchDraft[];spares:SpareDraft[]} {
 const ev={...qcEvidence,paperNumber:sheet.paperNumber.trim()||qcEvidence.paperNumber,signedPaperChecked:sheet.signed};
 const s=useAppStore.getState();
 for(const spare of sheet.spares.filter(row=>row.qty!==0))if(!spareProductIds(sheet,lines,s.deliveries,spare.courierId).has(spare.productId))throw new Error('Spare harus dari produk pesanan yang dibawa kurir pada PO yang dicentang. Periksa kembali pilihan kurir dan barang.');
 const grouped=new Map<string,{productId:string;courierId:string;qty:number}>();
 for(const {productId,courierId,qty} of sheet.spares.filter(row=>row.qty!==0)){
  if(!Number.isFinite(qty)||qty<0)throw new Error('Isi jumlah spare yang valid.');
  const key=JSON.stringify([courierId,productId]);
  grouped.set(key,{productId,courierId,qty:purchasingQuantity((grouped.get(key)?.qty||0)+qty)});
 }
 return {
  dispatches:Object.entries(sheet.orders).filter(([,d])=>d.selected).map(([soId,d])=>{
   const active=s.deliveries.find(delivery=>delivery.salesOrderId===soId&&delivery.status==='Menunggu');
   const actual=active?.lineSnapshots?.map(l=>({salesOrderItemId:l.salesOrderItemId,qty:l.qty}))||lines.filter(l=>l.salesOrderId===soId&&(l.qtyFinal||0)>0).map(l=>({salesOrderItemId:l.id,qty:d.quantities[l.id]??l.qtyFinal??0}));
   return {soId,courierId:d.courierId,lines:actual,evidence:ev,handoverAt:sheet.handoverAt,signedPaperChecked:sheet.signed};
  }),
  spares:[...grouped.values()].map(row=>({...row,evidence:{...ev,occurredAt:sheet.handoverAt}})),
 };
}
export default function PaperDispatchTable({sheet,onChange,lines,locked}:{sheet:DispatchSheet;onChange:(v:DispatchSheet)=>void;lines:SalesOrderItem[];locked:boolean}) {
 const s=useAppStore();const couriers=s.users.filter(u=>u.role==='kurir');
 const ready=s.salesOrders.filter(o=>{
  if(s.deliveries.some(d=>d.salesOrderId===o.id&&d.status==='Menunggu'))return true;
  if(['Batal','Selesai','Terkirim','Dikirim','Siap Kirim','Awaiting Audit'].includes(o.status))return false;
  const relevant=lines.filter(l=>l.salesOrderId===o.id&&l.qty-(l.qtyDelivered||0)-(l.qtyCancelled||0)>0);
  return relevant.some(l=>(l.qtyFinal||0)>0)&&relevant.every(l=>l.qtyFinal!=null);
 });
 const put=(soId:string,patch:Partial<DispatchSheet['orders'][string]>)=>onChange(setDispatchOrder({...sheet,orders:{...sheet.orders,[soId]:sheet.orders[soId]||{selected:false,courierId:s.salesOrders.find(o=>o.id===soId)?.assignedCourierId||'',quantities:{}}}},soId,patch));
 return <fieldset disabled={locked} aria-labelledby="handover-step-title" className="min-w-0 rounded-xl border border-slate-300 bg-white overflow-hidden">
  <div className="flex items-start gap-3 border-b bg-slate-100 px-4 py-4 sm:px-5"><span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-white">2</span><div><h3 id="handover-step-title" className="font-semibold text-slate-900">Salin serah terima kurir</h3><p className="mt-1 text-sm text-slate-600">Dari berita acara: pilih outlet / PO, kurir, dan jumlah yang benar-benar dibawa.</p><p className="mt-1 text-xs text-slate-500">Isi saat barang sudah diterima kurir. Kalau baru QC, lewati bagian ini.</p></div></div>
  <div className="space-y-3 border-b p-4 sm:p-5">
   <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="paper-handover-at">Waktu serah terima (WIB)</Label><Input id="paper-handover-at" type="datetime-local" value={sheet.handoverAt} onChange={e=>onChange({...sheet,handoverAt:e.target.value})}/></div><div><Label htmlFor="paper-handover-no">Nomor berita acara</Label><Input id="paper-handover-no" value={sheet.paperNumber} placeholder="Nomor BA pada kertas (kosong = nomor berkas QC)" onChange={e=>onChange({...sheet,paperNumber:e.target.value})}/></div></div>
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={sheet.signed} onChange={e=>onChange({...sheet,signed:e.target.checked})}/>Berita acara sudah ditandatangani QC dan kurir; barang sudah diterima kurir.</label>
  </div>
  <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-3">Ikut simpan</th><th className="p-3">Outlet / PO</th><th className="p-3">Kurir</th><th className="p-3">Barang / pesanan / spare</th></tr></thead><tbody>
   {ready.map(o=>{const d=sheet.orders[o.id];const active=s.deliveries.find(delivery=>delivery.salesOrderId===o.id&&delivery.status==='Menunggu');const rows=active?.lineSnapshots?.map(l=>({id:l.salesOrderItemId,productId:l.productId,name:l.productName,uom:l.uom,qty:l.qty}))||lines.filter(l=>l.salesOrderId===o.id&&(l.qtyFinal||0)>0).map(l=>{const p=s.products.find(p=>p.id===l.productId);return {id:l.id,productId:l.productId,name:p?.name||l.productId,uom:p?.uom,qty:l.qtyFinal||0}});return <tr className="border-t align-top" key={o.id}><td className="p-3"><input aria-label={`Serah terima ${o.poNumber}`} type="checkbox" checked={!!d?.selected} onChange={e=>put(o.id,{selected:e.target.checked})}/></td><td className="p-3"><p className="font-medium">{s.clients.find(c=>c.id===o.clientId)?.companyName}</p><p className="text-xs text-slate-500">{o.poNumber} · {o.targetDeliveryDate.slice(0,10)}</p>{active&&<span className="text-xs text-slate-500">Jumlah sudah dicatat saat barang keluar</span>}</td><td className="p-3"><select aria-label={`Kurir ${o.poNumber}`} className="h-9 w-44 rounded-md border bg-white px-2" value={d?.courierId??o.assignedCourierId??''} onChange={e=>put(o.id,{courierId:e.target.value})}><option value="">Pilih kurir</option>{couriers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></td><td className="p-3 space-y-2">{rows.map(l=><div key={l.id} className="grid grid-cols-[minmax(120px,1fr)_80px_80px] items-end gap-3"><p className="self-center">{l.name} <span className="text-xs text-slate-400">{l.uom}</span></p><label className="space-y-1"><span className="block text-xs text-slate-500">Pesanan</span><Input aria-label={`Dibawa ${o.poNumber} ${l.name}`} disabled={!!active} className="h-9 w-full text-right" type="number" min="0" max={l.qty} step="any" value={d?.quantities[l.id]??l.qty} onChange={e=>put(o.id,{quantities:{...d?.quantities,[l.id]:Number(e.target.value)}})}/></label><label className="space-y-1"><span className="block text-xs text-slate-500">Spare</span><Input aria-label={`Spare ${o.poNumber} ${l.name}`} disabled={!d?.selected||!d.courierId||(active?l.qty:(d.quantities[l.id]??l.qty))<=0} className="h-9 w-full text-right" type="number" min="0" step="any" placeholder="0" value={sheet.spares.find(row=>row.salesOrderId===o.id&&row.salesOrderItemId===l.id)?.qty||''} onChange={e=>onChange(setItemSpare(sheet,o.id,l.id,l.productId,Number(e.target.value)))}/></label></div>)}</td></tr>})}
   {!ready.length&&<tr><td colSpan={4} className="p-6 text-center text-slate-500">Isi hasil QC di atas. PO yang siap akan muncul di sini.</td></tr>}
  </tbody></table></div>
  <p className="border-t px-4 py-3 text-xs text-slate-500">Spare diisi di sebelah jumlah pesanan, dari sisa lolos / stok bebas. Mengikuti kurir PO dan tidak ikut ditagihkan ke outlet.</p>
 </fieldset>;
}

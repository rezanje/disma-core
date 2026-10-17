"use client"
import type {SalesOrderItem} from '@/types';
import type {PaperEvidence} from '@/lib/goods-command';
import type {DispatchDraft,SpareDraft} from '@/lib/paper-operations';
import {localPaperTime} from '@/lib/paper-operations';
import {useAppStore} from '@/lib/store';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
export type DispatchSheet={orders:Record<string,{selected:boolean;courierId:string;quantities:Record<string,number>}>;spares:Array<{productId:string;courierId:string;qty:number}>;handoverAt:string;paperNumber:string;signed:boolean};
export const emptyDispatchSheet=():DispatchSheet=>({orders:{},spares:[],handoverAt:localPaperTime(),paperNumber:'',signed:false});
export function dispatchSheetCount(sheet:DispatchSheet){return Object.values(sheet.orders).filter(o=>o.selected).length+sheet.spares.filter(s=>s.qty!==0).length}
export function dispatchSheetRows(sheet:DispatchSheet,lines:SalesOrderItem[],qcEvidence:PaperEvidence):{dispatches:DispatchDraft[];spares:SpareDraft[]} {
 const ev={...qcEvidence,paperNumber:sheet.paperNumber.trim()||qcEvidence.paperNumber,signedPaperChecked:sheet.signed};
 const s=useAppStore.getState();
 return {
  dispatches:Object.entries(sheet.orders).filter(([,d])=>d.selected).map(([soId,d])=>{
   const active=s.deliveries.find(delivery=>delivery.salesOrderId===soId&&delivery.status==='Menunggu');
   const actual=active?.lineSnapshots?.map(l=>({salesOrderItemId:l.salesOrderItemId,qty:l.qty}))||lines.filter(l=>l.salesOrderId===soId&&(l.qtyFinal||0)>0).map(l=>({salesOrderItemId:l.id,qty:d.quantities[l.id]??l.qtyFinal??0}));
   return {soId,courierId:d.courierId,lines:actual,evidence:ev,handoverAt:sheet.handoverAt,signedPaperChecked:sheet.signed};
  }),
  spares:sheet.spares.filter(row=>row.qty!==0).map(row=>({...row,evidence:{...ev,occurredAt:sheet.handoverAt}})),
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
 const put=(soId:string,patch:Partial<DispatchSheet['orders'][string]>)=>onChange({...sheet,orders:{...sheet.orders,[soId]:{...(sheet.orders[soId]||{selected:false,courierId:s.salesOrders.find(o=>o.id===soId)?.assignedCourierId||'',quantities:{}}),...patch}}});
 return <fieldset disabled={locked} className="rounded-xl border bg-white overflow-hidden">
  <div className="space-y-3 border-b p-4"><h3 className="font-semibold">Pembagian barang & serah terima kurir</h3><p className="text-sm text-slate-500">Centang PO yang sudah benar-benar disiapkan dan diterima kurir sesuai kertas. Kalau baru QC, biarkan kosong.</p>
   <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="paper-handover-at">Waktu serah terima (WIB)</Label><Input id="paper-handover-at" type="datetime-local" value={sheet.handoverAt} onChange={e=>onChange({...sheet,handoverAt:e.target.value})}/></div><div><Label htmlFor="paper-handover-no">Nomor berita acara</Label><Input id="paper-handover-no" value={sheet.paperNumber} placeholder="Nomor BA pada kertas (kosong = nomor berkas QC)" onChange={e=>onChange({...sheet,paperNumber:e.target.value})}/></div></div>
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={sheet.signed} onChange={e=>onChange({...sheet,signed:e.target.checked})}/>Berita acara sudah ditandatangani QC dan kurir; barang sudah diterima kurir.</label>
  </div>
  <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-3">Ikut simpan</th><th className="p-3">Outlet / PO</th><th className="p-3">Kurir</th><th className="p-3">Barang / jumlah aktual dibawa</th></tr></thead><tbody>
   {ready.map(o=>{const d=sheet.orders[o.id];const active=s.deliveries.find(delivery=>delivery.salesOrderId===o.id&&delivery.status==='Menunggu');const rows=active?.lineSnapshots?.map(l=>({id:l.salesOrderItemId,name:l.productName,uom:l.uom,qty:l.qty}))||lines.filter(l=>l.salesOrderId===o.id&&(l.qtyFinal||0)>0).map(l=>{const p=s.products.find(p=>p.id===l.productId);return {id:l.id,name:p?.name||l.productId,uom:p?.uom,qty:l.qtyFinal||0}});return <tr className="border-t align-top" key={o.id}><td className="p-3"><input aria-label={`Serah terima ${o.poNumber}`} type="checkbox" checked={!!d?.selected} onChange={e=>put(o.id,{selected:e.target.checked})}/></td><td className="p-3"><p className="font-medium">{s.clients.find(c=>c.id===o.clientId)?.companyName}</p><p className="text-xs text-slate-500">{o.poNumber} · {o.targetDeliveryDate.slice(0,10)}</p>{active&&<span className="text-xs text-slate-500">Jumlah sudah dicatat saat barang keluar</span>}</td><td className="p-3"><select aria-label={`Kurir ${o.poNumber}`} className="h-9 w-44 rounded-md border bg-white px-2" value={d?.courierId??o.assignedCourierId??''} onChange={e=>put(o.id,{courierId:e.target.value})}><option value="">Pilih kurir</option>{couriers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></td><td className="p-3 space-y-2">{rows.map(l=><label key={l.id} className="flex items-center justify-between gap-3"><span>{l.name} <span className="text-xs text-slate-400">{l.uom}</span></span><Input aria-label={`Dibawa ${o.poNumber} ${l.name}`} disabled={!!active} className="h-9 w-24 text-right" type="number" min="0" max={l.qty} step="any" value={d?.quantities[l.id]??l.qty} onChange={e=>put(o.id,{quantities:{...d?.quantities,[l.id]:Number(e.target.value)}})}/></label>)}</td></tr>})}
   {!ready.length&&<tr><td colSpan={4} className="p-6 text-center text-slate-500">Isi hasil QC di atas. PO yang siap akan muncul di sini.</td></tr>}
  </tbody></table></div>
  <div className="space-y-3 border-t p-4"><div className="flex items-center justify-between"><h4 className="text-sm font-medium">Spare dibawa kurir (opsional)</h4><Button type="button" size="sm" variant="outline" onClick={()=>onChange({...sheet,spares:[...sheet.spares,{productId:'',courierId:'',qty:0}]})}>Tambah spare</Button></div><p className="text-xs text-slate-500">Ambil dari sisa lolos / stok bebas setelah alokasi outlet. Spare tidak ikut ditagihkan.</p>
   {sheet.spares.map((spare,index)=>{const patch=(p:Partial<typeof spare>)=>onChange({...sheet,spares:sheet.spares.map((row,i)=>i===index?{...row,...p}:row)});return <div className="flex flex-wrap gap-2" key={index}><select aria-label={`Barang spare ${index+1}`} className="h-9 max-w-full rounded-md border px-2 text-sm" value={spare.productId} onChange={e=>patch({productId:e.target.value})}><option value="">Pilih barang</option>{s.products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.uom}</option>)}</select><select aria-label={`Kurir spare ${index+1}`} className="h-9 rounded-md border px-2 text-sm" value={spare.courierId} onChange={e=>patch({courierId:e.target.value})}><option value="">Pilih kurir</option>{couriers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select><Input aria-label={`Jumlah spare ${index+1}`} className="h-9 w-24" type="number" min="0" step="any" value={spare.qty||''} placeholder="Jumlah" onChange={e=>patch({qty:Number(e.target.value)})}/><Button type="button" size="sm" variant="ghost" onClick={()=>onChange({...sheet,spares:sheet.spares.filter((_,i)=>i!==index)})}>Hapus</Button></div>})}
  </div>
 </fieldset>;
}

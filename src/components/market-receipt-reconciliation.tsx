"use client"

import { useAppStore } from '@/lib/store'

/** Both counts are facts from their own paper; discrepancies never rewrite stock. */
export default function MarketReceiptReconciliation() {
 const items=useAppStore(s=>s.purchaseItems)
 const docs=useAppStore(s=>s.purchases)
 const products=useAppStore(s=>s.products)
 const tracked=new Set(items.filter(i=>i.physicalBeforeReport).map(i=>i.purchaseId))
 const rows=new Map<string,{purchaseId:string;productId:string;received:number;reported:number;pending:boolean}>()
 for(const i of items.filter(i=>tracked.has(i.purchaseId)&&(!i.purchaseMethod||i.purchaseMethod==='Pasar'))) {
  const key=i.purchaseId+'|'+i.productId
  const row=rows.get(key)||{purchaseId:i.purchaseId,productId:i.productId,received:0,reported:0,pending:false}
  row.received+=i.physicalQtyReceived??i.qcProcessedQty??0
  row.reported+=i.qtyPurchased||0
  row.pending ||= !!i.costPending
  rows.set(key,row)
 }
 if(!rows.size)return null
 return <section className="rounded-xl border bg-white p-4 space-y-3">
  <h2 className="font-semibold">Cocokkan penerimaan & laporan belanja</h2>
  <p className="text-sm text-slate-500">QC dan pengiriman dapat berjalan lebih dulu. Salinan laporan hanya melengkapi pembelian dan biaya, tanpa menambah stok lagi.</p>
  <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="text-left border-b"><th className="py-2">Dokumen / barang</th><th>Fisik diterima</th><th>Laporan beli</th><th>Selisih beli − fisik</th><th>Biaya</th></tr></thead><tbody>{[...rows.values()].map(row=>{
   const product=products.find(p=>p.id===row.productId)
   const diff=Math.round((row.reported-row.received)*1e6)/1e6
   return <tr className="border-b" key={row.purchaseId+'|'+row.productId}><td className="py-2">{docs.find(d=>d.id===row.purchaseId)?.advanceCode||row.purchaseId}<br/>{product?.name||row.productId}</td><td>{row.received} {product?.uom}</td><td>{row.reported} {product?.uom}</td><td className={diff?'text-amber-700':''}>{diff>0?'+':''}{diff}{diff?' · perlu dicocokkan':''}</td><td className={row.pending?'text-amber-700':''}>{row.pending?'Belum lengkap':'Tercatat'}</td></tr>
  })}</tbody></table></div>
 </section>
}

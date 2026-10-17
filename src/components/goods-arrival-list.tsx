"use client"

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { arrivalRemaining, awaitingArrival, awaitingQc } from '@/lib/daily-flow'
import { recordGoodsArrival } from '@/lib/dispatch'
import { PaperEvidenceFields } from '@/components/paper-evidence-fields'
import type { PaperEvidence } from '@/lib/goods-command'
import type { PurchaseItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

function ArrivalRow({item}: {item:PurchaseItem}) {
 const s=useAppStore()
 const [open,setOpen]=useState(false)
 const [qty,setQty]=useState(()=>arrivalRemaining(item))
 const [condition,setCondition]=useState('')
 const [evidence,setEvidence]=useState<PaperEvidence>({})
 const [busy,setBusy]=useState(false)
 const product=s.products.find(p=>p.id===item.productId)
 const doc=s.purchases.find(p=>p.id===item.purchaseId)
 const remaining=arrivalRemaining(item)
 const save=async()=>{
  if(busy)return
  setBusy(true)
  try {
   await recordGoodsArrival(useAppStore.getState,item.id,qty,{...evidence,condition})
   toast.success('Penerimaan tersimpan. Barang siap diperiksa QC; laporan belanja bisa menyusul.')
   setOpen(false);setEvidence({})
  } catch(error){toast.error(error instanceof Error?error.message:'Penerimaan belum tersimpan.')} finally{setBusy(false)}
 }
 return <div className="rounded-xl border p-3 space-y-3">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><p className="font-semibold">{product?.name||item.productId}</p><p className="text-sm text-slate-500">Menunggu {remaining} {product?.uom} · {item.purchaseMethod||'Pasar'} · {doc?.advanceCode||item.purchaseId}</p></div>
   <Button variant="outline" onClick={()=>setOpen(v=>!v)}>{open?'Tutup':'Catat barang datang'}</Button>
  </div>
  {open&&<div className="space-y-3 border-t pt-3">
   <div><Label htmlFor={'arrival-qty-'+item.id}>Jumlah fisik benar-benar datang</Label><Input id={'arrival-qty-'+item.id} type="number" min="0" max={remaining} step="any" value={qty} onChange={e=>setQty(Number(e.target.value))}/></div>
   <div><Label>Kondisi / catatan</Label><Input value={condition} onChange={e=>setCondition(e.target.value)}/></div>
   <PaperEvidenceFields value={evidence} onChange={setEvidence}/>
   <Button disabled={busy||!Number.isFinite(qty)||qty<=0||qty>remaining} onClick={save}>{busy?'Menyimpan…':'Simpan penerimaan & lanjut QC'}</Button>
  </div>}
 </div>
}

/** The same arrival queue is used from the daily screen and the QC workspace. */
export default function GoodsArrivalList() {
 const items=useAppStore(s=>s.purchaseItems)
 const purchases=useAppStore(s=>s.purchases)
 const waiting=awaitingArrival(items,purchases)
 return <details open={waiting.length>0&&!awaitingQc(items,purchases).length} className="rounded-xl border bg-white p-4">
  <summary className="cursor-pointer font-semibold">Menunggu barang datang ({waiting.length})</summary>
  <div className="mt-3 space-y-3">
  <p className="text-sm text-slate-500">Catat barang yang sudah tiba, lalu langsung QC. Belanja pasar tidak perlu menunggu laporan sourcing; stok bertambah setelah QC.</p>
  {!waiting.length&&<p className="text-sm text-slate-500">Tidak ada barang yang menunggu penerimaan.</p>}
  {waiting.map(item=><ArrivalRow key={item.id} item={item}/>)}
  </div>
 </details>
}

"use client"

import { Fragment, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppStore } from '@/lib/store'
import { awaitingArrival, awaitingQc, arrivalRemaining, qcRemaining, buildFifoAllocations } from '@/lib/daily-flow'
import { prepareQcEntry, submitQcEntry, type QcEntryDraft, type QcEntryPlan } from '@/lib/qc-entry'
import { type PaperEvidence } from '@/lib/goods-command'
import { WorksheetPrintButton } from '@/components/worksheet-print-button'
import ReceiptUpload from '@/components/ui/receipt-upload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { qty as qtyText } from '@/lib/worksheet-rows'
import { ChevronDown, Check, Search } from 'lucide-react'
import { toast } from 'sonner'

function localDateTime() {
 const date=new Date()
 return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)
}

export default function QcEntryTable() {
 const s=useAppStore()
 const [sheetId]=useState(()=>uuidv4())
 const [evidence,setEvidence]=useState<PaperEvidence>(()=>({occurredAt:localDateTime()}))
 const [search,setSearch]=useState('')
 const [drafts,setDrafts]=useState<Record<string,QcEntryDraft>>({})
 const [plans,setPlans]=useState<Record<string,QcEntryPlan>>({})
 const [expanded,setExpanded]=useState<Record<string,boolean>>({})
 const [errors,setErrors]=useState<Record<string,string>>({})
 const [busy,setBusy]=useState('')
 const [saved,setSaved]=useState('')
 const arrivals=awaitingArrival(s.purchaseItems,s.purchases)
 const qc=awaitingQc(s.purchaseItems,s.purchases)
 const queued=new Map([...arrivals,...qc].map(item=>[item.id,item]))
 // Keep the row and its submitted numbers visible while arrival transitions to QC.
 for(const id of Object.keys(plans)) {
  const item=s.purchaseItems.find(i=>i.id===id)
  if(item)queued.set(id,item)
 }
 const automaticPaper=`QC-${new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Jakarta'})}-${sheetId.slice(0,8)}`
 const paper={...evidence,paperNumber:evidence.paperNumber?.trim()||automaticPaper}
 const productName=(id:string)=>s.products.find(p=>p.id===id)?.name||id
 const documentName=(id:string)=>s.purchases.find(p=>p.id===id)?.advanceCode||id.slice(0,8)
 const rows=[...queued.values()].filter(item=>[productName(item.productId),s.products.find(p=>p.id===item.productId)?.skuCode,documentName(item.purchaseId),s.salesOrders.find(o=>o.id===item.salesOrderId)?.poNumber].join(' ').toLocaleLowerCase('id-ID').includes(search.toLocaleLowerCase('id-ID')))
 const getDraft=(id:string,ready:number):QcEntryDraft=>drafts[id]||{incoming:ready,passed:ready,rejected:0,rejectAction:'Disposal',rejectReason:''}
 const put=(id:string,initial:QcEntryDraft,patch:Partial<QcEntryDraft>)=>{
  setDrafts(old=>({...old,[id]:{...initial,...old[id],...patch}}))
  setErrors(old=>({...old,[id]:''}))
 }
 const save=async(id:string,draft:QcEntryDraft,needsArrival:boolean)=>{
  if(busy)return
  const item=useAppStore.getState().purchaseItems.find(i=>i.id===id)
  if(!item)return
  let plan=plans[id]
  try {
   if(!plan)plan=prepareQcEntry(item,draft,{eventId:`qc-entry:${uuidv4()}`,needsArrival,evidence:paper,orders:s.salesOrders,lines:s.salesOrderItems,actorRole:s.currentUser?.role})
  } catch(error) {
   setErrors(old=>({...old,[id]:error instanceof Error?error.message:'Periksa isian barang.'}))
   setExpanded(old=>({...old,[id]:true}))
   return
  }
  setDrafts(old=>({...old,[id]:{...draft}}))
  setBusy(id);setPlans(old=>({...old,[id]:plan}));setErrors(old=>({...old,[id]:''}))
  try {
   const warnings=await submitQcEntry(useAppStore.getState,plan)
   warnings.forEach(w=>toast.warning(w))
   setSaved(`${productName(item.productId)} · masuk ${draft.incoming}, lolos ${draft.passed}, reject ${draft.rejected}`)
   setPlans(old=>{const next={...old};delete next[id];return next})
   setDrafts(old=>{const next={...old};delete next[id];return next})
   setExpanded(old=>({...old,[id]:false}))
   toast.success('Penerimaan dan QC tersimpan.')
  } catch(error) {
   setErrors(old=>({...old,[id]:error instanceof Error?error.message:'Belum selesai tersimpan. Coba ulang dengan isian yang sama.'}))
  } finally {setBusy('')}
 }

 return <section className="space-y-4">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><h2 className="text-xl font-semibold tracking-tight">Penerimaan dan QC</h2><p className="mt-1 text-sm text-slate-500">Isi jumlah per barang, lalu simpan. Lolos otomatis dibagi ke PO; sisanya masuk stok gudang.</p></div>
   <div className="flex flex-wrap items-center gap-2"><WorksheetPrintButton kind="qc" title="LEMBAR QC BARANG MASUK" label="Print lembar QC" paperNumber={paper.paperNumber} showPaperNumberInput={false} rows={[...queued.values()].map(item=>{const product=s.products.find(p=>p.id===item.productId);return {group:documentName(item.purchaseId),cells:[product?.skuCode||'',product?.name||item.productId,qtyText(qcRemaining(item)||arrivalRemaining(item),product?.uom)]}})}/></div>
  </div>
  <div className="rounded-xl border bg-white p-4 space-y-3">
   <div className="grid gap-3 sm:grid-cols-3">
    <div><Label htmlFor="qc-examiner">Pemeriksa</Label><select id="qc-examiner" disabled={!!busy} className="h-9 w-full rounded-md border bg-white px-2 text-sm" value={evidence.performedBy||''} onChange={e=>setEvidence(v=>({...v,performedBy:e.target.value}))}><option value="">Pilih nama pemeriksa</option>{s.users.map(user=><option key={user.id} value={user.id}>{user.name}</option>)}</select></div>
    <div><Label htmlFor="qc-occurred-at">Waktu pemeriksaan</Label><Input id="qc-occurred-at" disabled={!!busy} type="datetime-local" className="h-9" value={evidence.occurredAt||''} onChange={e=>setEvidence(v=>({...v,occurredAt:e.target.value}))}/></div>
    <div><Label htmlFor="qc-paper-number">Nomor berkas</Label><Input id="qc-paper-number" disabled={!!busy} className="h-9" value={evidence.paperNumber||''} placeholder={automaticPaper} onChange={e=>setEvidence(v=>({...v,paperNumber:e.target.value}))}/></div>
   </div>
   <details><summary className="cursor-pointer text-xs text-slate-500">Lampiran berkas (opsional)</summary><div className="mt-3"><ReceiptUpload currentFile={evidence.paperProof||''} onFileSelect={url=>setEvidence(v=>({...v,paperProof:url}))} label="Foto / scan berkas QC"/></div></details>
  </div>
  {saved&&<p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><Check className="size-4"/>Tersimpan: {saved}</p>}
  <div className="rounded-xl border bg-white overflow-hidden">
   <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><p className="text-sm text-slate-500">{queued.size} barang menunggu · Masuk = Lolos + Reject</p><div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-slate-400"/><Input aria-label="Cari barang atau dokumen QC" className="h-9 w-full pl-8 sm:w-64" placeholder="Cari barang / dokumen / PO" value={search} onChange={e=>setSearch(e.target.value)}/></div></div>
   <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
    <thead className="border-b bg-slate-50 text-left text-xs text-slate-500"><tr><th scope="col" className="px-4 py-3">Barang / dokumen</th><th scope="col" className="px-2 py-3">Alokasi lolos</th><th scope="col" className="px-2 py-3 text-right">Sisa</th>{['Masuk','Lolos','Reject'].map(label=><th scope="col" key={label} className="w-24 px-2 py-3">{label}</th>)}<th scope="col" className="w-28 px-2 py-3">Tindakan reject</th><th scope="col" className="w-32 px-3 py-3">Aksi</th></tr></thead>
    <tbody>{rows.map(item=>{
     const product=s.products.find(p=>p.id===item.productId)
     const hasMeasuredQc=qc.some(q=>q.id===item.id)&&(item.physicalQtyReceived!=null||item.physicalBeforeReport)
     const needsArrival=!hasMeasuredQc&&arrivals.some(a=>a.id===item.id)
     const ready=hasMeasuredQc?qcRemaining(item):!needsArrival?qcRemaining(item):0
     const remaining=needsArrival?arrivalRemaining(item):qcRemaining(item)
     const d=getDraft(item.id,ready)
     const auto=buildFifoAllocations(item.productId,d.passed,s.salesOrders,s.salesOrderItems)
     const allocations=d.allocations||auto.allocations
     const inventory=Math.max(0,d.passed-allocations.reduce((total,a)=>total+a.qty,0))
     const locked=!!busy||!!plans[item.id]
     const balanced=Math.abs(d.incoming-d.passed-d.rejected)<1e-8
     const quantity=(label:string,key:'incoming'|'passed'|'rejected')=><Input type="number" min="0" step="any" max={key==='incoming'?remaining:d.incoming} aria-label={`${label} ${product?.name||item.productId}`} className="h-9 w-full min-w-16 text-right tabular-nums" placeholder="0" disabled={locked} value={d[key]||''} onChange={e=>{const value=e.target.value===''?0:Number(e.target.value);const patch:Partial<QcEntryDraft>={[key]:value,allocations:undefined};if(key==='incoming')patch.passed=Math.max(0,value-d.rejected);if(key==='rejected')patch.passed=Math.max(0,d.incoming-value);if(key==='passed')patch.rejected=Math.max(0,d.incoming-value);put(item.id,d,patch)}}/>
     return <Fragment key={item.id}>
      <tr className="border-b align-top hover:bg-slate-50/50">
       <th scope="row" className="px-4 py-3 text-left font-normal"><p className="font-medium">{product?.name||item.productId}</p><p className="mt-0.5 text-xs text-slate-500">{product?.skuCode} · {product?.uom} · {item.purchaseMethod||'Pasar'}</p><p className="mt-0.5 text-xs text-slate-500">{documentName(item.purchaseId)}</p><span className={`mt-1 inline-block text-xs ${plans[item.id]?'text-amber-700':'text-slate-500'}`}>{plans[item.id]?'Menunggu konfirmasi simpan':needsArrival?'Menunggu datang':'Siap QC'}</span></th>
       <td className="max-w-44 px-2 py-3 text-xs text-slate-500">{allocations.filter(a=>a.qty>0).map(a=><div key={a.soId}>{s.salesOrders.find(o=>o.id===a.soId)?.poNumber||a.soId}: {a.qty}</div>)}<div>Stok gudang: {inventory}</div>{item.costPending&&<p className="mt-1 text-amber-700">Biaya menyusul</p>}</td>
       <td className="px-2 py-3 text-right tabular-nums">{remaining}<span className="block text-xs text-slate-400">{product?.uom}</span></td>
       <td className="px-2 py-3">{quantity('Masuk','incoming')}</td><td className="px-2 py-3">{quantity('Lolos','passed')}</td><td className="px-2 py-3">{quantity('Reject','rejected')}</td>
       <td className="px-2 py-3">{d.rejected>0?<select aria-label={`Tindakan reject ${product?.name}`} disabled={locked} className="h-9 w-full rounded-md border bg-white px-1 text-xs" value={d.rejectAction} onChange={e=>{put(item.id,d,{rejectAction:e.target.value as QcEntryDraft['rejectAction']});if(e.target.value==='Return')setExpanded(old=>({...old,[item.id]:true}))}}><option value="Disposal">Buang</option><option value="Return">Retur vendor</option><option value="B2C">Stok B2C</option></select>:<span className="text-slate-400">—</span>}</td>
       <td className="space-y-1 px-3 py-3"><Button size="sm" className="h-9 w-full" disabled={!!busy||(!plans[item.id]&&(d.incoming<=0||!balanced||d.incoming>remaining))} onClick={()=>save(item.id,d,needsArrival)}>{busy===item.id?'Menyimpan…':plans[item.id]?'Coba simpan ulang':'Simpan'}</Button><button type="button" aria-expanded={!!expanded[item.id]} aria-controls={'qc-details-'+item.id} className="flex w-full items-center justify-center gap-1 py-1 text-xs text-slate-500 hover:text-slate-900" onClick={()=>setExpanded(old=>({...old,[item.id]:!old[item.id]}))}>Rincian<ChevronDown className="size-3"/></button></td>
      </tr>
      {d.rejected>0&&<tr className="border-b bg-rose-50/30"><td colSpan={8} className="px-4 py-2"><Input aria-label={`Alasan reject ${product?.name}`} disabled={locked} className="h-8 max-w-xl text-xs" placeholder="Alasan reject (wajib)" value={d.rejectReason} onChange={e=>put(item.id,d,{rejectReason:e.target.value})}/></td></tr>}
      {errors[item.id]&&<tr className="border-b bg-amber-50"><td colSpan={8} className="px-4 py-2 text-xs text-amber-800" role="alert">{errors[item.id]}{plans[item.id]&&<span> Isian disimpan untuk percobaan ulang yang sama. <button type="button" className="underline" onClick={()=>window.location.reload()}>Muat ulang status</button></span>}</td></tr>}
      {expanded[item.id]&&<tr id={'qc-details-'+item.id} className="border-b bg-slate-50"><td colSpan={8} className="px-4 py-4"><fieldset disabled={locked} className="space-y-4">
       <div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor={'qc-note-'+item.id}>Kondisi / catatan</Label><Input id={'qc-note-'+item.id} className="h-9" value={d.note||''} onChange={e=>put(item.id,d,{note:e.target.value})}/></div><div><Label htmlFor={'qc-batch-'+item.id}>Nomor batch</Label><Input id={'qc-batch-'+item.id} className="h-9" value={d.batchNumber||''} onChange={e=>put(item.id,d,{batchNumber:e.target.value})}/></div><div><Label htmlFor={'qc-expiry-'+item.id}>Kedaluwarsa</Label><Input id={'qc-expiry-'+item.id} type="date" className="h-9" value={d.expiryDate||''} onChange={e=>put(item.id,d,{expiryDate:e.target.value})}/></div></div>
       <div className="flex flex-wrap items-center gap-3"><span className="text-xs font-medium">Alokasi ke PO {d.allocations?'manual':'otomatis (FIFO)'}</span>{d.allocations&&<Button size="sm" variant="outline" onClick={()=>put(item.id,d,{allocations:undefined})}>Kembali otomatis</Button>}<span className="text-xs text-slate-500">Sisa lolos masuk stok gudang: {inventory} {product?.uom}</span></div>
       <div className="flex flex-wrap gap-3">{allocations.map((allocation,index)=><div className="w-48" key={allocation.soId}><Label>{s.salesOrders.find(o=>o.id===allocation.soId)?.poNumber||allocation.soId}</Label><Input type="number" min="0" step="any" aria-label={`Alokasi ${product?.name} ke ${allocation.soId}`} className="h-9" value={allocation.qty} onChange={e=>put(item.id,d,{allocations:allocations.map((a,i)=>i===index?{...a,qty:Number(e.target.value)}:a)})}/></div>)}</div>
       <div className="grid gap-3 sm:grid-cols-3">{d.rejected>0&&d.rejectAction==='Return'&&<div><Label>Vendor tujuan retur</Label><select aria-label={`Vendor retur ${product?.name}`} className="h-9 w-full rounded-md border bg-white px-2 text-sm" value={d.rejectVendorId||item.vendorId||item.plannedVendorId||''} onChange={e=>put(item.id,d,{rejectVendorId:e.target.value})}><option value="">Pilih vendor</option>{s.vendors.map(v=><option key={v.id} value={v.id}>{v.companyName}</option>)}</select></div>}{!item.physicalBeforeReport&&(item.purchaseMethod==='Vendor'||item.purchaseMethod==='Online')&&<div><Label>Harga vendor per {product?.uom}</Label><Input type="number" min="0" step="any" aria-label={`Harga vendor ${product?.name}`} className="h-9" placeholder={String(item.actualUnitPrice||item.estimatedUnitPrice||0)} value={d.vendorUnitPrice??''} onChange={e=>put(item.id,d,{vendorUnitPrice:e.target.value===''?undefined:Number(e.target.value)})}/></div>}{item.purchaseMethod==='Vendor'&&item.paymentMethod==='Transfer'&&['finance','super_admin'].includes(s.currentUser?.role||'')&&<div><Label>Rekening sumber pembayaran</Label><select aria-label={`Rekening ${product?.name}`} className="h-9 w-full rounded-md border bg-white px-2 text-sm" value={d.bankAccountId||''} onChange={e=>put(item.id,d,{bankAccountId:e.target.value})}><option value="">Pilih rekening</option>{s.bankAccounts.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}</div>
      </fieldset></td></tr>}
     </Fragment>
    })}
    {!rows.length&&<tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">{queued.size?'Tidak ada barang yang cocok dengan pencarian.':'Semua barang sudah diproses. Belum ada penerimaan atau QC yang menunggu.'}</td></tr>}
    </tbody>
   </table></div>
  </div>
 </section>
}

"use client"

import { Fragment, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppStore } from '@/lib/store'
import { awaitingArrival, awaitingQc, arrivalRemaining, qcRemaining, buildFifoAllocations } from '@/lib/daily-flow'
import { type QcEntryDraft, type QcEntryPlan } from '@/lib/qc-entry'
import { prepareQcBatch, submitQcBatch, type QcBatchRow } from '@/lib/qc-batch'
import type { PurchaseItem } from '@/types'
import { type PaperEvidence } from '@/lib/goods-command'
import { WorksheetPrintButton } from '@/components/worksheet-print-button'
import ReceiptUpload from '@/components/ui/receipt-upload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { qty as qtyText } from '@/lib/worksheet-rows'
import { ChevronDown, Check, Search } from 'lucide-react'
import { toast } from 'sonner'
import PaperDispatchTable,{emptyDispatchSheet,dispatchSheetRows,dispatchSheetCount} from '@/components/paper-dispatch-table'
import {preparePaperTranscription,type PaperCommand,localPaperTime} from '@/lib/paper-operations'
import {submitPaperOperation,PaperOperationRejected} from '@/lib/paper-submit'

function localDateTime() {
 const date=new Date()
 return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)
}

export default function QcEntryTable({transitionMode=false}:{transitionMode?:boolean}) {
 const [dispatchSheet,setDispatchSheet]=useState(emptyDispatchSheet)
 const [paperPending,setPaperPending]=useState<PaperCommand|null>(null)
 const s=useAppStore()
 const [sheetId]=useState(()=>uuidv4())
 const [evidence,setEvidence]=useState<PaperEvidence>(()=>({occurredAt:localPaperTime()}))
 const [search,setSearch]=useState('')
 const [drafts,setDrafts]=useState<Record<string,QcEntryDraft>>({})
 const [pending,setPending]=useState<QcEntryPlan[]|null>(null)
 const plans=Object.fromEntries((pending||[]).map(plan=>[plan.sourceId,plan]))
 const [batchError,setBatchError]=useState('')
 const [expanded,setExpanded]=useState<Record<string,boolean>>({})
 const [errors,setErrors]=useState<Record<string,string>>({})
 const [busy,setBusy]=useState(false)
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
 const rowMode=(item:PurchaseItem)=>{
  const measured=qc.some(q=>q.id===item.id)&&(item.physicalQtyReceived!=null||item.physicalBeforeReport)
  const needsArrival=!measured&&arrivals.some(a=>a.id===item.id)
  return {needsArrival,ready:measured||!needsArrival?qcRemaining(item):0,remaining:needsArrival?arrivalRemaining(item):qcRemaining(item)}
 }
 const filled=[...queued.values()].map(item=>({item,draft:getDraft(item.id,rowMode(item).ready),needsArrival:rowMode(item).needsArrival})).filter(row=>row.draft.incoming!==0||row.draft.passed!==0||row.draft.rejected!==0)
 // Preview the same shared demand allocation that will be validated for the batch.
 const previewLines=s.salesOrderItems.map(line=>({...line}))
 const previews=new Map<string,{allocations:Array<{soId:string;qty:number}>;inventory:number}>()
 for(const item of queued.values()) {
  const draft=getDraft(item.id,rowMode(item).ready)
  const automatic=buildFifoAllocations(item.productId,draft.passed,s.salesOrders,previewLines)
  const allocations=draft.allocations||automatic.allocations
  previews.set(item.id,{allocations,inventory:Math.max(0,draft.passed-allocations.reduce((total,a)=>total+a.qty,0))})
  for(const allocation of allocations){const line=previewLines.find(line=>line.salesOrderId===allocation.soId&&line.productId===item.productId);if(line&&Number.isFinite(allocation.qty)&&allocation.qty>0)line.qtyFinal=(line.qtyFinal||0)+allocation.qty}
 }
 const saveAll=async()=>{
  if(busy)return
  let submitted=pending
  if(!submitted) {
   if(!filled.length&&(!transitionMode||!dispatchSheetCount(dispatchSheet)))return
   if(filled.length>100){setBatchError('Maksimal 100 barang dalam sekali simpan.');return}
   const state=useAppStore.getState()
   const prepared=prepareQcBatch(filled as QcBatchRow[],{eventId:`qc-batch:${uuidv4()}`,needsArrival:false,evidence:paper,orders:state.salesOrders,lines:state.salesOrderItems,actorRole:state.currentUser?.role})
   if(Object.keys(prepared.errors).length){setErrors(prepared.errors);setExpanded(old=>({...old,...Object.fromEntries(Object.keys(prepared.errors).map(id=>[id,true]))}));setBatchError('Periksa isian yang ditandai. Belum ada barang yang dikirim untuk disimpan.');return}
   submitted=prepared.plans
   setDrafts(old=>({...old,...Object.fromEntries(filled.map(row=>[row.item.id,{...row.draft}]))}))
  }
  const batch=submitted
  let combined=paperPending
  if(transitionMode&&!combined){try{const {dispatches,spares}=dispatchSheetRows(dispatchSheet,previewLines as import('@/types').SalesOrderItem[],paper);combined=preparePaperTranscription(uuidv4(),batch,dispatches,spares)}catch(error){setBatchError(error instanceof Error?error.message:'Periksa isian serah terima.');return}}
  setBusy(true);setPending(batch);setErrors({});setBatchError('')
  try {
   if(combined){
    setPaperPending(combined);await submitPaperOperation(combined);
    setDrafts({});setExpanded({});setPending(null);setPaperPending(null);setDispatchSheet(emptyDispatchSheet());setSaved('QC dan serah terima yang dipilih sudah tersimpan.');toast.success('Seluruh isian berhasil disimpan.');return
   }
   const result=await submitQcBatch(batch)
   result.warnings.forEach(warning=>toast.warning(warning))
   const completed=new Set(result.completedSourceIds)
   const remaining=batch.filter(plan=>!completed.has(plan.sourceId))
   setDrafts(old=>Object.fromEntries(Object.entries(old).filter(([id])=>!completed.has(id))))
   setExpanded(old=>Object.fromEntries(Object.entries(old).filter(([id])=>!completed.has(id))))
   setPending(remaining.length?remaining:null)
   if(completed.size)setSaved(`${completed.size} barang berhasil disimpan bersama.`)
   if(result.complete)toast.success(`${completed.size} barang tersimpan.`)
   else {
    const message=result.message||'Sebagian barang belum selesai. Coba simpan ulang.'
    setBatchError(`${completed.size} barang tersimpan, ${remaining.length} belum selesai. ${message}`)
    if(result.failedSourceId)setErrors({[result.failedSourceId]:message})
   }
  } catch(error) {if(error instanceof PaperOperationRejected){setPending(null);setPaperPending(null)}setBatchError(error instanceof Error?error.message:'Simpan bersama belum selesai. Coba ulang dengan isian yang sama.')}
  finally {setBusy(false)}
 }

 return <section className="space-y-4">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><h2 className="text-xl font-semibold tracking-tight">{transitionMode?'Salin QC & serah terima':'Penerimaan dan QC'}</h2><p className="mt-1 text-sm text-slate-500">{transitionMode?'Kerjakan sesuai kertas: hasil QC di bagian 1, serah terima kurir di bagian 2. Simpan sekali di bawah.':'Isi jumlah semua barang, lalu klik Simpan semua sekali. Lolos otomatis dibagi ke PO; sisanya masuk stok gudang.'}</p></div>
   <div className="flex flex-wrap items-center gap-2"><WorksheetPrintButton kind="qc" title="LEMBAR QC BARANG MASUK" label="Print lembar QC" paperNumber={paper.paperNumber} showPaperNumberInput={false} rows={[...queued.values()].map(item=>{const product=s.products.find(p=>p.id===item.productId);return {group:documentName(item.purchaseId),cells:[product?.skuCode||'',product?.name||item.productId,qtyText(qcRemaining(item)||arrivalRemaining(item),product?.uom)]}})}/></div>
  </div>
  <section aria-labelledby={transitionMode?'qc-step-title':undefined} className={transitionMode?'overflow-hidden rounded-xl border border-emerald-200 bg-white':''}>
   {transitionMode&&<header className="flex items-start gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-4 sm:px-5"><span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-semibold text-white">1</span><div><h3 id="qc-step-title" className="font-semibold text-slate-900">Salin hasil QC</h3><p className="mt-1 text-sm text-slate-600">Dari lembar QC: isi pemeriksa, jumlah masuk, lolos, dan reject. Rincian hanya diisi bila perlu.</p></div></header>}
  <div className={transitionMode?'space-y-3 border-b p-4 sm:p-5':'rounded-xl border bg-white p-4 space-y-3'}>
   <div className="grid gap-3 sm:grid-cols-3">
    <div><Label htmlFor="qc-examiner">Pemeriksa</Label><select id="qc-examiner" disabled={busy||!!pending} className="h-9 w-full rounded-md border bg-white px-2 text-sm" value={evidence.performedBy||''} onChange={e=>setEvidence(v=>({...v,performedBy:e.target.value}))}><option value="">Pilih nama pemeriksa</option>{s.users.map(user=><option key={user.id} value={user.id}>{user.name}</option>)}</select></div>
    <div><Label htmlFor="qc-occurred-at">Waktu QC / penyiapan (WIB)</Label><Input id="qc-occurred-at" disabled={busy||!!pending} type="datetime-local" className="h-9" value={evidence.occurredAt||''} onChange={e=>setEvidence(v=>({...v,occurredAt:e.target.value}))}/></div>
    <div><Label htmlFor="qc-paper-number">Nomor berkas</Label><Input id="qc-paper-number" disabled={busy||!!pending} className="h-9" value={evidence.paperNumber||''} placeholder={automaticPaper} onChange={e=>setEvidence(v=>({...v,paperNumber:e.target.value}))}/></div>
   </div>
   <details><summary className="cursor-pointer text-xs text-slate-500">Lampiran berkas (opsional)</summary><fieldset disabled={busy||!!pending} className="mt-3"><ReceiptUpload currentFile={evidence.paperProof||''} onFileSelect={url=>setEvidence(v=>({...v,paperProof:url}))} label="Foto / scan berkas QC"/></fieldset></details>
  </div>
  {saved&&<p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><Check className="size-4"/>{saved}</p>}
  <div className={transitionMode?'overflow-hidden':'rounded-xl border bg-white overflow-hidden'}>
   <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><p className="text-sm text-slate-500">{queued.size} barang menunggu · Masuk = Lolos + Reject</p><div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-slate-400"/><Input aria-label="Cari barang atau dokumen QC" className="h-9 w-full pl-8 sm:w-64" placeholder="Cari barang / dokumen / PO" value={search} onChange={e=>setSearch(e.target.value)}/></div></div>
   <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
    <thead className="border-b bg-slate-50 text-left text-xs text-slate-500"><tr><th scope="col" className="px-4 py-3">Barang / dokumen</th><th scope="col" className="px-2 py-3">Alokasi lolos</th><th scope="col" className="px-2 py-3 text-right">Sisa</th>{['Masuk','Lolos','Reject'].map(label=><th scope="col" key={label} className="w-24 px-2 py-3">{label}</th>)}<th scope="col" className="w-28 px-2 py-3">Tindakan reject</th><th scope="col" className="w-24 px-3 py-3">Rincian</th></tr></thead>
    <tbody>{rows.map(item=>{
     const product=s.products.find(p=>p.id===item.productId)
     const {needsArrival,ready,remaining}=rowMode(item)
     const d=getDraft(item.id,ready)
     const {allocations,inventory}=previews.get(item.id)!
     const locked=busy||!!pending
     const quantity=(label:string,key:'incoming'|'passed'|'rejected')=><Input type="number" min="0" step="any" max={key==='incoming'?remaining:d.incoming} aria-label={`${label} ${product?.name||item.productId}`} className="h-9 w-full min-w-16 text-right tabular-nums" placeholder="0" disabled={locked} value={d[key]||''} onChange={e=>{const value=e.target.value===''?0:Number(e.target.value);const patch:Partial<QcEntryDraft>={[key]:value,allocations:undefined};if(key==='incoming')patch.passed=Math.max(0,value-d.rejected);if(key==='rejected')patch.passed=Math.max(0,d.incoming-value);if(key==='passed')patch.rejected=Math.max(0,d.incoming-value);put(item.id,d,patch)}}/>
     return <Fragment key={item.id}>
      <tr className="border-b align-top hover:bg-slate-50/50">
       <th scope="row" className="px-4 py-3 text-left font-normal"><p className="font-medium">{product?.name||item.productId}</p><p className="mt-0.5 text-xs text-slate-500">{product?.skuCode} · {product?.uom} · {item.purchaseMethod||'Pasar'}</p><p className="mt-0.5 text-xs text-slate-500">{documentName(item.purchaseId)}</p><span className={`mt-1 inline-block text-xs ${plans[item.id]?'text-amber-700':'text-slate-500'}`}>{plans[item.id]?'Menunggu konfirmasi simpan':needsArrival?'Menunggu datang':'Siap QC'}</span></th>
       <td className="max-w-44 px-2 py-3 text-xs text-slate-500">{allocations.filter(a=>a.qty>0).map(a=><div key={a.soId}>{s.salesOrders.find(o=>o.id===a.soId)?.poNumber||a.soId}: {a.qty}</div>)}<div>Stok gudang: {inventory}</div>{item.costPending&&<p className="mt-1 text-amber-700">Biaya menyusul</p>}</td>
       <td className="px-2 py-3 text-right tabular-nums">{remaining}<span className="block text-xs text-slate-400">{product?.uom}</span></td>
       <td className="px-2 py-3">{quantity('Masuk','incoming')}</td><td className="px-2 py-3">{quantity('Lolos','passed')}</td><td className="px-2 py-3">{quantity('Reject','rejected')}</td>
       <td className="px-2 py-3">{d.rejected>0?<select aria-label={`Tindakan reject ${product?.name}`} disabled={locked} className="h-9 w-full rounded-md border bg-white px-1 text-xs" value={d.rejectAction} onChange={e=>{put(item.id,d,{rejectAction:e.target.value as QcEntryDraft['rejectAction']});if(e.target.value==='Return')setExpanded(old=>({...old,[item.id]:true}))}}><option value="Disposal">Buang</option><option value="Return">Retur vendor</option><option value="B2C">Stok B2C</option></select>:<span className="text-slate-400">—</span>}</td>
       <td className="px-3 py-3"><button type="button" aria-expanded={!!expanded[item.id]} aria-controls={'qc-details-'+item.id} className="flex w-full items-center justify-center gap-1 py-1 text-xs text-slate-500 hover:text-slate-900" onClick={()=>setExpanded(old=>({...old,[item.id]:!old[item.id]}))}>Rincian<ChevronDown className="size-3"/></button></td>
      </tr>
      {d.rejected>0&&<tr className="border-b bg-rose-50/30"><td colSpan={8} className="px-4 py-2"><Input aria-label={`Alasan reject ${product?.name}`} disabled={locked} className="h-8 max-w-xl text-xs" placeholder="Alasan reject (wajib)" value={d.rejectReason} onChange={e=>put(item.id,d,{rejectReason:e.target.value})}/></td></tr>}
      {errors[item.id]&&<tr className="border-b bg-amber-50"><td colSpan={8} className="px-4 py-2 text-xs text-amber-800" role="alert">{errors[item.id]}</td></tr>}
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
   {!transitionMode&&<div className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50/50 px-4 py-3">
    <p className="text-sm text-slate-500">{pending?.length||filled.length} barang terisi · Baris kosong tidak ikut disimpan.{filled.some(row=>!rows.some(item=>item.id===row.item.id))&&<span className="block text-xs">Termasuk baris terisi yang tersembunyi oleh pencarian.</span>}</p>
    <Button disabled={busy||(!pending&&!filled.length)} onClick={saveAll}>{busy?`Menyimpan ${pending?.length||filled.length} barang…`:pending?'Coba simpan semua lagi':`Simpan semua (${filled.length})`}</Button>
   </div>}
  </div>
  </section>
  {transitionMode&&<><div className="pt-4"><PaperDispatchTable sheet={dispatchSheet} onChange={setDispatchSheet} lines={previewLines as import('@/types').SalesOrderItem[]} locked={busy||!!pending}/></div><div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm"><div><p className="text-sm font-semibold text-slate-900">Simpan isian yang sudah selesai</p><p className="mt-1 text-sm text-slate-500">{filled.length} barang QC · {dispatchSheetCount(dispatchSheet)} serah terima / spare dipilih</p><p className="mt-1 text-xs text-slate-500">Boleh simpan QC saja. Serah terima bisa disalin nanti.</p></div><Button disabled={busy||(!pending&&!filled.length&&!dispatchSheetCount(dispatchSheet))} onClick={saveAll}>{busy?'Menyimpan semua…':pending?'Coba simpan semua lagi':'Simpan QC & serah terima'}</Button></div></>}
  {batchError&&<div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{batchError}{pending&&<p className="mt-1 text-xs">Isian transaksi tetap disimpan. Coba ulang untuk melanjutkan; barang yang sudah tercatat tidak akan digandakan. <button type="button" className="underline" onClick={()=>window.location.reload()}>Muat ulang status</button></p>}</div>}
 </section>
}

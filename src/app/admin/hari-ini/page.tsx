"use client"
import { useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import AuthGuard from '@/components/auth/auth-guard';
import LateReturnIntake from '@/components/late-return-intake';
import PoReconciliationSummary from '@/components/po-reconciliation-summary';
import { PaperEvidenceFields } from '@/components/paper-evidence-fields';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { awaitingArrival,awaitingQc,buildFifoAllocations } from '@/lib/daily-flow';
import { processInboundQC,type RejectAction } from '@/lib/qc-process';
import { recordGoodsArrival,recordPacking,releaseForDelivery,recordCourierHandover,applyClientReceipt,finalizeDeliveryAndInvoice } from '@/lib/dispatch';
import type { PaperEvidence } from '@/lib/goods-command';
import { toast } from 'sonner';

/** Office transcription has explicit physical stages; field staff do not log in. */
export default function HariIniPage() {
 const s=useAppStore();
 const [busy,setBusy]=useState('');
 const [papers,setPapers]=useState<Record<string,PaperEvidence>>({});
 const [quantities,setQuantities]=useState<Record<string,number>>({});
 const [reasons,setReasons]=useState<Record<string,string>>({});
 const [actions,setActions]=useState<Record<string,RejectAction>>({});
 const [banks,setBanks]=useState<Record<string,string>>({});
 const evidence=(key:string)=>papers[key]||{};
 const fields=(key:string,recipient=false)=><PaperEvidenceFields value={evidence(key)} onChange={v=>setPapers(p=>({...p,[key]:v}))} recipient={recipient}/>;
 const number=(key:string,fallback:number,label:string,max?:number)=><div><Label htmlFor={key}>{label}</Label><Input id={key} type="number" min="0" max={max} step="any" value={quantities[key]??fallback} onChange={e=>setQuantities(p=>({...p,[key]:Number(e.target.value)}))}/></div>;
 const run=async(key:string,fn:()=>Promise<unknown>)=>{if(busy)return;setBusy(key);try{await fn();toast.success('Berkas berhasil dicatat.');setPapers(p=>Object.fromEntries(Object.entries(p).filter(([k])=>k!==key)));setQuantities(p=>Object.fromEntries(Object.entries(p).filter(([k])=>k!==key&&!k.startsWith(key+':'))));}catch(e){toast.error(e instanceof Error?e.message:'Pencatatan gagal. Isian tetap disimpan.');}finally{setBusy('');}};
 const arrival=s.purchaseItems.filter(i=>['Vendor','Online'].includes(i.purchaseMethod||'')&&!i.isQCed&&i.isOnlineOrdered&&i.qtyPurchased>(i.qcProcessedQty||0)&&s.purchases.some(p=>p.id===i.purchaseId&&['Pending','Belanja','Selesai'].includes(p.status)));
 const qc=awaitingQc(s.purchaseItems,s.purchases);
 const packing=s.salesOrders.filter(so=>so.status==='Packing');
 const handover=s.deliveries.filter(d=>d.status==='Menunggu');
 const receipts=s.deliveries.filter(d=>['Dikirim','Tunggu Konfirmasi'].includes(d.status));
 const title=(soId:string)=>s.salesOrders.find(so=>so.id===soId)?.poNumber||soId;
 const product=(id:string)=>s.products.find(p=>p.id===id)?.name||id;
 const button=(key:string,label:string,fn:()=>Promise<unknown>)=><Button disabled={!!busy} onClick={()=>run(key,fn)}>{busy===key?'Menyimpan…':label}</Button>;
 return <AuthGuard allowedRoles={['admin_po','finance','super_admin']}><div className="space-y-6">
  <PageHeader title="Hari ini" context="Salin berkas fisik sesuai urutan. Pelaksana lapangan dipilih namanya; pengetik dicatat terpisah."/>
  <p className="text-sm text-muted-foreground">Penerimaan → QC → packing → barang keluar → serah terima kurir → hasil klien → audit Finance. Setiap tahap menyimpan nomor berkas dan waktu kejadian sebenarnya.</p>
  <div className="flex flex-wrap gap-4 text-sm"><Link href="/warehouse/inbound">Cetak lembar penerimaan</Link><Link href="/warehouse/qc">QC / retur / persiapan</Link><Link href="/warehouse/outbound">Cetak lembar keluar</Link><Link href="/courier/handover">Cetak serah terima</Link><Link href="/admin/audit-pengiriman">Audit Finance</Link></div>
  <PoReconciliationSummary/>
  <section className="space-y-3"><h2 className="font-semibold">1 · Penerimaan barang / tranche susulan ({arrival.length})</h2>{arrival.map(i=>{const key='arrival:'+i.id;return <Card key={key}><CardContent className="space-y-3 p-4"><h3>{product(i.productId)}</h3>{number(key,i.qtyPurchased-(i.qcProcessedQty||0),'Jumlah benar-benar datang',i.qtyPurchased)}<Label>Kondisi / catatan</Label><Input value={reasons[key]||''} onChange={e=>setReasons(p=>({...p,[key]:e.target.value}))}/>{fields(key)}{button(key,'Catat penerimaan',()=>recordGoodsArrival(useAppStore.getState,i.id,quantities[key]??(i.qtyPurchased-(i.qcProcessedQty||0)),{...evidence(key),condition:reasons[key]}))}</CardContent></Card>})}</section>
  <section className="space-y-3"><h2 className="font-semibold">2 · Pemeriksaan QC ({qc.length})</h2>{qc.map(i=>{const key='qc:'+i.id;const remaining=i.qtyPurchased-(i.qcProcessedQty||0);const actual=quantities[key]??remaining;const reject=quantities[key+':reject']??0;const {allocations,inventoryRemainder}=buildFifoAllocations(i.productId,Math.max(0,actual-reject),s.salesOrders,s.salesOrderItems);return <Card key={key}><CardContent className="space-y-3 p-4"><h3>{product(i.productId)} · sisa pembelian {remaining}</h3>{number(key,remaining,'Jumlah diperiksa pada berkas ini',remaining)}{number(key+':reject',0,'Ditolak QC',actual)}{number(key+':price',i.actualUnitPrice||i.estimatedUnitPrice,'Harga vendor per satuan')}<Label>Tindakan reject</Label><select className="w-full rounded-md border p-2" value={actions[key]||'Disposal'} onChange={e=>setActions(p=>({...p,[key]:e.target.value as RejectAction}))}><option>Disposal</option><option>Return</option><option>B2C</option></select><Label>Alasan reject / sisa belum datang</Label><Input value={reasons[key]||''} onChange={e=>setReasons(p=>({...p,[key]:e.target.value}))}/><p className="text-sm">{allocations.map(a=>`${title(a.soId)}: ${a.qty}`).join(' · ')} · Stok umum: {inventoryRemainder}</p>{i.purchaseMethod==='Vendor'&&i.paymentMethod==='Transfer'&&['finance','super_admin'].includes(s.currentUser?.role||'')&&<div><Label>Rekening sumber pembayaran</Label><select className="w-full rounded-md border p-2" value={banks[key]||''} onChange={e=>setBanks(p=>({...p,[key]:e.target.value}))}><option value="">Pilih rekening</option>{s.bankAccounts.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}{fields(key)}{button(key,'Simpan keputusan QC',async()=>{const r=await processInboundQC(useAppStore.getState,{purchaseItemId:i.id,eventId:`qc:${i.id}:${evidence(key).paperNumber||'initial'}`,qtyPassToInventory:inventoryRemainder,allocations,qtyReject:reject,rejectAction:actions[key]||'Disposal',rejectReason:reasons[key],unbalanceReason:reasons[key],vendorUnitPrice:quantities[key+':price']??i.actualUnitPrice??i.estimatedUnitPrice,bankAccountId:banks[key],...evidence(key)});if(!r.ok)throw new Error(r.error);r.warnings.forEach(w=>toast.warning(w));})}</CardContent></Card>})}</section>
  <section className="space-y-3"><h2 className="font-semibold">3 · Packing dan barang keluar ({packing.length})</h2>{packing.map(so=>{const key='packing:'+so.id;const lines=s.salesOrderItems.filter(i=>i.salesOrderId===so.id&&(i.qtyFinal||0)>0);const releaseKey='release:'+so.id;return <Card key={key}><CardContent className="space-y-3 p-4"><h3>{so.poNumber}</h3>{lines.map(i=><div key={i.id}>{number(key+':'+i.id,i.qtyDispatched??i.qtyFinal??0,`${product(i.productId)} · lolos QC ${i.qtyFinal}`,i.qtyFinal??0)}</div>)}{fields(key)}{button(key,'Catat packing sesuai berkas',()=>recordPacking(useAppStore.getState,so.id,lines.map(i=>({salesOrderItemId:i.id,qty:quantities[key+':'+i.id]??i.qtyDispatched??i.qtyFinal??0})),evidence(key)))}{lines.every(i=>i.isPacked)&&<div className="space-y-3 border-t pt-3"><p>Barang telah dipacking. Salin kejadian barang benar-benar keluar gudang.</p>{fields(releaseKey)}{button(releaseKey,'Catat barang keluar gudang',()=>releaseForDelivery(useAppStore.getState,so.id,evidence(releaseKey)))}</div>}</CardContent></Card>})}</section>
  <section className="space-y-3"><h2 className="font-semibold">4 · Serah terima kurir ({handover.length})</h2>{handover.map(d=>{const key='handover:'+d.id;return <Card key={key}><CardContent className="space-y-3 p-4"><h3>{title(d.salesOrderId)}</h3><p className="text-sm">Pilih kurir yang benar-benar menerima barang sebagai pelaksana.</p>{fields(key)}{button(key,'Catat serah terima kepada kurir',()=>recordCourierHandover(useAppStore.getState,d.id,evidence(key)))}</CardContent></Card>})}</section>
  <section className="space-y-3"><h2 className="font-semibold">5 · Hasil penerimaan klien ({receipts.length})</h2>{receipts.map(d=>{const key='receipt:'+d.id;return <Card key={key}><CardContent className="space-y-3 p-4"><h3>{title(d.salesOrderId)}</h3>{!d.lineSnapshots?<p>Dokumen lama tanpa rincian tetap: rekonsiliasi berkas oleh Super Admin diperlukan.</p>:d.acceptedLineSnapshots?<p>Hasil klien sudah tersimpan. Lanjut buat draft tagihan untuk audit Finance.</p>:<>{d.lineSnapshots.map(i=><div key={i.salesOrderItemId}>{number(key+':'+i.salesOrderItemId,i.qty,`${i.productName} · berangkat ${i.qty}`,i.qty)}</div>)}{fields(key,true)}</>}{d.lineSnapshots&&button(key,d.acceptedLineSnapshots?'Buat draft tagihan dari hasil tersimpan':'Catat hasil klien & buat draft tagihan',async()=>{if(!d.acceptedLineSnapshots)await applyClientReceipt(useAppStore.getState,d.salesOrderId,d.lineSnapshots!.map(i=>({salesOrderItemId:i.salesOrderItemId,qtyReceived:quantities[key+':'+i.salesOrderItemId]??i.qty})),evidence(key));const r=await finalizeDeliveryAndInvoice(useAppStore.getState,d.id,d.salesOrderId);if(!r.ok)throw new Error(r.error);})}</CardContent></Card>})}</section>
  <LateReturnIntake/>
 </div></AuthGuard>;
}

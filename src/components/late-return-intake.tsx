"use client"
import {useState} from 'react';
import Link from 'next/link';
import {useAppStore} from '@/lib/store';
import {executeGoodsCommand,type PaperEvidence} from '@/lib/goods-command';
import {PaperEvidenceFields} from '@/components/paper-evidence-fields';
import {Card,CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Button} from '@/components/ui/button';
import {toast} from 'sonner';
export default function LateReturnIntake(){
 const s=useAppStore();
 const [deliveryId,setDeliveryId]=useState('');
 const [lineId,setLineId]=useState('');
 const [qty,setQty]=useState('');
 const [decision,setDecision]=useState('');
 const [reason,setReason]=useState('');
 const [paper,setPaper]=useState<PaperEvidence>({});
 const [busy,setBusy]=useState(false);
 const rounds=s.deliveries.filter(d=>d.status==='Terkirim'&&d.acceptedLineSnapshots&&d.invoiceId);
 const delivery=rounds.find(d=>d.id===deliveryId);
 const lines=delivery?.acceptedLineSnapshots||[];
 const selected=lines.filter(l=>l.salesOrderItemId===lineId);
 const previouslyReturned=s.pendingReturns.filter(r=>r.deliveryId===deliveryId&&r.salesOrderItemId===lineId&&r.rootCause==='post-delivery').reduce((sum,r)=>sum+r.qty,0);
 const maximum=Math.max(0,selected.reduce((sum,l)=>sum+l.qty,0)-previouslyReturned);
 const pending=s.pendingReturns.filter(r=>r.financialAdjustmentStatus==='Pending Finance');
 const submit=async()=>{
  if(busy)return;setBusy(true);
  try{
   await executeGoodsCommand(useAppStore.getState,{eventId:`late-return:${deliveryId}:${lineId}:${paper.paperNumber||'initial'}`,stage:'return-intake',sourceId:deliveryId,payload:{salesOrderItemId:lineId,qty:Number(qty),returnDecision:decision,reason,...paper}});
   toast.success('Retur diterima untuk QC. Penyesuaian tagihan menunggu Finance.');
   setDeliveryId('');setLineId('');setQty('');setDecision('');setReason('');setPaper({});
  }catch(error){toast.error(error instanceof Error?error.message:'Penerimaan retur gagal.');}finally{setBusy(false);}
 };
 return <section className="space-y-3">
  <h2 className="font-semibold">6 · Retur setelah pengiriman selesai</h2>
  <Card><CardContent className="space-y-3 p-4">
   <p className="text-sm text-muted-foreground">Pilih ronde asli dari berkas. Penerimaan fisik masuk antrean QC; Finance memproses kredit dari harga tagihan asli.</p>
   <div><Label htmlFor="return-round">Ronde pengiriman asli</Label><select id="return-round" className="w-full rounded-md border bg-background p-2" value={deliveryId} onChange={e=>{setDeliveryId(e.target.value);setLineId('');setQty('');}}><option value="">Pilih ronde selesai</option>{rounds.map(d=><option key={d.id} value={d.id}>{s.salesOrders.find(o=>o.id===d.salesOrderId)?.poNumber} · {d.deliveryDate} · {d.id}</option>)}</select></div>
   {delivery&&<>
    <div><Label htmlFor="return-line">Barang asli</Label><select id="return-line" className="w-full rounded-md border bg-background p-2" value={lineId} onChange={e=>setLineId(e.target.value)}><option value="">Pilih barang</option>{lines.filter((l,n,a)=>a.findIndex(x=>x.salesOrderItemId===l.salesOrderItemId)===n).map(l=><option key={l.salesOrderItemId} value={l.salesOrderItemId}>{l.productName}</option>)}</select></div>
    {lineId&&<>
     <div><Label htmlFor="return-qty">Jumlah benar-benar kembali (maksimal {maximum})</Label><Input id="return-qty" type="number" min="0" max={maximum} step="any" value={qty} onChange={e=>setQty(e.target.value)}/></div>
     <div><Label htmlFor="return-decision">Keputusan klien</Label><select id="return-decision" className="w-full rounded-md border bg-background p-2" value={decision} onChange={e=>setDecision(e.target.value)}><option value="">Pilih keputusan tertulis</option><option value="Replace">Ganti barang — buka kebutuhan susulan</option><option value="Cancel">Batalkan jumlah retur — tanpa pembelian ulang</option></select></div>
     <div><Label htmlFor="return-reason">Alasan retur</Label><Input id="return-reason" value={reason} onChange={e=>setReason(e.target.value)}/></div>
     <PaperEvidenceFields value={paper} onChange={setPaper}/>
     <Button disabled={busy} onClick={submit}>{busy?'Menyimpan…':'Catat penerimaan retur'}</Button>
    </>}
   </>}
  </CardContent></Card>
  {pending.length>0&&<Card><CardContent className="space-y-2 p-4"><p className="font-medium">{pending.length} retur menunggu penyesuaian tagihan</p><ul className="text-sm">{pending.map(r=><li key={r.id}>{r.diNumber} · {r.qty} · {r.returnDecision} · <Link className="underline" href={`/finance/invoices?creditReturnId=${encodeURIComponent(r.id)}`}>Proses kredit tagihan asli</Link></li>)}</ul><Link className="text-sm underline" href="/finance/invoices">Finance: proses kredit pada tagihan asli</Link></CardContent></Card>}
 </section>;
}

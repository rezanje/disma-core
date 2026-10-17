"use client"
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useAppStore} from '@/lib/store';
import {buildFieldPacket} from '@/lib/field-packet';
import {buildFieldPacketPdf} from '@/lib/field-packet-pdf';
import {jakartaDate} from '@/lib/paper-operations';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {PdfCanvasPreview} from '@/components/pdf-canvas-preview';
import {Printer,Download} from 'lucide-react';
import {toast} from 'sonner';
export default function FieldPacketWorkspace(){
 const s=useAppStore();const [date,setDate]=useState(()=>jakartaDate(new Date(Date.now()+86400000)));
 const [assignments,setAssignments]=useState<Record<string,string>>({});const [reference,setReference]=useState('');const [pdf,setPdf]=useState<string|null>(null);
 useEffect(()=>()=>{if(pdf)URL.revokeObjectURL(pdf)},[pdf]);
 const orders=s.salesOrders.filter(o=>o.targetDeliveryDate.slice(0,10)===date&&!['Batal','Selesai','Terkirim','Awaiting Audit'].includes(o.status));
 const print=()=>{try{const pages=buildFieldPacket(s,date,assignments,reference.trim()||`PAKET-${date}`);setPdf(buildFieldPacketPdf(pages).output('bloburl').toString())}catch(error){toast.error(error instanceof Error?error.message:'Paket belum bisa dicetak.')}};
 return <section className="space-y-4">
  <div><h2 className="text-xl font-semibold">Cetak paket lapangan</h2><p className="mt-1 text-sm text-slate-500">Satu PDF: belanja, QC, berita acara per kurir, surat jalan per outlet, dan lembar susulan kosong.</p></div>
  <div className="rounded-xl border bg-white p-4 space-y-4"><div className="flex flex-wrap items-end gap-3"><div><Label htmlFor="packet-date">Tanggal pengiriman</Label><Input id="packet-date" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><div><Label htmlFor="packet-reference">Nomor paket / revisi</Label><Input id="packet-reference" value={reference} placeholder={`PAKET-${date}`} onChange={e=>setReference(e.target.value)}/></div><Button onClick={print}><Printer className="mr-2 size-4"/>Preview & cetak paket</Button></div><p className="text-xs text-slate-500">Jumlah aktual dan tanda tangan diisi di lapangan. Pilihan kurir di sini untuk cetak; kurir aktual dicatat saat menyalin serah terima.</p>
   <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-3">Outlet / PO</th><th className="p-3">Alamat</th><th className="p-3">Rencana kurir</th></tr></thead><tbody>{orders.map(o=>{const c=s.clients.find(c=>c.id===o.clientId);return <tr className="border-t" key={o.id}><td className="p-3"><p>{c?.companyName}</p><p className="text-xs text-slate-500">{o.poNumber}</p></td><td className="max-w-xs p-3 text-slate-500">{c?.address}</td><td className="p-3"><select aria-label={`Rencana kurir ${o.poNumber}`} className="h-9 rounded-md border bg-white px-2" value={assignments[o.id]??o.assignedCourierId??''} onChange={e=>setAssignments(v=>({...v,[o.id]:e.target.value}))}><option value="">Isi nama di kertas</option>{s.users.filter(u=>u.role==='kurir').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></td></tr>})}{!orders.length&&<tr><td colSpan={3} className="p-8 text-center text-slate-500">Belum ada PO untuk tanggal ini. Lembar susulan kosong tetap bisa dicetak.</td></tr>}</tbody></table></div>
  </div>
  <div className="flex flex-wrap gap-4 text-sm"><Link className="underline" href="/admin/konsolidasi-belanja">Rincian & pelepasan belanja ke sourcing</Link><Link className="underline" href="/admin/delivery-routes">Atur rute dan urutan outlet</Link></div>
  <Dialog open={!!pdf} onOpenChange={open=>{if(!open)setPdf(null)}}><DialogContent className="flex h-[95vh] w-[96vw] max-w-[96vw] flex-col overflow-hidden p-0 sm:max-w-[96vw]"><DialogHeader className="px-5 py-4"><DialogTitle>Paket lapangan · {date}</DialogTitle></DialogHeader><div className="min-h-0 flex-1 bg-slate-100 p-3">{pdf&&<PdfCanvasPreview url={pdf}/>}</div><div className="flex justify-end gap-3 border-t p-4"><Button variant="outline" onClick={()=>{if(!pdf)return;const w=window.open(pdf,'_blank');w?.addEventListener('load',()=>w.print())}}><Printer className="mr-2 size-4"/>Print</Button><Button onClick={()=>{if(!pdf)return;const a=document.createElement('a');a.href=pdf;a.download=`Paket-lapangan-${date}.pdf`;a.click()}}><Download className="mr-2 size-4"/>Download PDF</Button></div></DialogContent></Dialog>
 </section>;
}

"use client"
import {useState} from 'react';
import Link from 'next/link';
import {useAppStore} from '@/lib/store';
import {Card,CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {PdfCanvasPreview} from '@/components/pdf-canvas-preview';
import {generateSuratJalan,generateBA} from '@/lib/pdf';
import {toast} from 'sonner';
/** Office users see every courier's round. Physical results use the common paper flow. */
export default function CourierDashboard(){
 const deliveries=useAppStore(s=>s.deliveries);const orders=useAppStore(s=>s.salesOrders);const clients=useAppStore(s=>s.clients);const users=useAppStore(s=>s.users);
 const [preview,setPreview]=useState<{url:string;title:string}|null>(null);
 const print=(id:string,type:'SJ'|'BA')=>{const d=deliveries.find(d=>d.id===id);const so=orders.find(s=>s.id===d?.salesOrderId);if(!d||!so)return;try{const url=type==='SJ'?generateSuratJalan(so.poNumber,undefined,'dataurl',undefined,d.id):generateBA(so.poNumber,undefined,'dataurl',undefined,d.id);if(typeof url==='string')setPreview({url,title:`${type} · ${so.poNumber} · ${d.id}`});}catch(e){toast.error(e instanceof Error?e.message:'Dokumen gagal dibuka.')}};
 return <div className="space-y-4"><h2 className="text-2xl font-bold">Kiriman per kurir dan ronde</h2><p className="text-sm text-muted-foreground">Kantor mencatat serah terima, hasil klien dan lampiran fisik melalui Hari ini. Kurir dipilih sebagai pelaksana tanpa akun masuk.</p><Link className="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground" href="/admin/hari-ini">Salin berkas serah terima / hasil klien</Link>{deliveries.map(d=>{const so=orders.find(s=>s.id===d.salesOrderId);return <Card key={d.id}><CardContent className="space-y-3 p-4"><h3 className="font-semibold">{so?.poNumber||d.salesOrderId} · {clients.find(c=>c.id===so?.clientId)?.companyName}</h3><p className="text-sm">{d.status} · {users.find(u=>u.id===d.courierId)?.name||'Kurir belum dicatat'} · Ronde {d.id}</p>{d.lineSnapshots?<ul className="text-sm">{d.lineSnapshots.map(l=><li key={l.salesOrderItemId}>{l.productName}: berangkat {l.qty} {l.uom}; diterima {d.acceptedLineSnapshots?.find(a=>a.salesOrderItemId===l.salesOrderItemId)?.qty??'belum dicatat'}</li>)}</ul>:<p className="text-sm text-amber-700">Riwayat lama tanpa rincian tetap. Periksa arsip fisik.</p>}<div className="flex gap-2"><Button variant="outline" onClick={()=>print(d.id,'SJ')}>Surat jalan ronde ini</Button><Button variant="outline" onClick={()=>print(d.id,'BA')}>Berita acara ronde ini</Button>{d.baUrl&&<a href={d.baUrl} target="_blank" rel="noreferrer">Lampiran penerimaan</a>}</div></CardContent></Card>})}<Dialog open={!!preview} onOpenChange={open=>{if(!open)setPreview(null)}}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>{preview?.title}</DialogTitle></DialogHeader>{preview&&<div className="max-h-[70vh] overflow-auto"><PdfCanvasPreview url={preview.url}/></div>}</DialogContent></Dialog></div>;
}

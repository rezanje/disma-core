'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {v4 as uuidv4} from 'uuid'
import {TabHost} from '@/components/layout/tab-host'
import History from '../activity-log/page'
import StockCount from '@/app/warehouse/opname/page'
import {recordFinancialReversal} from '@/lib/accounting'
import {formatRupiah} from '@/lib/utils'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {toast} from 'sonner'

type Event={id:string;date?:string;amount?:number;payload?:{date?:string;amount?:number;billId?:string};clientId?:string}
type Reversal={sourceType:string;sourceId:string;eventId:string;reason:string;date:string}
function FinancialCorrections(){
 const [data,setData]=useState<{receipts:Event[];vendorPayments:Event[];reversals:Reversal[]}>({receipts:[],vendorPayments:[],reversals:[]})
 const [error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [sourceType,setSourceType]=useState<'client-receipt'|'vendor-payment'>('client-receipt'),[sourceId,setSourceId]=useState(''),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[reason,setReason]=useState('')
 const attempt=useRef<{id:string;payload:string}|null>(null),inflight=useRef(false)
 const load=useCallback(async()=>{
  try{const response=await fetch('/api/accounting/reversals',{cache:'no-store'});const body=await response.json();if(!response.ok||!['receipts','vendorPayments','reversals'].every(key=>Array.isArray(body[key])))throw new Error(body.error||'Riwayat sumber gagal dimuat');setData(body);setError('')}
  catch(error){setError(error instanceof Error?error.message:'Riwayat gagal dimuat')}
 },[])
 useEffect(()=>{void load()},[load])
 const sources=(sourceType==='client-receipt'?data.receipts:data.vendorPayments).filter(event=>!data.reversals.some(reversal=>reversal.sourceType===sourceType&&reversal.sourceId===event.id))
 const submit=async()=>{
  if(inflight.current)return
  if(!sourceId||!date||reason.trim().length<5){toast.error('Pilih transaksi sumber, tanggal koreksi dan alasan minimal lima karakter.');return}
  const payload=JSON.stringify({sourceType,sourceId,date,reason:reason.trim()})
  if(attempt.current&&attempt.current.payload!==payload){toast.error('Ulangi data koreksi sebelumnya untuk memastikan hasil sebelum mengubah isian.');return}
  if(!attempt.current)attempt.current={id:uuidv4(),payload}
  inflight.current=true;setBusy(true)
  try{
   const ok=await recordFinancialReversal({eventId:attempt.current.id,date,sourceType,sourceId,reason:reason.trim()})
   if(!ok)throw new Error('Koreksi belum terkonfirmasi. Ulangi data yang sama dengan identitas koreksi yang dipertahankan.')
   attempt.current=null;setSourceId('');setReason('');toast.success('Transaksi pembalik dicatat; sumber dan riwayat tetap tersimpan.');await load()
  }catch(error){toast.error(error instanceof Error?error.message:'Koreksi gagal')}
  finally{inflight.current=false;setBusy(false)}
 }
 return <section className="space-y-5 rounded border p-4">
  <div><h2 className="font-bold">Pembalikan pembayaran dari sumber</h2><p className="mt-2 text-sm text-muted-foreground">Khusus Super Admin. Gunakan saat penerimaan klien atau pembayaran vendor salah dicatat. Sistem membalik jurnal, kas, dan alokasi tagihan bersama. Masukkan transaksi pengganti setelah pembalikan terkonfirmasi. Retur atau potongan memakai credit note.</p></div>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  <div className="grid gap-4 sm:grid-cols-2">
   <label className="space-y-2 text-sm">Jenis sumber<select className="w-full rounded border bg-background p-2" value={sourceType} disabled={busy||!!attempt.current} onChange={e=>{setSourceType(e.target.value as typeof sourceType);setSourceId('')}}><option value="client-receipt">Penerimaan klien</option><option value="vendor-payment">Pembayaran vendor</option></select></label>
   <label className="space-y-2 text-sm">Transaksi sumber<select className="w-full rounded border bg-background p-2" value={sourceId} disabled={busy} onChange={e=>setSourceId(e.target.value)}><option value="">Pilih transaksi</option>{sources.map(event=><option key={event.id} value={event.id}>{event.date||event.payload?.date} · {formatRupiah(event.amount||event.payload?.amount||0)} · {event.id}</option>)}</select></label>
   <label className="space-y-2 text-sm">Tanggal koreksi<Input type="date" value={date} disabled={busy} onChange={e=>setDate(e.target.value)}/></label>
   <label className="space-y-2 text-sm">Alasan dan nomor bukti<Input value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>
  </div><Button variant="destructive" disabled={busy} onClick={submit}>{busy?'Mencatat pembalikan…':'Balik transaksi sumber'}</Button>
  <p className="text-xs text-muted-foreground">Koreksi ditolak jika sudah dibalik, dana pengembalian tidak mencukupi, atau dokumen berikutnya perlu dibereskan lebih dahulu. Transaksi lama tanpa sumber yang dapat diverifikasi perlu rekonsiliasi dokumen sebelum koreksi.</p>
  <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Tanggal','Sumber','Alasan'].map(label=><th className="p-2 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{data.reversals.map(row=><tr className="border-t" key={row.eventId}><td className="p-2">{row.date}</td><td className="p-2">{row.sourceType} · {row.sourceId}</td><td className="p-2">{row.reason}</td></tr>)}</tbody></table></div>
 </section>
}
export default function Corrections(){return <TabHost queryKey="workspace" title="Koreksi dan riwayat" context="Setiap koreksi berasal dari transaksi atau hasil pemeriksaan fisik yang dapat ditelusuri." tabs={[{key:'pembayaran',title:'Koreksi pembayaran',render:()=> <FinancialCorrections/>},{key:'stok',title:'Pemeriksaan stok fisik',render:()=> <StockCount/>},{key:'riwayat',title:'Riwayat perubahan',render:()=> <History/>}]}/>}

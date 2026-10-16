'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {v4 as uuidv4} from 'uuid'
import {useAppStore} from '@/lib/store'
import {recordVendorAdvance,recordVendorClaimRefund,recordVendorClaimNetoff} from '@/lib/accounting'
import {formatRupiah} from '@/lib/utils'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Card,CardHeader,CardTitle,CardContent} from '@/components/ui/card'
import {toast} from 'sonner'

type Advance={id:string;purchaseId:string;vendorId:string;amount:number;appliedAmount:number;date:string}
type Claim={id:string;vendorId:string;productId:string;qty:number;claimAmount:number;settledAmount:number;remainingAmount:number;status:string}
type Data={advances:Advance[];claims:Claim[];settlements:unknown[]}
export default function VendorSettlements(){
 const purchases=useAppStore(s=>s.purchases),vendors=useAppStore(s=>s.vendors),banks=useAppStore(s=>s.bankAccounts),bills=useAppStore(s=>s.vendorBills)
 const [data,setData]=useState<Data>({advances:[],claims:[],settlements:[]})
 const [error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [kind,setKind]=useState<'advance'|'refund'|'netoff'>('advance')
 const [purchaseId,setPurchaseId]=useState(''),[vendorId,setVendorId]=useState(''),[claimId,setClaimId]=useState(''),[billId,setBillId]=useState(''),[bankId,setBankId]=useState('')
 const [amount,setAmount]=useState(''),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[note,setNote]=useState('')
 const attempt=useRef<{id:string;payload:string}|null>(null),inflight=useRef(false)
 const load=useCallback(async()=>{
  try{const response=await fetch('/api/accounting/vendor-events',{cache:'no-store'});const body=await response.json();if(!response.ok||!['advances','claims','settlements'].every(key=>Array.isArray(body[key])))throw new Error(body.error||'Rincian uang muka dan klaim gagal dimuat');setData(body);setError('')}
  catch(error){setError(error instanceof Error?error.message:'Rincian vendor gagal dimuat')}
 },[])
 useEffect(()=>{void load()},[load])
 const claim=data.claims.find(row=>row.id===claimId)
 const submit=async()=>{
  if(inflight.current)return
  const value=Number(amount)
  if(!Number.isFinite(value)||value<=0||!date||note.trim().length<5){toast.error('Isi tanggal, nominal positif, dan catatan bukti minimal lima karakter.');return}
  if(kind==='advance'&&(!purchaseId||!vendorId||!bankId)){toast.error('Pilih dokumen belanja, vendor dan sumber bank.');return}
  if(kind!=='advance'&&(!claim||value>claim.remainingAmount||(kind==='refund'&&!bankId)||(kind==='netoff'&&!billId))){toast.error('Pilih klaim dan tujuan yang sesuai; nominal tidak melebihi sisa klaim.');return}
  const payload=JSON.stringify({kind,date,amount:value,purchaseId,vendorId,claimId,billId,bankId,note:note.trim()})
  if(attempt.current&&attempt.current.payload!==payload){toast.error('Pastikan transaksi sebelumnya dengan mengulang data yang sama sebelum mengubah isian.');return}
  if(!attempt.current)attempt.current={id:uuidv4(),payload}
  inflight.current=true;setBusy(true)
  try{
   const base={eventId:attempt.current.id,date,amount:value,note:note.trim()}
   const ok=kind==='advance'?await recordVendorAdvance({...base,bankAccountId:bankId,purchaseId,vendorId}):kind==='refund'?await recordVendorClaimRefund({...base,bankAccountId:bankId,vendorReturnId:claimId}):await recordVendorClaimNetoff({...base,vendorReturnId:claimId,billId})
   if(!ok)throw new Error('Transaksi belum terkonfirmasi. Ulangi data yang sama; identitas transaksi tetap disimpan.')
   attempt.current=null;setAmount('');setNote('');toast.success('Penyelesaian vendor dan jurnal sudah dicatat bersama.');await load()
  }catch(error){toast.error(error instanceof Error?error.message:'Penyelesaian gagal')}
  finally{inflight.current=false;setBusy(false)}
 }
 const vendorName=(id:string)=>vendors.find(v=>v.id===id)?.companyName||id
 const selectClass='w-full rounded border border-input bg-background px-3 py-2 text-sm'
 return <div className="space-y-6">
  <div><h2 className="text-xl font-bold">Uang muka dan klaim vendor</h2><p className="mt-2 text-sm text-muted-foreground">Uang muka sebelum barang datang tetap menjadi aset. Saat tagihan penerimaan terbit, uang muka vendor yang sama dialokasikan sesuai dokumen. Refund hanya dicatat setelah uang diterima; potong utang menggunakan tagihan vendor yang sama.</p></div>
  {error&&<p role="alert" className="text-destructive text-sm">{error}</p>}
  <Card><CardHeader><CardTitle>Catat sesuai bukti</CardTitle></CardHeader><CardContent className="space-y-4">
   <div className="grid gap-4 sm:grid-cols-2">
    <label className="space-y-2 text-sm">Jenis penyelesaian<select className={selectClass} value={kind} disabled={busy||!!attempt.current} onChange={e=>setKind(e.target.value as typeof kind)}><option value="advance">Uang muka vendor</option><option value="refund">Terima refund klaim</option><option value="netoff">Potong utang dari klaim</option></select></label>
    <label className="space-y-2 text-sm">Tanggal kejadian<Input type="date" value={date} disabled={busy} onChange={e=>setDate(e.target.value)}/></label>
    {kind==='advance'?<><label className="space-y-2 text-sm">Dokumen belanja<select className={selectClass} value={purchaseId} disabled={busy} onChange={e=>setPurchaseId(e.target.value)}><option value="">Pilih dokumen</option>{purchases.map(p=><option key={p.id} value={p.id}>{p.id} · {p.status}</option>)}</select></label><label className="space-y-2 text-sm">Vendor<select className={selectClass} value={vendorId} disabled={busy} onChange={e=>setVendorId(e.target.value)}><option value="">Pilih vendor</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.companyName}</option>)}</select></label></>:<label className="space-y-2 text-sm">Klaim dari retur vendor<select className={selectClass} value={claimId} disabled={busy} onChange={e=>{setClaimId(e.target.value);setBillId('')}}><option value="">Pilih klaim yang belum selesai</option>{data.claims.filter(c=>c.remainingAmount>0).map(c=><option key={c.id} value={c.id}>{vendorName(c.vendorId)} · {c.id} · sisa {formatRupiah(c.remainingAmount)}</option>)}</select></label>}
    {kind==='netoff'?<label className="space-y-2 text-sm">Tagihan yang dipotong<select className={selectClass} value={billId} disabled={busy} onChange={e=>setBillId(e.target.value)}><option value="">Pilih tagihan vendor yang sama</option>{bills.filter(b=>b.vendorId===claim?.vendorId&&b.totalAmount>b.amountPaid).map(b=><option key={b.id} value={b.id}>{b.billNumber} · sisa {formatRupiah(b.totalAmount-b.amountPaid)}</option>)}</select></label>:<label className="space-y-2 text-sm">{kind==='refund'?'Rekening penerima refund':'Sumber uang muka'}<select className={selectClass} value={bankId} disabled={busy} onChange={e=>setBankId(e.target.value)}><option value="">Pilih kas/bank</option>{banks.map(b=><option key={b.id} value={b.id}>{b.name} · {formatRupiah(b.balance)}</option>)}</select></label>}
    <label className="space-y-2 text-sm">Nominal rupiah<Input type="number" min="0.01" step="0.01" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)}/></label>
    <label className="space-y-2 text-sm">Catatan dan nomor bukti<Input value={note} disabled={busy} onChange={e=>setNote(e.target.value)}/></label>
   </div><Button disabled={busy} onClick={submit}>{busy?'Mencatat…':'Simpan sesuai bukti'}</Button>
  </CardContent></Card>
  <Card><CardHeader><CardTitle>Sisa uang muka vendor</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Vendor / dokumen','Tanggal','Dibayar','Dialokasikan','Sisa aset'].map(h=><th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{data.advances.map(row=><tr key={row.id}><td className="p-2">{vendorName(row.vendorId)} · {row.purchaseId}</td><td className="p-2">{row.date}</td><td className="p-2">{formatRupiah(row.amount)}</td><td className="p-2">{formatRupiah(row.appliedAmount)}</td><td className="p-2">{formatRupiah(Math.max(0,row.amount-row.appliedAmount))}</td></tr>)}</tbody></table>{!data.advances.length&&<p className="text-sm text-muted-foreground">Belum ada uang muka tercatat.</p>}</div></CardContent></Card>
 </div>
}

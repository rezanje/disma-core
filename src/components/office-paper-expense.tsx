'use client'

import {useRef,useState} from 'react'
import Link from 'next/link'
import {v4 as uuidv4} from 'uuid'
import {useAppStore} from '@/lib/store'
import {PAPER_EXPENSE_CATEGORIES,recordPaperExpense,validatePaperExpense,type PaperExpenseInput} from '@/lib/paper-expense-command'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Card,CardHeader,CardTitle,CardContent} from '@/components/ui/card'
import ReceiptUpload from '@/components/ui/receipt-upload'
import {formatRupiah} from '@/lib/utils'
import {toast} from 'sonner'

/** Office transcription of one actual payment source; no inferred wallet or split. */
export function OfficePaperExpense({channel}:{channel:'sourcing'|'kurir'}) {
 const users=useAppStore(state=>state.users)
 const banks=useAppStore(state=>state.bankAccounts)
 const purchases=useAppStore(state=>state.purchases)
 const expenses=useAppStore(state=>state.expenses)
 const reimbursements=useAppStore(state=>state.reimbursements)
 const [recordType,setRecordType]=useState<'expense'|'reimbursement'>('expense')
 const [performedBy,setPerformedBy]=useState(''),[payeeId,setPayeeId]=useState('')
 const [date,setDate]=useState(''),[bankId,setBankId]=useState(''),[purchaseId,setPurchaseId]=useState('')
 const [amount,setAmount]=useState(''),[category,setCategory]=useState('Bensin')
 const [description,setDescription]=useState(''),[receiptUrl,setReceiptUrl]=useState('')
 const [busy,setBusy]=useState(false),[pendingId,setPendingId]=useState('')
 const [showLegacy,setShowLegacy]=useState(false)
 const attempt=useRef<PaperExpenseInput|null>(null),inflight=useRef(false)
 const locked=busy || !!pendingId
 const submit=async(event:React.FormEvent)=> {
  event.preventDefault()
  if(inflight.current) return
  const eventId=attempt.current?.eventId || uuidv4()
  const input=attempt.current || {eventId,id:eventId,recordType,channel,date:date && !Number.isNaN(new Date(date).getTime())?new Date(date).toISOString():date,performedBy,payeeId:recordType==='reimbursement'?payeeId:undefined,bankAccountId:recordType==='expense'?bankId:undefined,amount:Number(amount),category,description:description.trim(),receiptUrl,purchaseId:purchaseId || undefined}
  const invalid=validatePaperExpense(input)
  if(invalid) {toast.error(invalid);return}
  attempt.current=input;setPendingId(input.eventId);inflight.current=true;setBusy(true)
  try {
   await recordPaperExpense(input)
   attempt.current=null;setPendingId('')
   setAmount('');setDescription('');setReceiptUrl('');setDate('');setPurchaseId('')
   toast.success('Satu salinan biaya tersimpan untuk pemeriksaan Finance.')
  } catch(error) {
   if(error instanceof Error && 'safeToEdit' in error && error.safeToEdit===true) {attempt.current=null;setPendingId('')}
   toast.error(error instanceof Error?error.message:'Hasil pencatatan belum pasti. Ulangi data yang sama.')
  } finally {inflight.current=false;setBusy(false)}
 }
 const history=[
  ...expenses.filter(row=>showLegacy?!row.channel:row.channel===channel).map(row=>({id:row.id,date:row.date,person:row.performedBy || row.reporterId,payee:'',amount:row.amount,description:row.description,source:row.sourceBankAccountId,status:row.status,proof:row.receiptUrl,recordedBy:row.recordedBy,recordedAt:row.recordedAt,type:'Kas perusahaan'})),
  ...reimbursements.filter(row=>showLegacy?!row.channel:row.channel===channel).map(row=>({id:row.id,date:row.date,person:row.performedBy || '',payee:row.userId,amount:row.amount,description:row.description,source:undefined,status:row.status,proof:row.receiptUrl,recordedBy:row.recordedBy,recordedAt:row.recordedAt,type:'Uang pribadi'})),
 ].sort((a,b)=>b.date.localeCompare(a.date))
 const name=(id:string)=>users.find(user=>user.id===id)?.name || id || 'Belum tercatat'
 const selectClass='w-full rounded-md border bg-background p-2 text-sm'
 return <div className="space-y-6">
  <div><h1 className="text-xl font-bold">Salin bukti biaya {channel==='kurir'?'kurir':'sourcing'}</h1><p className="mt-2 text-sm text-muted-foreground">Pilih pelaksana, waktu, sumber uang dan bukti yang benar-benar tercatat di kertas. Satu pengeluaran memakai satu sumber; tidak dipecah otomatis menjadi talangan.</p></div>
  <Card><CardHeader><CardTitle>Satu bukti pengeluaran</CardTitle></CardHeader><CardContent>
   <form onSubmit={submit} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
     <label className="space-y-2 text-sm">Uang yang dipakai<select className={selectClass} value={recordType} disabled={locked} onChange={event=>setRecordType(event.target.value as typeof recordType)}><option value="expense">Kas / rekening perusahaan</option><option value="reimbursement">Uang pribadi — ajukan penggantian</option></select></label>
     <label className="space-y-2 text-sm">Pelaksana sesuai kertas<select className={selectClass} value={performedBy} disabled={locked} onChange={event=>setPerformedBy(event.target.value)}><option value="">Pilih nama pelaksana</option>{users.map(user=><option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
     <label className="space-y-2 text-sm">Waktu kejadian sebenarnya<Input type="datetime-local" value={date} disabled={locked} onChange={event=>setDate(event.target.value)} required /></label>
     {recordType==='expense'?<label className="space-y-2 text-sm">Kas / rekening yang dipakai<select className={selectClass} value={bankId} disabled={locked} onChange={event=>setBankId(event.target.value)}><option value="">Pilih sumber sesuai bukti</option>{banks.filter(bank=>bank.accountCode).map(bank=><option key={bank.id} value={bank.id}>{bank.name}</option>)}</select></label>:<label className="space-y-2 text-sm">Orang yang membayar / penerima penggantian<select className={selectClass} value={payeeId} disabled={locked} onChange={event=>setPayeeId(event.target.value)}><option value="">Pilih pemilik uang pribadi</option>{users.map(user=><option key={user.id} value={user.id}>{user.name}</option>)}</select></label>}
     <label className="space-y-2 text-sm">Dokumen belanja terkait (bila ada)<select className={selectClass} value={purchaseId} disabled={locked} onChange={event=>setPurchaseId(event.target.value)}><option value="">Tidak terkait dokumen belanja</option>{purchases.filter(purchase=>!['Batal','Cancelled'].includes(purchase.status)).map(purchase=><option key={purchase.id} value={purchase.id}>{purchase.advanceCode || purchase.id} · {purchase.status}</option>)}</select></label>
     <label className="space-y-2 text-sm">Kategori<select className={selectClass} value={category} disabled={locked} onChange={event=>setCategory(event.target.value)}>{PAPER_EXPENSE_CATEGORIES.map(value=><option key={value}>{value}</option>)}</select></label>
     <label className="space-y-2 text-sm">Nominal sesuai bukti<Input type="number" min="0.01" step="0.01" value={amount} disabled={locked} onChange={event=>setAmount(event.target.value)} required /></label>
     <label className="space-y-2 text-sm">Keterangan dan nomor bukti<Input value={description} disabled={locked} onChange={event=>setDescription(event.target.value)} required minLength={5} /></label>
    </div>
    <fieldset disabled={locked}><ReceiptUpload label="Foto / scan bukti asli (wajib)" currentFile={receiptUrl} onFileSelect={setReceiptUrl} /></fieldset>
    <p className="text-xs text-muted-foreground">Nama dan waktu pengetik disimpan oleh server. Salinan ini menunggu pemeriksaan; persetujuan mencatat pembayaran dari sumber yang dipilih.</p>
    {pendingId&&<p role="status" className="text-xs text-amber-700">Pencatatan {pendingId} belum dikonfirmasi. Ulangi pemeriksaan dengan data yang sama; identitas kejadian dipertahankan.</p>}
    <Button type="submit" disabled={busy}>{busy?'Menyimpan…':pendingId?'Ulangi pemeriksaan dan simpan':'Simpan untuk pemeriksaan'}</Button>
   </form>
  </CardContent></Card>
  <p className="text-sm"><Link className="underline" href="/finance/kas?workspace=dana">Serah dana atau pengembalian kas petugas</Link> dicatat terpisah sesuai uang yang benar-benar diserahkan.</p>
  <Card><CardHeader><CardTitle>Riwayat salinan</CardTitle></CardHeader><CardContent className="space-y-3">
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showLegacy} onChange={event=>setShowLegacy(event.target.checked)} />Lihat seluruh catatan lama yang asal kertasnya belum terverifikasi</label>
   <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Kejadian','Pelaksana / penerima penggantian','Sumber uang','Nominal','Status / bukti','Pencatat'].map(label=><th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{history.map(row=><tr key={row.type+row.id} className="border-t"><td className="p-2">{new Date(row.date).toLocaleString('id-ID')}<p>{row.description}</p></td><td className="p-2">{name(row.person)}{row.payee&&<p>Penggantian: {name(row.payee)}</p>}</td><td className="p-2">{row.type}{row.source&&<p>{banks.find(bank=>bank.id===row.source)?.name || row.source}</p>}</td><td className="p-2">{formatRupiah(row.amount)}</td><td className="p-2">{row.status}{row.proof&&<p><a href={row.proof} className="underline" target="_blank" rel="noopener noreferrer">Bukti asli</a></p>}</td><td className="p-2">{row.recordedBy?name(row.recordedBy):'Pencatat historis belum terverifikasi'}{row.recordedAt&&<p>{new Date(row.recordedAt).toLocaleString('id-ID')}</p>}</td></tr>)}</tbody></table>{history.length===0&&<p className="py-4 text-sm text-muted-foreground">Belum ada catatan pada pilihan ini.</p>}</div>
  </CardContent></Card>
 </div>
}

'use client'

import {useEffect,useState} from 'react'
import {toast} from 'sonner'
import {Button} from '@/components/ui/button'
import {Card,CardHeader,CardTitle,CardContent} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {clearAllOperationalCaches} from '@/lib/store'

type Metadata={savedAt:string;bytes:number|null}|null
export default function MaintenancePage(){
 const [checkpoint,setCheckpoint]=useState<Metadata>(null)
 const [previous,setPrevious]=useState<Metadata>(null)
 const [busy,setBusy]=useState(false)
 const [confirmation,setConfirmation]=useState('')
 const [loadError,setLoadError]=useState('')
 const load=async()=>{
  try{
   const response=await fetch('/api/db/backup?info=checkpoint',{cache:'no-store'})
   const data=await response.json()
   if(!response.ok)throw new Error(data.error||'Informasi cadangan gagal dimuat')
   setCheckpoint(data.checkpoint);setPrevious(data.preRestore);setLoadError('')
  }catch(error){setLoadError(error instanceof Error?error.message:'Informasi cadangan gagal dimuat')}
 }
 useEffect(()=>{void load()},[])
 const act=async(action:string,backupData?:unknown)=>{
  if(busy)return
  const restoring=action!=='checkpoint_save'
  if(restoring&&confirmation!=='PULIHKAN CADANGAN'){toast.error('Ketik PULIHKAN CADANGAN untuk melanjutkan.');return}
  setBusy(true)
  try{
   const response=await fetch('/api/db/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,backupData})})
   const data=await response.json()
   if(!response.ok||data.success!==true)throw new Error(data.error||'Server belum mengonfirmasi penyimpanan')
   if(restoring){clearAllOperationalCaches();toast.success('Pemulihan selesai. Silakan masuk kembali.');window.location.assign('/login')}
   else{toast.success(`Cadangan lengkap tersimpan: ${data.rows.toLocaleString('id-ID')} baris.`);await load()}
  }catch(error){toast.error(error instanceof Error?error.message:'Operasi cadangan gagal')}
  finally{setBusy(false)}
 }
 const download=async()=>{
  if(busy)return
  setBusy(true)
  try{
   const response=await fetch('/api/db/backup',{cache:'no-store'})
   if(!response.ok){const data=await response.json();throw new Error(data.error||'Ekspor gagal')}
   const blob=await response.blob();const url=URL.createObjectURL(blob)
   const link=document.createElement('a');link.href=url;link.download=`disma-backup-${new Date().toISOString().slice(0,10)}.json`;link.click();URL.revokeObjectURL(url)
   toast.success('Berkas cadangan lengkap disiapkan untuk diunduh.')
  }catch(error){toast.error(error instanceof Error?error.message:'Ekspor gagal')}
  finally{setBusy(false)}
 }
 return <div className="max-w-3xl space-y-6 pb-12">
  <div><h1 className="text-2xl font-bold">Cadangan dan pemulihan</h1><p className="mt-2 text-sm text-muted-foreground">Khusus Super Admin. Cadangan memuat seluruh tabel bisnis beserta daftar dan jumlah baris. Pemulihan mengganti data bisnis sebagai satu transaksi dan mengakhiri sesi pengguna.</p></div>
  {loadError&&<p role="alert" className="text-sm text-destructive">{loadError}</p>}
  <Card><CardHeader><CardTitle>Cadangan lengkap</CardTitle></CardHeader><CardContent className="space-y-4">
   <p className="text-sm">Terakhir disimpan: {checkpoint?new Date(checkpoint.savedAt).toLocaleString('id-ID'):'Belum tersedia'}.</p>
   <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={()=>act('checkpoint_save')}>Simpan cadangan</Button><Button variant="outline" disabled={busy} onClick={download}>Unduh cadangan lengkap</Button></div>
  </CardContent></Card>
  <Card><CardHeader><CardTitle>Pulihkan data</CardTitle></CardHeader><CardContent className="space-y-4">
   <p className="text-sm">Pastikan pengguna lain sudah berhenti mencatat. Data sebelum pemulihan disimpan sebagai cadangan pengaman. Berkas lama yang tidak lengkap akan ditolak.</p>
   <label className="block space-y-2 text-sm"><span>Ketik PULIHKAN CADANGAN</span><Input value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={busy}/></label>
   <div className="flex flex-wrap gap-3"><Button variant="destructive" disabled={busy||!checkpoint||confirmation!=='PULIHKAN CADANGAN'} onClick={()=>act('checkpoint_restore')}>Pulihkan cadangan tersimpan</Button><Button variant="outline" disabled={busy||!previous||confirmation!=='PULIHKAN CADANGAN'} onClick={()=>act('checkpoint_undo')}>Kembali ke sebelum pemulihan</Button></div>
   <label className="block space-y-2 text-sm"><span>Atau pilih berkas cadangan lengkap</span><Input type="file" accept=".json,application/json" disabled={busy||confirmation!=='PULIHKAN CADANGAN'} onChange={async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return
    try{await act('restore_upload',JSON.parse(await file.text()))}catch{toast.error('Berkas JSON tidak valid')}
   }}/></label>
  </CardContent></Card>
  <p className="text-sm text-muted-foreground">Reset simulasi hanya tersedia pada lingkungan pengujian yang diaktifkan secara khusus. Koreksi transaksi operasional dilakukan melalui dokumen sumber dan riwayat koreksi.</p>
 </div>
}

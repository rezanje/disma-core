"use client"
import { useId } from 'react';
import { useAppStore } from '@/lib/store';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ReceiptUpload from '@/components/ui/receipt-upload';
import type { PaperEvidence } from '@/lib/goods-command';
/** Inactive field staff remain selectable; they do not need an application account. */
export function PaperEvidenceFields({value,onChange,recipient=false,photoOptional=false}:{value:PaperEvidence;onChange:(value:PaperEvidence)=>void;recipient?:boolean;photoOptional?:boolean}) {
 const id=useId(); const users=useAppStore(s=>s.users);
 const put=(key:keyof PaperEvidence,text:string)=>onChange({...value,[key]:text});
 return <fieldset className="space-y-3 rounded-xl border p-3">
  <legend className="px-1 text-sm font-semibold">Salin kejadian dari berkas lapangan</legend>
  <div className="grid gap-3 sm:grid-cols-2">
   <div><Label htmlFor={id+'-actor'}>Pelaksana fisik</Label><select id={id+'-actor'} value={value.performedBy||''} onChange={e=>put('performedBy',e.target.value)} className="h-10 w-full rounded-md border bg-background px-2"><option value="">Pilih nama sesuai berkas</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
   <div><Label htmlFor={id+'-at'}>Waktu kejadian sebenarnya</Label><Input id={id+'-at'} type="datetime-local" value={value.occurredAt||''} onChange={e=>put('occurredAt',e.target.value)}/></div>
   <div><Label htmlFor={id+'-paper'}>Nomor berkas / revisi</Label><Input id={id+'-paper'} value={value.paperNumber||''} onChange={e=>put('paperNumber',e.target.value)} placeholder="Nomor lembar fisik"/></div>
   {recipient&&<><div><Label htmlFor={id+'-recipient'}>Nama penerima klien</Label><Input id={id+'-recipient'} value={value.recipientName||''} onChange={e=>put('recipientName',e.target.value)}/></div><div><Label htmlFor={id+'-reason'}>Alasan penolakan / selisih</Label><Input id={id+'-reason'} value={value.rejectionReason||''} onChange={e=>put('rejectionReason',e.target.value)}/></div></>}
  </div>
  {recipient&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={!!value.signedPaperChecked} onChange={e=>onChange({...value,signedPaperChecked:e.target.checked})}/>Saya sudah memeriksa surat jalan / berita acara bertanda tangan pada berkas ini.</label>}
  <ReceiptUpload currentFile={value.paperProof||''} onFileSelect={url=>put('paperProof',url)} label={photoOptional?"Foto / scan berkas asli (opsional)":"Foto / scan berkas asli"}/>
  {photoOptional&&<p className="text-xs text-muted-foreground">Foto boleh dikosongkan. Wajib diisi: pelaksana fisik, waktu kejadian, dan nomor berkas.</p>}
  <p className="text-xs text-muted-foreground">Nama dan waktu pengetik disimpan terpisah secara otomatis.</p>
 </fieldset>;
}

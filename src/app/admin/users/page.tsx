'use client'
import {useRef,useState} from 'react'
import {useSearchParams} from 'next/navigation'
import {v4 as uuidv4} from 'uuid'
import {useAppStore} from '@/lib/store'
import {getNavItemsForUser} from '@/lib/navigation'
import type {Role,User} from '@/types'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter} from '@/components/ui/dialog'
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs'
import {toast} from 'sonner'

const LOGIN_ROLES:Role[]=['admin_po','finance','super_admin']
const LABELS:Partial<Record<Role,string>>={admin_po:'Admin PO',finance:'Admin Finance',super_admin:'Super Admin',sourcing:'Petugas belanja (tanpa login)',gudang:'Petugas QC / gudang (tanpa login)',kurir:'Kurir (tanpa login)'}
export default function UserManagementPage(){
 const users=useAppStore(s=>s.users),currentUser=useAppStore(s=>s.currentUser),addUser=useAppStore(s=>s.addUser),updateUser=useAppStore(s=>s.updateUser)
 const query=useSearchParams()
 const [tab,setTab]=useState(query.get('tab')==='roles'?'roles':'users')
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[editing,setEditing]=useState<User|null>(null)
 const [name,setName]=useState(''),[role,setRole]=useState<Role>('admin_po'),[pin,setPin]=useState(''),[active,setActive]=useState(true)
 const pending=useRef(false),newId=useRef('')
 const edit=(user?:User)=>{setEditing(user||null);setName(user?.name||'');setRole(user?.role||'admin_po');setActive(user?.isActive!==false);setPin('');newId.current=uuidv4();setOpen(true)}
 const save=async()=>{
  if(pending.current)return
  const login=LOGIN_ROLES.includes(role),promoting=editing&&!LOGIN_ROLES.includes(editing.role)&&login
  if(!name.trim()){toast.error('Nama wajib diisi.');return}
  if(login&&((!editing||promoting)&&!pin || pin&&!/^\d{4,6}$/.test(pin))){toast.error('Isi PIN unik empat sampai enam angka untuk akun aplikasi.');return}
  if(editing?.id===currentUser?.id&&(role!=='super_admin'||!active)){toast.error('Akun Super Admin yang sedang digunakan harus tetap aktif.');return}
  pending.current=true;setBusy(true)
  try{
   const values={name:name.trim(),role,isActive:active,...(pin?{pin}:{})}
   if(editing)await updateUser(editing.id,values)
   else await addUser({id:newId.current,...values,pin:login?pin:uuidv4()})
   setPin('');setOpen(false);toast.success('Data pengguna tersimpan. Perubahan akses berlaku pada permintaan berikutnya.')
  }catch(error){toast.error(error instanceof Error?error.message:'Pengguna gagal disimpan')}
  finally{pending.current=false;setBusy(false)}
 }
 return <div className="space-y-6">
  <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Pengguna dan akses</h1><p className="mt-2 text-sm text-muted-foreground">Tiga peran kantor dapat masuk aplikasi. Nama petugas lapangan digunakan sebagai pelaksana pada salinan kertas.</p></div><Button onClick={()=>edit()}>Tambah pengguna / petugas</Button></div>
  <Tabs value={tab} onValueChange={value=>setTab(value||'users')}><TabsList><TabsTrigger value="users">Pengguna dan petugas</TabsTrigger><TabsTrigger value="roles">Tanggung jawab akses</TabsTrigger></TabsList>
   <TabsContent value="users"><div className="overflow-x-auto rounded border"><table className="w-full text-sm"><thead><tr>{['Nama','Tugas','Akses aplikasi','Status','Tindakan'].map(label=><th key={label} className="p-3 text-left">{label}</th>)}</tr></thead><tbody>{users.map(user=><tr key={user.id} className="border-t"><td className="p-3">{user.name}</td><td className="p-3">{LABELS[user.role]||user.role}</td><td className="p-3">{LOGIN_ROLES.includes(user.role)?'Akun kantor':'Pelaksana tanpa login'}</td><td className="p-3">{user.isActive===false?'Tidak aktif':'Aktif'}</td><td className="p-3"><Button variant="outline" size="sm" onClick={()=>edit(user)}>Ubah</Button></td></tr>)}</tbody></table></div></TabsContent>
   <TabsContent value="roles"><p className="my-4 text-sm text-muted-foreground">Akses mengikuti tanggung jawab di bawah dan diperiksa server. Super Admin mengatur siapa yang memegang peran tersebut serta menonaktifkan akun. Petugas lapangan tidak membutuhkan akun untuk menyelesaikan pekerjaan.</p><div className="grid gap-4 md:grid-cols-3">{LOGIN_ROLES.map(role=><section className="rounded border p-4 space-y-3" key={role}><h2 className="font-bold">{LABELS[role]}</h2><ul className="list-disc pl-5 space-y-2 text-sm">{getNavItemsForUser([],role).map(menu=><li key={menu.key}>{menu.title}</li>)}</ul></section>)}</div></TabsContent>
  </Tabs>
  <Dialog open={open} onOpenChange={value=>{if(!busy){setOpen(value);if(!value)setPin('')}}}><DialogContent><DialogHeader><DialogTitle>{editing?'Ubah pengguna / petugas':'Tambah pengguna / petugas'}</DialogTitle></DialogHeader><div className="space-y-4">
   <label className="block space-y-2 text-sm">Nama<Input value={name} onChange={e=>setName(e.target.value)} disabled={busy}/></label>
   <label className="block space-y-2 text-sm">Tugas<select className="w-full rounded border bg-background p-2" value={role} disabled={busy||editing?.id===currentUser?.id} onChange={e=>setRole(e.target.value as Role)}>{!LABELS[role]&&<option value={role}>{role} (peran lama, tanpa login)</option>}{Object.entries(LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
   {LOGIN_ROLES.includes(role)&&<label className="block space-y-2 text-sm">{editing?'PIN baru (kosongkan untuk mempertahankan)':'PIN unik empat sampai enam angka'}<Input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={e=>setPin(e.target.value)} maxLength={6} disabled={busy}/></label>}
   <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={active} disabled={busy||editing?.id===currentUser?.id} onChange={e=>setActive(e.target.checked)}/>Aktif {LOGIN_ROLES.includes(role)?'untuk masuk aplikasi':'sebagai pilihan pelaksana'}</label>
  </div><DialogFooter><Button onClick={save} disabled={busy}>{busy?'Menyimpan…':'Simpan pengguna'}</Button></DialogFooter></DialogContent></Dialog>
 </div>
}

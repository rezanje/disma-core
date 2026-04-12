"use client"

import { useState, useEffect } from "react"
import { v4 as uuidv4 } from "uuid"
import { useAppStore } from "@/lib/store"
import { Role, User } from "@/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Shield, UserCog, AlertCircle, Plus, Edit2, Check, Users as UsersIcon } from "lucide-react"
import { toast } from "sonner"
import AuthGuard from "@/components/auth/auth-guard"

import { APP_PAGES } from "@/lib/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"

const ROLE_LABELS: Record<string, string> = {
  admin_po: "Admin PO",
  sourcing: "Tim Pasar (Sourcing)",
  gudang: "Staff Gudang",
  kurir: "Tim Logistik/Kurir",
  finance: "Tim Finance",
  ceo: "CEO",
  cmo: "CMO",
  super_admin: "Super Admin",
}

export default function UserManagementPage() {
  const users = useAppStore(state => state.users)
  const currentUser = useAppStore(state => state.currentUser)
  const updateUser = useAppStore(state => state.updateUser)
  const addUser = useAppStore(state => state.addUser)
  const rolePermissions = useAppStore(state => state.rolePermissions) || {}
  const updateRolePermissions = useAppStore(state => state.updateRolePermissions)

  const { useSearchParams } = require("next/navigation")
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")

  // State for Tabs
  const [activeTab, setActiveTab] = useState(tabParam || "users")

  useEffect(() => {
    if (tabParam) setActiveTab(tabParam)
  }, [tabParam])

  // State for Add User
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newUser, setNewUser] = useState({ name: "", role: "admin_po" as Role, id: "" })

  // State for Edit Name
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newName, setNewName] = useState("")

  // State for Role Permission Management
  const [selectedRoleForPerms, setSelectedRoleForPerms] = useState<string>("admin_po")

  const handleRoleChange = (userId: string, newRole: Role) => {
    if (userId === currentUser?.id) {
       toast.error("Gak bisa ganti role sendiri bro, nanti lo gak bisa akses panel ini lagi!")
       return
    }
    updateUser(userId, { role: newRole })
    toast.success("Role user berhasil diperbarui.")
  }

  const handleAddUser = () => {
    if (!newUser.name || !newUser.id) {
      toast.error("Nama dan ID User (Username) wajib diisi.")
      return
    }
    
    if (users.find(u => u.id === newUser.id)) {
      toast.error("ID User sudah terpakai.")
      return
    }

    addUser({
      id: uuidv4(),
      name: newUser.name,
      role: newUser.role as Role,
      pin: "1234" // Default PIN
    })
    
    setIsAddOpen(false)
    setNewUser({ name: "", role: "admin_po", id: "" })
    toast.success("User baru berhasil ditambahkan.")
  }

  const togglePermission = (role: string, pageKey: any) => {
    const currentPerms = rolePermissions[role] || []
    let newPerms: any[] = []
    
    if (currentPerms.includes(pageKey)) {
      newPerms = currentPerms.filter(k => k !== pageKey)
    } else {
      newPerms = [...currentPerms, pageKey]
    }
    
    updateRolePermissions(role, newPerms)
    toast.success(`Izin [${pageKey}] untuk role ${ROLE_LABELS[role]} telah diperbarui.`)
  }

  const startEditing = (user: User) => {
    setEditingId(user.id)
    setNewName(user.name)
  }

  const saveName = () => {
    if (editingId && newName) {
      updateUser(editingId, { name: newName })
      setEditingId(null)
      toast.success("Nama berhasil diperbarui.")
    }
  }

  // Group pages by category
  const categories = Array.from(new Set(APP_PAGES.map(p => p.category)))

  return (
    <AuthGuard allowedRoles={['ceo', 'super_admin']}>
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 -mx-4 -mt-4 p-6 border-b shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
              <UserCog className="text-emerald-600" /> User & Role Management
            </h2>
            <p className="text-slate-500 text-sm">Kelola akses, perizinan role, dan personil DISMA.</p>
          </div>
          
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger 
              render={
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-6 h-10 font-bold transition-colors">
                  <Plus className="w-4 h-4 mr-2" /> Tambah User Baru
                </Button>
              }
            />
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Tambah User Baru</DialogTitle>
                <DialogDescription>Daftarkan personil baru ke dalam sistem DISMA Core.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="id">ID User / Username</Label>
                  <Input 
                    id="id" 
                    placeholder="misal: ahmad_sourcing" 
                    value={newUser.id}
                    onChange={(e) => setNewUser({...newUser, id: e.target.value})}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="name">Nama Lengkap</Label>
                  <Input 
                    id="name" 
                    placeholder="Nama Karyawan" 
                    value={newUser.name}
                    onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="role">Role / Jabatan</Label>
                  <Select 
                    value={newUser.role} 
                    onValueChange={(val) => setNewUser({...newUser, role: val as Role})}
                  >
                    <SelectTrigger id="role">
                      <SelectValue placeholder="Pilih Role" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([role, label]) => (
                         <SelectItem key={role} value={role}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddUser} className="bg-emerald-600 hover:bg-emerald-700">Simpan User</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-slate-100 p-1 rounded-xl">
            <TabsTrigger value="users" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <UsersIcon className="w-4 h-4 mr-2" /> Daftar Pengguna
            </TabsTrigger>
            <TabsTrigger value="roles" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Shield className="w-4 h-4 mr-2" /> Otoritas Role
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 border-none shadow-md overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b">
                   <CardTitle className="text-lg">Daftar Pengguna</CardTitle>
                   <CardDescription>Total {users.length} personil terdaftar.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-100/30">
                        <TableHead>Nama Karyawan</TableHead>
                        <TableHead>Role Saat Ini</TableHead>
                        <TableHead>Kontrol</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map(user => (
                        <TableRow key={user.id}>
                          <TableCell>
                            {editingId === user.id ? (
                              <div className="flex items-center gap-2 max-w-[200px]">
                                <Input 
                                  value={newName} 
                                  onChange={(e) => setNewName(e.target.value)}
                                  className="h-8 text-xs font-bold"
                                  autoFocus 
                                />
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" onClick={saveName}>
                                   <Check className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group">
                                <div>
                                  <div className="font-bold text-slate-800 dark:text-slate-200">{user.name}</div>
                                  <div className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">{user.id}</div>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => startEditing(user)}
                                >
                                   <Edit2 className="w-3 h-3 text-slate-400" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase">
                              {ROLE_LABELS[user.role]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Select 
                              value={user.role} 
                              onValueChange={(val) => handleRoleChange(user.id, val as Role)}
                              disabled={user.id === currentUser?.id}
                            >
                              <SelectTrigger className="w-[150px] h-8 text-xs border-slate-200">
                                <SelectValue placeholder="Role" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(ROLE_LABELS).map(([role, label]) => (
                                   <SelectItem key={role} value={role} className="text-xs">
                                     {label}
                                   </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="bg-emerald-900 text-white border-none shadow-xl h-fit">
                <CardHeader>
                   <CardTitle className="text-emerald-200 flex items-center gap-2 text-sm uppercase tracking-widest">
                      <Shield className="w-4 h-4" /> Security Notice
                   </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                   <p className="text-xs leading-relaxed opacity-80">
                      Penambahan user baru akan memberikan akses langsung sesuai rolenya. 
                   </p>
                   <div className="flex items-start gap-2 p-3 bg-white/10 rounded-xl text-xs">
                      <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
                      <span>Username bersifat unik dan digunakan untuk login. Jangan berikan login sembarangan selain personil kantor.</span>
                   </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="roles" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Role Selection */}
              <Card className="border-none shadow-md overflow-hidden h-fit">
                <CardHeader className="bg-slate-50/50 border-b">
                  <CardTitle className="text-sm uppercase tracking-widest text-slate-500">Pilih Role</CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <div className="grid gap-1">
                    {Object.entries(ROLE_LABELS).map(([role, label]) => (
                      <button
                        key={role}
                        onClick={() => setSelectedRoleForPerms(role)}
                        className={cn(
                          "flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all",
                          selectedRoleForPerms === role 
                            ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" 
                            : "text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        {label}
                        {selectedRoleForPerms === role && <Check className="w-4 h-4 ml-2" />}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Permission Matrix */}
              <Card className="lg:col-span-3 border-none shadow-md overflow-hidden">
                <CardHeader className="bg-emerald-50/50 border-b flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Otoritas Akses Halaman</CardTitle>
                    <CardDescription>
                      Atur halaman apa saja yang bisa diakses oleh <span className="font-bold text-emerald-700">{ROLE_LABELS[selectedRoleForPerms]}</span>.
                    </CardDescription>
                  </div>
                  <Badge className="bg-emerald-600">
                    {rolePermissions[selectedRoleForPerms]?.length || 0} Halaman Aktif
                  </Badge>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid gap-8">
                    {categories.map(category => (
                      <div key={category} className="space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                          <div className="h-px flex-1 bg-slate-100" />
                          {category}
                          <div className="h-px flex-1 bg-slate-100" />
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {APP_PAGES.filter(p => p.category === category).map(page => {
                            const isChecked = rolePermissions[selectedRoleForPerms]?.includes(page.key)
                            return (
                              <div 
                                key={page.key} 
                                className={cn(
                                  "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none",
                                  isChecked 
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
                                    : "bg-white border-slate-100 text-slate-500 hover:border-slate-200"
                                )}
                                onClick={() => togglePermission(selectedRoleForPerms, page.key as any)}
                              >
                                <div className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                                  isChecked ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"
                                )}>
                                  {page.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-bold truncate">{page.title}</div>
                                  <div className="text-[10px] opacity-70 truncate font-mono">{page.href}</div>
                                </div>
                                <Checkbox 
                                  checked={isChecked}
                                  onCheckedChange={() => togglePermission(selectedRoleForPerms, page.key as any)}
                                  className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                                />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AuthGuard>
  )
}

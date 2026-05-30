"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah } from "@/lib/utils"
import { Lead, LeadStatus } from "@/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { 
  Target,
  Plus,
  ArrowUpRight,
  Layers,
  Search,
  Users,
  Briefcase,
  Trash2
} from "lucide-react"
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
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import AuthGuard from "@/components/auth/auth-guard"

export default function CRMPipelinePage() {
  const leads = useAppStore(state => state.leads)
  const addLead = useAppStore(state => state.addLead)
  const updateLead = useAppStore(state => state.updateLead)
  const deleteLead = useAppStore(state => state.deleteLead)
  const users = useAppStore(state => state.users)
  const currentUser = useAppStore(state => state.currentUser)
  const uniqueUsers = Array.from(new Map(users.map(u => [u.name, u])).values())

  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false)
  const initialLeadState = { 
    companyName: "", contactName: "", value: "0", status: "Lead" as LeadStatus,
    channel: "", jabatan: "", noHp: "", email: "", picDisma: currentUser?.name || "", priority: "Medium" as "High" | "Medium" | "Low", lastContact: "", nextStepContact: "", notes: ""
  }
  const [newLead, setNewLead] = useState(initialLeadState)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  const handleAddLead = () => {
    if (!newLead.companyName || !newLead.contactName) {
      toast.error("Nama Perusahaan dan Kontak wajib diisi.")
      return
    }
    
    addLead({
      id: `lead-${Date.now()}`,
      companyName: newLead.companyName,
      contactName: newLead.contactName,
      value: parseFloat(newLead.value) || 0,
      status: newLead.status,
      channel: newLead.channel,
      jabatan: newLead.jabatan,
      noHp: newLead.noHp,
      email: newLead.email,
      picDisma: newLead.picDisma,
      priority: newLead.priority,
      lastContact: newLead.lastContact,
      nextStepContact: newLead.nextStepContact,
      notes: newLead.notes,
      createdAt: new Date().toISOString()
    })
    
    setIsAddLeadOpen(false)
    setNewLead(initialLeadState)
    toast.success("Lead baru berhasil didaftarkan.")
  }

  const handleEditLead = () => {
    if (!editingLead) return
    updateLead(editingLead.id, editingLead)
    setIsEditOpen(false)
    toast.success("Lead berhasil diupdate.")
  }

  const handleStatusChange = (leadId: string, newStatus: LeadStatus) => {
     updateLead(leadId, { status: newStatus })
     toast.success("Status lead berhasil diupdate.")
  }

  const filteredLeads = leads.filter(l => 
    l.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.contactName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const pipelineValue = leads.reduce((sum, l) => sum + (l.status !== 'Deal' && l.status !== 'Repeat' && l.status !== 'Sudah Berhenti' ? l.value : 0), 0)
  const closedValue = leads.filter(l => l.status === 'Deal' || l.status === 'Repeat').reduce((sum, l) => sum + l.value, 0)
  const activeLeadsCount = leads.filter(l => l.status !== 'Deal' && l.status !== 'Repeat' && l.status !== 'Sudah Berhenti').length

  return (
    <AuthGuard allowedRoles={['ceo', 'super_admin', 'cmo']}>
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 -mx-4 -mt-4 p-6 border-b shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
              <Target className="text-rose-500" /> B2B CRM Pipeline
            </h2>
            <p className="text-slate-500 text-sm">Kelola leads dan tracking penawaran ke klien korporat.</p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Cari Lead..." 
                className="pl-9 w-[200px] h-9 text-xs rounded-xl" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Dialog open={isAddLeadOpen} onOpenChange={setIsAddLeadOpen}>
              <DialogTrigger
                render={
                  <Button className="bg-emerald-600 hover:bg-emerald-700 rounded-xl px-4 h-9 text-xs font-bold">
                    <Plus className="w-4 h-4 mr-2" /> Add New Lead
                  </Button>
                }
              />
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Mendaftarkan Lead Baru</DialogTitle>
                  <DialogDescription>Input calon klien potensial untuk tracking sales pipeline.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                  {/* Kolom Kiri */}
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="add-company">Nama Perusahaan / Klien</Label>
                      <Input id="add-company" value={newLead.companyName} onChange={e => setNewLead({...newLead, companyName: e.target.value})} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="add-contact">Nama PIC / Kontak</Label>
                      <Input id="add-contact" value={newLead.contactName} onChange={e => setNewLead({...newLead, contactName: e.target.value})} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="add-jabatan">Jabatan PIC</Label>
                      <Input id="add-jabatan" value={newLead.jabatan} onChange={e => setNewLead({...newLead, jabatan: e.target.value})} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="add-no-hp">No. HP / WhatsApp</Label>
                      <Input id="add-no-hp" value={newLead.noHp} onChange={e => setNewLead({...newLead, noHp: e.target.value})} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="add-email">Email</Label>
                      <Input id="add-email" type="email" value={newLead.email} onChange={e => setNewLead({...newLead, email: e.target.value})} />
                    </div>
                  </div>

                  {/* Kolom Kanan */}
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="add-value">Estimasi Nilai Proyek (Rp)</Label>
                      <Input id="add-value" type="number" value={newLead.value} onChange={e => setNewLead({...newLead, value: e.target.value})} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Status Awal</Label>
                      <Select value={newLead.status} onValueChange={val => setNewLead({...newLead, status: val as LeadStatus})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Lead">Lead</SelectItem>
                          <SelectItem value="Contacted">Contacted</SelectItem>
                          <SelectItem value="Meeting">Meeting</SelectItem>
                          <SelectItem value="Quotation">Quotation</SelectItem>
                          <SelectItem value="Deal">Deal</SelectItem>
                          <SelectItem value="Repeat">Repeat</SelectItem>
                          <SelectItem value="Sudah Berhenti">Sudah Berhenti</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Prioritas</Label>
                      <Select value={newLead.priority} onValueChange={val => setNewLead({...newLead, priority: val as "High"|"Medium"|"Low"})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih Prioritas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="High">High</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="Low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="add-channel">Channel (Asal Lead)</Label>
                      <Input id="add-channel" value={newLead.channel} placeholder="Misal: LinkedIn, Ref..." onChange={e => setNewLead({...newLead, channel: e.target.value})} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="add-pic-disma">PIC Disma</Label>
                      <Select value={newLead.picDisma || "none"} onValueChange={val => setNewLead({...newLead, picDisma: (val === "none" || !val) ? "" : val})}>
                        <SelectTrigger id="add-pic-disma">
                          <SelectValue placeholder="Pilih PIC Disma" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Tanpa PIC</SelectItem>
                          {uniqueUsers.map(u => (
                            <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Kolom Bawah (Full Width) */}
                  <div className="md:col-span-2 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="add-last-contact">Last Contact</Label>
                        <Input id="add-last-contact" type="date" value={newLead.lastContact} onChange={e => setNewLead({...newLead, lastContact: e.target.value})} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="add-next-step">Next Step</Label>
                        <Input id="add-next-step" value={newLead.nextStepContact} placeholder="Rencana selanjutnya..." onChange={e => setNewLead({...newLead, nextStepContact: e.target.value})} />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="add-notes">Notes Tambahan</Label>
                      <Input id="add-notes" value={newLead.notes} onChange={e => setNewLead({...newLead, notes: e.target.value})} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddLead} className="bg-emerald-600">Simpan Lead</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* CRM KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           <Card className="border-none shadow-sm bg-white dark:bg-slate-900 border-l-4 border-l-emerald-500">
              <CardContent className="p-4">
                 <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Total Pipeline Value</p>
                 <h4 className="text-xl font-black text-emerald-600">{formatRupiah(pipelineValue)}</h4>
              </CardContent>
           </Card>
           <Card className="border-none shadow-sm bg-white dark:bg-slate-900 border-l-4 border-l-emerald-500">
              <CardContent className="p-4">
                 <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Closed Deals Value</p>
                 <h4 className="text-xl font-black text-emerald-600">{formatRupiah(closedValue)}</h4>
              </CardContent>
           </Card>
           <Card className="border-none shadow-sm bg-white dark:bg-slate-900 border-l-4 border-l-rose-500">
              <CardContent className="p-4">
                 <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Active Leads</p>
                 <h4 className="text-xl font-black text-rose-600">{activeLeadsCount}</h4>
              </CardContent>
           </Card>
           <Card className="border-none shadow-sm bg-white dark:bg-slate-900 border-l-4 border-l-emerald-500">
              <CardContent className="p-4">
                 <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Growth Forecast</p>
                 <h4 className="text-xl font-black text-emerald-600">+{(pipelineValue / 5000000).toFixed(0)} Deals</h4>
              </CardContent>
           </Card>
        </div>

        {/* The Pipeline Board */}
        <div className="flex gap-4 overflow-x-auto pb-4">
          {(['Lead', 'Contacted', 'Meeting', 'Quotation', 'Deal', 'Repeat', 'Sudah Berhenti'] as LeadStatus[]).map((status) => {
             const currentLeads = filteredLeads.filter(l => l.status === status)
             return (
                <div key={status} className="space-y-3 min-w-[300px] shrink-0">
                   <div className="flex items-center justify-between px-2">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                         <Layers className="w-3 h-3" /> {status}
                         <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">{currentLeads.length}</Badge>
                      </h4>
                   </div>
                   <div className="space-y-3 min-h-[500px] p-2 rounded-3xl bg-slate-100/50 dark:bg-slate-800/30 border border-dashed border-slate-300 dark:border-slate-700">
                      {currentLeads.length === 0 ? (
                         <div className="h-40 flex flex-col items-center justify-center text-[10px] text-slate-400 italic gap-2">
                            <Briefcase className="w-6 h-6 opacity-20" />
                            No active deals
                         </div>
                      ) : (
                         currentLeads.map(lead => (
                            <Card 
                               key={lead.id} 
                               onClick={() => {
                                 setEditingLead(lead)
                                 setIsEditOpen(true)
                               }}
                               className="border-none shadow-sm hover:shadow-xl transition-all duration-300 group rounded-2xl bg-white dark:bg-slate-900 overflow-hidden cursor-pointer"
                            >
                               <div className={`h-1 w-full ${['Deal', 'Repeat'].includes(status) ? 'bg-emerald-500' : status === 'Sudah Berhenti' ? 'bg-rose-500' : 'bg-emerald-400'}`} />
                               <CardContent className="p-4">
                                  <div className="flex justify-between items-start mb-2">
                                     <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{lead.companyName}</p>
                                     <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        <Button
                                           variant="ghost"
                                           size="icon"
                                           className="w-8 h-8 rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50"
                                           onClick={() => {
                                              if (confirm("Hapus lead ini permanen?")) {
                                                 deleteLead(lead.id)
                                                 toast.success("Lead berhasil dihapus")
                                              }
                                           }}
                                        >
                                           <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                        <Select 
                                           value={lead.status} 
                                           onValueChange={(val) => handleStatusChange(lead.id, val as LeadStatus)}
                                         >
                                           <SelectTrigger className="w-8 h-8 p-0 border-none bg-slate-50 dark:bg-slate-800 shadow-none hover:bg-slate-100 rounded-full flex items-center justify-center">
                                              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                                           </SelectTrigger>
                                           <SelectContent>
                                              <SelectItem value="Lead">Lead</SelectItem>
                                              <SelectItem value="Contacted">Contacted</SelectItem>
                                              <SelectItem value="Meeting">Meeting</SelectItem>
                                              <SelectItem value="Quotation">Quotation</SelectItem>
                                              <SelectItem value="Deal">Deal</SelectItem>
                                              <SelectItem value="Repeat">Repeat</SelectItem>
                                              <SelectItem value="Sudah Berhenti">Sudah Berhenti</SelectItem>
                                           </SelectContent>
                                        </Select>
                                     </div>
                                  </div>
                                  <div className="flex flex-col gap-1.5 mb-3">
                                     <div className="flex items-center gap-1.5">
                                        <Users className="w-3 h-3 text-slate-400" />
                                        <p className="text-[10px] text-slate-500 font-medium truncate">{lead.contactName}</p>
                                     </div>
                                     {lead.picDisma && (
                                       <div className="flex items-center gap-1.5">
                                          <Target className="w-3 h-3 text-indigo-400" />
                                          <p className="text-[10px] text-indigo-500 font-bold truncate">PIC: {lead.picDisma}</p>
                                       </div>
                                     )}
                                  </div>
                                  <div className="flex items-center justify-between mt-auto">
                                     <p className="text-sm font-black text-emerald-600">{formatRupiah(lead.value)}</p>
                                     <Badge variant="outline" className="text-[8px] h-4 px-1 border-slate-200">
                                        {new Date(lead.createdAt).toLocaleDateString()}
                                     </Badge>
                                  </div>
                               </CardContent>
                            </Card>
                         ))
                      )}
                   </div>
                </div>
             )
          })}
        </div>
      </div>

      {/* Edit Lead Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail / Edit Lead</DialogTitle>
            <DialogDescription>Update informasi detail tentang lead ini.</DialogDescription>
          </DialogHeader>
          {editingLead && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
               {/* Kolom Kiri */}
               <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label>Nama Perusahaan / Klien</Label>
                    <Input value={editingLead.companyName} onChange={e => setEditingLead({...editingLead, companyName: e.target.value})} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Nama PIC / Kontak</Label>
                    <Input value={editingLead.contactName} onChange={e => setEditingLead({...editingLead, contactName: e.target.value})} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Jabatan PIC</Label>
                    <Input value={editingLead.jabatan || ""} onChange={e => setEditingLead({...editingLead, jabatan: e.target.value})} />
                  </div>
                  <div className="grid gap-2">
                    <Label>No. HP / WhatsApp</Label>
                    <Input value={editingLead.noHp || ""} onChange={e => setEditingLead({...editingLead, noHp: e.target.value})} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Email</Label>
                    <Input type="email" value={editingLead.email || ""} onChange={e => setEditingLead({...editingLead, email: e.target.value})} />
                  </div>
               </div>
               
               {/* Kolom Kanan */}
               <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label>Estimasi Nilai Proyek (Rp)</Label>
                    <Input type="number" value={editingLead.value} onChange={e => setEditingLead({...editingLead, value: parseFloat(e.target.value) || 0})} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Status</Label>
                    <Select value={editingLead.status} onValueChange={val => setEditingLead({...editingLead, status: val as LeadStatus})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Lead">Lead</SelectItem>
                        <SelectItem value="Contacted">Contacted</SelectItem>
                        <SelectItem value="Meeting">Meeting</SelectItem>
                        <SelectItem value="Quotation">Quotation</SelectItem>
                        <SelectItem value="Deal">Deal</SelectItem>
                        <SelectItem value="Repeat">Repeat</SelectItem>
                        <SelectItem value="Sudah Berhenti">Sudah Berhenti</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Prioritas</Label>
                    <Select value={editingLead.priority || "Medium"} onValueChange={val => setEditingLead({...editingLead, priority: val as "High"|"Medium"|"Low"})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Prioritas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Channel (Asal Lead)</Label>
                    <Input value={editingLead.channel || ""} placeholder="Misal: LinkedIn, Ref..." onChange={e => setEditingLead({...editingLead, channel: e.target.value})} />
                  </div>
                  <div className="grid gap-2">
                    <Label>PIC Disma</Label>
                    <Select value={editingLead.picDisma || "none"} onValueChange={val => setEditingLead({...editingLead, picDisma: (val === "none" || !val) ? undefined : val})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih PIC Disma" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Tanpa PIC</SelectItem>
                        {uniqueUsers.map(u => (
                          <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                        ))}
                        {editingLead.picDisma && !uniqueUsers.some(u => u.name === editingLead.picDisma) && (
                          <SelectItem value={editingLead.picDisma}>{editingLead.picDisma}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
               </div>
               
               {/* Kolom Bawah (Full Width) */}
               <div className="md:col-span-2 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Last Contact</Label>
                      <Input type="date" value={editingLead.lastContact || ""} onChange={e => setEditingLead({...editingLead, lastContact: e.target.value})} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Next Step</Label>
                      <Input value={editingLead.nextStepContact || ""} placeholder="Rencana selanjutnya..." onChange={e => setEditingLead({...editingLead, nextStepContact: e.target.value})} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Notes Tambahan</Label>
                    <Input value={editingLead.notes || ""} onChange={e => setEditingLead({...editingLead, notes: e.target.value})} />
                  </div>
               </div>
             </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Batal</Button>
            <Button onClick={handleEditLead} className="bg-emerald-600">Simpan Perubahan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AuthGuard>
  )
}

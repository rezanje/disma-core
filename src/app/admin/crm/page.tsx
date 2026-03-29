"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah } from "@/lib/utils"
import { LeadStatus } from "@/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { 
  Target,
  Plus,
  ArrowUpRight,
  Layers,
  Search,
  Users,
  Briefcase
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

  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false)
  const [newLead, setNewLead] = useState({ companyName: "", contactName: "", value: "0", status: "Lead" as LeadStatus })
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
      value: parseFloat(newLead.value),
      status: newLead.status,
      createdAt: new Date().toISOString()
    })
    
    setIsAddLeadOpen(false)
    setNewLead({ companyName: "", contactName: "", value: "0", status: "Lead" })
    toast.success("Lead baru berhasil didaftarkan.")
  }

  const handleStatusChange = (leadId: string, newStatus: LeadStatus) => {
     updateLead(leadId, { status: newStatus })
     toast.success("Status lead berhasil diupdate.")
  }

  const filteredLeads = leads.filter(l => 
    l.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.contactName.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const pipelineValue = leads.reduce((sum, l) => sum + (l.status !== 'Closed' ? l.value : 0), 0)
  const closedValue = leads.filter(l => l.status === 'Closed').reduce((sum, l) => sum + l.value, 0)

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
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Mendaftarkan Lead Baru</DialogTitle>
                  <DialogDescription>Input calon klien potensial untuk tracking sales pipeline.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="company">Nama Perusahaan / Klien</Label>
                    <Input id="company" value={newLead.companyName} onChange={e => setNewLead({...newLead, companyName: e.target.value})} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="contact">Nama PIC / Kontak</Label>
                    <Input id="contact" value={newLead.contactName} onChange={e => setNewLead({...newLead, contactName: e.target.value})} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="value">Estimasi Nilai Proyek (Rp)</Label>
                    <Input id="value" type="number" value={newLead.value} onChange={e => setNewLead({...newLead, value: e.target.value})} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Status Awal</Label>
                    <Select value={newLead.status} onValueChange={val => setNewLead({...newLead, status: val as LeadStatus})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Lead">Lead Terdeteksi</SelectItem>
                        <SelectItem value="Meeting">Jadwal Meeting</SelectItem>
                        <SelectItem value="Quotation">Penawaran Dikirim</SelectItem>
                      </SelectContent>
                    </Select>
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
                 <h4 className="text-xl font-black text-rose-600">{leads.filter(l => l.status !== 'Closed').length}</h4>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {['Lead', 'Meeting', 'Quotation', 'Closed'].map((status) => {
             const currentLeads = filteredLeads.filter(l => l.status === status)
             return (
                <div key={status} className="space-y-3">
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
                            <Card key={lead.id} className="border-none shadow-sm hover:shadow-xl transition-all duration-300 group rounded-2xl bg-white dark:bg-slate-900 overflow-hidden">
                               <div className={`h-1 w-full ${status === 'Closed' ? 'bg-emerald-500' : 'bg-emerald-400'}`} />
                               <CardContent className="p-4">
                                  <div className="flex justify-between items-start mb-2">
                                     <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{lead.companyName}</p>
                                     <Select 
                                        value={lead.status} 
                                        onValueChange={(val) => handleStatusChange(lead.id, val as LeadStatus)}
                                      >
                                        <SelectTrigger className="w-8 h-8 p-0 border-none bg-slate-50 dark:bg-slate-800 shadow-none hover:bg-slate-100 rounded-full flex items-center justify-center">
                                           <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                                        </SelectTrigger>
                                        <SelectContent>
                                           <SelectItem value="Lead">Move to Lead</SelectItem>
                                           <SelectItem value="Meeting">Move to Meeting</SelectItem>
                                           <SelectItem value="Quotation">Move to Quotation</SelectItem>
                                           <SelectItem value="Closed">Mark as Closed/Deal</SelectItem>
                                        </SelectContent>
                                     </Select>
                                  </div>
                                  <div className="flex items-center gap-1.5 mb-3">
                                     <Users className="w-3 h-3 text-slate-400" />
                                     <p className="text-[10px] text-slate-500 font-medium truncate">{lead.contactName}</p>
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
    </AuthGuard>
  )
}

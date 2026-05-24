"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { Plus, Pencil, Trash2, Share2, DollarSign, Receipt, TrendingUp, History, FileText, Download, Upload, Eye, Search, Filter, Printer, Mail, ChevronRight, ChevronDown, CheckCircle2, X, Loader2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import { v4 as uuidv4 } from "uuid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn, formatRupiah } from "@/lib/utils"
import { format } from "date-fns"
import { generateInvoicePDF, generateTukarFakturBundle } from "@/lib/pdf"
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import UniversalPDFPreview from "@/components/finance/UniversalPDFPreview"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Client, SalesOrder, SalesOrderItem, Invoice, Product, Purchase, PurchaseItem } from "@/types"

export default function ClientsPage() {
  const clients: Client[] = useAppStore(state => state.clients)
  const addClient = useAppStore(state => state.addClient)
  const updateClient = useAppStore(state => state.updateClient)
  const updateMultipleClients = useAppStore(state => state.updateMultipleClients)
  const salesOrders: SalesOrder[] = useAppStore(state => state.salesOrders)
  const salesOrderItems: SalesOrderItem[] = useAppStore(state => state.salesOrderItems)
  const invoices: Invoice[] = useAppStore(state => state.invoices)
  const products: Product[] = useAppStore(state => state.products)
  const purchases: Purchase[] = useAppStore(state => state.purchases)
  const purchaseItems: PurchaseItem[] = useAppStore(state => state.purchaseItems)
  
  const [isOpen, setIsOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [pdfPreview, setPdfPreview] = useState<{ url: string, title: string } | null>(null)
  const [invoicePreview, setInvoicePreview] = useState<{ id: string, isConsolidated: boolean } | null>(null)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<"companyName" | "picName" | "totalRevenue" | "outstandingAR" | "nearestDue" | "health">("companyName")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [filterDebt, setFilterDebt] = useState<"all" | "has_debt">("all")
  const [isSaving, setIsSaving] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [selectedHistoryClient, setSelectedHistoryClient] = useState<Client | null>(null)
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [bulkParentId, setBulkParentId] = useState<string>("")
  
  const selectedClient = clients.find(c => c.id === selectedClientId)
  
  const [formData, setFormData] = useState({
    companyName: "",
    picName: "",
    email: "",
    phone: "",
    address: "",
    paymentTermDays: 30,
    isBrand: false,
    parentId: ""
  })

  const resetForm = () => {
    setFormData({ 
      companyName: "", 
      picName: "", 
      email: "", 
      phone: "", 
      address: "", 
      paymentTermDays: 30,
      isBrand: false,
      parentId: ""
    })
    setEditingClient(null)
  }

  const handleEdit = (client: Client) => {
    setEditingClient(client)
    setFormData({
      companyName: client.companyName,
      picName: client.picName,
      email: client.email || "",
      phone: client.phone,
      address: client.address,
      paymentTermDays: client.paymentTermDays,
      isBrand: client.isBrand || false,
      parentId: client.parentId || ""
    })
    setIsOpen(true)
  }

  const handleSave = async () => {
    console.log("[Clients] Attempting to save client:", formData)
    if (!formData.companyName || !formData.picName) {
      toast.error("Company name and PIC are required")
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        companyName: formData.companyName,
        picName: formData.picName,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        paymentTermDays: formData.paymentTermDays,
        isBrand: formData.isBrand,
        parentId: formData.parentId || null
      }
      if (editingClient) {
        await updateClient(editingClient.id, payload)
        toast.success("Client updated successfully")
      } else {
        await addClient({
          id: uuidv4(),
          ...payload,
          createdAt: new Date().toISOString()
        })
        toast.success("Client added successfully")
      }

      setIsOpen(false)
      resetForm()
    } catch (err: any) {
      console.error("[Clients] Save failed:", err)
      toast.error("Gagal menyimpan client: " + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const getClientOutstandingARSingle = (cId: string): number => {
    const clientInvoices = invoices.filter(inv => inv.clientId === cId)
    const consolidatedSOIds = new Set(
      clientInvoices
        .filter((inv: any) => inv.isConsolidated && inv.salesOrderIds?.length > 0)
        .flatMap((inv: any) => inv.salesOrderIds)
    )
    const activeInvoices = clientInvoices.filter((inv: Invoice) => {
      if ((inv as any).supersededByInvoiceId) return false
      if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !(inv as any).isConsolidated) return false
      return true
    })
    return activeInvoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0)
  }

  const getClientOutstandingAR = (clientId: string): number => {
    const client = clients.find(c => c.id === clientId)
    if (!client) return 0
    if (client.isBrand) {
      const branches = clients.filter(c => c.parentId === clientId)
      const selfAR = getClientOutstandingARSingle(clientId)
      const branchesAR = branches.reduce((sum, b) => sum + getClientOutstandingARSingle(b.id), 0)
      return selfAR + branchesAR
    }
    return getClientOutstandingARSingle(clientId)
  }

  const getClientLifetimeRevenueSingle = (cId: string): number => {
    const client = clients.find(c => c.id === cId)
    if (!client) return 0
    const totalJanMay = client.totalOrderJanMay || 0
    const clientInvoices = invoices.filter(inv => inv.clientId === cId)
    const consolidatedSOIds = new Set(
      clientInvoices
        .filter((inv: any) => inv.isConsolidated && inv.salesOrderIds?.length > 0)
        .flatMap((inv: any) => inv.salesOrderIds)
    )
    const activeInvoices = clientInvoices.filter((inv: Invoice) => {
      if ((inv as any).supersededByInvoiceId) return false
      if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !(inv as any).isConsolidated) return false
      return true
    })
    const activeNonImported = activeInvoices.filter(inv => !inv.id.startsWith('inv-import-'))
    return totalJanMay + activeNonImported.reduce((sum, inv) => sum + inv.totalAmount, 0)
  }

  const getClientLifetimeRevenue = (clientId: string): number => {
    const client = clients.find(c => c.id === clientId)
    if (!client) return 0
    if (client.isBrand) {
      const branches = clients.filter(c => c.parentId === clientId)
      const selfRev = getClientLifetimeRevenueSingle(clientId)
      const branchesRev = branches.reduce((sum, b) => sum + getClientLifetimeRevenueSingle(b.id), 0)
      return selfRev + branchesRev
    }
    return getClientLifetimeRevenueSingle(clientId)
  }

  const getClientHealthSingle = (cId: string) => {
    const clientInvoices = invoices.filter(inv => inv.clientId === cId)
    const consolidatedSOIds = new Set(
      clientInvoices
        .filter((inv: any) => inv.isConsolidated && inv.salesOrderIds?.length > 0)
        .flatMap((inv: any) => inv.salesOrderIds)
    )
    const activeInvoices = clientInvoices.filter((inv: Invoice) => {
      if ((inv as any).supersededByInvoiceId) return false
      if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !(inv as any).isConsolidated) return false
      return true
    })
    const now = new Date()
    
    const overdue = activeInvoices.some(inv => inv.status !== 'Paid' && new Date(inv.dueDate) < now)
    if (overdue) return { label: 'Overdue', color: 'bg-rose-100 text-rose-700 border-rose-200', icon: '🔴', rank: 3 }
    
    const hasBeenLate = activeInvoices.some(inv => inv.status === 'Paid' && inv.paidDate && new Date(inv.paidDate) > new Date(inv.dueDate))
    if (hasBeenLate) return { label: 'Late', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: '🟡', rank: 2 }
    
    return { label: 'Good', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: '🟢', rank: 1 }
  }

  const getClientHealth = (clientId: string) => {
    const client = clients.find(c => c.id === clientId)
    if (!client) return { label: 'Good', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: '🟢', rank: 1 }
    if (client.isBrand) {
      const branches = clients.filter(c => c.parentId === clientId)
      const selfHealth = getClientHealthSingle(clientId)
      const branchHealths = branches.map(b => getClientHealthSingle(b.id))
      const allHealths = [selfHealth, ...branchHealths]
      const worstHealth = allHealths.sort((a, b) => b.rank - a.rank)[0]
      return worstHealth
    }
    return getClientHealthSingle(clientId)
  }

  const getNearestDueDateSingle = (cId: string) => {
    const clientInvoices = invoices.filter(inv => inv.clientId === cId)
    const consolidatedSOIds = new Set(
      clientInvoices
        .filter((inv: any) => inv.isConsolidated && inv.salesOrderIds?.length > 0)
        .flatMap((inv: any) => inv.salesOrderIds)
    )
    const activeInvoices = clientInvoices.filter((inv: Invoice) => {
      if ((inv as any).supersededByInvoiceId) return false
      if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !(inv as any).isConsolidated) return false
      return true
    })
    const unpaid = activeInvoices.filter(inv => inv.status !== 'Paid')
    if (unpaid.length === 0) return null
    const sorted = [...unpaid].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    return new Date(sorted[0].dueDate)
  }

  const getNearestDueDate = (clientId: string) => {
    const client = clients.find(c => c.id === clientId)
    if (!client) return null
    if (client.isBrand) {
      const branches = clients.filter(c => c.parentId === clientId)
      const selfDue = getNearestDueDateSingle(clientId)
      const branchDues = branches.map(b => getNearestDueDateSingle(b.id)).filter((d): d is Date => d !== null)
      const allDues = [selfDue, ...branchDues].filter((d): d is Date => d !== null)
      if (allDues.length === 0) return null
      allDues.sort((a, b) => a.getTime() - b.getTime())
      return allDues[0]
    }
    return getNearestDueDateSingle(clientId)
  }

  // ENHANCED FILTERING/SORTING LOGIC
  const processedClients = clients
    .filter(client => {
      const matchesSearch = client.companyName.toLowerCase().includes(search.toLowerCase()) || 
                           client.picName.toLowerCase().includes(search.toLowerCase())
      
      const totalDebt = getClientOutstandingAR(client.id)
      const matchesDebt = filterDebt === "all" || totalDebt > 0
      
      return matchesSearch && matchesDebt
    })
    .sort((a, b) => {
      const getHealthRank = (clientId: string) => {
        const label = getClientHealth(clientId).label
        if (label === 'Overdue') return 3
        if (label === 'Late') return 2
        if (label === 'Good') return 1
        return 0
      }

      let comparison = 0
      if (sortField === "companyName") {
        comparison = a.companyName.localeCompare(b.companyName)
      } else if (sortField === "picName") {
        comparison = a.picName.localeCompare(b.picName)
      } else if (sortField === "totalRevenue") {
        comparison = getClientLifetimeRevenue(a.id) - getClientLifetimeRevenue(b.id)
      } else if (sortField === "outstandingAR") {
        comparison = getClientOutstandingAR(a.id) - getClientOutstandingAR(b.id)
      } else if (sortField === "nearestDue") {
        const dateA = getNearestDueDate(a.id)
        const dateB = getNearestDueDate(b.id)
        if (!dateA && !dateB) comparison = 0
        else if (!dateA) comparison = 1
        else if (!dateB) comparison = -1
        else comparison = dateA.getTime() - dateB.getTime()
      } else if (sortField === "health") {
        comparison = getHealthRank(a.id) - getHealthRank(b.id)
      }

      return sortDirection === "asc" ? comparison : -comparison
    })

  // Toggle selection helpers for bulk assignment
  const toggleSelectClient = (id: string) => {
    setSelectedClientIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const allSelected = processedClients.length > 0 && processedClients.every(c => selectedClientIds.includes(c.id))

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedClientIds(prev => prev.filter(id => !processedClients.some(c => c.id === id)))
    } else {
      const newIds = [...selectedClientIds]
      processedClients.forEach(c => {
        if (!newIds.includes(c.id)) newIds.push(c.id)
      })
      setSelectedClientIds(newIds)
    }
  }

  const handleBulkAssignBrand = async () => {
    if (selectedClientIds.length === 0) {
      toast.error("Pilih setidaknya satu client")
      return
    }

    const targetParentId = (!bulkParentId || bulkParentId === "none") ? null : bulkParentId

    // Check if parent client is itself selected (cannot be its own child)
    if (targetParentId && selectedClientIds.includes(targetParentId)) {
      toast.error("Induk Brand tidak boleh termasuk dalam daftar client yang dipilih!")
      return
    }

    const updates = selectedClientIds.map(id => ({
      id,
      data: {
        parentId: targetParentId
      }
    }))

    const loadingToast = toast.loading(`Menghubungkan ${selectedClientIds.length} client ke Brand...`)
    try {
      await updateMultipleClients(updates)
      toast.success(`Berhasil memperbarui ${selectedClientIds.length} client.`, { id: loadingToast })
      setSelectedClientIds([])
      setBulkParentId("")
    } catch (e) {
      console.error(e)
      toast.error("Gagal melakukan pembaruan massal", { id: loadingToast })
    }
  }

  const handleSort = (field: "companyName" | "picName" | "totalRevenue" | "outstandingAR" | "nearestDue" | "health") => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      if (field === "totalRevenue" || field === "outstandingAR" || field === "health") {
        setSortDirection("desc")
      } else {
        setSortDirection("asc")
      }
    }
  }

  const renderSortHeader = (
    field: "companyName" | "picName" | "totalRevenue" | "outstandingAR" | "nearestDue" | "health", 
    label: string, 
    align: "left" | "center" | "right" = "left"
  ) => {
    const isActive = sortField === field
    return (
      <TableHead 
        className={cn(
          "h-auto py-6 select-none cursor-pointer hover:bg-slate-100/50 transition-colors font-black text-[10px] uppercase tracking-widest",
          align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
          isActive ? "text-emerald-600" : "text-slate-400",
          field === "companyName" ? "pl-4" : ""
        )}
        onClick={() => handleSort(field)}
      >
        <div className={cn(
          "flex items-center gap-1.5",
          align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"
        )}>
          <span>{label}</span>
          <span className="shrink-0 transition-all duration-200">
            {isActive ? (
              sortDirection === "asc" ? (
                <ArrowUp className="w-3.5 h-3.5" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5" />
              )
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
            )}
          </span>
        </div>
      </TableHead>
    )
  }

  if (selectedClient) {
    const brandBranches = selectedClient.isBrand ? clients.filter(c => c.parentId === selectedClient.id) : []
    const branchIds = brandBranches.map(b => b.id)

    const clientInvoices = invoices.filter(inv => inv.clientId === selectedClient.id || branchIds.includes(inv.clientId))
    const clientOrders = salesOrders.filter(so => so.clientId === selectedClient.id || branchIds.includes(so.clientId))
    const totalLifetimeRevenue = getClientLifetimeRevenue(selectedClient.id)
    const totalOutstanding = getClientOutstandingAR(selectedClient.id)
    const nearestDue = getNearestDueDate(selectedClient.id)
    
    const paidInvoices = clientInvoices.filter(inv => inv.status === 'Paid' && inv.paidDate)
    const avgDaysToPay = paidInvoices.length > 0 
      ? Math.round(paidInvoices.reduce((sum, inv) => {
          const days = (new Date(inv.paidDate!).getTime() - new Date(inv.issueDate).getTime()) / (1000 * 60 * 60 * 24)
          return sum + days
        }, 0) / paidInvoices.length)
      : selectedClient.paymentTermDays

    const tabsList = ['Profile']
    if (selectedClient.isBrand) {
      tabsList.push('Cabang / Outlets')
    }
    tabsList.push('Purchase Orders', 'Invoices', 'Payment History', 'Notes')

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" className="rounded-full font-bold hover:bg-slate-100" onClick={() => setSelectedClientId(null)}>
             <ChevronRight className="rotate-180 mr-2 h-4 w-4" /> Kembali ke Daftar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full h-10 font-bold border-slate-200" onClick={() => handleEdit(selectedClient)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit Profil
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="liquid-card border-none bg-slate-900 text-white shadow-xl">
            <CardContent className="p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Lifetime Revenue</p>
              <h3 className="text-2xl font-black">{formatRupiah(totalLifetimeRevenue)}</h3>
            </CardContent>
          </Card>
          <Card className="liquid-card border-none shadow-xl">
            <CardContent className="p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Active Outstanding</p>
              <h3 className="text-2xl font-black text-rose-600">{formatRupiah(totalOutstanding)}</h3>
            </CardContent>
          </Card>
          <Card className="liquid-card border-none shadow-xl">
            <CardContent className="p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Jatuh Tempo Terdekat</p>
              <h3 className="text-lg font-black">{nearestDue ? format(nearestDue, 'dd MMM yyyy') : '-'}</h3>
            </CardContent>
          </Card>
          <Card className="liquid-card border-none shadow-xl">
            <CardContent className="p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Avg Payment Cycle</p>
              <h3 className="text-2xl font-black text-emerald-600">{avgDaysToPay} Hari</h3>
            </CardContent>
          </Card>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden min-h-[600px] flex flex-col border border-slate-100">
          <div className="p-8 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-2xl border border-slate-100">
                {getClientHealth(selectedClient.id).icon}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-2xl font-black tracking-tight text-slate-900">{selectedClient.companyName}</h2>
                  {selectedClient.isBrand && (
                    <Badge className="bg-indigo-100 hover:bg-indigo-100 border-none text-indigo-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow-sm">
                      🏢 Brand / Group
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                   <Badge className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-full border shadow-sm", getClientHealth(selectedClient.id).color)}>
                     {getClientHealth(selectedClient.id).label}
                   </Badge>
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client ID: {selectedClient.id.substring(0,8)}</span>
                   {selectedClient.parentId && (
                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                       • Cabang dari: {clients.find(c => c.id === selectedClient.parentId)?.companyName || 'Unknown'}
                     </span>
                   )}
                </div>
              </div>
            </div>
          </div>

          <Tabs defaultValue="profile" className="flex-1 flex flex-col">
            <div className="px-8 border-b border-slate-100 flex justify-center bg-white">
               <TabsList className="bg-transparent h-16 gap-8">
                  {tabsList.map(tab => (
                    <TabsTrigger 
                      key={tab} 
                      value={tab.toLowerCase().replace(/[^a-z0-9]+/g, '-')} 
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:text-emerald-600 font-black uppercase text-[10px] tracking-[0.2em] px-0 h-full transition-all"
                    >
                      {tab}
                    </TabsTrigger>
                  ))}
               </TabsList>
            </div>

            <TabsContent value="profile" className="p-8 flex-1">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Contact Information</h4>
                      <div className="space-y-4">
                        <div className="flex justify-between border-b border-slate-50 pb-2">
                           <span className="text-sm font-bold text-slate-500">PIC Name</span>
                           <span className="text-sm font-black text-slate-900">{selectedClient.picName}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-50 pb-2">
                           <span className="text-sm font-bold text-slate-500">Email Address</span>
                           <span className="text-sm font-black text-slate-900">{selectedClient.email || '-'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-50 pb-2">
                           <span className="text-sm font-bold text-slate-500">Phone Number</span>
                           <span className="text-sm font-black text-slate-900">{selectedClient.phone || '-'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Billing Address</h4>
                      <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 text-sm font-bold text-slate-600 leading-relaxed">
                        {selectedClient.address}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Account Settings</h4>
                      <div className="space-y-4">
                        <div className="flex justify-between border-b border-slate-50 pb-2">
                           <span className="text-sm font-bold text-slate-500">Payment Terms</span>
                           <span className="text-sm font-black text-emerald-600">{selectedClient.paymentTermDays} Days</span>
                        </div>
                        {selectedClient.isBrand && (
                          <div className="flex justify-between border-b border-slate-50 pb-2">
                             <span className="text-sm font-bold text-slate-500">Tipe Akun</span>
                             <span className="text-sm font-black text-indigo-600">BRAND INDUK / GROUP</span>
                          </div>
                        )}
                        {selectedClient.parentId && (
                          <div className="flex justify-between border-b border-slate-50 pb-2">
                             <span className="text-sm font-bold text-slate-500">Brand Induk</span>
                             <button 
                               onClick={() => setSelectedClientId(selectedClient.parentId!)}
                               className="text-sm font-black text-indigo-600 hover:underline text-left"
                             >
                               {clients.find(c => c.id === selectedClient.parentId)?.companyName || 'Unknown'}
                             </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
               </div>
            </TabsContent>
            
            {selectedClient.isBrand && (
              <TabsContent value="cabang-outlets" className="p-0 flex-1">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-black text-[10px] uppercase pl-8 py-4">Nama Outlet</TableHead>
                      <TableHead className="font-black text-[10px] uppercase">PIC</TableHead>
                      <TableHead className="font-black text-[10px] uppercase">No Telp</TableHead>
                      <TableHead className="font-black text-[10px] uppercase text-right">Outstanding AR</TableHead>
                      <TableHead className="font-black text-[10px] uppercase text-right">Lifetime Revenue</TableHead>
                      <TableHead className="font-black text-[10px] uppercase text-center">Status / Health</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {brandBranches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-slate-400 italic">
                          Belum ada outlet yang terhubung.
                        </TableCell>
                      </TableRow>
                    ) : (
                      brandBranches.map(branch => {
                        const branchAR = getClientOutstandingARSingle(branch.id)
                        const branchRev = getClientLifetimeRevenueSingle(branch.id)
                        const branchHealth = getClientHealthSingle(branch.id)
                        return (
                          <TableRow 
                            key={branch.id} 
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                            onClick={() => setSelectedClientId(branch.id)}
                          >
                            <TableCell className="pl-8 py-5 font-black text-slate-900 text-xs hover:underline">
                              {branch.companyName}
                            </TableCell>
                            <TableCell className="text-xs font-bold text-slate-600">{branch.picName}</TableCell>
                            <TableCell className="text-xs font-bold text-slate-600">{branch.phone || '-'}</TableCell>
                            <TableCell className="text-right">
                              <span className={cn("font-black", branchAR > 0 ? "text-rose-600" : "text-emerald-600")}>
                                {formatRupiah(branchAR)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-black text-slate-900">{formatRupiah(branchRev)}</TableCell>
                            <TableCell className="text-center">
                              <Badge className={cn("text-[9px] font-black uppercase rounded-full px-2 py-0.5 border shadow-sm", branchHealth.color)}>
                                {branchHealth.label}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
            )}
            
            <TabsContent value="purchase-orders" className="p-0 flex-1">
               <Table>
                 <TableHeader className="bg-slate-50">
                    <TableRow>
                       <TableHead className="font-black text-[10px] uppercase pl-8 py-4">PO Number</TableHead>
                       <TableHead className="font-black text-[10px] uppercase">Order Date</TableHead>
                       <TableHead className="font-black text-[10px] uppercase">Target Delivery</TableHead>
                       <TableHead className="font-black text-[10px] uppercase text-right">Value</TableHead>
                       <TableHead className="font-black text-[10px] uppercase text-center">Status</TableHead>
                    </TableRow>
                 </TableHeader>
                 <TableBody>
                    {clientOrders.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="h-32 text-center text-slate-400 italic">No PO history found.</TableCell></TableRow>
                    ) : (
                      clientOrders.sort((a,b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()).map(so => {
                         const items = salesOrderItems.filter(item => item.salesOrderId === so.id)
                         const total = items.reduce((sum, item) => sum + item.subtotal, 0)
                         
                         // Determine Financial Status
                         const relatedInvoice = invoices.find(inv => 
                           inv.salesOrderId === so.id || (inv.salesOrderIds && inv.salesOrderIds.includes(so.id))
                         )
                         
                         let finStatus = { label: 'Belum Terbit', color: 'bg-slate-100 text-slate-500 border-slate-200' }
                         if (so.status === 'Batal') {
                           finStatus = { label: 'Batal', color: 'bg-rose-100 text-rose-800 border-rose-200' }
                         } else if (relatedInvoice) {
                            if (relatedInvoice.status === 'Paid') {
                              finStatus = { label: 'Lunas', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
                            } else {
                              finStatus = { label: 'Outstanding', color: 'bg-amber-100 text-amber-800 border-amber-200' }
                            }
                         }

                         return (
                           <TableRow key={so.id} className="hover:bg-slate-50 transition-colors">
                              <TableCell className="pl-8 py-5 text-xs">
                                <div className="flex flex-col">
                                  <span className="font-black text-slate-900">{so.poNumber}</span>
                                  {selectedClient.isBrand && so.clientId !== selectedClient.id && (
                                    <span className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                                      Outlet: {clients.find(c => c.id === so.clientId)?.companyName || 'Unknown'}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs font-bold text-slate-600">{format(new Date(so.orderDate), 'dd MMM yyyy')}</TableCell>
                              <TableCell className="text-xs font-bold text-slate-600">{format(new Date(so.targetDeliveryDate), 'dd MMM yyyy')}</TableCell>
                              <TableCell className="text-right font-black text-slate-900">{formatRupiah(total)}</TableCell>
                              <TableCell className="text-center">
                                 <div className="flex flex-col items-center gap-1">
                                    <Badge className={cn("text-[9px] font-black uppercase rounded-full px-2 py-0.5 border shadow-sm", finStatus.color)}>
                                      {finStatus.label}
                                    </Badge>
                                    {so.status !== 'Terkirim' && so.status !== 'Selesai' && so.status !== 'Batal' && (
                                       <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Status: {so.status}</span>
                                    )}
                                 </div>
                              </TableCell>
                           </TableRow>
                         )
                      })
                    )}
                 </TableBody>
               </Table>
            </TabsContent>

            <TabsContent value="invoices" className="p-0 flex-1">
               <Table>
                 <TableHeader className="bg-slate-50">
                    <TableRow>
                       <TableHead className="font-black text-[10px] uppercase pl-8 py-4">Invoice ID</TableHead>
                       <TableHead className="font-black text-[10px] uppercase">Issue Date</TableHead>
                       <TableHead className="font-black text-[10px] uppercase">Due Date</TableHead>
                       <TableHead className="font-black text-[10px] uppercase text-right">Total</TableHead>
                       <TableHead className="font-black text-[10px] uppercase text-right">Remaining</TableHead>
                       <TableHead className="font-black text-[10px] uppercase text-center">Status</TableHead>
                    </TableRow>
                 </TableHeader>
                 <TableBody>
                    {clientInvoices.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="h-32 text-center text-slate-400 italic">No invoices found.</TableCell></TableRow>
                    ) : (
                      clientInvoices.sort((a,b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime()).map(inv => (
                        <TableRow key={inv.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setInvoicePreview({ id: inv.id, isConsolidated: inv.isConsolidated || false })}>
                           <TableCell className="pl-8 py-5 text-xs">
                             <div className="flex flex-col">
                               <span className="font-black text-indigo-600 uppercase">{inv.id.substring(0,8)}</span>
                               {selectedClient.isBrand && inv.clientId !== selectedClient.id && (
                                 <span className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                                   Outlet: {clients.find(c => c.id === inv.clientId)?.companyName || 'Unknown'}
                                 </span>
                               )}
                             </div>
                           </TableCell>
                           <TableCell className="text-xs font-bold text-slate-600">{format(new Date(inv.issueDate), 'dd MMM yyyy')}</TableCell>
                           <TableCell className="text-xs font-bold text-slate-600">{format(new Date(inv.dueDate), 'dd MMM yyyy')}</TableCell>
                           <TableCell className="text-right font-black text-slate-900">{formatRupiah(inv.totalAmount)}</TableCell>
                           <TableCell className="text-right font-black text-rose-600">{formatRupiah(inv.totalAmount - inv.amountPaid)}</TableCell>
                           <TableCell className="text-center">
                              <Badge className={cn(
                                "text-[9px] font-black uppercase rounded-full px-2 py-0.5 border shadow-sm",
                                inv.status === 'Paid' ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-rose-100 text-rose-700 border-rose-200"
                              )}>
                                {inv.status}
                              </Badge>
                           </TableCell>
                        </TableRow>
                      ))
                    )}
                 </TableBody>
               </Table>
            </TabsContent>

            <TabsContent value="payment-history" className="p-0 flex-1">
               <Table>
                 <TableHeader className="bg-slate-50">
                    <TableRow>
                       <TableHead className="font-black text-[10px] uppercase pl-8 py-4">Payment Date</TableHead>
                       <TableHead className="font-black text-[10px] uppercase">Amount</TableHead>
                       <TableHead className="font-black text-[10px] uppercase">Method</TableHead>
                       <TableHead className="font-black text-[10px] uppercase">Notes</TableHead>
                    </TableRow>
                 </TableHeader>
                 <TableBody>
                    {clientInvoices.flatMap(inv => (inv.payments || []).map(p => ({ ...p, invId: inv.id }))).length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="h-32 text-center text-slate-400 italic">No payment history found.</TableCell></TableRow>
                    ) : (
                      clientInvoices
                        .flatMap(inv => (inv.payments || []).map(p => ({ ...p, invId: inv.id })))
                        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((p, idx) => (
                        <TableRow key={idx}>
                           <TableCell className="pl-8 py-5 text-xs">
                             <div className="flex flex-col">
                               <span className="font-bold text-slate-600">{format(new Date(p.date), 'dd MMM yyyy')}</span>
                               {selectedClient.isBrand && invoices.find(inv => inv.id === p.invId)?.clientId !== selectedClient.id && (
                                 <span className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                                   Outlet: {clients.find(c => c.id === invoices.find(inv => inv.id === p.invId)?.clientId)?.companyName || 'Unknown'}
                                 </span>
                               )}
                             </div>
                           </TableCell>
                           <TableCell className="font-black text-emerald-600 text-base">{formatRupiah(p.amount)}</TableCell>
                           <TableCell className="text-xs font-black uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg w-fit">{p.method || '-'}</TableCell>
                           <TableCell className="text-xs text-slate-400 italic font-medium">{p.note || '-'}</TableCell>
                        </TableRow>
                      ))
                    )}
                 </TableBody>
               </Table>
            </TabsContent>

            <TabsContent value="notes" className="p-8 flex-1 flex flex-col gap-4">
               <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Internal Collection Notes</Label>
               <textarea 
                  className="flex-1 w-full min-h-[300px] p-6 rounded-3xl bg-slate-50 border border-slate-100 text-sm font-bold text-slate-700 leading-relaxed focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all"
                  placeholder="Catatan untuk tim collection Sifa... (contoh: 'Owner susah dihubungi tiap Jumat', 'Minta invoice dipisah per unit')"
                  value={selectedClient.notes || ""}
                  onChange={(e) => updateClient(selectedClient.id, { notes: e.target.value })}
               />
               <p className="text-[10px] text-slate-400 italic font-bold uppercase tracking-widest">* Catatan ini hanya terlihat oleh tim admin/finance internal.</p>
            </TabsContent>
          </Tabs>
        </div>

        {invoicePreview && (
          <UniversalPDFPreview 
            isOpen={!!invoicePreview}
            onClose={() => setInvoicePreview(null)}
            invoiceId={invoicePreview.id}
            isConsolidated={invoicePreview.isConsolidated}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <span className="text-4xl emoji-3d">👥</span>
          <div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900">Clients Database</h2>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Kelola data pelanggan & kondisi piutang</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="rounded-full h-12 px-6 font-bold border-slate-200 hover:bg-slate-50 transition-all shadow-sm"
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = '.csv'
              input.onchange = (e: any) => {
                const file = e.target.files[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = async (event: any) => {
                  const csv = (event.target.result as string || "").trim()
                  if (!csv) {
                    toast.error("File kosong atau tidak terbaca.")
                    return
                  }
                  
                  const allLines = csv.split('\n')
                  let headerRowIndex = -1
                  let delimiter = ','
                  
                  for (let i = 0; i < allLines.length; i++) {
                    const line = allLines[i].trim()
                    if (!line) continue
                    const upperLine = line.toUpperCase()
                    if (upperLine.includes('COMPANY') || upperLine.includes('PERUSAHAAN') || upperLine.includes('PELANGGAN')) {
                      headerRowIndex = i
                      delimiter = line.includes(';') ? ';' : ','
                      break
                    }
                  }

                  if (headerRowIndex === -1) {
                    toast.error("Format kolom tidak dikenali. Pastikan ada kolom 'PELANGGAN' atau 'COMPANY NAME'.")
                    return
                  }

                  const rawHeaders = allLines[headerRowIndex].split(delimiter).map(h => h.trim().toUpperCase())
                  const itemMap = new Map<string, any>()
                  
                  toast.loading("Sedang memproses klien...", { id: "csv_import_client" });

                  for (let i = headerRowIndex + 1; i < allLines.length; i++) {
                    const line = allLines[i].trim()
                    if (!line) continue
                    
                    const values = line.split(delimiter).map(v => v.trim())
                    if (values.length < 1) continue
                    
                    const client: any = {
                      createdAt: new Date().toISOString()
                    }
                    
                    rawHeaders.forEach((h, index) => {
                      const val = values[index]
                      if (val === undefined) return
                      const cleanVal = val.trim()

                      if (h.includes('COMPANY') || h.includes('PERUSAHAAN') || h.includes('PELANGGAN')) {
                        client.companyName = cleanVal
                        if (!client.picName) client.picName = cleanVal
                      } else if (h.includes('PIC') || h.includes('NAMA ORANG')) {
                        client.picName = cleanVal
                      } else if (h.includes('EMAIL')) {
                        client.email = cleanVal
                      } else if (h.includes('PHONE') || h.includes('TELPON') || h.includes('TELEPON') || h.includes('WA')) {
                        client.phone = cleanVal
                      } else if (h.includes('ADDRESS') || h.includes('ALAMAT')) {
                        client.address = cleanVal
                      } else if (h.includes('TERM') || h.includes('TEMPO') || h.includes('JATUH TEMPO')) {
                        client.paymentTermDays = parseInt(cleanVal) || 30
                      }
                    })

                    if (client.companyName) {
                      const existing = clients.find(c => c.companyName.toLowerCase() === client.companyName.toLowerCase());
                      client.id = existing ? existing.id : uuidv4();
                      itemMap.set(client.companyName, client);
                    }
                  }

                  const items = Array.from(itemMap.values())

                  if (items.length > 0) {
                    toast.loading(`Membaca ${items.length} klien unik. Mengirim ke database...`, { id: "csv_import_client" });
                    try {
                      const { addClients } = useAppStore.getState();
                      await addClients(items);
                      toast.success(`Berhasil mengimpor ${items.length} klien!`, { id: "csv_import_client" });
                    } catch (err: any) {
                      toast.error("Gagal: " + err.message, { id: "csv_import_client" });
                    }
                  } else {
                    toast.error("Tidak ada data klien yang valid (butuh Nama Perusahaan & PIC).", { id: "csv_import_client" });
                  }
                }
                reader.readAsText(file)
              }
              input.click()
            }}>
            <Upload className="mr-2 h-4 w-4" /> Import CSV
          </Button>

          <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open)
            if (!open) resetForm()
          }}>
            <DialogTrigger render={<Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-full h-12 px-6 shadow-[0_10px_30px_rgba(16,185,129,0.3)] hover:-translate-y-1 transition-all" />}>
              <div className="flex items-center">
                <Plus className="mr-2 h-5 w-5" /> Add New Client
              </div>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] rounded-3xl border-none shadow-2xl">
              <form onSubmit={async (e) => {
                e.preventDefault();
                await handleSave();
              }}>
                <DialogHeader>
                  <DialogTitle className="text-xl font-black">
                    {editingClient ? "Edit Client" : "Add New Client"}
                  </DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="companyName" className="text-xs font-black uppercase text-slate-400 tracking-widest">Company Name</Label>
                    <Input 
                      id="companyName" 
                      required
                      value={formData.companyName}
                      className="h-11 rounded-xl border-slate-200 focus:ring-emerald-500/10"
                      onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                      placeholder="PT Maju Bersama" 
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="picName" className="text-xs font-black uppercase text-slate-400 tracking-widest">PIC Name</Label>
                    <Input 
                      id="picName" 
                      required
                      value={formData.picName}
                      className="h-11 rounded-xl border-slate-200"
                      onChange={(e) => setFormData({...formData, picName: e.target.value})}
                      placeholder="Budi Santoso" 
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email" className="text-xs font-black uppercase text-slate-400 tracking-widest">Email</Label>
                    <Input 
                      id="email" 
                      type="email"
                      value={formData.email}
                      className="h-11 rounded-xl border-slate-200"
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      placeholder="name@company.com" 
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phone" className="text-xs font-black uppercase text-slate-400 tracking-widest">Phone Number</Label>
                    <Input 
                      id="phone" 
                      value={formData.phone}
                      className="h-11 rounded-xl border-slate-200"
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      placeholder="08123456789" 
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="address" className="text-xs font-black uppercase text-slate-400 tracking-widest">Address</Label>
                    <Input 
                      id="address" 
                      value={formData.address}
                      className="h-11 rounded-xl border-slate-200"
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      placeholder="Jl. Sudirman No. 1" 
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="paymentTerms" className="text-xs font-black uppercase text-slate-400 tracking-widest">Payment Terms (Days)</Label>
                    <Input 
                      id="paymentTerms" 
                      type="number"
                      value={formData.paymentTermDays}
                      className="h-11 rounded-xl border-slate-200 font-bold"
                      onChange={(e) => setFormData({...formData, paymentTermDays: parseInt(e.target.value) || 0})}
                    />
                  </div>
                  
                  {/* BRAND / GROUPING FIELDS */}
                  <div className="grid grid-cols-2 gap-4 border-t pt-4 border-slate-100 items-end">
                    <div className="flex items-center space-x-2 h-11">
                      <input 
                        type="checkbox" 
                        id="isBrand" 
                        checked={formData.isBrand}
                        className="rounded border-slate-300 h-5 w-5 accent-emerald-600 cursor-pointer"
                        onChange={(e) => {
                          const checked = e.target.checked
                          setFormData({
                            ...formData,
                            isBrand: checked,
                            parentId: checked ? "" : formData.parentId
                          })
                        }}
                      />
                      <Label htmlFor="isBrand" className="text-xs font-black uppercase text-slate-700 tracking-wider cursor-pointer">
                        Brand / Induk Group
                      </Label>
                    </div>

                    {!formData.isBrand && (
                      <div className="grid gap-1">
                        <Label htmlFor="parentId" className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                          Hubungkan ke Brand
                        </Label>
                        <Select 
                          value={formData.parentId || "none"}
                          onValueChange={(val) => setFormData({ ...formData, parentId: (!val || val === "none") ? "" : val })}
                        >
                          <SelectTrigger id="parentId" className="h-11 rounded-xl bg-white border-slate-200 text-xs font-bold text-slate-700">
                            <SelectValue placeholder="Pilih Brand...">
                              {formData.parentId ? (
                                clients.find(c => c.id === formData.parentId)?.companyName || "Pilih Brand..."
                              ) : undefined}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-none shadow-2xl">
                            <SelectItem value="none">Independent (Tidak Ada)</SelectItem>
                            {clients
                              .filter(c => c.isBrand && c.id !== editingClient?.id)
                              .map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.companyName}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-4">
                  <Button type="button" variant="outline" className="rounded-full h-12 px-6 font-bold" onClick={() => setIsOpen(false)} disabled={isSaving}>Cancel</Button>
                  <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-full h-12 px-6 shadow-lg shadow-emerald-500/20" disabled={isSaving}>
                    {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Menyimpan...</> : "Save Client"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2 relative">
            <Input 
            placeholder="Cari nama perusahaan atau PIC..." 
            className="h-14 pl-12 rounded-full bg-white border-none shadow-[0_8px_30px_rgba(0,0,0,0.06)] font-bold text-slate-700 focus-visible:ring-emerald-500/20 focus-visible:ring-4 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <Search className="w-5 h-5" />
          </div>
        </div>
        <div>
          <Select 
            value={`${sortField}-${sortDirection}`} 
            onValueChange={(val: string | null) => {
              if (!val) return
              const [field, direction] = val.split("-") as [any, any]
              setSortField(field)
              setSortDirection(direction)
            }}
          >
            <SelectTrigger className="h-14 rounded-full bg-white border-none shadow-[0_8px_30px_rgba(0,0,0,0.06)] font-bold text-slate-700 focus:ring-emerald-500/20">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-none shadow-2xl">
              <SelectItem value="companyName-asc">Sort: Nama Client (A-Z)</SelectItem>
              <SelectItem value="companyName-desc">Sort: Nama Client (Z-A)</SelectItem>
              <SelectItem value="totalRevenue-desc">Sort: Total Transaksi (Tertinggi)</SelectItem>
              <SelectItem value="totalRevenue-asc">Sort: Total Transaksi (Terendah)</SelectItem>
              <SelectItem value="outstandingAR-desc">Sort: Sisa Hutang (Tertinggi)</SelectItem>
              <SelectItem value="outstandingAR-asc">Sort: Sisa Hutang (Terendah)</SelectItem>
              <SelectItem value="picName-asc">Sort: PIC / Contact (A-Z)</SelectItem>
              <SelectItem value="picName-desc">Sort: PIC / Contact (Z-A)</SelectItem>
              <SelectItem value="nearestDue-asc">Sort: Jatuh Tempo (Terdekat)</SelectItem>
              <SelectItem value="nearestDue-desc">Sort: Jatuh Tempo (Terjauh)</SelectItem>
              <SelectItem value="health-desc">Sort: Health (Terburuk)</SelectItem>
              <SelectItem value="health-asc">Sort: Health (Terbaik)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Select value={filterDebt} onValueChange={(val: any) => setFilterDebt(val)}>
            <SelectTrigger className="h-14 rounded-full bg-white border-none shadow-[0_8px_30px_rgba(0,0,0,0.06)] font-bold text-slate-700 focus:ring-emerald-500/20">
              <SelectValue placeholder="Filter Hutang" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-none shadow-2xl">
              <SelectItem value="all">Semua Client</SelectItem>
              <SelectItem value="has_debt">Ada Hutang Saja</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedClientIds.length > 0 && (
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-5 bg-indigo-50/80 border border-indigo-100 rounded-3xl mt-6 animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="flex items-center gap-3">
            <span className="text-xs font-black text-indigo-800 uppercase tracking-widest bg-indigo-100 px-3 py-1.5 rounded-full shadow-sm">
              {selectedClientIds.length} Client Terpilih
            </span>
            <span className="text-xs text-slate-500 font-bold uppercase tracking-tight">Massal Action:</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-56">
              <Select 
                value={bulkParentId || "none"}
                onValueChange={(val) => setBulkParentId(val || "")}
              >
                <SelectTrigger className="h-10 rounded-xl bg-white border-slate-200 text-xs font-bold text-slate-700 shadow-sm">
                  <SelectValue placeholder="Pilih Induk Brand...">
                    {bulkParentId && bulkParentId !== "none" ? (
                      clients.find(c => c.id === bulkParentId)?.companyName || "Pilih Induk Brand..."
                    ) : bulkParentId === "none" ? (
                      "Lepas dari Brand (Mandiri)"
                    ) : (
                      undefined
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-none shadow-2xl">
                  <SelectItem value="none">Lepas dari Brand (Mandiri)</SelectItem>
                  {clients
                    .filter(c => c.isBrand)
                    .map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.companyName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Button 
              size="sm" 
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-500/20"
              onClick={handleBulkAssignBrand}
            >
              Masukin ke Induk Brand
            </Button>
            <Button 
              size="sm" 
              variant="ghost"
              className="text-slate-500 hover:text-slate-800 text-[10px] font-black uppercase tracking-wider px-3"
              onClick={() => {
                setSelectedClientIds([])
                setBulkParentId("")
              }}
            >
              Batal
            </Button>
          </div>
        </div>
      )}

      <div className="liquid-card overflow-hidden mt-6 bg-white border border-slate-100 shadow-xl">
        <Table>
          <TableHeader className="bg-slate-50/50 border-b border-slate-100">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-16 text-center pl-8 py-6">
                <input 
                  type="checkbox" 
                  className="rounded border-slate-300 h-4 w-4 accent-indigo-600 cursor-pointer"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
              </TableHead>
              {renderSortHeader("companyName", "Company Info", "left")}
              {renderSortHeader("picName", "PIC / Contact", "left")}
              {renderSortHeader("totalRevenue", "Total Revenue", "right")}
              {renderSortHeader("outstandingAR", "Outstanding AR", "right")}
              {renderSortHeader("nearestDue", "Nearest Due", "center")}
              {renderSortHeader("health", "Health", "center")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {processedClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center text-slate-400 italic font-bold uppercase tracking-widest">
                  Belum ada data client yang sesuai...
                </TableCell>
              </TableRow>
            ) : (
              processedClients.map((client: Client) => {
                const totalRevenue = getClientLifetimeRevenue(client.id)
                const nearestDue = getNearestDueDate(client.id)
                const health = getClientHealth(client.id)
                const totalDebt = getClientOutstandingAR(client.id)
                const parentClient = client.parentId ? clients.find(c => c.id === client.parentId) : null
                const outletsCount = client.isBrand ? clients.filter(c => c.parentId === client.id).length : 0
                const isSelected = selectedClientIds.includes(client.id)

                return (
                  <TableRow 
                    key={client.id} 
                    className={cn(
                      "hover:bg-slate-50/80 transition-colors group border-b border-slate-50 text-sm cursor-pointer",
                      isSelected && "bg-indigo-50/20 hover:bg-indigo-50/30"
                    )}
                    onClick={() => setSelectedClientId(client.id)}
                  >
                    <TableCell className="w-16 text-center pl-8 py-6" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 h-4 w-4 accent-indigo-600 cursor-pointer"
                        checked={isSelected}
                        onChange={() => toggleSelectClient(client.id)}
                      />
                    </TableCell>
                    <TableCell className="py-6 pl-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="font-black text-slate-800 tracking-tight text-base leading-none">{client.companyName}</span>
                          {client.isBrand && (
                            <Badge className="bg-indigo-100 hover:bg-indigo-100 border-none text-indigo-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow-sm">
                              🏢 Brand / Group
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                           <Badge variant="outline" className="text-[9px] font-black border-slate-200 text-slate-500 bg-slate-50 h-5 px-2 rounded-full uppercase">
                              {client.paymentTermDays}D Terms
                           </Badge>
                           {client.isBrand && (
                             <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-tight">
                               • {outletsCount} Outlet
                             </span>
                           )}
                           {parentClient && (
                             <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight flex items-center gap-1">
                               • Cabang dari: <span className="text-slate-600 font-extrabold">{parentClient.companyName}</span>
                             </span>
                           )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-700">{client.picName}</span>
                        <span className="text-[10px] text-slate-400 font-black uppercase mt-0.5 tracking-tighter">{client.phone || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-black text-slate-900 text-base">
                      {formatRupiah(totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn("font-black text-base", totalDebt > 0 ? "text-rose-600" : "text-emerald-600")}>
                        {formatRupiah(totalDebt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-black text-xs text-slate-500">
                      {nearestDue ? format(nearestDue, 'dd MMM yyyy') : '-'}
                    </TableCell>
                    <TableCell className="text-center">
                       <Badge className={cn("text-[9px] font-black uppercase rounded-full px-2 py-0.5 border shadow-sm", health.color)}>
                         {health.label}
                       </Badge>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* DIALOG: CLIENT HISTORY & DOCUMENT ARCHIVE */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-5xl sm:max-w-5xl w-[95vw] max-h-[92vh] overflow-hidden flex flex-col p-0 rounded-[2.5rem] border-none shadow-2xl">
          <DialogHeader className="p-8 bg-slate-900 text-white shrink-0">
             <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-3xl bg-white/10 flex items-center justify-center text-emerald-400 shadow-inner">
                  <History className="w-8 h-8" />
                </div>
                <div>
                   <DialogTitle className="text-2xl font-black tracking-tight">{selectedHistoryClient?.companyName}</DialogTitle>
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 mt-1 flex items-center gap-2">
                     <FileText className="w-3 h-3" /> Arsip Dokumen & Riwayat Transaksi
                   </p>
                </div>
             </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto bg-slate-50/50">
             <Tabs defaultValue="orders" className="w-full">
                <div className="px-8 pt-6 pb-0 bg-white border-b border-slate-100 flex justify-center">
                   <TabsList className="bg-slate-100 p-1 rounded-2xl h-12 w-fit mb-4">
                      <TabsTrigger value="orders" className="rounded-xl px-6 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                         Order & Item
                      </TabsTrigger>
                      <TabsTrigger value="purchases" className="rounded-xl px-6 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                         Belanja
                      </TabsTrigger>
                      <TabsTrigger value="billing" className="rounded-xl px-6 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                         Invoice
                      </TabsTrigger>
                      <TabsTrigger value="payments" className="rounded-xl px-6 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                         Riwayat Pembayaran
                      </TabsTrigger>
                   </TabsList>
                </div>

                <TabsContent value="orders" className="p-8 space-y-6 mt-0">
                   <div className="space-y-4">
                      {selectedHistoryClient && salesOrders.filter(so => so.clientId === selectedHistoryClient.id).length === 0 ? (
                        <div className="text-center py-10">
                           <p className="text-slate-400 font-bold uppercase text-xs tracking-widest italic">Belum ada riwayat order untuk client ini.</p>
                        </div>
                      ) : (
                        salesOrders
                          .filter(so => so.clientId === selectedHistoryClient?.id)
                          .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
                          .map(so => {
                             const hasDocs = so.archivedSuratJalanUrl || so.archivedBaUrl;
                             const items = salesOrderItems.filter(it => it.salesOrderId === so.id)
                             const soTotal = items.reduce((s, it) => s + ((it.qtyFinal ?? it.qty) * it.unitPrice), 0)
                             const productName = (id: string) => products.find(p => p.id === id)?.name || id.slice(0,8)
                             return (
                               <div key={so.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300">
                                  <div className="flex justify-between items-start mb-4">
                                     <div>
                                        <span className="text-[10px] font-black tracking-widest uppercase text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">{so.poNumber}</span>
                                        <p className="text-xs font-black text-slate-400 uppercase tracking-tight mt-2">{new Date(so.orderDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                     </div>
                                     <div className="flex flex-col items-end gap-1">
                                        <Badge variant="outline" className="font-black text-[10px] uppercase rounded-full">
                                          {so.status}
                                        </Badge>
                                        <span className="text-lg font-black text-emerald-700 tracking-tight">{formatRupiah(soTotal)}</span>
                                     </div>
                                  </div>

                                  {/* LINE ITEMS */}
                                  {items.length > 0 && (
                                    <div className="mb-4 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Item ({items.length})</p>
                                      <div className="space-y-1.5">
                                        {items.map(it => {
                                          const qty = it.qtyFinal ?? it.qty
                                          const sub = qty * it.unitPrice
                                          const adjusted = it.qtyFinal != null && it.qtyFinal !== it.qty
                                          return (
                                            <div key={it.id} className="flex justify-between items-center text-xs">
                                              <span className="font-bold text-slate-700">{productName(it.productId)}</span>
                                              <div className="flex items-center gap-3">
                                                <span className="text-slate-500 font-mono">
                                                  {qty} × {formatRupiah(it.unitPrice)}
                                                  {adjusted && <span className="text-amber-600 ml-1">(adj from {it.qty})</span>}
                                                </span>
                                                <span className="font-black text-slate-800 min-w-[110px] text-right">{formatRupiah(sub)}</span>
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {hasDocs ? (
                                    <div className="flex gap-2">
                                     {so.archivedSuratJalanUrl && (
                                       <div className="flex flex-col items-center gap-1">
                                         <Button
                                           size="sm"
                                           variant="outline"
                                           className="h-8 w-8 rounded-lg p-0 border-emerald-100 text-emerald-600 hover:bg-emerald-50"
                                           onClick={() => setPdfPreview({ url: so.archivedSuratJalanUrl!, title: `Surat Jalan - ${so.poNumber}` })}
                                         >
                                           <Eye className="w-3.5 h-3.5" />
                                         </Button>
                                         <span className="text-[7px] font-black uppercase text-emerald-600/50">SJ</span>
                                       </div>
                                     )}
                                     {so.archivedBaUrl && (
                                       <div className="flex flex-col items-center gap-1">
                                         <Button
                                           size="sm"
                                           variant="outline"
                                           className="h-8 w-8 rounded-lg p-0 border-indigo-100 text-indigo-600 hover:bg-indigo-50"
                                           onClick={() => setPdfPreview({ url: so.archivedBaUrl!, title: `Berita Acara - ${so.poNumber}` })}
                                         >
                                           <Eye className="w-3.5 h-3.5" />
                                         </Button>
                                         <span className="text-[7px] font-black uppercase text-indigo-600/50">BA</span>
                                       </div>
                                     )}
                                   </div>
                                  ) : (
                                    <div className="py-3 px-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200">
                                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center italic">Dokumen belum diarsipkan (Order {so.status})</p>
                                    </div>
                                  )}
                               </div>
                             )
                          })
                      )}
                   </div>
                </TabsContent>

                {/* PURCHASES TAB — show every Purchase that contains a PurchaseItem linked to this client's SOs */}
                <TabsContent value="purchases" className="p-8 space-y-6 mt-0">
                   <div className="space-y-4">
                      {(() => {
                        if (!selectedHistoryClient) return null
                        const clientSOIds = new Set(salesOrders.filter(so => so.clientId === selectedHistoryClient.id).map(so => so.id))
                        const relevantItems = purchaseItems.filter(pi => pi.salesOrderId && clientSOIds.has(pi.salesOrderId))
                        const relevantPurchaseIds = new Set(relevantItems.map(pi => pi.purchaseId))
                        const relevantPurchases = purchases.filter(p => relevantPurchaseIds.has(p.id))
                                                          .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        if (relevantPurchases.length === 0) {
                          return (
                            <div className="text-center py-10">
                              <p className="text-slate-400 font-bold uppercase text-xs tracking-widest italic">Belum ada riwayat belanja terkait order client ini.</p>
                            </div>
                          )
                        }
                        const productName = (id: string) => products.find(p => p.id === id)?.name || id.slice(0,8)
                        const poNumberOf = (soId?: string) => soId ? (salesOrders.find(s => s.id === soId)?.poNumber || soId.slice(0,8)) : '—'
                        return relevantPurchases.map(p => {
                          const itemsForP = purchaseItems.filter(pi => pi.purchaseId === p.id && pi.salesOrderId && clientSOIds.has(pi.salesOrderId))
                          const actual = itemsForP.reduce((s, it) => s + (it.actualUnitPrice * it.qtyPurchased), 0)
                          const target = itemsForP.reduce((s, it) => s + (it.estimatedUnitPrice * it.qtyTarget), 0)
                          return (
                            <div key={p.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                              <div className="flex justify-between items-start mb-4">
                                <div>
                                  <span className="text-[10px] font-black tracking-widest uppercase text-violet-600 bg-violet-50 px-3 py-1 rounded-full">{p.id.slice(0,8)}</span>
                                  <p className="text-xs font-black text-slate-400 uppercase tracking-tight mt-2">{new Date(p.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <Badge variant="outline" className="font-black text-[10px] uppercase rounded-full">{p.status}</Badge>
                                  <span className="text-[10px] font-bold text-slate-400">Target {formatRupiah(target)} → Actual {formatRupiah(actual)}</span>
                                </div>
                              </div>
                              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Item Belanja ({itemsForP.length})</p>
                                <div className="space-y-1.5">
                                  {itemsForP.map(it => (
                                    <div key={it.id} className="flex justify-between items-center text-xs">
                                      <div className="flex flex-col">
                                        <span className="font-bold text-slate-700">{productName(it.productId)}</span>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">via {poNumberOf(it.salesOrderId)} {it.purchaseMethod ? `· ${it.purchaseMethod}` : ''}</span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="text-slate-500 font-mono">{it.qtyPurchased}/{it.qtyTarget} × {formatRupiah(it.actualUnitPrice || it.estimatedUnitPrice)}</span>
                                        <span className="font-black text-slate-800 min-w-[110px] text-right">{formatRupiah(it.actualUnitPrice * it.qtyPurchased)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        })
                      })()}
                   </div>
                </TabsContent>

                {/* PAYMENTS TAB — flatten payments[] from every (active) invoice */}
                <TabsContent value="payments" className="p-8 space-y-4 mt-0">
                   {(() => {
                      if (!selectedHistoryClient) return null
                      const clientInvs = invoices.filter(i => i.clientId === selectedHistoryClient.id)
                      type Row = { invId: string; isConsol: boolean; date: string; amount: number; method?: string; note?: string }
                      const rows: Row[] = []
                      for (const inv of clientInvs) {
                        for (const p of (inv.payments || [])) {
                          rows.push({ invId: inv.id, isConsol: !!inv.isConsolidated, date: p.date, amount: p.amount, method: p.method, note: p.note })
                        }
                      }
                      rows.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      if (rows.length === 0) {
                        return (
                          <div className="text-center py-10">
                            <p className="text-slate-400 font-bold uppercase text-xs tracking-widest italic">Belum ada pembayaran tercatat.</p>
                          </div>
                        )
                      }
                      const total = rows.reduce((s, r) => s + r.amount, 0)
                      return (
                        <>
                          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex justify-between items-center">
                             <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Total Terbayar</span>
                             <span className="text-2xl font-black text-emerald-700 tracking-tight">{formatRupiah(total)}</span>
                          </div>
                          <div className="space-y-3">
                            {rows.map((r, idx) => (
                              <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center">
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black tracking-widest uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{r.invId.startsWith('TF-') ? r.invId : r.invId.slice(0,8)}</span>
                                    {r.isConsol && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none text-[8px] font-black uppercase">Tukar Faktur</Badge>}
                                  </div>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{format(new Date(r.date), 'dd MMM yyyy')} {r.method ? `· ${r.method}` : ''} {r.note ? `· ${r.note}` : ''}</p>
                                </div>
                                <span className="font-black text-emerald-700">{formatRupiah(r.amount)}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )
                   })()}
                </TabsContent>

                <TabsContent value="billing" className="p-8 space-y-6 mt-0">
                   <div className="space-y-4">
                      {(() => {
                         // Match the filter logic used for the totals row so the archive list is
                         // internally consistent: hide superseded standalone invoices that have been
                         // absorbed into a Tukar Faktur.
                         const archivedInvoices = invoices.filter(inv => inv.clientId === selectedHistoryClient?.id)
                         const archivedConsolidatedSOIds = new Set(
                           archivedInvoices
                             .filter((inv: any) => inv.isConsolidated && inv.salesOrderIds?.length > 0)
                             .flatMap((inv: any) => inv.salesOrderIds)
                         )
                         const visibleArchive = archivedInvoices.filter((inv: any) => {
                            if (inv.supersededByInvoiceId) return false
                            if (inv.salesOrderId && archivedConsolidatedSOIds.has(inv.salesOrderId) && !inv.isConsolidated) return false
                            return true
                         })
                         return visibleArchive.length === 0 ? (
                            <div className="text-center py-10">
                               <p className="text-slate-400 font-bold uppercase text-xs tracking-widest italic">Belum ada riwayat invoice untuk client ini.</p>
                            </div>
                         ) : (
                            visibleArchive
                              .sort((a,b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime())
                           .map(inv => (
                             <div key={inv.id} className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300">
                                <div className="flex justify-between items-start">
                                   <div>
                                      <div className="flex items-center gap-2">
                                         <span className="text-[10px] font-black tracking-widest uppercase text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{inv.id.substring(0,8)}</span>
                                         {inv.isConsolidated && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none text-[8px] font-black uppercase">Consolidated</Badge>}
                                      </div>
                                      <p className="text-sm font-black text-slate-700 uppercase tracking-tight mt-2">{formatRupiah(inv.totalAmount)}</p>
                                      {inv.isConsolidated && inv.consolidatedOrderNumbers && (
                                          <p className="text-[9px] font-black text-emerald-600 uppercase tracking-tight bg-emerald-50 w-fit px-2 py-0.5 rounded-lg mt-1 border border-emerald-100 italic">
                                            {inv.consolidatedOrderNumbers.join(', ')}
                                          </p>
                                       )}
                                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Tempo: {format(new Date(inv.dueDate), 'dd MMM yyyy')}</p>
                                   </div>
                                   <div className="flex flex-col items-end gap-2">
                                      <Badge className={cn(
                                         "font-black text-[9px] uppercase rounded-full shadow-sm",
                                         inv.status === 'Paid' ? "bg-emerald-500 hover:bg-emerald-500" : "bg-rose-500 hover:bg-rose-500"
                                      )}>
                                         {inv.status}
                                      </Badge>
                                      <Button 
                                         size="sm" 
                                         variant="outline" 
                                         className="h-8 gap-2 rounded-xl border-slate-200 font-bold text-[10px] uppercase px-4"
                                         onClick={() => setInvoicePreview({ id: inv.id, isConsolidated: inv.isConsolidated || false })}
                                      >
                                         <Eye className="w-3.5 h-3.5" /> Preview
                                      </Button>
                                   </div>
                                </div>
                             </div>
                           ))
                         )
                      })()}
                   </div>
                </TabsContent>
             </Tabs>
          </div>
          
          <div className="p-6 bg-white border-t border-slate-100 shrink-0">
             <Button className="w-full h-14 bg-slate-900 text-white font-black uppercase tracking-[0.2em] rounded-2xl" onClick={() => setIsHistoryOpen(false)}>
                Tutup Arsip
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF PREVIEW MODAL */}
       <Dialog open={!!pdfPreview} onOpenChange={(open) => !open && setPdfPreview(null)}>
        <DialogContent className="max-w-5xl h-[90vh] p-0 rounded-[2rem] overflow-hidden border-none bg-slate-900 shadow-2xl flex flex-col">
          <DialogHeader className="p-6 bg-slate-900 text-white flex flex-row items-center justify-between shrink-0">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                   <FileText className="w-5 h-5" />
                </div>
                <div>
                   <DialogTitle className="text-lg font-black tracking-tight">{pdfPreview?.title}</DialogTitle>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Archive Preview</p>
                </div>
             </div>
             <Button 
                variant="ghost" 
                className="text-slate-400 hover:text-white hover:bg-white/10 rounded-xl"
                onClick={() => {
                  if (pdfPreview) {
                    const link = document.createElement('a');
                    link.href = pdfPreview.url;
                    link.download = `${pdfPreview.title}.pdf`;
                    link.click();
                  }
                }}
             >
                <Download className="w-4 h-4 mr-2" /> Download PDF
             </Button>
          </DialogHeader>
          <div className="flex-1 bg-slate-800 relative">
             {pdfPreview && (
                <iframe 
                   src={pdfPreview.url} 
                   className="w-full h-full border-none"
                   title="PDF Preview"
                />
             )}
          </div>
          <div className="p-4 bg-slate-900 border-t border-white/5 flex justify-center sticky bottom-0">
             <Button
                className="rounded-2xl bg-white text-slate-900 font-black px-12 h-12 uppercase text-[10px] tracking-widest"
                onClick={() => setPdfPreview(null)}
             >
                Tutup Preview
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Global Invoice Preview Modal for Clients — top-level so it survives independent of pdfPreview Dialog */}
      {invoicePreview && (
        <UniversalPDFPreview
          isOpen={!!invoicePreview}
          onClose={() => setInvoicePreview(null)}
          invoiceId={invoicePreview.id}
          isConsolidated={invoicePreview.isConsolidated}
        />
      )}
    </div>
  )
}

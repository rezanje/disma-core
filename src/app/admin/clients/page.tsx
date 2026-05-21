"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { Plus, Pencil, Trash2, Share2, DollarSign, Receipt, TrendingUp, History, FileText, Download, Upload, Eye, Search, Filter, Printer, Mail, ChevronRight, ChevronDown, CheckCircle2, X, Loader2 } from "lucide-react"
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
import { Client, SalesOrder, SalesOrderItem, Invoice } from "@/types"

export default function ClientsPage() {
  const clients: Client[] = useAppStore(state => state.clients)
  const addClient = useAppStore(state => state.addClient)
  const updateClient = useAppStore(state => state.updateClient)
  const salesOrders: SalesOrder[] = useAppStore(state => state.salesOrders)
  const salesOrderItems: SalesOrderItem[] = useAppStore(state => state.salesOrderItems)
  const invoices: Invoice[] = useAppStore(state => state.invoices)
  
  const [isOpen, setIsOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [pdfPreview, setPdfPreview] = useState<{ url: string, title: string } | null>(null)
  const [invoicePreview, setInvoicePreview] = useState<{ id: string, isConsolidated: boolean } | null>(null)
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"name" | "value" | "debt">("name")
  const [filterDebt, setFilterDebt] = useState<"all" | "has_debt">("all")
  const [isSaving, setIsSaving] = useState(false)
  
  const selectedClient = clients.find(c => c.id === selectedClientId)
  
  const [formData, setFormData] = useState({
    companyName: "",
    picName: "",
    email: "",
    phone: "",
    address: "",
    paymentTermDays: 30
  })

  const resetForm = () => {
    setFormData({ companyName: "", picName: "", email: "", phone: "", address: "", paymentTermDays: 30 })
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
      paymentTermDays: client.paymentTermDays
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
      if (editingClient) {
        await updateClient(editingClient.id, formData)
        toast.success("Client updated successfully")
      } else {
        await addClient({
          id: uuidv4(),
          ...formData,
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

  // ENHANCED FILTERING/SORTING LOGIC
  const processedClients = clients
    .filter(client => {
      const matchesSearch = client.companyName.toLowerCase().includes(search.toLowerCase()) || 
                           client.picName.toLowerCase().includes(search.toLowerCase())
      
      const clientInvoices = invoices.filter(inv => inv.clientId === client.id)
      const totalDebt = clientInvoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0)
      
      const matchesDebt = filterDebt === "all" || totalDebt > 0
      
      return matchesSearch && matchesDebt
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.companyName.localeCompare(b.companyName)
      
      const getVal = (clientId: string) => {
        const clientOrders = salesOrders.filter(so => so.clientId === clientId)
        const orderIds = clientOrders.map(so => so.id)
        return salesOrderItems
          .filter(item => orderIds.includes(item.salesOrderId))
          .reduce((sum, item) => sum + item.subtotal, 0)
      }
      
      const getDebt = (clientId: string) => {
        return invoices
          .filter(inv => inv.clientId === clientId)
          .reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0)
      }

      if (sortBy === "value") return getVal(b.id) - getVal(a.id)
      if (sortBy === "debt") return getDebt(b.id) - getDebt(a.id)
      return 0
    })

  const getClientHealth = (clientId: string) => {
    const clientInvoices = invoices.filter(inv => inv.clientId === clientId)
    const now = new Date()
    
    const overdue = clientInvoices.some(inv => inv.status !== 'Paid' && new Date(inv.dueDate) < now)
    if (overdue) return { label: 'Overdue', color: 'bg-rose-100 text-rose-700 border-rose-200', icon: '🔴' }
    
    const hasBeenLate = clientInvoices.some(inv => inv.status === 'Paid' && inv.paidDate && new Date(inv.paidDate) > new Date(inv.dueDate))
    if (hasBeenLate) return { label: 'Late', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: '🟡' }
    
    return { label: 'Good', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: '🟢' }
  }

  const getNearestDueDate = (clientId: string) => {
    const unpaid = invoices.filter(inv => inv.clientId === clientId && inv.status !== 'Paid')
    if (unpaid.length === 0) return null
    const sorted = [...unpaid].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    return new Date(sorted[0].dueDate)
  }

  if (selectedClient) {
    const clientInvoices = invoices.filter(inv => inv.clientId === selectedClient.id)
    const clientOrders = salesOrders.filter(so => so.clientId === selectedClient.id)
    const totalLifetimeRevenue = clientInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0)
    const totalOutstanding = clientInvoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0)
    const nearestDue = getNearestDueDate(selectedClient.id)
    
    const paidInvoices = clientInvoices.filter(inv => inv.status === 'Paid' && inv.paidDate)
    const avgDaysToPay = paidInvoices.length > 0 
      ? Math.round(paidInvoices.reduce((sum, inv) => {
          const days = (new Date(inv.paidDate!).getTime() - new Date(inv.issueDate).getTime()) / (1000 * 60 * 60 * 24)
          return sum + days
        }, 0) / paidInvoices.length)
      : selectedClient.paymentTermDays

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
                <h2 className="text-2xl font-black tracking-tight text-slate-900">{selectedClient.companyName}</h2>
                <div className="flex items-center gap-2 mt-1">
                   <Badge className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-full border shadow-sm", getClientHealth(selectedClient.id).color)}>
                     {getClientHealth(selectedClient.id).label}
                   </Badge>
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client ID: {selectedClient.id.substring(0,8)}</span>
                </div>
              </div>
            </div>
          </div>

          <Tabs defaultValue="profile" className="flex-1 flex flex-col">
            <div className="px-8 border-b border-slate-100 flex justify-center bg-white">
               <TabsList className="bg-transparent h-16 gap-8">
                  {['Profile', 'Purchase Orders', 'Invoices', 'Payment History', 'Notes'].map(tab => (
                    <TabsTrigger 
                      key={tab} 
                      value={tab.toLowerCase().replace(' ', '-')} 
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
                      <div className="flex justify-between border-b border-slate-50 pb-2">
                         <span className="text-sm font-bold text-slate-500">Payment Terms</span>
                         <span className="text-sm font-black text-emerald-600">{selectedClient.paymentTermDays} Days</span>
                      </div>
                    </div>
                  </div>
               </div>
            </TabsContent>
            
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
                              <TableCell className="pl-8 py-5 font-black text-slate-900 text-xs">{so.poNumber}</TableCell>
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
                           <TableCell className="pl-8 py-5 font-black text-indigo-600 uppercase text-xs">{inv.id.substring(0,8)}</TableCell>
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
                           <TableCell className="pl-8 py-5 font-bold text-xs text-slate-600">{format(new Date(p.date), 'dd MMM yyyy')}</TableCell>
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
          <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
            <SelectTrigger className="h-14 rounded-full bg-white border-none shadow-[0_8px_30px_rgba(0,0,0,0.06)] font-bold text-slate-700 focus:ring-emerald-500/20">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-none shadow-2xl">
              <SelectItem value="name">Sort: Nama Client</SelectItem>
              <SelectItem value="value">Sort: Total Transaksi</SelectItem>
              <SelectItem value="debt">Sort: Sisa Hutang</SelectItem>
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

      <div className="liquid-card overflow-hidden mt-6 bg-white border border-slate-100 shadow-xl">
        <Table>
          <TableHeader className="bg-slate-50/50 border-b border-slate-100">
            <TableRow>
              <TableHead className="font-black text-[10px] uppercase tracking-widest text-emerald-600 py-6 pl-8 h-auto">Company Info</TableHead>
              <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400 h-auto">PIC / Contact</TableHead>
              <TableHead className="text-right font-black text-[10px] uppercase tracking-widest text-slate-400 h-auto">Total Revenue</TableHead>
              <TableHead className="text-right font-black text-[10px] uppercase tracking-widest text-slate-400 h-auto">Outstanding AR</TableHead>
              <TableHead className="text-center font-black text-[10px] uppercase tracking-widest text-slate-400 h-auto">Nearest Due</TableHead>
              <TableHead className="text-center font-black text-[10px] uppercase tracking-widest text-slate-400 h-auto">Health</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processedClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center text-slate-400 italic font-bold uppercase tracking-widest">
                  Belum ada data client yang sesuai...
                </TableCell>
              </TableRow>
            ) : (
              processedClients.map((client: Client) => {
                const clientInvoices = invoices.filter((inv: Invoice) => inv.clientId === client.id)
                const totalRevenue = clientInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0)
                const totalDebt = clientInvoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0)
                const nearestDue = getNearestDueDate(client.id)
                const health = getClientHealth(client.id)

                return (
                  <TableRow 
                    key={client.id} 
                    className="hover:bg-slate-50/80 transition-colors group border-b border-slate-50 text-sm cursor-pointer"
                    onClick={() => setSelectedClientId(client.id)}
                  >
                    <TableCell className="py-6 pl-8">
                      <div className="flex flex-col">
                        <span className="font-black text-slate-800 tracking-tight text-base leading-none mb-2">{client.companyName}</span>
                        <div className="flex items-center gap-1.5">
                           <Badge variant="outline" className="text-[9px] font-black border-slate-200 text-slate-500 bg-slate-50 h-5 px-2 rounded-full uppercase">
                              {client.paymentTermDays}D Terms
                           </Badge>
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

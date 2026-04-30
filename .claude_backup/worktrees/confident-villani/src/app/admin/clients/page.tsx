"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { Plus, Pencil, Trash2, Share2, DollarSign, Receipt, TrendingUp, History, FileText, Download, Eye, Search, Filter, Printer, Mail, ChevronRight, ChevronDown, CheckCircle2, X } from "lucide-react"
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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [selectedClientForHistory, setSelectedClientForHistory] = useState<Client | null>(null)
  const [pdfPreview, setPdfPreview] = useState<{ url: string, title: string } | null>(null)
  const [invoicePreview, setInvoicePreview] = useState<{ id: string, isConsolidated: boolean } | null>(null)
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"name" | "value" | "debt">("name")
  const [filterDebt, setFilterDebt] = useState<"all" | "has_debt">("all")
  
  const [selectedHistoryClient, setSelectedHistoryClient] = useState<Client | null>(null)
  
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

  const handleSave = () => {
    if (!formData.companyName || !formData.picName) {
      toast.error("Company name and PIC are required")
      return
    }

    if (editingClient) {
      updateClient(editingClient.id, formData)
      toast.success("Client updated successfully")
    } else {
      addClient({
        id: uuidv4(),
        ...formData,
        createdAt: new Date().toISOString()
      })
      toast.success("Client added successfully")
    }
    
    setIsOpen(false)
    resetForm()
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
        
        <Dialog open={isOpen} onOpenChange={(open) => {
          setIsOpen(open)
          if (!open) resetForm()
        }}>
          <DialogTrigger render={
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-full h-12 px-6 shadow-[0_10px_30px_rgba(16,185,129,0.3)] hover:-translate-y-1 transition-all">
              <Plus className="mr-2 h-5 w-5" /> Add New Client
            </Button>
          } />
          <DialogContent className="sm:max-w-[500px] rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-black">{editingClient ? "Edit Client" : "Add New Client"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="companyName" className="text-xs font-black uppercase text-slate-400 tracking-widest">Company Name</Label>
                <Input 
                  id="companyName" 
                  value={formData.companyName}
                  className="h-11 rounded-xl border-slate-200"
                  onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                  placeholder="PT Maju Bersama" 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="picName" className="text-xs font-black uppercase text-slate-400 tracking-widest">PIC Name</Label>
                <Input 
                  id="picName" 
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
              <Button variant="outline" className="rounded-full h-12 px-6 font-bold" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-full h-12 px-6" onClick={handleSave}>Save Client</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2 relative">
            <Input 
            placeholder="Cari nama perusahaan atau PIC..." 
            className="h-14 pl-12 rounded-full bg-white border-none shadow-[0_8px_30px_rgba(0,0,0,0.06)] font-bold text-slate-700 focus-visible:ring-emerald-500/20 focus-visible:ring-4 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>
        <div>
          <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
            <SelectTrigger className="h-14 rounded-full bg-white border-none shadow-[0_8px_30px_rgba(0,0,0,0.06)] font-bold text-slate-700 focus:ring-emerald-500/20">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
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
            <SelectContent>
              <SelectItem value="all">Semua Client</SelectItem>
              <SelectItem value="has_debt">Ada Hutang Saja</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="liquid-card overflow-hidden mt-6">
        <Table>
          <TableHeader className="bg-slate-50 border-b border-slate-100">
            <TableRow className="hover:bg-slate-50">
              <TableHead className="font-black text-[10px] uppercase tracking-widest text-emerald-600 py-6 h-auto">Company Info</TableHead>
              <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400 h-auto">Contact Info</TableHead>
              <TableHead className="text-right font-black text-[10px] uppercase tracking-widest text-slate-400 h-auto">Total Revenue</TableHead>
              <TableHead className="text-right font-black text-[10px] uppercase tracking-widest text-slate-400 h-auto">Outstanding AR</TableHead>
              <TableHead className="w-[100px] text-center font-black text-[10px] uppercase tracking-widest text-slate-400 h-auto">Ops</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processedClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-slate-400 italic">
                  Belum ada data client yang sesuai...
                </TableCell>
              </TableRow>
            ) : (
              processedClients.map((client: Client) => {
                // CALCULATE TOTALS
                const clientOrders = salesOrders.filter((so: SalesOrder) => so.clientId === client.id)
                const clientOrderIds = clientOrders.map((so: SalesOrder) => so.id)
                const totalOrdersVal = salesOrderItems
                  .filter((item: SalesOrderItem) => clientOrderIds.includes(item.salesOrderId))
                  .reduce((sum: number, item: SalesOrderItem) => sum + item.subtotal, 0)
                
                const clientInvoices = invoices.filter((inv: Invoice) => inv.clientId === client.id)
                const totalDebt = clientInvoices.reduce((sum: number, inv: Invoice) => sum + (inv.totalAmount - inv.amountPaid), 0)

                return (
                  <TableRow key={client.id} className="hover:bg-slate-50/50 transition-colors group border-b border-slate-100 text-sm">
                    <TableCell className="py-5">
                      <div className="flex flex-col">
                        <span className="font-black text-slate-800 tracking-tight text-base leading-none mb-1">{client.companyName}</span>
                        <div className="flex items-center gap-1.5">
                           <Badge variant="outline" className="text-[9px] font-black border-slate-200 text-slate-500 bg-slate-50 h-5 px-1.5">
                              {client.paymentTermDays}D Terms
                           </Badge>
                           <span className="text-[10px] text-slate-400 font-bold uppercase truncate max-w-[150px]">{client.address}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-700">{client.picName}</span>
                        <span className="text-[10px] text-slate-400 font-bold">{client.phone || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-black text-emerald-600 text-base">{formatRupiah(totalOrdersVal)}</span>
                        <div className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                          <TrendingUp className="w-2.5 h-2.5" />
                          {clientOrders.length} Order
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className={cn("font-black", totalDebt > 0 ? "text-rose-600" : "text-emerald-600")}>
                          {formatRupiah(totalDebt)}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Receivable</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-10 w-10 rounded-full text-indigo-600 hover:bg-indigo-50 hover:scale-110 transition-all"
                          title="Lihat Arsip Dokumen"
                          onClick={() => {
                            setSelectedHistoryClient(client)
                            setIsHistoryOpen(true)
                          }}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-10 w-10 rounded-full text-emerald-600 hover:bg-emerald-50 hover:scale-110 transition-all"
                          title="Copy Order Link"
                          onClick={() => {
                            const link = `${window.location.origin}/order/${client.id}`
                            navigator.clipboard.writeText(link)
                            toast.success(`Link order untuk ${client.companyName} disalin!`)
                          }}
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 rounded-xl text-slate-400 hover:text-slate-600 hover:scale-110 transition-all"
                          onClick={() => handleEdit(client)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 rounded-[2.5rem] border-none shadow-2xl">
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
                      <TabsTrigger value="orders" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                         Order & Dokumen
                      </TabsTrigger>
                      <TabsTrigger value="billing" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                         Riwayat Penagihan
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
                             return (
                               <div key={so.id} className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300">
                                  <div className="flex justify-between items-start mb-4">
                                     <div>
                                        <span className="text-[10px] font-black tracking-widest uppercase text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">{so.poNumber}</span>
                                        <p className="text-xs font-black text-slate-400 uppercase tracking-tight mt-2">{new Date(so.orderDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                     </div>
                                     <Badge variant="outline" className="font-black text-[10px] uppercase rounded-full">
                                       {so.status}
                                     </Badge>
                                  </div>
                                  
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

                <TabsContent value="billing" className="p-8 space-y-6 mt-0">
                   <div className="space-y-4">
                      {selectedHistoryClient && invoices.filter(inv => inv.clientId === selectedHistoryClient.id).length === 0 ? (
                         <div className="text-center py-10">
                            <p className="text-slate-400 font-bold uppercase text-xs tracking-widest italic">Belum ada riwayat invoice untuk client ini.</p>
                         </div>
                      ) : (
                         invoices
                           .filter(inv => inv.clientId === selectedHistoryClient?.id)
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
                      )}
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
            {/* Global Invoice Preview Modal for Clients */}
      {invoicePreview && (
        <UniversalPDFPreview 
          isOpen={!!invoicePreview}
          onClose={() => setInvoicePreview(null)}
          invoiceId={invoicePreview.id}
          isConsolidated={invoicePreview.isConsolidated}
        />
      )}
    </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

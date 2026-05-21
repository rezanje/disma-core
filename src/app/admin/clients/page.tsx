"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { Plus, Pencil, Trash2, Share2, DollarSign, Receipt, TrendingUp, History, FileText, Download, Upload, Eye, Search, Filter, Printer, Mail, ChevronRight, ChevronDown, CheckCircle2, X } from "lucide-react"
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
import { Client, SalesOrder, SalesOrderItem, Invoice, Product, Purchase, PurchaseItem } from "@/types"

export default function ClientsPage() {
  const clients: Client[] = useAppStore(state => state.clients)
  const addClient = useAppStore(state => state.addClient)
  const updateClient = useAppStore(state => state.updateClient)
  const salesOrders: SalesOrder[] = useAppStore(state => state.salesOrders)
  const salesOrderItems: SalesOrderItem[] = useAppStore(state => state.salesOrderItems)
  const invoices: Invoice[] = useAppStore(state => state.invoices)
  const products: Product[] = useAppStore(state => state.products)
  const purchases: Purchase[] = useAppStore(state => state.purchases)
  const purchaseItems: PurchaseItem[] = useAppStore(state => state.purchaseItems)
  
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

  const handleSave = async () => {
    console.log("[Clients] Attempting to save client:", formData)
    if (!formData.companyName || !formData.picName) {
      toast.error("Company name and PIC are required")
      return
    }

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
            variant="ghost" 
            className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-full h-12 px-6 font-bold"
            onClick={async () => {
              if (confirm("Bersihkan SEMUA data client? Ini akan menghapus Client agar import masal lo lancar (Pesanan/Nota tetap aman kecuali kliennya dihapus). Lanjut?")) {
                toast.loading("Membersihkan database client...", { id: "client_wipe" });
                try {
                  const res = await fetch('/api/db/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'clients_only' })
                  });
                  if (!res.ok) throw new Error("Gagal membersihkan data client");
                  toast.success("Data client bersih total!", { id: "client_wipe" });
                  window.location.reload();
                } catch (err: any) {
                  toast.error("Gagal: " + err.message, { id: "client_wipe" });
                }
              }
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Bersihkan Klien
          </Button>

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
                  
                  // Find true header row
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
                        if (!client.picName) client.picName = cleanVal // Default PIC to client name
                      } else if (h.includes('PIC') || h.includes('NAMA ORANG')) {
                        client.picName = cleanVal
                      } else if (h === 'KODE' || h === 'CODE' || h === 'ID') {
                        // ignore literal ID column to avoid postgres UUID errors
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

                    // Handle missing ID mapping safely with UUID format
                    if (client.companyName) {
                      const existing = clients.find(c => c.companyName.toLowerCase() === client.companyName.toLowerCase());
                      client.id = existing ? existing.id : uuidv4();
                      itemMap.set(client.companyName, client); // deduplicate by company name instead of fake ID
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
            <DialogTrigger render={
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-full h-12 px-6 shadow-[0_10px_30px_rgba(16,185,129,0.3)] hover:-translate-y-1 transition-all">
                <Plus className="mr-2 h-5 w-5" /> Add New Client
              </Button>
            } />
            <DialogContent className="sm:max-w-[500px] rounded-3xl">
              <form onSubmit={async (e) => {
                e.preventDefault();
                await handleSave();
              }}>
                <DialogHeader>
                  <DialogTitle className="text-xl font-black">{editingClient ? "Edit Client" : "Add New Client"}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="companyName" className="text-xs font-black uppercase text-slate-400 tracking-widest">Company Name</Label>
                    <Input 
                      id="companyName" 
                      required
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
                  <Button type="button" variant="outline" className="rounded-full h-12 px-6 font-bold" onClick={() => setIsOpen(false)}>Cancel</Button>
                  <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-full h-12 px-6">Save Client</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
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
                  .reduce((sum: number, item: SalesOrderItem) => {
                    const finalQty = item.qtyFinal ?? item.qty
                    return sum + (finalQty * item.unitPrice)
                  }, 0)
                
                // Exclude original invoices that have been superseded by a Tukar Faktur.
                // Source of truth: explicit `supersededByInvoiceId`. Fallback to salesOrderIds membership
                // in any consolidated invoice for data written before that field existed.
                const clientInvoices = invoices.filter((inv: Invoice) => inv.clientId === client.id)
                const consolidatedSOIds = new Set(
                  clientInvoices
                    .filter((inv: any) => inv.isConsolidated && inv.salesOrderIds?.length > 0)
                    .flatMap((inv: any) => inv.salesOrderIds)
                )
                const activeInvoices = clientInvoices.filter((inv: Invoice) => {
                  if ((inv as any).supersededByInvoiceId) return false
                  if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !(inv as any).isConsolidated) {
                    return false
                  }
                  return true
                })
                const totalDebt = activeInvoices.reduce((sum: number, inv: Invoice) => sum + (inv.totalAmount - inv.amountPaid), 0)

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

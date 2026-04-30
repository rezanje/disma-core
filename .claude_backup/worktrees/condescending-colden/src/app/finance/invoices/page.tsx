"use client"

import { useState, Fragment } from "react"
import { useAppStore } from "@/lib/store"
import { recordPaymentReceived } from "@/lib/accounting"
import { cn, formatRupiah } from "@/lib/utils"
import { Invoice } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import UniversalPDFPreview from "@/components/finance/UniversalPDFPreview"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Receipt, Search, History, Calendar as CalendarIcon, ChevronDown, ChevronRight, FileText, Download, Share2, Mail, Send, CheckCircle2, Eye, Printer, Plus } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { generateInvoicePDF, generateTukarFakturBundle } from "@/lib/pdf"
import { toast } from "sonner"
import { format } from "date-fns"
import { v4 as uuidv4 } from 'uuid'
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export default function InvoicesPage() {
  const invoices = useAppStore(state => state.invoices)
  const salesOrders = useAppStore(state => state.salesOrders)
  const clients = useAppStore(state => state.clients)
  const updateInvoice = useAppStore(state => state.updateInvoice)

  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null)
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [searchTerm, setSearchTerm] = useState("")
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null)
  
  // Tukar Faktur States
  const [selectedInvoiceForPreview, setSelectedInvoiceForPreview] = useState<{ id: string, isConsolidated: boolean } | null>(null)
  const [isTukarFakturOpen, setIsTukarFakturOpen] = useState(false)
  const [tfClientId, setTfClientId] = useState("")
  const [isTfClientSearchOpen, setIsTfClientSearchOpen] = useState(false)
  const [tfClientSearch, setTfClientSearch] = useState("")
  const [selectedPOIds, setSelectedPOIds] = useState<string[]>([])
  const [isConsolidating, setIsConsolidating] = useState(false)
  const [pdfPreview, setPdfPreview] = useState<{ url: string, title: string } | null>(null)
  
  const addInvoice = useAppStore(state => state.addInvoice)

  const filteredInvoices = invoices.filter(inv => {
    const client = clients.find(c => c.id === inv.clientId)
    return client?.companyName.toLowerCase().includes(searchTerm.toLowerCase())
  })

  const handleRecordPayment = async () => {
    if (!activeInvoice || paymentAmount <= 0) return
    if (paymentAmount > (activeInvoice.totalAmount - activeInvoice.amountPaid)) {
      toast.error("Nominal pembayaran melebihi sisa tagihan!")
      return
    }

    const newAmountPaid = activeInvoice.amountPaid + paymentAmount
    const status = newAmountPaid >= activeInvoice.totalAmount ? 'Paid' : 'Partial'

    // Create new payment record
    const paymentRecord = {
      id: uuidv4(),
      amount: paymentAmount,
      date: new Date(paymentDate).toISOString(),
      note: "Pembayaran diterima"
    }

    // Update Invoice State with Payment History
    updateInvoice(activeInvoice.id, {
      amountPaid: newAmountPaid,
      status: status,
      payments: [...(activeInvoice.payments || []), paymentRecord]
    })

    // Auto Journal: Debit Cash, Credit AR
    const success = await recordPaymentReceived(activeInvoice.id, paymentAmount, new Date(paymentDate).toISOString())

    if (success) {
      toast.success(`Pembayaran ${formatRupiah(paymentAmount)} berhasil dicatat.`)
      setActiveInvoice(null)
      setPaymentAmount(0)
      setPaymentDate(new Date().toISOString().split('T')[0])
    } else {
      toast.error("Gagal mencatat jurnal pembayaran.")
    }
  }

  const salesOrderItems = useAppStore(state => state.salesOrderItems)

  const calculateSOTotal = (soId: string) => {
    return salesOrderItems
      .filter(item => item.salesOrderId === soId)
      .reduce((sum, item) => sum + (item.subtotalFinal ?? item.subtotal), 0)
  }

  const handleCreateConsolidatedInvoice = () => {
    if (!tfClientId || selectedPOIds.length === 0) return
    
    setIsConsolidating(true)
    const now = new Date().toISOString()
    const invId = `TF-${uuidv4().substring(0,8)}`
    const selectedSOs = salesOrders.filter(so => selectedPOIds.includes(so.id))
    const totalAmount = selectedPOIds.reduce((sum, id) => sum + calculateSOTotal(id), 0)
    
    const newInvoice: Invoice = {
      id: invId,
      clientId: tfClientId,
      salesOrderIds: selectedPOIds,
      isConsolidated: true,
      consolidatedOrderNumbers: selectedSOs.map(so => so.poNumber),
      issueDate: now,
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      totalAmount,
      amountPaid: 0,
      status: 'Unpaid',
      payments: []
    }
    
    addInvoice(newInvoice)
    generateTukarFakturBundle(invId)
    toast.success("Tukar Faktur (Consolidated Invoice) Berhasil Dibuat!")
    setIsConsolidating(false)
    setIsTukarFakturOpen(false)
    setSelectedPOIds([])
  }

  const handleShareWA = (inv: Invoice) => {
    const client = clients.find(c => c.id === inv.clientId)
    const message = `Halo ${client?.companyName}, ini adalah tagihan Tukar Faktur periode Anda dengan total ${formatRupiah(inv.totalAmount)}. No Invoice: ${inv.id}. Silakan cek dokumen lengkap di sistem DISMA.`
    window.open(`https://wa.me/${client?.phone || ''}?text=${encodeURIComponent(message)}`, '_blank')
  }

  const handleShareEmail = (inv: Invoice) => {
    const client = clients.find(c => c.id === inv.clientId)
    const subject = `[INVOICE] Penagihan Tukar Faktur - ${client?.companyName}`
    const body = `Yth. Finance ${client?.companyName},\n\nTerlampir rincian tagihan Tukar Faktur untuk periode transaksi Anda.\nTotal Tagihan: ${formatRupiah(inv.totalAmount)}\nNo Invoice: ${inv.id}\n\nTerima kasih.`
    window.location.href = `mailto:${client?.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Invoices & Piutang</h2>
          <p className="text-muted-foreground">Kelola tagihan pelanggan dan catat pembayaran masuk.</p>
        </div>
        <Button 
          className="bg-slate-900 text-white hover:bg-slate-800 rounded-2xl h-12 px-6 font-black uppercase text-[11px] tracking-widest shadow-xl"
          onClick={() => setIsTukarFakturOpen(true)}
        >
          <Plus className="w-4 h-4 mr-2" /> Buat Tukar Faktur
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Cari nama klien..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex gap-2 text-sm text-slate-600 font-medium ml-auto bg-slate-100 dark:bg-slate-900 p-2 rounded-lg">
              <div className="px-3 border-r border-slate-300 dark:border-slate-800">
                Total Unpaid: {formatRupiah(invoices.filter(i => i.status !== 'Paid').reduce((sum, i) => sum + (i.totalAmount - i.amountPaid), 0))}
              </div>
              <div className="px-3 text-emerald-600">
                Total Paid: {formatRupiah(invoices.reduce((sum, i) => sum + i.amountPaid, 0))}
              </div>
            </div>
          </div>

          <div className="rounded-md border bg-white dark:bg-slate-950">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead>PO Ref</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Jatuh Tempo</TableHead>
                  <TableHead className="text-right">Total Tagihan</TableHead>
                  <TableHead className="text-right">Sisa (Unpaid)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      Belum ada invoice diterbitkan.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((inv) => {
                    const client = clients.find(c => c.id === inv.clientId)
                    const so = salesOrders.find(s => s.id === inv.salesOrderId)
                    const unpaid = inv.totalAmount - inv.amountPaid
                    const isExpanded = expandedInvoiceId === inv.id

                    return (
                      <Fragment key={inv.id}>
                        <TableRow className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 group">
                          <TableCell className="w-4 p-0 pl-4">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)}
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium text-[10px] text-slate-400 font-mono">{inv.id.substring(0, 8)}</TableCell>
                          <TableCell className="font-semibold">{so?.poNumber || inv.consolidatedOrderNumbers?.join(', ')}</TableCell>
                          <TableCell className="font-medium">{client?.companyName}</TableCell>
                          <TableCell >
                            <div className={new Date(inv.dueDate) < new Date() && inv.status !== 'Paid' ? "text-rose-600 font-bold" : "text-slate-600"}>
                              {format(new Date(inv.dueDate), 'dd/MM/yyyy')}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatRupiah(inv.totalAmount)}</TableCell>
                          <TableCell className="text-right text-rose-600 font-bold">
                            {unpaid > 0 ? formatRupiah(unpaid) : <span className="text-emerald-500">-</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant={inv.status === 'Paid' ? 'default' : 'outline'} className={
                              inv.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                                inv.status === 'Unpaid' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' :
                                  'bg-amber-500/10 text-amber-600 border-amber-500/20'
                            }>
                              {inv.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right flex items-center justify-end gap-2">
                             <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 rounded-lg p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                onClick={() => setSelectedInvoiceForPreview({ id: inv.id, isConsolidated: inv.isConsolidated || false })}
                             >
                                <Eye className="w-4 h-4" />
                             </Button>
                             <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 rounded-lg p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                onClick={() => handleShareWA(inv)}
                             >
                                <Share2 className="w-4 h-4" />
                             </Button>
                             <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 rounded-lg p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                onClick={() => handleShareEmail(inv)}
                             >
                                <Mail className="w-4 h-4" />
                             </Button>
                            {inv.status !== 'Paid' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-700 font-bold h-8"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setActiveInvoice(inv)
                                  setPaymentAmount(unpaid)
                                }}
                              >
                                <Receipt className="w-3.5 h-3.5 mr-2" /> Catat Bayar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow key={`exp-${inv.id}`} className="bg-slate-50/50 dark:bg-slate-900/50">
                            <TableCell colSpan={9} className="p-4 pt-0">
                              <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm animate-in slide-in-from-top-2 duration-200">
                                <div className="flex items-center justify-between mb-4">
                                  <h4 className="text-sm font-bold flex items-center gap-2">
                                    <History className="w-4 h-4 text-emerald-600" />
                                    History Pembayaran
                                  </h4>
                                  <span className="text-xs text-slate-500">
                                    {inv.payments?.length || 0} Kali Cicilan
                                  </span>
                                </div>

                                <div className="space-y-2">
                                  {(!inv.payments || inv.payments.length === 0) ? (
                                    <div className="text-center py-6 text-xs text-slate-400 italic">
                                      Belum ada history pembayaran untuk invoice ini.
                                    </div>
                                  ) : (
                                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                      {[...(inv.payments || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => (
                                        <div key={p.id} className="flex justify-between items-center py-2.5 px-1">
                                          <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
                                              <Receipt className="w-4 h-4 text-emerald-600" />
                                            </div>
                                            <div>
                                              <p className="text-sm font-bold">{formatRupiah(p.amount)}</p>
                                              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                                <CalendarIcon className="w-3 h-3" />
                                                {format(new Date(p.date), 'dd MMM yyyy, HH:mm')}
                                              </div>
                                            </div>
                                          </div>
                                          <Badge variant="secondary" className="text-[10px] bg-slate-100 font-medium">Sukses</Badge>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {inv.status !== 'Paid' && (
                                  <div className="mt-4 pt-4 border-t border-dashed border-slate-200 flex justify-between items-center">
                                    <span className="text-xs text-slate-500 italic">Sisa tagihan tersisa: <span className="font-bold text-rose-600">{formatRupiah(unpaid)}</span></span>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!activeInvoice} onOpenChange={(open) => !open && setActiveInvoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Catat Pembayaran Masuk (Pelunasan AR)</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded border">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-500">Total Tagihan:</span>
                <span className="font-semibold">{formatRupiah(activeInvoice?.totalAmount || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Sisa Belum Dibayar:</span>
                <span className="font-bold text-rose-600">{formatRupiah((activeInvoice?.totalAmount || 0) - (activeInvoice?.amountPaid || 0))}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Tanggal Pembayaran</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="date"
                    className="pl-9 h-12"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Nominal Diterima</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">Rp</span>
                  <Input
                    type="number"
                    className="h-12 text-base font-bold pl-10"
                    value={paymentAmount || ''}
                    onChange={(e) => setPaymentAmount(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-900 p-2 rounded">
              Catatan: Kas & Bank akan didebit, Piutang Usaha akan dikredit sesuai tanggal transaksi yang dipilih.
            </p>

            <Button
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-lg font-black tracking-wide shadow-lg shadow-emerald-200 dark:shadow-none mt-2 rounded-2xl border-none"
              onClick={handleRecordPayment}
            >
              Konfirmasi Pembayaran
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* TUKAR FAKTUR MODAL */}
      <Dialog open={isTukarFakturOpen} onOpenChange={setIsTukarFakturOpen}>
        <DialogContent className="sm:max-w-4xl p-0 overflow-hidden rounded-[2.5rem] border-none shadow-2xl">
           <DialogHeader className="p-8 bg-slate-900 text-white relative">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                 <FileText className="w-24 h-24" />
              </div>
              <div className="relative z-10">
                 <Badge className="bg-emerald-500 text-white border-none px-4 py-1 rounded-full font-black uppercase text-[9px] tracking-widest mb-4">New Workflow</Badge>
                 <DialogTitle className="text-3xl font-black uppercase tracking-tighter">Proses Tukar Faktur</DialogTitle>
                 <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1 opacity-70">Konsolidasi banyak PO menjadi satu tagihan resmi</p>
              </div>
           </DialogHeader>

           <div className="p-10 bg-slate-50 space-y-8">
               <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Cari & Pilih Client (Hanya Dengan Outstanding PO)</label>
                     <Popover open={isTfClientSearchOpen} onOpenChange={setIsTfClientSearchOpen}>
                        <PopoverTrigger className="w-full h-14 rounded-2xl bg-white border-none shadow-sm font-bold flex justify-between items-center px-4 hover:bg-slate-50 transition-colors outline-none text-left overflow-hidden">
                           <span className="truncate">
                              {tfClientId ? clients.find(c => c.id === tfClientId)?.companyName : "Pilih Perusahaan"}
                           </span>
                           <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </PopoverTrigger>
                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2 rounded-2xl shadow-2xl border-none">
                           <div className="flex items-center border-b border-slate-100 p-2 mb-2">
                              <Search className="mr-2 h-4 w-4 text-slate-400" />
                              <input
                                 className="flex h-10 w-full bg-transparent text-sm outline-none placeholder:text-slate-400 capitalize font-medium"
                                 placeholder="Ketik nama client..."
                                 value={tfClientSearch}
                                 onChange={(e) => setTfClientSearch(e.target.value)}
                              />
                           </div>
                           <div className="max-h-[250px] overflow-y-auto space-y-1">
                              {clients
                                 .filter(c => {
                                    const hasOutstanding = salesOrders.some(so => 
                                       so.clientId === c.id && 
                                       ['Terkirim', 'Selesai'].includes(so.status) && 
                                       !invoices.some(inv => (inv.salesOrderId === so.id || inv.salesOrderIds?.includes(so.id)))
                                    )
                                    const matchesSearch = c.companyName.toLowerCase().includes(tfClientSearch.toLowerCase())
                                    return hasOutstanding && matchesSearch
                                 })
                                 .map(c => (
                                    <div
                                       key={c.id}
                                       className={cn(
                                          "px-3 py-3 rounded-xl text-sm font-medium cursor-pointer transition-colors flex items-center justify-between",
                                          tfClientId === c.id ? "bg-emerald-50 text-emerald-700" : "hover:bg-slate-50"
                                       )}
                                       onClick={() => {
                                          setTfClientId(c.id)
                                          setIsTfClientSearchOpen(false)
                                          setTfClientSearch("")
                                       }}
                                    >
                                       {c.companyName}
                                       {tfClientId === c.id && <CheckCircle2 className="w-4 h-4" />}
                                    </div>
                                 ))
                              }
                              {clients.filter(c => {
                                 const hasOutstanding = salesOrders.some(so => 
                                    so.clientId === c.id && 
                                    ['Terkirim', 'Selesai'].includes(so.status) && 
                                    !invoices.some(inv => (inv.salesOrderId === so.id || inv.salesOrderIds?.includes(so.id)) && inv.status === 'Paid')
                                 )
                                 const matchesSearch = c.companyName.toLowerCase().includes(tfClientSearch.toLowerCase())
                                 return hasOutstanding && matchesSearch
                              }).length === 0 && (
                                 <div className="text-center py-6 text-xs text-slate-400 italic">Tidak ada client dengan outstanding PO.</div>
                              )}
                           </div>
                        </PopoverContent>
                     </Popover>
                  </div>
               </div>

              <div className="space-y-4">
                 <div className="flex justify-between items-end px-2">
                    <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Pilih PO Terkirim (Settled)</h4>
                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">{selectedPOIds.length} Terpilih</span>
                 </div>
                 
                 <div className="max-h-[300px] overflow-y-auto rounded-[2rem] border border-slate-200 bg-white shadow-inner">
                    <Table>
                       <TableHeader className="bg-slate-50/50">
                          <TableRow>
                             <TableHead className="w-12 text-center">Pilih</TableHead>
                             <TableHead>No PO</TableHead>
                             <TableHead>Tanggal Kirim</TableHead>
                             <TableHead className="text-right">Total Nilai</TableHead>
                          </TableRow>
                       </TableHeader>
                       <TableBody>
                          {salesOrders.filter(so => 
                             so.clientId === tfClientId && 
                             ['Terkirim', 'Selesai'].includes(so.status) &&
                             !invoices.some(inv => (inv.salesOrderId === so.id || inv.salesOrderIds?.includes(so.id)))
                          ).map(so => (
                             <TableRow key={so.id} className="cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => {
                                if (selectedPOIds.includes(so.id)) setSelectedPOIds(prev => prev.filter(id => id !== so.id))
                                else setSelectedPOIds(prev => [...prev, so.id])
                             }}>
                                <TableCell className="text-center">
                                   <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${selectedPOIds.includes(so.id) ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200'}`}>
                                      {selectedPOIds.includes(so.id) && <CheckCircle2 className="w-3 h-3 text-white" />}
                                   </div>
                                </TableCell>
                                <TableCell className="font-bold">{so.poNumber}</TableCell>
                                <TableCell className="text-slate-500 text-xs font-medium">{format(new Date(so.orderDate), 'dd/MM/yyyy')}</TableCell>
                                <TableCell className="text-right font-black">{formatRupiah(calculateSOTotal(so.id))}</TableCell>
                             </TableRow>
                          ))}
                          {salesOrders.filter(so => 
                             so.clientId === tfClientId && 
                             ['Terkirim', 'Selesai'].includes(so.status) &&
                             !invoices.some(inv => (inv.salesOrderId === so.id || inv.salesOrderIds?.includes(so.id)) && inv.status === 'Paid')
                          ).length === 0 && (
                            <TableRow>
                               <TableCell colSpan={4} className="h-32 text-center text-slate-400 italic">Pilih klien dan rentang tanggal untuk melihat PO yang tersedia.</TableCell>
                            </TableRow>
                          )}
                       </TableBody>
                    </Table>
                 </div>
              </div>

              <div className="flex gap-4 pt-4">
                 <Button 
                    variant="ghost" 
                    className="flex-1 h-16 rounded-2xl font-black uppercase text-[10px] tracking-widest text-slate-400"
                    onClick={() => setIsTukarFakturOpen(false)}
                 >
                    Batalkan
                 </Button>
                 <Button 
                    className="flex-[2] h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[11px] tracking-widest shadow-xl shadow-emerald-200"
                    disabled={selectedPOIds.length === 0 || isConsolidating}
                    onClick={handleCreateConsolidatedInvoice}
                 >
                    Terbitkan Tukar Faktur ({selectedPOIds.length} PO)
                 </Button>
              </div>
           </div>
        </DialogContent>
      </Dialog>
      {/* Global Invoice & Tukar Faktur Preview Modal */}
      {selectedInvoiceForPreview && (
        <UniversalPDFPreview 
          isOpen={!!selectedInvoiceForPreview}
          onClose={() => setSelectedInvoiceForPreview(null)}
          invoiceId={selectedInvoiceForPreview.id}
          isConsolidated={selectedInvoiceForPreview.isConsolidated}
        />
      )}
    </div>
  )
}

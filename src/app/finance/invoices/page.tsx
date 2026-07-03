"use client"

import { useState, Fragment, useEffect } from "react"
import Link from "next/link"
import { useAppStore } from "@/lib/store"
import { recordManualReceivable, recordPaymentReceived } from "@/lib/accounting"
import { cn, formatRupiah } from "@/lib/utils"
import { Invoice } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import UniversalPDFPreview from "@/components/finance/UniversalPDFPreview"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Receipt, Search, History, Calendar as CalendarIcon, ChevronDown, ChevronRight, FileText, Share2, Mail, CheckCircle2, Eye, Plus, Loader2, FilePlus2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { generateTukarFakturBundle } from "@/lib/pdf"
import { toast } from "sonner"
import { format } from "date-fns"
import { v4 as uuidv4 } from 'uuid'
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export default function InvoicesPage() {
  const invoices = useAppStore(state => state.invoices)
  const salesOrders = useAppStore(state => state.salesOrders)
  const clients = useAppStore(state => state.clients)
  const tukarFakturs = useAppStore(state => state.tukarFakturs)
  const updateInvoice = useAppStore(state => state.updateInvoice)
  const recordTukarFakturPayment = useAppStore(state => state.recordTukarFakturPayment)

  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null)

  // Listen to URL search param detailId to auto-open invoice payment modal
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const detailId = searchParams.get('detailId');
      if (detailId && (!activeInvoice || activeInvoice.id !== detailId)) {
        const inv = invoices.find(i => i.id === detailId);
        if (inv) {
          setActiveInvoice(inv);
        }
      }
    }
  }, [invoices, activeInvoice]);

  const [paymentAmount, setPaymentAmount] = useState(0)
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentBankAccountId, setPaymentBankAccountId] = useState("")
  const [allocations, setAllocations] = useState<Record<string, number>>({})
  const [isManualReceivableOpen, setIsManualReceivableOpen] = useState(false)
  const [manualClientId, setManualClientId] = useState("")
  const [manualInvoiceRef, setManualInvoiceRef] = useState("")
  const [manualIssueDate, setManualIssueDate] = useState(new Date().toISOString().split('T')[0])
  const [manualDueDate, setManualDueDate] = useState(new Date().toISOString().split('T')[0])
  const [manualAmount, setManualAmount] = useState(0)
  const [isCreatingManualReceivable, setIsCreatingManualReceivable] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null)
  const bankAccounts = useAppStore(state => state.bankAccounts)
  
  // Tukar Faktur States
  const [selectedInvoiceForPreview, setSelectedInvoiceForPreview] = useState<{ id: string, isConsolidated: boolean } | null>(null)
  const [isTukarFakturOpen, setIsTukarFakturOpen] = useState(false)
  const [tfClientId, setTfClientId] = useState("")
  const [isTfClientSearchOpen, setIsTfClientSearchOpen] = useState(false)
  const [tfClientSearch, setTfClientSearch] = useState("")
  const [selectedPOIds, setSelectedPOIds] = useState<string[]>([])
  const [isConsolidating, setIsConsolidating] = useState(false)
  const [isRecordingPayment, setIsRecordingPayment] = useState(false)
  
  const addInvoice = useAppStore(state => state.addInvoice)

  const filteredInvoices = invoices.filter(inv => {
    const client = clients.find(c => c.id === inv.clientId)
    return client?.companyName.toLowerCase().includes(searchTerm.toLowerCase())
  })

  const consolidatedInvoiceSalesOrderIds = new Set(
    invoices
      .filter(inv => inv.isConsolidated)
      .flatMap(inv => inv.salesOrderIds || [])
  )

  // Invoice rendered as "regular" iff: not consolidated, not marked superseded, and its SO has not
  // been absorbed by any consolidated invoice. The explicit `supersededByInvoiceId` flag is the
  // source of truth going forward; the salesOrderIds fallback preserves correctness for legacy data
  // written before the supersede field existed.
  const isSuperseded = (inv: Invoice) =>
    !!inv.supersededByInvoiceId ||
    (!inv.isConsolidated && !!inv.salesOrderId && consolidatedInvoiceSalesOrderIds.has(inv.salesOrderId))

  const isManualInvoice = (inv: Invoice) => !inv.isConsolidated && !inv.salesOrderId && !(inv.salesOrderIds?.length)
  const manualInvoices = filteredInvoices.filter(isManualInvoice)
  const regularInvoices = filteredInvoices.filter(inv =>
    !inv.isConsolidated && !isManualInvoice(inv) && !isSuperseded(inv)
  )
  const consolidatedInvoices = filteredInvoices.filter(inv => inv.isConsolidated)
  const visibleInvoices = [...regularInvoices, ...manualInvoices, ...consolidatedInvoices]

  const childInvoices = activeInvoice && activeInvoice.isConsolidated
    ? invoices.filter(i => i.supersededByInvoiceId === activeInvoice.id)
    : []

  const handleAutoDistribute = () => {
    if (!activeInvoice) return
    let remaining = paymentAmount
    const nextAllocations: Record<string, number> = {}
    const sortedChildren = [...childInvoices].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    for (const child of sortedChildren) {
      const unpaid = child.totalAmount - child.amountPaid
      if (remaining <= 0) {
        nextAllocations[child.id] = 0
      } else if (remaining >= unpaid) {
        nextAllocations[child.id] = unpaid
        remaining -= unpaid
      } else {
        nextAllocations[child.id] = remaining
        remaining = 0
      }
    }
    setAllocations(nextAllocations)
  }

  const handleAllocationChange = (childId: string, value: number) => {
    setAllocations(prev => ({
      ...prev,
      [childId]: value
    }))
  }

  const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + (val || 0), 0)

  const handleRecordPayment = async () => {
    if (!activeInvoice || paymentAmount <= 0) return
    if (!paymentBankAccountId) {
      toast.error("Silakan pilih rekening bank tujuan penerimaan!")
      return
    }
    if (paymentAmount > (activeInvoice.totalAmount - activeInvoice.amountPaid)) {
      toast.error("Nominal pembayaran melebihi sisa tagihan!")
      return
    }
    if (activeInvoice.isConsolidated && totalAllocated !== paymentAmount) {
      toast.error("Total alokasi per PO harus sama dengan nominal diterima!")
      return
    }

    setIsRecordingPayment(true)
    try {
      let success = false
      if (activeInvoice.isConsolidated) {
        success = await recordTukarFakturPayment(
          activeInvoice.id,
          allocations,
          new Date(paymentDate).toISOString(),
          paymentBankAccountId,
          paymentAmount
        )
      } else {
        success = await recordPaymentReceived(
          activeInvoice.id,
          paymentAmount,
          new Date(paymentDate).toISOString(),
          paymentBankAccountId
        )
      }

      if (success) {
        if (!activeInvoice.isConsolidated) {
          const newAmountPaid = activeInvoice.amountPaid + paymentAmount
          const status = newAmountPaid >= activeInvoice.totalAmount ? 'Paid' : 'Partial'

          const paymentRecord = {
            id: uuidv4(),
            amount: paymentAmount,
            date: new Date(paymentDate).toISOString(),
            note: "Pembayaran diterima"
          }

          updateInvoice(activeInvoice.id, {
            amountPaid: newAmountPaid,
            status: status,
            payments: [...(activeInvoice.payments || []), paymentRecord]
          })
        }

        toast.success(`Pembayaran ${formatRupiah(paymentAmount)} berhasil dicatat ke rekening tujuan.`)
        setActiveInvoice(null)
        setPaymentAmount(0)
        setPaymentDate(new Date().toISOString().split('T')[0])
        setPaymentBankAccountId("")
        setAllocations({})
      } else {
        toast.error("Gagal mencatat jurnal pembayaran. Transaksi dibatalkan.")
      }
    } catch (e) {
      console.error(e)
      toast.error("Terjadi kesalahan saat memproses pembayaran.")
    } finally {
      setIsRecordingPayment(false)
    }
  }

  const salesOrderItems = useAppStore(state => state.salesOrderItems)

  const calculateSOTotal = (soId: string) => {
    return salesOrderItems
      .filter(item => item.salesOrderId === soId)
      .reduce((sum, item) => sum + (item.subtotalFinal ?? item.subtotal), 0)
  }

  const getInvoicesForSalesOrder = (soId: string) => {
    return invoices.filter(inv => inv.salesOrderId === soId || inv.salesOrderIds?.includes(soId))
  }

  const isOutstandingSalesOrder = (soId: string) => {
    const relatedInvoices = getInvoicesForSalesOrder(soId)
    const hasConsolidatedInvoice = relatedInvoices.some(inv => inv.isConsolidated)
    const singleInvoices = relatedInvoices.filter(inv => !inv.isConsolidated)
    const hasNoSingleInvoiceYet = singleInvoices.length === 0
    const hasUnpaidSingleInvoice = singleInvoices.some(inv => inv.status !== 'Paid')

    return !hasConsolidatedInvoice && (hasNoSingleInvoiceYet || hasUnpaidSingleInvoice)
  }

  const outstandingClients = clients.filter(client =>
    salesOrders.some(so =>
      so.clientId === client.id &&
      ['Terkirim', 'Selesai'].includes(so.status) &&
      isOutstandingSalesOrder(so.id)
    )
  )

  const outstandingSalesOrders = salesOrders.filter(so =>
    so.clientId === tfClientId &&
    ['Terkirim', 'Selesai'].includes(so.status) &&
    isOutstandingSalesOrder(so.id)
  )

  const handleCreateConsolidatedInvoice = async () => {
    if (!tfClientId || selectedPOIds.length === 0) return

    const selectedSOs = salesOrders.filter(so => selectedPOIds.includes(so.id))

    // GUARD 1: every selected SO must belong to the chosen client (no cross-client leakage)
    const foreignSOs = selectedSOs.filter(so => so.clientId !== tfClientId)
    if (foreignSOs.length > 0) {
      toast.error(`Gagal: ${foreignSOs.length} SO bukan milik client ini (${foreignSOs.map(s => s.poNumber).join(', ')}). Tukar Faktur dibatalkan.`)
      return
    }
    if (selectedSOs.length !== selectedPOIds.length) {
      toast.error("Gagal: ada SO yang tidak ditemukan. Refresh halaman.")
      return
    }

    setIsConsolidating(true)
    const now = new Date().toISOString()
    const invId = `TF-${uuidv4().substring(0,8)}`
    const totalAmount = selectedPOIds.reduce((sum, id) => sum + calculateSOTotal(id), 0)

    // Carry over payments already received against the standalone invoices being absorbed.
    // Without this, the TF shows full outstanding even though AR has already been credited by
    // those partial payments, causing the invoice list total to diverge from the GL.
    const supersedeTargets = invoices.filter(inv =>
      !inv.isConsolidated &&
      inv.salesOrderId &&
      selectedPOIds.includes(inv.salesOrderId) &&
      !inv.supersededByInvoiceId
    )
    const carriedPayments = supersedeTargets.flatMap(inv => inv.payments || [])
    const carriedAmount = supersedeTargets.reduce((sum, inv) => sum + (inv.amountPaid || 0), 0)
    const carriedStatus: Invoice['status'] =
      carriedAmount >= totalAmount ? 'Paid' : carriedAmount > 0 ? 'Partial' : 'Unpaid'

    const newInvoice: Invoice = {
      id: invId,
      clientId: tfClientId,
      salesOrderIds: selectedPOIds,
      isConsolidated: true,
      consolidatedOrderNumbers: selectedSOs.map(so => so.poNumber),
      issueDate: now,
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      totalAmount,
      amountPaid: carriedAmount,
      status: carriedStatus,
      payments: carriedPayments,
      paidDate: carriedStatus === 'Paid' ? now : undefined,
    }

    addInvoice(newInvoice)

    // Mark every standalone (non-consolidated) invoice for the absorbed SOs as superseded.
    // Revenue/AR already posted via these originals; the consolidated invoice carries only the
    // settlement journal — leaving the originals in 'Unpaid' would misrepresent the receivables.
    for (const orig of supersedeTargets) {
      await updateInvoice(orig.id, { supersededByInvoiceId: invId })
    }

    generateTukarFakturBundle(invId)
    toast.success(`Tukar Faktur berhasil${supersedeTargets.length ? `, ${supersedeTargets.length} invoice asli ditandai superseded` : ''}.`)
    setIsConsolidating(false)
    setIsTukarFakturOpen(false)
    setSelectedPOIds([])
  }

  const resetManualReceivableForm = () => {
    setManualClientId("")
    setManualInvoiceRef("")
    setManualIssueDate(new Date().toISOString().split('T')[0])
    setManualDueDate(new Date().toISOString().split('T')[0])
    setManualAmount(0)
  }

  const handleManualClientChange = (clientId: string | null) => {
    if (!clientId) return
    setManualClientId(clientId)
    const client = clients.find(c => c.id === clientId)
    const dueDate = new Date(manualIssueDate)
    dueDate.setDate(dueDate.getDate() + (client?.paymentTermDays || 30))
    setManualDueDate(dueDate.toISOString().split('T')[0])
  }

  const handleCreateManualReceivable = async () => {
    if (!manualClientId) {
      toast.error("Pilih client terlebih dahulu.")
      return
    }
    if (manualAmount <= 0) {
      toast.error("Nominal piutang harus lebih dari 0.")
      return
    }
    if (!manualIssueDate || !manualDueDate) {
      toast.error("Tanggal invoice dan jatuh tempo wajib diisi.")
      return
    }

    const invoiceId = manualInvoiceRef.trim() || `AR-${uuidv4().substring(0, 8).toUpperCase()}`
    if (invoices.some(inv => inv.id.toLowerCase() === invoiceId.toLowerCase())) {
      toast.error("Nomor invoice/piutang sudah dipakai.")
      return
    }

    setIsCreatingManualReceivable(true)
    try {
      const issueDate = new Date(manualIssueDate).toISOString()
      const newInvoice: Invoice = {
        id: invoiceId,
        clientId: manualClientId,
        issueDate,
        dueDate: new Date(manualDueDate).toISOString(),
        totalAmount: manualAmount,
        amountPaid: 0,
        status: 'Unpaid',
        payments: []
      }

      addInvoice(newInvoice)
      const success = await recordManualReceivable(invoiceId, manualAmount, issueDate)

      if (success) {
        toast.success("Piutang manual berhasil dicatat per client.")
        resetManualReceivableForm()
        setIsManualReceivableOpen(false)
      } else {
        toast.error("Piutang tersimpan, tapi jurnal AR gagal dibuat.")
      }
    } finally {
      setIsCreatingManualReceivable(false)
    }
  }

  const handleShareWA = (inv: Invoice) => {
    const client = clients.find(c => c.id === inv.clientId)
    let phone = client?.phone || ''
    if (!phone) {
      const inputPhone = window.prompt(`Nomor WhatsApp untuk ${client?.companyName || 'Klien'} tidak ditemukan. Silakan masukkan nomor HP/WA (contoh: 08123456789):`);
      if (!inputPhone) return;
      phone = inputPhone;
    }

    const so = salesOrders.find(s => s.id === inv.salesOrderId);
    const invoiceLabel = inv.id.substring(0, 8).toUpperCase();
    const docInfo = so?.poNumber ? `Invoice INV-#${invoiceLabel} (PO: ${so.poNumber})` : `Invoice INV-#${invoiceLabel}`;
    const outstanding = inv.totalAmount - inv.amountPaid;
    const formattedOutstanding = formatRupiah(outstanding);
    const dueDateFormatted = format(new Date(inv.dueDate), 'dd/MM/yyyy');
    
    const message = `Halo Kak/Bapak/Ibu di *${client?.companyName || 'Klien'}*,\n\nKami dari *Disma Fresh* ingin menginformasikan tagihan untuk *${docInfo}* sebesar *${formattedOutstanding}* yang jatuh tempo pada *${dueDateFormatted}*.\n\nMohon kesediaannya untuk melakukan pembayaran. Jika pembayaran telah dilakukan, mohon kirimkan bukti transfernya ya Kak. Terima kasih banyak! 🙏😊`;

    let formattedPhone = phone.replace(/[^0-9]/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '62' + formattedPhone.slice(1);
    }
    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank')
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-2xl h-12 px-5 font-black uppercase text-[11px] tracking-widest"
            onClick={() => setIsManualReceivableOpen(true)}
          >
            <FilePlus2 className="w-4 h-4 mr-2" /> Input Piutang
          </Button>
          <Button
            className="bg-slate-900 text-white hover:bg-slate-800 rounded-2xl h-12 px-6 font-black uppercase text-[11px] tracking-widest shadow-xl"
            onClick={() => setIsTukarFakturOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" /> Buat Tukar Faktur
          </Button>
        </div>
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
                Total Unpaid: {formatRupiah(visibleInvoices.filter(i => i.status !== 'Paid').reduce((sum, i) => sum + (i.totalAmount - i.amountPaid), 0))}
              </div>
              <div className="px-3 text-emerald-600">
                Total Paid: {formatRupiah(visibleInvoices.reduce((sum, i) => sum + i.amountPaid, 0))}
              </div>
            </div>
          </div>

          <Tabs defaultValue="regular" className="space-y-6">
            <TabsList className="bg-slate-100 p-1.5 rounded-[1.5rem] h-14">
              <TabsTrigger value="regular" className="rounded-[1rem] px-6 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-md">
                Invoice Reguler ({regularInvoices.length})
              </TabsTrigger>
              <TabsTrigger value="manual" className="rounded-[1rem] px-6 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-md">
                Piutang Manual ({manualInvoices.length})
              </TabsTrigger>
              <TabsTrigger value="consolidated" className="rounded-[1rem] px-6 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-md">
                Tukar Faktur ({consolidatedInvoices.length})
              </TabsTrigger>
            </TabsList>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-amber-700">
              Pembayaran invoice reguler diterima melalui Tukar Faktur. Piutang manual bisa langsung dicatat pembayarannya dari tab Piutang Manual.
            </div>

            <TabsContent value="regular">
              <div className="rounded-md border bg-white dark:bg-slate-950">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice ID</TableHead>
                      <TableHead>PO Ref</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Jatuh Tempo</TableHead>
                      <TableHead>TF</TableHead>
                      <TableHead className="text-right">Total Tagihan</TableHead>
                      <TableHead className="text-right">Sisa (Unpaid)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {regularInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                          Belum ada invoice reguler diterbitkan.
                        </TableCell>
                      </TableRow>
                    ) : (
                      regularInvoices.map((inv) => {
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
                              <TableCell className="font-semibold">{so?.poNumber || '-'}</TableCell>
                              <TableCell className="font-medium">{client?.companyName}</TableCell>
                              <TableCell>
                                <div className={new Date(inv.dueDate) < new Date() && inv.status !== 'Paid' ? "text-rose-600 font-bold" : "text-slate-600"}>
                                  {format(new Date(inv.dueDate), 'dd/MM/yyyy')}
                                </div>
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  if (!inv.tukarFakturId) return <span className="text-xs text-slate-400 italic">Belum TF</span>
                                  const tf = tukarFakturs.find(t => t.id === inv.tukarFakturId)
                                  if (!tf) return <span className="text-xs text-slate-400">—</span>
                                  return (
                                    <Link href={`/finance/tukar-faktur/${tf.id}`} className="text-xs font-bold text-blue-600 hover:underline">
                                      {tf.tfNumber}
                                    </Link>
                                  )
                                })()}
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
                                    onClick={() => setSelectedInvoiceForPreview({ id: inv.id, isConsolidated: false })}
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
                                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">
                                  Bayar via Tukar Faktur
                                </Badge>
                              </TableCell>
                            </TableRow>

                            {isExpanded && (
                              <TableRow key={`exp-${inv.id}`} className="bg-slate-50/50 dark:bg-slate-900/50">
                                <TableCell colSpan={10} className="p-4 pt-0">
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
            </TabsContent>

            <TabsContent value="manual">
              <div className="rounded-md border bg-white dark:bg-slate-950">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>No Piutang</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Jatuh Tempo</TableHead>
                      <TableHead className="text-right">Total Tagihan</TableHead>
                      <TableHead className="text-right">Sisa (Unpaid)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manualInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                          Belum ada piutang manual per client.
                        </TableCell>
                      </TableRow>
                    ) : (
                      manualInvoices.map((inv) => {
                        const client = clients.find(c => c.id === inv.clientId)
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
                              <TableCell className="font-semibold text-[11px] font-mono text-slate-500">{inv.id}</TableCell>
                              <TableCell className="font-medium">{client?.companyName}</TableCell>
                              <TableCell className="text-slate-600">{format(new Date(inv.issueDate), 'dd/MM/yyyy')}</TableCell>
                              <TableCell>
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
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 rounded-lg p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                    onClick={() => setSelectedInvoiceForPreview({ id: inv.id, isConsolidated: false })}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  {inv.status !== 'Paid' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-700 font-bold h-8"
                                      onClick={() => {
                                        setActiveInvoice(inv)
                                        setPaymentAmount(unpaid)
                                        setPaymentBankAccountId("")
                                      }}
                                    >
                                      <Receipt className="w-3.5 h-3.5 mr-2" /> Catat Bayar
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>

                            {isExpanded && (
                              <TableRow key={`exp-manual-${inv.id}`} className="bg-slate-50/50 dark:bg-slate-900/50">
                                <TableCell colSpan={9} className="p-4 pt-0">
                                  <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm animate-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-center justify-between mb-4">
                                      <h4 className="text-sm font-bold flex items-center gap-2">
                                        <History className="w-4 h-4 text-emerald-600" />
                                        History Pembayaran Piutang Manual
                                      </h4>
                                      <span className="text-xs text-slate-500">
                                        {inv.payments?.length || 0} Kali Cicilan
                                      </span>
                                    </div>

                                    <div className="space-y-2">
                                      {(!inv.payments || inv.payments.length === 0) ? (
                                        <div className="text-center py-6 text-xs text-slate-400 italic">
                                          Belum ada history pembayaran untuk piutang ini.
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
            </TabsContent>

            <TabsContent value="consolidated">
              <div className="rounded-md border bg-white dark:bg-slate-950">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Invoice TF</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Jumlah PO</TableHead>
                      <TableHead>Daftar PO</TableHead>
                      <TableHead>Jatuh Tempo</TableHead>
                      <TableHead className="text-right">Total Tagihan</TableHead>
                      <TableHead className="text-right">Sisa (Unpaid)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consolidatedInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                          Belum ada kumpulan tukar faktur yang dibuat.
                        </TableCell>
                      </TableRow>
                    ) : (
                      consolidatedInvoices.map((inv) => {
                        const client = clients.find(c => c.id === inv.clientId)
                        const unpaid = inv.totalAmount - inv.amountPaid
                        const isExpanded = expandedInvoiceId === inv.id
                        const poLabels = inv.consolidatedOrderNumbers?.length
                          ? inv.consolidatedOrderNumbers
                          : (inv.salesOrderIds || [])
                              .map(soId => salesOrders.find(so => so.id === soId)?.poNumber)
                              .filter(Boolean) as string[]

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
                              <TableCell className="font-semibold text-[11px] font-mono text-slate-500">{inv.id}</TableCell>
                              <TableCell className="font-medium">{client?.companyName}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                                  {(inv.salesOrderIds?.length || poLabels.length || 0)} PO
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-[320px]">
                                <div className="flex flex-wrap gap-1">
                                  {poLabels.map(po => (
                                    <span key={po} className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                                      {po}
                                    </span>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
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
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 rounded-lg p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                    onClick={() => setSelectedInvoiceForPreview({ id: inv.id, isConsolidated: true })}
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
                                      onClick={() => {
                                        setActiveInvoice(inv)
                                        setPaymentAmount(unpaid)
                                        setPaymentBankAccountId("")
                                      }}
                                    >
                                      <Receipt className="w-3.5 h-3.5 mr-2" /> Catat Bayar
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>

                            {isExpanded && (
                              <TableRow key={`exp-consolidated-${inv.id}`} className="bg-slate-50/50 dark:bg-slate-900/50">
                                <TableCell colSpan={10} className="p-4 pt-0">
                                  <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm animate-in slide-in-from-top-2 duration-200">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                      {/* Left Column: Constituent PO Invoices */}
                                      <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                          <h4 className="text-sm font-bold flex items-center gap-2">
                                            <Receipt className="w-4 h-4 text-indigo-600" />
                                            Daftar PO (Invoice Asal)
                                          </h4>
                                          <span className="text-xs text-slate-500 font-medium bg-indigo-50 dark:bg-indigo-950/30 px-2.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-900">
                                            {invoices.filter(i => i.supersededByInvoiceId === inv.id).length} PO Terkait
                                          </span>
                                        </div>

                                        <div className="border border-slate-100 dark:border-slate-800 rounded-lg overflow-hidden">
                                          <Table>
                                            <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                                              <TableRow className="hover:bg-transparent">
                                                <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider">Ref PO</TableHead>
                                                <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider">Jatuh Tempo</TableHead>
                                                <TableHead className="h-9 text-right text-[10px] font-bold uppercase tracking-wider">Total</TableHead>
                                                <TableHead className="h-9 text-right text-[10px] font-bold uppercase tracking-wider">Sisa</TableHead>
                                                <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider">Status</TableHead>
                                                <TableHead className="h-9 text-right text-[10px] font-bold uppercase tracking-wider">Aksi</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {(() => {
                                                const childInvoices = invoices.filter(i => i.supersededByInvoiceId === inv.id);
                                                if (childInvoices.length === 0) {
                                                  return (
                                                    <TableRow>
                                                      <TableCell colSpan={6} className="text-center py-4 text-xs text-slate-400 italic">
                                                        Tidak ada invoice asal ditemukan.
                                                      </TableCell>
                                                    </TableRow>
                                                  );
                                                }
                                                return childInvoices.map((child) => {
                                                  const childSo = salesOrders.find(s => s.id === child.salesOrderId);
                                                  const childUnpaid = child.totalAmount - child.amountPaid;
                                                  return (
                                                    <TableRow key={child.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                                                      <TableCell className="py-2.5 font-semibold text-xs">{childSo?.poNumber || child.id.substring(0, 8)}</TableCell>
                                                      <TableCell className="py-2.5 text-xs text-slate-500">{format(new Date(child.dueDate), 'dd/MM/yyyy')}</TableCell>
                                                      <TableCell className="py-2.5 text-right text-xs font-medium">{formatRupiah(child.totalAmount)}</TableCell>
                                                      <TableCell className="py-2.5 text-right text-xs font-bold text-rose-600">
                                                        {childUnpaid > 0 ? formatRupiah(childUnpaid) : <span className="text-emerald-500">-</span>}
                                                      </TableCell>
                                                      <TableCell className="py-2.5">
                                                        <Badge variant={child.status === 'Paid' ? 'default' : 'outline'} className={
                                                          child.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[9px] px-1.5 py-0' :
                                                            child.status === 'Unpaid' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20 text-[9px] px-1.5 py-0' :
                                                              'bg-amber-500/10 text-amber-600 border-amber-500/20 text-[9px] px-1.5 py-0'
                                                        }>
                                                          {child.status}
                                                        </Badge>
                                                      </TableCell>
                                                      <TableCell className="py-2.5 text-right">
                                                        {childUnpaid > 0 && (
                                                          <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50 text-emerald-700 font-bold h-7 px-2.5 text-[10px] rounded-md transition-colors"
                                                            onClick={() => {
                                                              setActiveInvoice(inv);
                                                              setPaymentAmount(childUnpaid);
                                                              setPaymentBankAccountId("");
                                                              setAllocations({
                                                                [child.id]: childUnpaid
                                                              });
                                                            }}
                                                          >
                                                            Bayar PO
                                                          </Button>
                                                        )}
                                                      </TableCell>
                                                    </TableRow>
                                                  );
                                                });
                                              })()}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </div>

                                      {/* Right Column: Payment History */}
                                      <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                          <h4 className="text-sm font-bold flex items-center gap-2">
                                            <History className="w-4 h-4 text-emerald-600" />
                                            History Pembayaran Tukar Faktur
                                          </h4>
                                          <span className="text-xs text-slate-500 font-medium bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-full border border-emerald-100 dark:border-emerald-900">
                                            {inv.payments?.length || 0} Kali Cicilan
                                          </span>
                                        </div>

                                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                          {(!inv.payments || inv.payments.length === 0) ? (
                                            <div className="text-center py-10 border border-dashed border-slate-100 dark:border-slate-800 rounded-lg text-xs text-slate-400 italic">
                                              Belum ada history pembayaran untuk tukar faktur ini.
                                            </div>
                                          ) : (
                                            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg p-2 bg-slate-50/30 dark:bg-slate-900/10">
                                              {[...(inv.payments || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => (
                                                <div key={p.id} className="flex justify-between items-center py-2.5 px-2">
                                                  <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center border border-emerald-100 dark:border-emerald-900">
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
                                                  <Badge variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 font-medium">Sukses</Badge>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>

                                        {inv.status !== 'Paid' && (
                                          <div className="pt-2 flex justify-between items-center">
                                            <span className="text-xs text-slate-500 italic">Sisa tagihan tersisa: <span className="font-bold text-rose-600">{formatRupiah(unpaid)}</span></span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={isManualReceivableOpen} onOpenChange={(open) => {
        setIsManualReceivableOpen(open)
        if (!open) resetManualReceivableForm()
      }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Input Piutang per Client</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Client</label>
              <Select value={manualClientId} onValueChange={handleManualClientChange}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Pilih client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Nomor Invoice / Ref</label>
              <Input
                className="h-12 font-mono"
                placeholder="Kosongkan untuk auto nomor AR"
                value={manualInvoiceRef}
                onChange={(e) => setManualInvoiceRef(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Tanggal Invoice</label>
                <Input
                  type="date"
                  className="h-12"
                  value={manualIssueDate}
                  onChange={(e) => {
                    const value = e.target.value
                    setManualIssueDate(value)
                    const client = clients.find(c => c.id === manualClientId)
                    if (client && value) {
                      const dueDate = new Date(value)
                      dueDate.setDate(dueDate.getDate() + (client.paymentTermDays || 30))
                      setManualDueDate(dueDate.toISOString().split('T')[0])
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Jatuh Tempo</label>
                <Input
                  type="date"
                  className="h-12"
                  value={manualDueDate}
                  onChange={(e) => setManualDueDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Nominal Piutang</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">Rp</span>
                <Input
                  type="number"
                  className="h-12 text-base font-bold pl-10"
                  value={manualAmount || ''}
                  onChange={(e) => setManualAmount(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <p className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg">
              Saat disimpan, sistem membuat invoice piutang manual dan jurnal Debit Piutang Usaha / Kredit Pendapatan Penjualan.
            </p>

            <Button
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black tracking-wide rounded-2xl"
              onClick={handleCreateManualReceivable}
              disabled={isCreatingManualReceivable}
            >
              {isCreatingManualReceivable ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Menyimpan...</> : "Simpan Piutang"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!activeInvoice} onOpenChange={(open) => {
        if (!open) {
          setActiveInvoice(null)
          setPaymentBankAccountId("")
          setAllocations({})
          if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (params.has('detailId')) {
              params.delete('detailId');
              const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
              window.history.replaceState(null, '', newUrl);
            }
          }
        }
      }}>
        <DialogContent className={activeInvoice?.isConsolidated ? "sm:max-w-xl" : undefined}>
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

            <div className="space-y-2">
              <label className="text-sm font-semibold">Rekening Bank Tujuan</label>
              <Select value={paymentBankAccountId} onValueChange={(val) => setPaymentBankAccountId(val || "")}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Pilih rekening bank...">{paymentBankAccountId ? bankAccounts.find(b => b.id === paymentBankAccountId)?.name : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex justify-between items-center w-full min-w-[200px]">
                        <span>{account.name}</span>
                        <span className="text-xs text-slate-500 font-mono ml-4">{account.accountNumber || '-'}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeInvoice?.isConsolidated && (
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-800 dark:text-slate-200">Alokasi Pembayaran per PO</label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-indigo-200 text-indigo-700 font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900"
                    onClick={handleAutoDistribute}
                  >
                    Bagi Otomatis (FIFO)
                  </Button>
                </div>
                
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {childInvoices.map((child) => {
                    const childSo = salesOrders.find(s => s.id === child.salesOrderId);
                    const childUnpaid = child.totalAmount - child.amountPaid;
                    const allocatedVal = allocations[child.id] || 0;
                    return (
                      <div key={child.id} className="flex items-center justify-between gap-4 p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{childSo?.poNumber || child.id.substring(0, 8)}</p>
                          <p className="text-[10px] text-slate-500">Sisa: {formatRupiah(childUnpaid)}</p>
                        </div>
                        <div className="relative w-40">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">Rp</span>
                          <Input
                            type="number"
                            className="h-9 text-xs font-bold pl-8 pr-2"
                            placeholder="0"
                            value={allocatedVal || ""}
                            onChange={(e) => handleAllocationChange(child.id, Math.max(0, parseInt(e.target.value) || 0))}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between items-center text-xs p-2.5 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 text-amber-800 dark:text-amber-300">
                  <span>Total Dialokasikan: <strong>{formatRupiah(totalAllocated)}</strong></span>
                  {totalAllocated !== paymentAmount && (
                    <span className="font-medium text-rose-600 dark:text-rose-400">Selisih: {formatRupiah(paymentAmount - totalAllocated)}</span>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-900 p-2 rounded">
              Catatan: Kas & Bank akan didebit, Piutang Usaha akan dikredit sesuai tanggal transaksi yang dipilih.
            </p>

            <Button
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-lg font-black tracking-wide shadow-lg shadow-emerald-200 dark:shadow-none mt-2 rounded-2xl border-none"
              onClick={handleRecordPayment}
              disabled={isRecordingPayment || !paymentBankAccountId || paymentAmount <= 0 || (activeInvoice?.isConsolidated && totalAllocated !== paymentAmount)}
            >
              {isRecordingPayment ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Mencatat...</> : "Konfirmasi Pembayaran"}
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
                              {outstandingClients
                                 .filter(c => {
                                    const matchesSearch = c.companyName.toLowerCase().includes(tfClientSearch.toLowerCase())
                                    return matchesSearch
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
                                          setSelectedPOIds([])
                                          setIsTfClientSearchOpen(false)
                                          setTfClientSearch("")
                                       }}
                                    >
                                       {c.companyName}
                                       {tfClientId === c.id && <CheckCircle2 className="w-4 h-4" />}
                                    </div>
                                 ))
                              }
                              {outstandingClients.filter(c => {
                                 const matchesSearch = c.companyName.toLowerCase().includes(tfClientSearch.toLowerCase())
                                 return matchesSearch
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
                          {outstandingSalesOrders.map(so => (
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
                          {outstandingSalesOrders.length === 0 && (
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

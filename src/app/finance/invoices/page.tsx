"use client"

import { useState, Fragment, useEffect, useRef } from "react"
import Link from "next/link"
import { useAppStore } from "@/lib/store"
import { recordPaymentReceived } from "@/lib/accounting"
import { recordManualReceivableCommand, recordCreditNoteCommand, recordCreditRefundCommand } from "@/lib/finance-commands"
import { validateReceiptAllocations, batchPaymentHistory, sourceReturnCredit } from "@/lib/billing-document"
import { GenerateTfModal } from "@/components/tukar-faktur/GenerateTfModal"
import { creditLimit, validateCreditNote, buildCreditNoteNumber } from "@/lib/credit-note"
import { cn, formatRupiah } from "@/lib/utils"
import { Invoice, CreditNote } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import UniversalPDFPreview from "@/components/finance/UniversalPDFPreview"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Receipt, Search, History, Calendar as CalendarIcon, ChevronDown, ChevronRight, FileText, Share2, Mail, CheckCircle2, Eye, Plus, Loader2, FilePlus2, FileMinus } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { generateTukarFakturBundle } from "@/lib/pdf"
import { toast } from "sonner"
import { format } from "date-fns"
import { v4 as uuidv4 } from 'uuid'
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export default function InvoicesPage({ embedded }: { embedded?: boolean } = {}) {
  const invoices = useAppStore(state => state.invoices)
  const salesOrders = useAppStore(state => state.salesOrders)
  const clients = useAppStore(state => state.clients)
  const tukarFakturs = useAppStore(state => state.tukarFakturs)
  const pendingReturns = useAppStore(state => state.pendingReturns)
  const creditLinkHandled = useRef("")
  const creditNotes = useAppStore(state => state.creditNotes)
  const currentUser = useAppStore(state => state.currentUser)
  const recordTukarFakturPayment = useAppStore(state => state.recordTukarFakturPayment)

  const paymentAttempt = useRef<{ id: string; payload: string } | null>(null)
  const paymentInFlight = useRef(false)
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
  // Credit note — koreksi invoice yang sudah terbit.
  const [cnInvoice, setCnInvoice] = useState<Invoice | null>(null)
  const [cnSourceReturnId,setCnSourceReturnId]=useState("")
  const [refundCredit,setRefundCredit]=useState<CreditNote|null>(null)
  const [refundAmount,setRefundAmount]=useState(0)
  const [refundBank,setRefundBank]=useState("")
  const [refundDate,setRefundDate]=useState(new Date().toISOString().slice(0,10))
  const [refundBusy,setRefundBusy]=useState(false)
  const refundAttempt=useRef<{id:string;payload:string}|null>(null)
  const refundInFlight=useRef(false)
  const [cnAmount, setCnAmount] = useState(0)
  const [cnReason, setCnReason] = useState("")
  const [cnBusy, setCnBusy] = useState(false)
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
  const [isRecordingPayment, setIsRecordingPayment] = useState(false)
  

  useEffect(()=> {
    const returnId=new URLSearchParams(window.location.search).get('creditReturnId')
    if(!returnId || creditLinkHandled.current===returnId) return
    const source=pendingReturns.find(row=>row.id===returnId)
    const invoice=invoices.find(row=>row.id===source?.invoiceId)
    if(!source || !invoice) return
    creditLinkHandled.current=returnId
    const amount=sourceReturnCredit(invoice,source)
    if(amount===null) {toast.error('Retur belum memiliki sumber invoice yang dapat dikoreksi, atau sudah dikreditkan. Periksa riwayat sumber.');return}
    setCnInvoice(invoice);setCnSourceReturnId(source.id);setCnAmount(amount);setCnReason(`Retur ${source.diNumber || source.id}: ${source.reason}`)
  },[pendingReturns,invoices])

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

  // Invoice anak dari sebuah batch tukar faktur. Ada dua generasi batch yang hidup
  // berdampingan: invoice konsolidasi lama (anak ditandai `supersededByInvoiceId`) dan
  // tabel `tukar_faktur` baru yang dipakai Admin PO (anak ditandai `tukarFakturId`).
  const childrenOfBatch = (batchId: string) =>
    invoices.filter(i => i.supersededByInvoiceId === batchId || i.tukarFakturId === batchId)

  // TF dari sistem baru dibungkus jadi baris berbentuk invoice supaya tabel + dialog
  // "Catat Bayar" yang sudah ada bisa dipakai apa adanya. Tanpa ini, TF yang diterbitkan
  // Admin PO tidak pernah muncul di Finance dan pembayarannya tidak bisa dicatat sama
  // sekali — invoice regulernya cuma menampilkan badge mati "Bayar via Tukar Faktur".
  // Baris ini sengaja TIDAK masuk `visibleInvoices`: nilainya sudah terhitung lewat
  // invoice anaknya, jadi menambahkannya akan menggandakan total di header.
  const tukarFakturRows: Invoice[] = tukarFakturs
    .filter(tf => tf.status !== 'Draft')
    .map(tf => {
      const children = childrenOfBatch(tf.id)
      const poNumbers = children
        .map(child => salesOrders.find(so => so.id === child.salesOrderId)?.poNumber)
        .filter(Boolean) as string[]
      const totalAmount = children.reduce((sum, child) => sum + child.totalAmount, 0)
      const amountPaid = children.reduce((sum, child) => sum + (child.amountPaid || 0), 0)
      return {
        id: tf.id,
        clientId: tf.clientId,
        issueDate: tf.issueDate,
        // Jatuh tempo batch = yang paling awal di antara invoice anaknya.
        dueDate: children.map(c => c.dueDate).sort()[0] || tf.issueDate,
        totalAmount,
        amountPaid,
        status: amountPaid >= totalAmount && totalAmount > 0 ? 'Paid' : amountPaid > 0 ? 'Partial' : 'Unpaid',
        isConsolidated: true,
        payments: batchPaymentHistory(children),
        consolidatedOrderNumbers: poNumbers.length ? poNumbers : [tf.tfNumber],
        salesOrderIds: children.map(c => c.salesOrderId).filter(Boolean) as string[],
      } satisfies Invoice
    })
    .filter(row => {
      const client = clients.find(c => c.id === row.clientId)
      return client?.companyName.toLowerCase().includes(searchTerm.toLowerCase())
    })

  const batchRows = [...consolidatedInvoices, ...tukarFakturRows]
  const visibleInvoices = [...regularInvoices, ...manualInvoices, ...consolidatedInvoices].filter(invoice=>invoice.status!=='Draft')

  const childInvoices = activeInvoice && activeInvoice.isConsolidated
    ? childrenOfBatch(activeInvoice.id)
    : []

  const creditAttempt = useRef<{id:string;payload:string;cnNumber:string;date:string}|null>(null)
  const manualAttempt = useRef<{id:string;payload:string}|null>(null)
  const creditBusy = useRef(false)
  const manualBusy = useRef(false)

  const handleCreateCreditNote = async () => {
    if(creditBusy.current || !cnInvoice) return
    const salah=validateCreditNote(cnInvoice,cnAmount,cnReason)
    if(salah) {toast.error(salah);return}
    if(cnSourceReturnId) {
      const source=pendingReturns.find(row=>row.id===cnSourceReturnId)
      if(!source || sourceReturnCredit(cnInvoice,source)!==cnAmount) {toast.error('Nilai koreksi harus sama dengan retur sumber yang belum dikreditkan.');return}
    }
    const payload=JSON.stringify({invoiceId:cnInvoice.id,amount:cnAmount,reason:cnReason,sourceReturnId:cnSourceReturnId})
    if(creditAttempt.current && creditAttempt.current.payload!==payload) {toast.error('Ulangi koreksi sebelumnya dengan data yang sama untuk memastikan hasil.');return}
    if(!creditAttempt.current) creditAttempt.current={id:uuidv4(),payload,cnNumber:buildCreditNoteNumber(new Date(),creditNotes.map(c=>c.cnNumber)),date:new Date().toISOString()}
    creditBusy.current=true;setCnBusy(true)
    try {
      const attempt=creditAttempt.current
      const ok=await recordCreditNoteCommand({eventId:attempt.id,invoiceId:cnInvoice.id,amount:cnAmount,reason:cnReason,cnNumber:attempt.cnNumber,date:attempt.date,createdBy:currentUser?.id,sourceReturnId:cnSourceReturnId || undefined})
      if(!ok) throw new Error('Credit note belum terkonfirmasi. Ulangi data yang sama.')
      creditAttempt.current=null;setCnInvoice(null);setCnSourceReturnId("");toast.success('Credit note dan koreksi tagihan dicatat bersama.')
    } catch(e) {toast.error((e as Error).message)}
    finally {creditBusy.current=false;setCnBusy(false)}
  }

  const handleCreditRefund=async()=> {
    if(refundInFlight.current || !refundCredit) return
    const current=creditNotes.find(note=>note.id===refundCredit.id) || refundCredit
    const remaining=Math.max(0,(current.refundableAmount || 0)-(current.refundedAmount || 0))
    if(!refundBank || !Number.isFinite(refundAmount) || refundAmount<=0 || refundAmount>remaining || !refundDate || Number.isNaN(new Date(refundDate).getTime())) {toast.error('Pilih bank, tanggal dan nominal dalam sisa refund credit note.');return}
    const payload=JSON.stringify({creditNoteId:current.id,bankAccountId:refundBank,amount:refundAmount,date:refundDate})
    if(refundAttempt.current && refundAttempt.current.payload!==payload) {toast.error('Ulangi refund sebelumnya dengan data yang sama untuk memastikan hasil.');return}
    if(!refundAttempt.current) refundAttempt.current={id:uuidv4(),payload}
    refundInFlight.current=true;setRefundBusy(true)
    try {
      const ok=await recordCreditRefundCommand({eventId:refundAttempt.current.id,creditNoteId:current.id,bankAccountId:refundBank,amount:refundAmount,date:new Date(refundDate).toISOString()})
      if(!ok) throw new Error('Refund belum terkonfirmasi. Ulangi data yang sama.')
      refundAttempt.current=null;setRefundCredit(null);toast.success('Refund credit note, jurnal dan kas dicatat bersama.')
    } catch(error) {toast.error((error as Error).message)}
    finally {refundInFlight.current=false;setRefundBusy(false)}
  }

  const handleAutoDistribute = () => {
    if (!activeInvoice) return
    let remaining = paymentAmount
    const nextAllocations: Record<string, number> = {}
    const sortedChildren = [...childInvoices].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    for (const child of sortedChildren) {
      const unpaid = Math.max(0, child.totalAmount - child.amountPaid)
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
      [childId]: Math.min(Math.max(0, Number.isFinite(value) ? value : 0), Math.max(0, (childInvoices.find(c => c.id === childId)?.totalAmount || 0) - (childInvoices.find(c => c.id === childId)?.amountPaid || 0)))
    }))
  }

  const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + (val || 0), 0)

  const handleRecordPayment = async () => {
    if (paymentInFlight.current || !activeInvoice || !Number.isFinite(paymentAmount) || paymentAmount <= 0) return
    if(activeInvoice.status==='Draft') {toast.error('Draft tagihan menunggu audit Finance. Terbitkan invoice sebelum menerima pembayaran.');return}
    if (activeInvoice.isConsolidated && !tukarFakturs.some(tf => tf.id === activeInvoice.id)) {
      toast.error('TF konsolidasi lama perlu direkonsiliasi dengan invoice dan jurnal asal sebelum menerima pembayaran. Hubungi Super Admin untuk pemetaan sumber; jangan membuat tagihan pengganti.'); return
    }
    if (!paymentBankAccountId) {
      toast.error("Silakan pilih rekening bank tujuan penerimaan!")
      return
    }
    if (paymentAmount > (Math.max(0, activeInvoice.totalAmount - activeInvoice.amountPaid))) {
      toast.error("Nominal pembayaran melebihi sisa tagihan!")
      return
    }
    if (activeInvoice.isConsolidated) {
      const error = validateReceiptAllocations(childInvoices, allocations, paymentAmount)
      if (error) { toast.error(error); return }
    }
    const payload = JSON.stringify({ invoiceId: activeInvoice.id, paymentAmount, paymentDate, paymentBankAccountId, allocations })
    if (paymentAttempt.current && paymentAttempt.current.payload !== payload) {
      toast.error('Percobaan sebelumnya belum terkonfirmasi. Ulangi data yang sama dan periksa hasil sebelum mengubah pembayaran.'); return
    }
    if (!paymentAttempt.current) paymentAttempt.current = { id: uuidv4(), payload }
    paymentInFlight.current = true

    setIsRecordingPayment(true)
    try {
      let success = false
      if (activeInvoice.isConsolidated) {
        success = await recordTukarFakturPayment(
          activeInvoice.id,
          allocations,
          new Date(paymentDate).toISOString(),
          paymentBankAccountId,
          paymentAmount,
          paymentAttempt.current.id
        )
      } else {
        success = await recordPaymentReceived(
          activeInvoice.id,
          paymentAmount,
          new Date(paymentDate).toISOString(),
          paymentBankAccountId,
          paymentAttempt.current.id
        )
      }

      if (success) {
        paymentAttempt.current = null
        toast.success(`Pembayaran ${formatRupiah(paymentAmount)} berhasil dicatat ke rekening tujuan.`)
        setActiveInvoice(null)
        setPaymentAmount(0)
        setPaymentDate(new Date().toISOString().split('T')[0])
        setPaymentBankAccountId("")
        setAllocations({})
      } else {
        toast.error("Penerimaan belum terkonfirmasi. Ulangi data yang sama; ID pembayaran dipertahankan.")
      }
    } catch (e) {
      console.error(e)
      toast.error("Penerimaan belum terkonfirmasi. Ulangi data yang sama untuk memeriksa hasil tanpa menggandakan penerimaan.")
    } finally {
      paymentInFlight.current = false
      setIsRecordingPayment(false)
    }
  }

  const salesOrderItems = useAppStore(state => state.salesOrderItems)

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
    if(manualBusy.current) return
    if(!manualClientId || !Number.isFinite(manualAmount) || manualAmount<=0 || !manualIssueDate || !manualDueDate) {toast.error('Pilih klien, tanggal dan nominal positif.');return}
    const payload=JSON.stringify({clientId:manualClientId,ref:manualInvoiceRef.trim(),amount:manualAmount,issueDate:manualIssueDate,dueDate:manualDueDate})
    if(manualAttempt.current && manualAttempt.current.payload!==payload) {toast.error('Ulangi piutang sebelumnya dengan data yang sama untuk memastikan hasil.');return}
    if(!manualAttempt.current) manualAttempt.current={id:uuidv4(),payload}
    const eventId=manualAttempt.current.id
    const invoiceId=manualInvoiceRef.trim()||`AR-${eventId.slice(0,8).toUpperCase()}`
    manualBusy.current=true;setIsCreatingManualReceivable(true)
    try {
      const ok=await recordManualReceivableCommand({eventId,invoice:{id:invoiceId,clientId:manualClientId,issueDate:new Date(manualIssueDate).toISOString(),dueDate:new Date(manualDueDate).toISOString(),totalAmount:manualAmount,amountPaid:0,status:'Unpaid',payments:[]}})
      if(!ok) throw new Error('Piutang belum terkonfirmasi. Ulangi data yang sama.')
      manualAttempt.current=null;resetManualReceivableForm();setIsManualReceivableOpen(false);toast.success('Piutang dan jurnal dicatat bersama.')
    } catch(e) {toast.error((e as Error).message)}
    finally {manualBusy.current=false;setIsCreatingManualReceivable(false)}
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
    const outstanding = Math.max(0, inv.totalAmount - inv.amountPaid);
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
        {!embedded && (
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Invoices & Piutang</h2>
            <p className="text-muted-foreground">Kelola tagihan pelanggan dan catat pembayaran masuk.</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-2xl h-12 px-5 font-bold uppercase text-[11px] tracking-widest"
            onClick={() => setIsManualReceivableOpen(true)}
          >
            <FilePlus2 className="w-4 h-4 mr-2" /> Input Piutang
          </Button>
          <Button
            className="bg-slate-900 text-white hover:bg-slate-800 rounded-2xl h-12 px-6 font-bold uppercase text-[11px] tracking-widest shadow-sm"
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
                Total Unpaid: {formatRupiah(visibleInvoices.filter(i => i.status !== 'Paid').reduce((sum, i) => sum + (Math.max(0, i.totalAmount - i.amountPaid)), 0))}
              </div>
              <div className="px-3 text-emerald-600">
                Penerimaan bruto: {formatRupiah(visibleInvoices.reduce((sum, i) => sum + i.amountPaid, 0))}
              </div>
            </div>
          </div>

          <Tabs defaultValue="regular" className="space-y-6">
            <TabsList className="bg-slate-100 p-1.5 rounded-xl h-14">
              <TabsTrigger value="regular" className="rounded-lg px-6 font-bold uppercase text-[11px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-md">
                Invoice Reguler ({regularInvoices.length})
              </TabsTrigger>
              <TabsTrigger value="manual" className="rounded-lg px-6 font-bold uppercase text-[11px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-md">
                Piutang Manual ({manualInvoices.length})
              </TabsTrigger>
              <TabsTrigger value="consolidated" className="rounded-lg px-6 font-bold uppercase text-[11px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-md">
                Tukar Faktur ({batchRows.length})
              </TabsTrigger>
              <TabsTrigger value="credits" className="rounded-lg px-6 font-bold text-[11px]">Credit Note & Refund ({creditNotes.length})</TabsTrigger>
            </TabsList>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold  text-amber-700">
              Penerimaan dapat dicatat pada invoice atau alokasi Tukar Faktur. Credit note atas invoice yang sudah dibayar membuat kewajiban refund terpisah.
            </div>

            <TabsContent value="credits">
              <div className="space-y-4">
                <label className="text-sm font-bold">Koreksi invoice terbit</label>
                <select aria-label="Invoice untuk credit note" value="" onChange={e=>{const invoice=invoices.find(row=>row.id===e.target.value);if(invoice){setCnInvoice(invoice);setCnAmount(0);setCnReason('');setCnSourceReturnId('')}}} className="block border rounded-lg p-2 text-sm">
                  <option value="">Pilih invoice (termasuk yang sudah dibayar)</option>
                  {[...regularInvoices,...manualInvoices].filter(invoice=>creditLimit(invoice)>0).map(invoice=><option key={invoice.id} value={invoice.id}>{invoice.id} · {clients.find(client=>client.id===invoice.clientId)?.companyName} · {formatRupiah(invoice.totalAmount)}</option>)}
                </select>
                <Table><TableHeader><TableRow><TableHead>Credit note</TableHead><TableHead>Invoice / retur sumber</TableHead><TableHead>Nilai koreksi</TableHead><TableHead>Sisa kewajiban refund</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader><TableBody>
                  {creditNotes.filter(note=>!searchTerm || clients.find(client=>client.id===note.clientId)?.companyName.toLowerCase().includes(searchTerm.toLowerCase()) || note.cnNumber.toLowerCase().includes(searchTerm.toLowerCase())).map(note=> {
                    const remaining=Math.max(0,(note.refundableAmount || 0)-(note.refundedAmount || 0))
                    return <TableRow key={note.id}><TableCell>{note.cnNumber}<p className="text-xs text-slate-500">{note.reason}</p></TableCell><TableCell>{note.invoiceId}<p className="text-xs">{note.sourceReturnId || 'Koreksi manual'}</p></TableCell><TableCell>{formatRupiah(note.amount)}</TableCell><TableCell>{formatRupiah(remaining)}</TableCell><TableCell><Button size="sm" variant="outline" disabled={remaining<=0} onClick={()=>{setRefundCredit(note);setRefundAmount(remaining);setRefundBank('');setRefundDate(new Date().toISOString().slice(0,10))}}>Catat Refund</Button></TableCell></TableRow>
                  })}
                  {creditNotes.length===0 && <TableRow><TableCell colSpan={5}>Belum ada credit note.</TableCell></TableRow>}
                </TableBody></Table>
              </div>
            </TabsContent>

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
                        const unpaid = Math.max(0, inv.totalAmount - inv.amountPaid)
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
                              <TableCell className="font-medium text-[11px] text-slate-400 font-mono">{inv.id.substring(0, 8)}</TableCell>
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
                                  {inv.status === 'Draft' ? 'Menunggu audit' : inv.status}
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
                                    disabled={inv.status==='Draft'} onClick={() => handleShareWA(inv)}
                                 >
                                    <Share2 className="w-4 h-4" />
                                 </Button>
                                 <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 rounded-lg p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                    disabled={inv.status==='Draft'} onClick={() => handleShareEmail(inv)}
                                 >
                                    <Mail className="w-4 h-4" />
                                 </Button>
                                <Button size="sm" variant="outline" disabled={inv.status === 'Draft' || inv.status === 'Paid' || inv.status === 'Cancelled'} onClick={() => { setActiveInvoice(inv); setPaymentAmount(Math.max(0, inv.totalAmount - inv.amountPaid)) }}>Catat Bayar</Button>
                                {creditLimit(inv)>0 && <Button size="sm" variant="outline" onClick={()=>{setCnInvoice(inv);setCnAmount(0);setCnReason('');setCnSourceReturnId('')}}>Credit Note</Button>}
                              </TableCell>
                            </TableRow>

                            {isExpanded && (
                              <TableRow key={`exp-${inv.id}`} className="bg-slate-50/50 dark:bg-slate-900/50">
                                <TableCell colSpan={10} className="p-4 pt-0">
                                  <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm duration-200">
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
                                                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                                    <CalendarIcon className="w-3 h-3" />
                                                    {format(new Date(p.date), 'dd MMM yyyy, HH:mm')}
                                                  </div>
                                                </div>
                                              </div>
                                              <Badge variant="secondary" className="text-[11px] bg-slate-100 font-medium">Sukses</Badge>
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
                        const unpaid = Math.max(0, inv.totalAmount - inv.amountPaid)
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
                                  {inv.status === 'Draft' ? 'Menunggu audit' : inv.status}
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
                                  {/* Satu-satunya cara membetulkan tagihan yang sudah terbit tanpa
                                      mengubah angkanya diam-diam. */}
                                  {creditLimit(inv)>0 && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-amber-200 bg-amber-50/50 hover:bg-amber-50 text-amber-700 font-bold h-8"
                                      onClick={() => { setCnInvoice(inv); setCnAmount(0); setCnReason(""); setCnSourceReturnId("") }}
                                      title="Koreksi tagihan yang sudah terbit"
                                    >
                                      <FileMinus className="w-3.5 h-3.5 mr-2" /> Credit Note
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>

                            {isExpanded && (
                              <TableRow key={`exp-manual-${inv.id}`} className="bg-slate-50/50 dark:bg-slate-900/50">
                                <TableCell colSpan={9} className="p-4 pt-0">
                                  <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm duration-200">
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
                                                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                                    <CalendarIcon className="w-3 h-3" />
                                                    {format(new Date(p.date), 'dd MMM yyyy, HH:mm')}
                                                  </div>
                                                </div>
                                              </div>
                                              <Badge variant="secondary" className="text-[11px] bg-slate-100 font-medium">Sukses</Badge>
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
                    {batchRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                          Belum ada kumpulan tukar faktur yang dibuat.
                        </TableCell>
                      </TableRow>
                    ) : (
                      batchRows.map((inv) => {
                        const client = clients.find(c => c.id === inv.clientId)
                        const unpaid = Math.max(0, inv.totalAmount - inv.amountPaid)
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
                              <TableCell className="font-semibold text-[11px] font-mono text-slate-500">
                                {/* Batch sistem baru dikenali lewat nomor TF-nya, bukan uuid mentah. */}
                                {tukarFakturs.find(t => t.id === inv.id)?.tfNumber || inv.id}
                                {!tukarFakturs.some(tf => tf.id === inv.id) && <p className="text-[10px] text-amber-700">TF lama: rekonsiliasi sumber sebelum penerimaan</p>}
                              </TableCell>
                              <TableCell className="font-medium">{client?.companyName}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                                  {(inv.salesOrderIds?.length || poLabels.length || 0)} PO
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-[320px]">
                                <div className="flex flex-wrap gap-1">
                                  {poLabels.map(po => (
                                    <span key={po} className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold">
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
                                  {inv.status === 'Draft' ? 'Menunggu audit' : inv.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 rounded-lg p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                    onClick={() => { if (tukarFakturs.some(tf => tf.id === inv.id)) window.open(`/finance/tukar-faktur/${inv.id}/print`, "_blank", "noopener,noreferrer"); else setSelectedInvoiceForPreview({ id: inv.id, isConsolidated: true }) }}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 rounded-lg p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                    disabled={inv.status==='Draft'} onClick={() => handleShareWA(inv)}
                                  >
                                    <Share2 className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 rounded-lg p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                    disabled={inv.status==='Draft'} onClick={() => handleShareEmail(inv)}
                                  >
                                    <Mail className="w-4 h-4" />
                                  </Button>
                                  {inv.status !== 'Paid' && tukarFakturs.some(tf => tf.id === inv.id) && (
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
                                  <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm duration-200">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                      {/* Left Column: Constituent PO Invoices */}
                                      <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                          <h4 className="text-sm font-bold flex items-center gap-2">
                                            <Receipt className="w-4 h-4" />
                                            Daftar PO (Invoice Asal)
                                          </h4>
                                          <span className="text-xs text-slate-500 font-medium bg-indigo-50 dark:bg-indigo-950/30 px-2.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-900">
                                            {childrenOfBatch(inv.id).length} PO Terkait
                                          </span>
                                        </div>

                                        <div className="border border-slate-100 dark:border-slate-800 rounded-lg overflow-hidden">
                                          <Table>
                                            <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                                              <TableRow className="hover:bg-transparent">
                                                <TableHead className="h-9 text-[11px] font-bold ">Ref PO</TableHead>
                                                <TableHead className="h-9 text-[11px] font-bold ">Jatuh Tempo</TableHead>
                                                <TableHead className="h-9 text-right text-[11px] font-bold ">Total</TableHead>
                                                <TableHead className="h-9 text-right text-[11px] font-bold ">Sisa</TableHead>
                                                <TableHead className="h-9 text-[11px] font-bold ">Status</TableHead>
                                                <TableHead className="h-9 text-right text-[11px] font-bold ">Aksi</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {(() => {
                                                const childInvoices = childrenOfBatch(inv.id);
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
                                                  const childUnpaid = Math.max(0, child.totalAmount - child.amountPaid);
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
                                                          child.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[11px] px-1.5 py-0' :
                                                            child.status === 'Unpaid' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20 text-[11px] px-1.5 py-0' :
                                                              'bg-amber-500/10 text-amber-600 border-amber-500/20 text-[11px] px-1.5 py-0'
                                                        }>
                                                          {child.status}
                                                        </Badge>
                                                      </TableCell>
                                                      <TableCell className="py-2.5 text-right">
                                                        {childUnpaid > 0 && tukarFakturs.some(tf => tf.id === inv.id) && (
                                                          <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50 text-emerald-700 font-bold h-7 px-2.5 text-[11px] rounded-md transition-colors"
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
                                                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                                        <CalendarIcon className="w-3 h-3" />
                                                        {format(new Date(p.date), 'dd MMM yyyy, HH:mm')}
                                                      </div>
                                                    </div>
                                                  </div>
                                                  <Badge variant="secondary" className="text-[11px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 font-medium">Sukses</Badge>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>

                                        {inv.status !== 'Paid' && tukarFakturs.some(tf => tf.id === inv.id) && (
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
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-bold tracking-wide rounded-2xl"
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
                    const childUnpaid = Math.max(0, child.totalAmount - child.amountPaid);
                    const allocatedVal = allocations[child.id] || 0;
                    return (
                      <div key={child.id} className="flex items-center justify-between gap-4 p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{childSo?.poNumber || child.id.substring(0, 8)}</p>
                          <p className="text-[11px] text-slate-500">Sisa: {formatRupiah(childUnpaid)}</p>
                        </div>
                        <div className="relative w-40">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">Rp</span>
                          <Input
                            type="number"
                            className="h-9 text-xs font-bold pl-8 pr-2"
                            placeholder="0"
                            max={childUnpaid}
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
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-lg font-bold tracking-wide shadow-sm dark:shadow-none mt-2 rounded-2xl border-none"
              onClick={handleRecordPayment}
              disabled={isRecordingPayment || !paymentBankAccountId || paymentAmount <= 0 || (activeInvoice?.isConsolidated && totalAllocated !== paymentAmount)}
            >
              {isRecordingPayment ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Mencatat...</> : "Konfirmasi Pembayaran"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* TUKAR FAKTUR MODAL */}
      <GenerateTfModal open={isTukarFakturOpen} onOpenChange={setIsTukarFakturOpen} />
      {/* Global Invoice & Tukar Faktur Preview Modal */}
      {selectedInvoiceForPreview && (
        <UniversalPDFPreview 
          isOpen={!!selectedInvoiceForPreview}
          onClose={() => setSelectedInvoiceForPreview(null)}
          invoiceId={selectedInvoiceForPreview.id}
          isConsolidated={selectedInvoiceForPreview.isConsolidated}
        />
      )}
      <Dialog open={!!refundCredit} onOpenChange={open=>{if(!open && !refundBusy)setRefundCredit(null)}}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Refund Credit Note {refundCredit?.cnNumber}</DialogTitle></DialogHeader>
          <p className="text-xs text-slate-500">Pembayaran ini mengurangi kewajiban refund klien dan saldo bank. Penerimaan invoice asli tetap dipertahankan.</p>
          <Input aria-label="Tanggal refund" type="date" value={refundDate} onChange={event=>setRefundDate(event.target.value)} />
          <Input aria-label="Nominal refund" type="number" min={0} max={Math.max(0,(refundCredit?.refundableAmount || 0)-(refundCredit?.refundedAmount || 0))} value={refundAmount || ''} onChange={event=>setRefundAmount(Number(event.target.value))} />
          <select aria-label="Rekening sumber refund" value={refundBank} onChange={event=>setRefundBank(event.target.value)} className="border rounded-lg p-2 text-sm"><option value="">Pilih rekening sumber</option>{bankAccounts.map(bank=><option key={bank.id} value={bank.id}>{bank.name}</option>)}</select>
          <Button onClick={handleCreditRefund} disabled={refundBusy || !refundBank || refundAmount<=0}>{refundBusy?'Mencatat…':'Konfirmasi Refund'}</Button>
        </DialogContent>
      </Dialog>
      {cnInvoice && (
        <Dialog open onOpenChange={(o) => { if (!o) setCnInvoice(null) }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-bold">Credit Note</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 text-xs font-bold space-y-1">
                <p>{clients.find(c => c.id === cnInvoice.clientId)?.companyName}</p>
                <p className="text-slate-500">Tagihan sekarang {formatRupiah(cnInvoice.totalAmount)}</p>
                <p className="text-slate-500">Nilai yang masih bisa dikoreksi {formatRupiah(creditLimit(cnInvoice))}</p>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-500">Sumber retur (opsional)</label>
                <select aria-label="Retur sumber credit note" value={cnSourceReturnId} onChange={event=> {
                  setCnSourceReturnId(event.target.value)
                  const source=pendingReturns.find(row=>row.id===event.target.value)
                  if(source) {const amount=sourceReturnCredit(cnInvoice,source);setCnAmount(amount || 0);setCnReason(`Retur ${source.diNumber || source.id}: ${source.reason}`)}
                }} className="block border rounded-lg p-2 text-sm w-full">
                  <option value="">Koreksi manual dengan alasan</option>
                  {pendingReturns.filter(source=>source.invoiceId===cnInvoice.id && source.financialAdjustmentStatus==='Pending Finance').map(source=><option key={source.id} value={source.id} disabled={sourceReturnCredit(cnInvoice,source)===null}>{source.diNumber || source.id} · {source.qty} · {source.returnDecision==='Replace'?'Penggantian':'Batal'} · {formatRupiah(sourceReturnCredit(cnInvoice,source) || 0)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-500">Nilai koreksi</label>
                <Input type="number" disabled={!!cnSourceReturnId} max={creditLimit(cnInvoice)} value={cnAmount || ''} onChange={e => setCnAmount(Number(e.target.value))}
                  className="h-11 font-bold" placeholder="0" />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-500">Alasan</label>
                <Input value={cnReason} onChange={e => setCnReason(e.target.value)}
                  className="h-11 font-bold" placeholder="Contoh: 5 kg ditolak klien, salah harga tier" />
              </div>
              <p className="text-[11px] text-slate-400 font-bold">
                Tagihan klien turun sebesar ini dan pendapatan ikut dikoreksi. Stok tidak
                tersentuh; barang yang kembali diproses lewat retur customer. Nilai yang sudah dibayar menjadi kewajiban refund dan dibayarkan dari tab Credit Note & Refund.
              </p>
              <Button disabled={cnBusy} onClick={handleCreateCreditNote}
                className="w-full h-12 font-bold bg-amber-600 hover:bg-amber-700">
                {cnBusy ? "Memproses..." : "Terbitkan Credit Note"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

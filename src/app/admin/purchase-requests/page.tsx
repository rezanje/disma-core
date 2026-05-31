"use client"

import { useState, useMemo, useEffect } from "react"
import { useAppStore } from "@/lib/store"
import { PurchaseRequest, PurchaseRequestStatus } from "@/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { formatRupiah, formatNumber, parseNumber } from "@/lib/utils"
import { 
  ClipboardList, Plus, FileText, CheckCircle2, AlertTriangle, 
  XCircle, Clock, ShieldCheck, Landmark, DollarSign, Search, Sparkles, ShoppingBag
} from "lucide-react"
import { recordBudgetTransfer, recordPRExpensePayment } from "@/lib/accounting"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"

const CATEGORY_OPTIONS = [
  "Sourcing",
  "Operasional Gudang",
  "Logistik & Bensin",
  "Marketing & Promo",
  "Aset & Peralatan",
  "Lain-lain"
]

const PR_EXPENSE_TYPES: { label: string; code: string }[] = [
  { label: 'Sewa Gedung/Workshop', code: '6-1100' },
  { label: 'Listrik, Air & Internet', code: '6-1200' },
  { label: 'Marketing & Iklan', code: '6-1300' },
  { label: 'Transportasi & BBM / Bengkel', code: '6-1400' },
  { label: 'ATK & Kantor', code: '6-1500' },
  { label: 'Admin Platform (Shopee/Tokopedia)', code: '6-1600' },
  { label: 'Ongkos Kirim', code: '6-1700' },
  { label: 'Gaji & Tunjangan', code: '6-1000' },
  { label: 'Operasional Lainnya', code: '6-9000' },
]

export default function PurchaseRequestsPage() {
  const purchaseRequests = useAppStore(state => state.purchaseRequests) || []
  const currentUser = useAppStore(state => state.currentUser)
  const addPurchaseRequest = useAppStore(state => state.addPurchaseRequest)
  const updatePurchaseRequest = useAppStore(state => state.updatePurchaseRequest)
  const purchases = useAppStore(state => state.purchases)
  const salesOrders = useAppStore(state => state.salesOrders) || []
  const salesOrderItems = useAppStore(state => state.salesOrderItems) || []
  const clients = useAppStore(state => state.clients) || []
  const purchaseItems = useAppStore(state => state.purchaseItems) || []
  const products = useAppStore(state => state.products) || []
  const vendors = useAppStore(state => state.vendors) || []
  const bankAccounts = useAppStore(state => state.bankAccounts) || []
  const users = useAppStore(state => state.users) || []
  const updatePurchase = useAppStore(state => state.updatePurchase)
  const addVendor = useAppStore(state => state.addVendor)

  // List States
  const [filterStatus, setFilterStatus] = useState<string>("ALL")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [selectedPRId, setSelectedPRId] = useState<string | null>(null)

  // Add PR Form States
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newAmountRaw, setNewAmountRaw] = useState("")
  const [newCategory, setNewCategory] = useState("Sourcing")
  const [selectedSOIds, setSelectedSOIds] = useState<string[]>([])
  const [includeManualItems, setIncludeManualItems] = useState(false)
  const [manualItemsList, setManualItemsList] = useState<any[]>([])

  useEffect(() => {
    try {
      const items = JSON.parse(localStorage.getItem('shopping_manualItems') || '[]')
      setManualItemsList(items)
    } catch { /* ignore */ }
  }, [])

  const recalculateForm = (soIds: string[], manualChecked: boolean) => {
    // Recalculate sum of selected POs using estimatedHpp
    const poSum = soIds.reduce((sum, id) => {
      const items = salesOrderItems.filter(item => item.salesOrderId === id)
      const total = items.reduce((s, item) => {
        const prod = products.find(p => p.id === item.productId)
        const estHpp = item.estimatedHpp !== undefined ? item.estimatedHpp : (prod?.basePrice || 0)
        return s + (estHpp * item.qty)
      }, 0)
      return sum + total
    }, 0)

    const manualSum = manualChecked ? manualItemsList.reduce((sum, item) => {
      return sum + (item.price * item.qty)
    }, 0) : 0

    const newSum = poSum + manualSum
    
    if (newSum > 0) {
      setNewAmountRaw(formatNumber(newSum))
    } else {
      setNewAmountRaw("")
    }

    // Auto-populate Title & Description if they are empty
    const selectedPOs = soIds.map(id => salesOrders.find(so => so.id === id)).filter(Boolean)
    const hasSelections = selectedPOs.length > 0 || manualChecked

    if (hasSelections) {
      if (!newTitle || newTitle.startsWith("Belanja Sourcing PO:") || newTitle.startsWith("Belanja Sourcing Stok") || newTitle.startsWith("Belanja Sourcing PO & Stok")) {
        const titleParts = []
        if (selectedPOs.length > 0) titleParts.push(`PO: ${selectedPOs.map(so => so?.poNumber).join(', ')}`)
        if (manualChecked) titleParts.push(`Stok Manual`)
        setNewTitle(`Belanja Sourcing ${titleParts.join(' & ')}`)
      }
      
      let onlineProductIds = new Set<string>()
      try {
        onlineProductIds = new Set(JSON.parse(localStorage.getItem('shopping_onlineProductIds') || '[]'))
      } catch { /* ignore */ }

      if (!newDescription || newDescription.startsWith("Kebutuhan pembelian barang")) {
        const descParts = []
        if (selectedPOs.length > 0) {
          const poDetails = selectedPOs.map(so => {
            const clientName = clients.find(c => c.id === so?.clientId)?.companyName || 'Client'
            const soItems = salesOrderItems.filter(i => i.salesOrderId === so?.id)
            const itemsDesc = soItems.map(item => {
              const prod = products.find(p => p.id === item.productId)
              const isOnline = onlineProductIds.has(item.productId)
              const estHpp = item.estimatedHpp !== undefined ? item.estimatedHpp : (prod?.basePrice || 0)
              return `  - ${item.qty}x ${prod?.name || 'Item'} @ ${formatRupiah(estHpp)}${isOnline ? ' (Belanja Online)' : ''}`
            }).join('\n')
            return `- PO ${so?.poNumber} (${clientName})\n${itemsDesc}`
          }).join('\n\n')
          descParts.push(`Kebutuhan pembelian barang untuk PO:\n\n${poDetails}`)
        }
        
        if (manualChecked && manualItemsList.length > 0) {
          const manualDetails = manualItemsList.map(item => {
            const prod = products.find(p => p.id === item.productId)
            const isOnline = onlineProductIds.has(item.productId)
            return `  - ${item.qty}x ${prod?.name || 'Item'} @ ${formatRupiah(item.price)}${isOnline ? ' (Belanja Online)' : ''}`
          }).join('\n')
          descParts.push(`Kebutuhan Item Stok Manual:\n\n${manualDetails}`)
        }

        setNewDescription(descParts.join('\n\n---\n\n'))
      }
    } else {
      if (newTitle.startsWith("Belanja Sourcing")) setNewTitle("")
      if (newDescription.startsWith("Kebutuhan pembelian barang")) setNewDescription("")
    }
  }

  const handleToggleSO = (soId: string) => {
    const nextSelected = selectedSOIds.includes(soId)
      ? selectedSOIds.filter(id => id !== soId)
      : [...selectedSOIds, soId]
    
    setSelectedSOIds(nextSelected)
    recalculateForm(nextSelected, includeManualItems)
  }

  const handleToggleManual = (checked: boolean) => {
    setIncludeManualItems(checked)
    recalculateForm(selectedSOIds, checked)
  }

  // Audit / Action Notes States
  const [financeNote, setFinanceNote] = useState("")
  const [cfoNote, setCfoNote] = useState("")

  // Step-4 disbursement modal state
  const [disburseOpen, setDisburseOpen] = useState(false)
  const [disburseType, setDisburseType] = useState<'sourcing' | 'expense'>('expense')
  const [disburseBankId, setDisburseBankId] = useState("")
  const [disburseDestBankId, setDisburseDestBankId] = useState("")
  const [disburseSourcingId, setDisburseSourcingId] = useState("")
  const [disburseContactId, setDisburseContactId] = useState("")
  const [disburseExpenseCode, setDisburseExpenseCode] = useState("6-9000")
  const [disburseAmountRaw, setDisburseAmountRaw] = useState("")
  const [disburseSpareRaw, setDisburseSpareRaw] = useState("")
  const [disburseNote, setDisburseNote] = useState("")
  const [creatingContact, setCreatingContact] = useState(false)
  const [newContactName, setNewContactName] = useState("")
  const [newContactKind, setNewContactKind] = useState<'vendor' | 'toko' | 'perorangan'>('vendor')
  const [isDisbursing, setIsDisbursing] = useState(false)

  const activePR = purchaseRequests.find(pr => pr.id === selectedPRId)

  // Map of SO id -> number of PRs already linked to it (untuk tanda "Sudah Diajukan")
  const poPRCount = useMemo(() => {
    const counts = new Map<string, number>()
    purchaseRequests.forEach(pr => {
      (pr.salesOrderIds || []).forEach(soId => {
        counts.set(soId, (counts.get(soId) || 0) + 1)
      })
    })
    return counts
  }, [purchaseRequests])

  // Estimated HPP (buy price) total for an SO — matches the Nominal Dana calc.
  // Uses item.estimatedHpp, falling back to product basePrice. NOT selling price.
  const soHppTotal = (soId: string) =>
    salesOrderItems
      .filter(item => item.salesOrderId === soId)
      .reduce((sum, item) => {
        const prod = products.find(p => p.id === item.productId)
        const estHpp = item.estimatedHpp !== undefined ? item.estimatedHpp : (prod?.basePrice || 0)
        return sum + estHpp * item.qty
      }, 0)

  // Purchases (shopping list docs) funded by this PR — used for the sourcing path.
  const linkedPurchases = (pr: PurchaseRequest) =>
    purchases.filter(p => p.purchaseRequestId === pr.id)

  const openDisburse = (pr: PurchaseRequest) => {
    setDisburseType(pr.category === 'Sourcing' ? 'sourcing' : 'expense')
    setDisburseBankId("")
    setDisburseDestBankId("")
    setDisburseSourcingId("")
    setDisburseContactId("")
    setDisburseExpenseCode("6-9000")
    setDisburseAmountRaw(formatNumber(String(pr.amount)))
    setDisburseNote("")
    setDisburseSpareRaw("")
    setCreatingContact(false)
    setNewContactName("")
    setNewContactKind('vendor')
    setDisburseOpen(true)
  }

  const handleCreateContact = async () => {
    if (!newContactName.trim()) { toast.error('Isi nama kontak.'); return }
    const id = uuidv4()
    await addVendor({
      id, companyName: newContactName.trim(), picName: '', email: '', phone: '',
      address: '', createdAt: new Date().toISOString(), kind: newContactKind,
    })
    setDisburseContactId(id)
    setCreatingContact(false)
    setNewContactName("")
    toast.success('Kontak dibuat.')
  }

  // Calculate Summary metrics
  const totalPRCount = purchaseRequests.length
  const pendingFinanceCount = purchaseRequests.filter(pr => pr.status === 'Pending_Finance').length
  const pendingCfoCount = purchaseRequests.filter(pr => pr.status === 'Pending_CFO').length
  const totalApprovedAmount = purchaseRequests
    .filter(pr => pr.status === 'Approved')
    .reduce((sum, pr) => sum + pr.amount, 0)

  // Filtering logic
  const filteredPRs = purchaseRequests.filter(pr => {
    const matchesStatus = filterStatus === "ALL" || pr.status === filterStatus
    const matchesSearch = pr.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          pr.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          pr.requestedBy.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStatus && matchesSearch
  }).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const handleCreatePR = async (e: React.FormEvent) => {
    e.preventDefault()
    const amountVal = parseNumber(newAmountRaw)
    if (!newTitle.trim() || !newDescription.trim() || amountVal <= 0) {
      toast.error("Mohon isi form dengan lengkap dan nominal lebih dari 0!")
      return
    }

    const prId = `PR-${Math.floor(1000 + Math.random() * 9000)}`
    const prPayload: PurchaseRequest = {
      id: prId,
      title: newTitle,
      description: newDescription,
      amount: amountVal,
      category: newCategory,
      status: "Pending_Finance",
      requestedBy: currentUser?.name || currentUser?.id || "Karyawan",
      salesOrderIds: selectedSOIds,
      createdAt: new Date().toISOString()
    }

    toast.loading("Mengajukan Purchase Request...", { id: "create-pr" })
    try {
      await addPurchaseRequest(prPayload)
      toast.success(`Purchase Request ${prId} berhasil dibuat!`, { id: "create-pr" })
      // Reset Form
      setNewTitle("")
      setNewDescription("")
      setNewAmountRaw("")
      setNewCategory("Sourcing")
      setSelectedSOIds([])
      setIsFormOpen(false)
    } catch (err) {
      console.error(err)
      toast.error("Gagal mengajukan Purchase Request", { id: "create-pr" })
    }
  }

  // Finance Verification Handler
  const handleFinanceVerify = async (status: 'Pending_CFO' | 'Rejected') => {
    if (!activePR) return
    if (!financeNote.trim()) {
      toast.error("Catatan Finance wajib diisi untuk verifikasi/penolakan!")
      return
    }

    toast.loading("Memproses verifikasi Finance...", { id: "finance-verify" })
    try {
      await updatePurchaseRequest(activePR.id, {
        status,
        approvedByFinance: currentUser?.name || currentUser?.id || "Finance Admin",
        financeNote: financeNote
      })
      toast.success(status === 'Pending_CFO' ? "PR Terverifikasi & diteruskan ke CFO!" : "PR berhasil ditolak oleh Finance.", { id: "finance-verify" })
      setFinanceNote("")
      setSelectedPRId(null)
    } catch (err) {
      console.error(err)
      toast.error("Gagal memproses verifikasi", { id: "finance-verify" })
    }
  }

  // CFO Approval / Release Funds Handler
  const handleCfoApprove = async (status: 'Approved' | 'Rejected') => {
    if (!activePR) return
    if (!cfoNote.trim()) {
      toast.error("Catatan CFO wajib diisi untuk approval/penolakan!")
      return
    }

    toast.loading("Memproses persetujuan CFO...", { id: "cfo-approve" })
    try {
      // 1. Update status PR
      await updatePurchaseRequest(activePR.id, {
        status,
        approvedByCfo: currentUser?.name || currentUser?.id || "CFO / Owner",
        cfoNote: cfoNote
      })

      // 2. Jika disetujui, kita bisa merekam transaksi cash di wallet target (sourcing / operasional)
      // Namun untuk PR general, ini akan dicairkan saat admin finance memproses vendor bill atau penarikan tunai.
      toast.success(status === 'Approved' ? "Dana berhasil disetujui & dilepas (Approved & Released)!" : "Pengajuan dana ditolak oleh CFO.", { id: "cfo-approve" })
      setCfoNote("")
      setSelectedPRId(null)
    } catch (err) {
      console.error(err)
      toast.error("Gagal memproses approval CFO", { id: "cfo-approve" })
    }
  }

  const handleDisburse = async () => {
    if (!activePR) return
    if (activePR.status !== 'Approved') { toast.error('PR belum di-approve CFO.'); return }
    if (activePR.disbursedAt) { toast.error('PR ini sudah dicairkan.'); return }

    const amount = parseNumber(disburseAmountRaw)
    if (amount <= 0) { toast.error('Nominal harus lebih dari 0.'); return }
    if (amount > activePR.amount) { toast.error('Nominal tidak boleh melebihi yang disetujui CFO.'); return }
    if (!disburseBankId) { toast.error('Pilih rekening sumber.'); return }

    const now = new Date().toISOString()
    setIsDisbursing(true)
    const loadingId = toast.loading('Memproses transaksi...')
    try {
      let ok = false

      if (disburseType === 'sourcing') {
        const linked = linkedPurchases(activePR)
        if (linked.length === 0) { toast.error('Belum ada shopping list untuk PR ini. Buat shopping list dulu.', { id: loadingId }); setIsDisbursing(false); return }
        if (linked.length > 1) { toast.error('PR ini punya >1 shopping list. Cairkan lewat masing-masing dokumen.', { id: loadingId }); setIsDisbursing(false); return }
        if (!disburseSourcingId) { toast.error('Pilih penanggung jawab sourcing.', { id: loadingId }); setIsDisbursing(false); return }
        if (!disburseDestBankId) { toast.error('Pilih rekening tujuan.', { id: loadingId }); setIsDisbursing(false); return }
        if (disburseDestBankId === disburseBankId) { toast.error('Rekening tujuan tidak boleh sama dengan sumber.', { id: loadingId }); setIsDisbursing(false); return }
        const spare = parseNumber(disburseSpareRaw) || 0
        const purchase = linked[0]
        const user = users.find(u => u.id === disburseSourcingId)
        // Transfer belanja + ops sekaligus (1 uang muka). Settlement misah HPP vs beban ops.
        ok = await recordBudgetTransfer(purchase.id, amount + spare, disburseBankId, user?.name || 'Sourcing', disburseDestBankId)
        if (ok) {
          await updatePurchase(purchase.id, {
            status: 'Belanja',
            purchaserId: disburseSourcingId,
            budgetAmount: amount,
            budgetTransferDate: now,
            budgetBankAccountId: disburseBankId,
            budgetDestBankAccountId: disburseDestBankId,
            budgetTransferedBy: currentUser?.id,
            operationalSpareAmount: spare,
          })
        }
      } else {
        if (!disburseContactId) { toast.error('Pilih atau buat kontak tujuan.', { id: loadingId }); setIsDisbursing(false); return }
        const contact = vendors.find(v => v.id === disburseContactId)
        ok = await recordPRExpensePayment(
          activePR.id, amount, disburseBankId, disburseExpenseCode,
          contact?.companyName || 'Kontak', disburseNote, now
        )
      }

      if (!ok) { toast.error('Gagal mencatat transaksi ke ledger.', { id: loadingId }); return }

      await updatePurchaseRequest(activePR.id, {
        disbursedAt: now,
        disbursementType: disburseType === 'sourcing' ? 'sourcing' : 'other',
        disbursedBy: currentUser?.name || currentUser?.id,
      })
      toast.success('Transaksi tercatat & dana dicairkan.', { id: loadingId })
      setDisburseOpen(false)
    } catch (e) {
      toast.error(`Gagal: ${e instanceof Error ? e.message : String(e)}`, { id: loadingId })
    } finally {
      setIsDisbursing(false)
    }
  }

  const getStatusBadge = (status: PurchaseRequestStatus) => {
    switch (status) {
      case "Pending_Finance":
        return <Badge className="bg-amber-50 text-amber-700 border-amber-200 uppercase text-[10px] font-black tracking-wider">Verifikasi Finance</Badge>
      case "Pending_CFO":
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200 uppercase text-[10px] font-black tracking-wider">Approval CFO</Badge>
      case "Approved":
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 uppercase text-[10px] font-black tracking-wider">Approved & Released</Badge>
      case "Rejected":
        return <Badge className="bg-rose-50 text-rose-700 border-rose-200 uppercase text-[10px] font-black tracking-wider">Ditolak</Badge>
      default:
        return <Badge className="bg-slate-50 text-slate-700 border-slate-200 uppercase text-[10px] font-black tracking-wider">{status}</Badge>
    }
  }

  const isFinanceRole = currentUser?.role === 'finance' || currentUser?.role === 'ceo' || currentUser?.role === 'super_admin'
  const isCfoRole = currentUser?.role === 'ceo' || currentUser?.role === 'super_admin'

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-100/40 dark:shadow-none">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white uppercase flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-emerald-600" />
            Purchase <span className="text-emerald-600">Requests</span>
          </h2>
          <p className="text-slate-400 font-bold mt-1 uppercase text-[10px] tracking-widest">
            Pengajuan Pembelian & Dana Operasional • Approval Flow 3-Tahap
          </p>
        </div>
        
        <Button 
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl px-6 h-12 font-extrabold text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
        >
          {isFormOpen ? "Tutup Form" : "Buat Pengajuan Baru"}
        </Button>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="rounded-[2rem] border-none shadow-md bg-white dark:bg-slate-900 p-6 flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-slate-100 text-slate-600">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Pengajuan</p>
            <h3 className="text-2xl font-black text-slate-800 dark:text-white">{totalPRCount} PR</h3>
          </div>
        </Card>
        
        <Card className="rounded-[2rem] border-none shadow-md bg-white dark:bg-slate-900 p-6 flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-amber-50 text-amber-600">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-amber-500 uppercase tracking-wider">Verifikasi Finance</p>
            <h3 className="text-2xl font-black text-slate-800 dark:text-white">{pendingFinanceCount} PR</h3>
          </div>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-md bg-white dark:bg-slate-900 p-6 flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-blue-50 text-blue-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-wider">Approval CFO</p>
            <h3 className="text-2xl font-black text-slate-800 dark:text-white">{pendingCfoCount} PR</h3>
          </div>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-md bg-emerald-900 text-white p-6 flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-emerald-800 text-emerald-200">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-emerald-300 uppercase tracking-wider">Total Released (CFO)</p>
            <h3 className="text-xl font-black">{formatRupiah(totalApprovedAmount)}</h3>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: PR FORM or PR LIST */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* CREATE PR FORM */}
          {isFormOpen && (
            <Card className="rounded-[2.5rem] border-none shadow-xl bg-white dark:bg-slate-900 animate-in fade-in slide-in-from-top-4 duration-300">
              <CardHeader className="border-b border-slate-50 dark:border-slate-800/50 p-8">
                <CardTitle className="text-lg font-black text-slate-800 dark:text-white uppercase flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-500" /> Form Pengajuan Dana (PR)
                </CardTitle>
                <CardDescription className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                  Isi data di bawah untuk mengajukan anggaran belanja
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                <form onSubmit={handleCreatePR} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pr-title" className="text-[10px] font-black uppercase tracking-wider text-slate-400">Judul Pengajuan</Label>
                      <Input 
                        id="pr-title"
                        placeholder="Contoh: Pembelian Timbangan Digital Gudang"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="h-12 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-category" className="text-[10px] font-black uppercase tracking-wider text-slate-400">Kategori Anggaran</Label>
                      <Select value={newCategory} onValueChange={(v) => setNewCategory(v ?? '')}>
                        <SelectTrigger className="h-12 rounded-xl">
                          <SelectValue placeholder="Pilih Kategori" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORY_OPTIONS.map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* PO Selector Block */}
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>Hubungkan dengan Sales Order / PO (Opsional)</span>
                      {selectedSOIds.length > 0 && (
                        <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full border border-emerald-200">
                          {selectedSOIds.length} PO Terpilih
                        </span>
                      )}
                    </Label>
                    
                    {salesOrders.filter(so => so.status !== 'Batal' && so.status !== 'Selesai').length === 0 ? (
                      <div className="text-xs font-bold text-slate-400 py-2 border border-dashed rounded-xl px-4 text-center">
                        Tidak ada Sales Order aktif untuk dihubungkan.
                      </div>
                    ) : (
                      <div className="max-h-[160px] overflow-y-auto rounded-xl border border-slate-150 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
                        {salesOrders
                          .filter(so => so.status !== 'Batal' && so.status !== 'Selesai')
                          .map(so => {
                            const client = clients?.find(c => c.id === so.clientId)
                            const total = soHppTotal(so.id)
                            const isChecked = selectedSOIds.includes(so.id)
                            const prCount = poPRCount.get(so.id) || 0

                            return (
                              <label
                                key={so.id}
                                className={cn(
                                  "flex cursor-pointer items-center justify-between rounded-lg border p-2.5 transition-all text-xs font-bold",
                                  isChecked
                                    ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 text-slate-800 dark:text-slate-200"
                                    : "border-slate-100 bg-white dark:bg-slate-950 hover:border-emerald-300 text-slate-600 dark:text-slate-400"
                                )}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleSO(so.id)}
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer accent-emerald-600"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="font-black text-slate-900 dark:text-slate-100">{so.poNumber}</p>
                                      {prCount > 0 && (
                                        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white shadow-sm shrink-0">
                                          {prCount > 1 ? `${prCount}× Diajukan` : 'Sudah Diajukan'}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase truncate">
                                      {client?.companyName || 'Unknown Client'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end shrink-0">
                                  <span className="text-[7px] font-black uppercase tracking-widest text-slate-400">Est. HPP</span>
                                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                                    {formatRupiah(total)}
                                  </span>
                                </div>
                              </label>
                            )
                          })}
                      </div>
                    )}
                    
                    {manualItemsList.length > 0 && (
                      <label className={cn(
                        "flex cursor-pointer items-center justify-between rounded-xl border p-3 mt-3 transition-all text-xs font-bold",
                        includeManualItems
                          ? "border-blue-400 bg-blue-50/50 dark:bg-blue-950/20 text-slate-800 dark:text-slate-200"
                          : "border-slate-200 bg-white dark:bg-slate-950 hover:border-blue-300 text-slate-600 dark:text-slate-400"
                      )}>
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={includeManualItems}
                            onChange={(e) => handleToggleManual(e.target.checked)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer accent-blue-600"
                          />
                          <div className="min-w-0">
                            <p className="font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                              Item Stok Manual
                              <span className="rounded-full bg-blue-100 dark:bg-blue-900 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-300 shadow-sm shrink-0">
                                {manualItemsList.length} Item
                              </span>
                            </p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase truncate mt-0.5">
                              Keranjang Shopping List (Belum ada PR)
                            </p>
                          </div>
                        </div>
                        <span className="font-extrabold text-blue-600 dark:text-blue-400 shrink-0">
                          {formatRupiah(manualItemsList.reduce((s, item) => s + (item.qty * item.price), 0))}
                        </span>
                      </label>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pr-amount" className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nominal Dana (Rp)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-sm font-black text-slate-400 select-none">Rp</span>
                      <Input 
                        id="pr-amount"
                        placeholder="Contoh: 1.500.000"
                        value={newAmountRaw}
                        onChange={(e) => setNewAmountRaw(formatNumber(e.target.value))}
                        className="h-12 rounded-xl pl-10 text-lg font-black text-slate-800 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pr-desc" className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tujuan & Detail Penggunaan</Label>
                    <Textarea 
                      id="pr-desc"
                      placeholder="Jelaskan kebutuhan pembelian barang secara detail, spesifikasi, dan justifikasi finansialnya..."
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      className="min-h-[100px] rounded-xl"
                    />
                  </div>

                  <Button type="submit" className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold uppercase tracking-widest text-xs rounded-xl mt-4">
                    Ajukan Sekarang
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* PR LIST */}
          <Card className="rounded-[2.5rem] border-none shadow-xl bg-white dark:bg-slate-900 overflow-hidden">
            <CardHeader className="border-b border-slate-50 dark:border-slate-800/50 p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-black text-slate-800 dark:text-white uppercase">Daftar Pengajuan</CardTitle>
                <CardDescription className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">Riwayat pengajuan Purchase Request</CardDescription>
              </div>
              
              {/* Search & Filter */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-44">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                  <Input 
                    placeholder="Cari..." 
                    className="pl-8 h-9 text-xs rounded-xl" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? '')}>
                  <SelectTrigger className="h-9 text-xs rounded-xl w-36 bg-slate-50 border-none font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <SelectValue placeholder="Filter Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL" className="text-xs font-bold">Semua Status</SelectItem>
                    <SelectItem value="Pending_Finance" className="text-xs font-bold text-amber-600">Verifikasi Finance</SelectItem>
                    <SelectItem value="Pending_CFO" className="text-xs font-bold text-blue-600">Approval CFO</SelectItem>
                    <SelectItem value="Approved" className="text-xs font-bold text-emerald-600">Approved</SelectItem>
                    <SelectItem value="Rejected" className="text-xs font-bold text-rose-600">Ditolak</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {filteredPRs.length === 0 ? (
                <div className="p-16 text-center text-slate-400 font-black uppercase text-[10px] tracking-widest flex flex-col items-center justify-center gap-2">
                  <ClipboardList className="w-8 h-8 opacity-20" />
                  Tidak ada pengajuan purchase request yang cocok
                </div>
              ) : (
                <div className="divide-y divide-slate-50 dark:divide-slate-800/40">
                  {filteredPRs.map(pr => (
                    <button
                      key={pr.id}
                      onClick={() => setSelectedPRId(pr.id)}
                      className={cn(
                        "w-full p-6 text-left hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 select-none",
                        selectedPRId === pr.id ? "bg-slate-50 dark:bg-slate-800/40 border-l-4 border-emerald-600" : ""
                      )}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-400 font-mono tracking-wider">{pr.id}</span>
                          <span className="text-[9px] font-black bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-md uppercase tracking-wider">{pr.category}</span>
                          {getStatusBadge(pr.status)}
                        </div>
                        <h4 className="font-extrabold text-slate-800 dark:text-white uppercase tracking-tight text-sm">{pr.title}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Diajukan oleh: <span className="text-slate-600 dark:text-slate-300">{pr.requestedBy}</span> • {new Date(pr.createdAt).toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'})}</p>
                      </div>
                      
                      <div className="text-right shrink-0">
                        <h4 className="text-lg font-black text-slate-900 dark:text-white">{formatRupiah(pr.amount)}</h4>
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Nominal Pengajuan</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: DETAIL PR & ACTION FORM */}
        <div className="space-y-6">
          
          <Card className="rounded-[2.5rem] border-none shadow-xl bg-white dark:bg-slate-900 overflow-hidden">
            <CardHeader className="bg-slate-50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800/50 p-8">
              <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">Detail Pengajuan Dana</CardTitle>
              <CardDescription className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">Detail dan riwayat persetujuan audit</CardDescription>
            </CardHeader>
            
            <CardContent className="p-8">
              {activePR ? (
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="space-y-3">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 font-mono tracking-wider">{activePR.id}</span>
                      <h3 className="text-xl font-black text-slate-950 dark:text-white uppercase tracking-tight mt-1">{activePR.title}</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase">Kategori</p>
                        <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">{activePR.category}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase">Tanggal</p>
                        <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">{new Date(activePR.createdAt).toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'})}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Justifikasi Anggaran</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed bg-slate-50/50 dark:bg-slate-800/30 p-4 rounded-2xl mt-1 border border-slate-100/50 dark:border-slate-800">
                        {activePR.description}
                      </p>
                    </div>

                    {/* Linked Sales Orders / POs */}
                    {activePR.salesOrderIds && activePR.salesOrderIds.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Sales Orders / PO Terkait</p>
                        <div className="max-h-[140px] overflow-y-auto rounded-2xl border border-slate-100 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-800/20 space-y-1.5">
                          {activePR.salesOrderIds.map(soId => {
                            const so = salesOrders.find(s => s.id === soId)
                            if (!so) return null
                            const client = clients.find(c => c.id === so.clientId)
                            const total = soHppTotal(so.id)
                            return (
                              <div key={soId} className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold">
                                <div className="min-w-0">
                                  <p className="font-extrabold text-slate-950 dark:text-white">{so.poNumber}</p>
                                  <p className="text-[9px] text-slate-400 font-bold uppercase truncate">
                                    {client?.companyName || 'Unknown Client'}
                                  </p>
                                </div>
                                <span className="font-black text-emerald-600 dark:text-emerald-400 shrink-0">
                                  {formatRupiah(total)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div className="p-5 bg-emerald-950 text-white rounded-[2rem] shadow-md relative overflow-hidden group">
                      <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl" />
                      <p className="text-[9px] font-black uppercase text-emerald-300 tracking-wider">Total Dana Diajukan</p>
                      <h2 className="text-3xl font-black mt-1">{formatRupiah(activePR.amount)}</h2>
                    </div>
                  </div>

                  {/* APPROVAL TIMELINE */}
                  <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Workflow State</h4>
                    
                    <div className="space-y-4">
                      {/* Step 1: Requested */}
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">1</div>
                          <div className="w-0.5 h-10 bg-emerald-600 mt-1" />
                        </div>
                        <div>
                          <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Pengajuan Awal</h5>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Oleh: {activePR.requestedBy}</p>
                        </div>
                      </div>

                      {/* Step 2: Verified */}
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs",
                            activePR.status !== 'Pending_Finance' && activePR.status !== 'Rejected' ? "bg-emerald-600 text-white" : 
                            activePR.status === 'Rejected' && !activePR.approvedByCfo ? "bg-rose-600 text-white" : "bg-slate-200 text-slate-400 dark:bg-slate-800"
                          )}>2</div>
                          <div className="w-0.5 h-10 bg-slate-200 dark:bg-slate-800 mt-1" />
                        </div>
                        <div className="flex-1">
                          <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Verifikasi Finance</h5>
                          {activePR.approvedByFinance ? (
                            <div className="space-y-1">
                              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Oleh: {activePR.approvedByFinance}</p>
                              {activePR.financeNote && <p className="text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded-lg text-slate-500 italic mt-1 font-bold">"{activePR.financeNote}"</p>}
                            </div>
                          ) : (
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 italic">Menunggu audit tim finance...</p>
                          )}
                        </div>
                      </div>

                      {/* Step 3: Approved & Released */}
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs",
                            activePR.status === 'Approved' ? "bg-emerald-600 text-white" : 
                            activePR.status === 'Rejected' && activePR.approvedByFinance ? "bg-rose-600 text-white" : "bg-slate-200 text-slate-400 dark:bg-slate-800"
                          )}>3</div>
                        </div>
                        <div className="flex-1">
                          <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Persetujuan CFO</h5>
                          {activePR.approvedByCfo ? (
                            <div className="space-y-1">
                              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Oleh: {activePR.approvedByCfo}</p>
                              {activePR.cfoNote && <p className="text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded-lg text-slate-500 italic mt-1 font-bold">"{activePR.cfoNote}"</p>}
                            </div>
                          ) : (
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 italic">Menunggu approval & rilis dana CFO...</p>
                          )}
                        </div>
                      </div>

                      {/* Step 4: Disbursement (Finance action) */}
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs",
                            activePR.disbursedAt ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-400 dark:bg-slate-800"
                          )}>4</div>
                        </div>
                        <div className="flex-1">
                          <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Pencairan Dana</h5>
                          {activePR.disbursedAt ? (
                            <div className="space-y-1">
                              <span className="inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">Sudah Dicairkan</span>
                              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                                Oleh: {activePR.disbursedBy} • {new Date(activePR.disbursedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                              </p>
                            </div>
                          ) : activePR.status === 'Approved' && isFinanceRole ? (
                            <Button
                              onClick={() => openDisburse(activePR)}
                              className="mt-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider h-9 rounded-xl px-4"
                            >
                              <DollarSign className="w-3.5 h-3.5 mr-1" /> Transaksi
                            </Button>
                          ) : (
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 italic">Menunggu pencairan dana oleh finance...</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ACTION CONTROLS */}
                  {activePR.status === 'Pending_Finance' && isFinanceRole && (
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tindakan Audit Finance</Label>
                      <Textarea 
                        placeholder="Tambahkan catatan kelayakan anggaran untuk CFO..."
                        value={financeNote}
                        onChange={(e) => setFinanceNote(e.target.value)}
                        className="min-h-[80px] rounded-xl text-xs"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Button 
                          onClick={() => handleFinanceVerify('Pending_CFO')}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl"
                        >
                          Verify & Diteruskan
                        </Button>
                        <Button 
                          onClick={() => handleFinanceVerify('Rejected')}
                          variant="outline"
                          className="border-rose-200 hover:bg-rose-50 text-rose-600 font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl"
                        >
                          Tolak (Reject)
                        </Button>
                      </div>
                    </div>
                  )}

                  {activePR.status === 'Pending_CFO' && isCfoRole && (
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tindakan Persetujuan CFO</Label>
                      <Textarea 
                        placeholder="Tambahkan catatan persetujuan CFO..."
                        value={cfoNote}
                        onChange={(e) => setCfoNote(e.target.value)}
                        className="min-h-[80px] rounded-xl text-xs"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Button 
                          onClick={() => handleCfoApprove('Approved')}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl"
                        >
                          Approve & Rilis
                        </Button>
                        <Button 
                          onClick={() => handleCfoApprove('Rejected')}
                          variant="outline"
                          className="border-rose-200 hover:bg-rose-50 text-rose-600 font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl"
                        >
                          Tolak (Reject)
                        </Button>
                      </div>
                    </div>
                  )}

                {/* Linked Shopping Lists */}
                  {activePR.status === 'Approved' && (() => {
                    const linkedPurchases = purchases.filter(p => p.purchaseRequestId === activePR.id)
                    const linkedPurchaseIds = linkedPurchases.map(lp => lp.id)
                    const onlineItems = purchaseItems.filter(pi => 
                      pi.purchaseMethod === 'Online' && 
                      linkedPurchaseIds.includes(pi.purchaseId)
                    )
                    return (
                      <div className="space-y-4">
                        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                            Shopping List Terkait ({linkedPurchases.length})
                          </p>
                          {linkedPurchases.length === 0 ? (
                            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                              <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                                Belum digunakan — compile shopping list dari menu Admin › Shopping List
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {linkedPurchases.map((p, idx) => (
                                <div key={p.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                                  <div>
                                    <p className="text-xs font-black text-slate-800">
                                      #{idx + 1} {p.advanceCode || `SL-${p.id.slice(0, 8)}`}
                                    </p>
                                    <p className="text-[10px] font-bold text-slate-400">
                                      {new Date(p.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </p>
                                  </div>
                                  <span className={cn(
                                    'rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest',
                                    p.reconciliationStatus === 'Terverifikasi' ? 'bg-emerald-100 text-emerald-700' :
                                    p.budgetTransferDate ? 'bg-blue-100 text-blue-700' :
                                    p.reconciliationStatus === 'Belum Transfer' ? 'bg-amber-100 text-amber-700' :
                                    'bg-slate-100 text-slate-500'
                                  )}>
                                    {p.reconciliationStatus === 'Terverifikasi' ? 'Selesai' :
                                     p.budgetTransferDate ? 'Dana Ditransfer' :
                                     p.reconciliationStatus === 'Belum Transfer' ? 'Menunggu Dana' :
                                     'Draft'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Linked Online Purchase Items */}
                        {onlineItems.length > 0 && (
                          <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-3 flex items-center gap-1.5">
                              <ShoppingBag className="w-3.5 h-3.5" /> Item Belanja Online ({onlineItems.length})
                            </p>
                            <div className="space-y-2">
                              {onlineItems.map(item => {
                                const prod = products.find(p => p.id === item.productId)
                                return (
                                  <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-black text-slate-800 truncate">
                                        {prod?.name || 'Unknown Product'}
                                      </p>
                                      <p className="text-[9px] font-bold text-slate-400">
                                        Qty: {item.qtyTarget} • {item.onlineRef ? `Ref: ${item.onlineRef}` : 'Menunggu Order'}
                                      </p>
                                    </div>
                                    <span className={cn(
                                      'rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest',
                                      item.isOnlineOrdered ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                    )}>
                                      {item.isOnlineOrdered ? 'Ordered' : 'Pending'}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                </div>
              ) : (
                <div className="h-60 flex flex-col items-center justify-center text-center text-slate-400 font-black uppercase text-[10px] tracking-widest gap-2">
                  <ClipboardList className="w-8 h-8 opacity-20" />
                  Pilih salah satu pengajuan untuk melihat detail
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>

      <Dialog open={disburseOpen} onOpenChange={setDisburseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transaksi Pencairan Dana</DialogTitle>
          </DialogHeader>
          {activePR && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tipe Transaksi</Label>
                <Select value={disburseType} onValueChange={(v) => setDisburseType((v as 'sourcing' | 'expense') ?? 'expense')}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sourcing">Sourcing — Belanja PO (pindah kas)</SelectItem>
                    <SelectItem value="expense">Pengeluaran / Bayar</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Dari Rekening</Label>
                <Select value={disburseBankId} onValueChange={(v) => setDisburseBankId(v ?? '')}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="-- Pilih rekening --" /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name} ({formatRupiah(b.balance)})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {disburseType === 'sourcing' && (
                <>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ke Rekening (Tujuan)</Label>
                    <Select value={disburseDestBankId} onValueChange={(v) => setDisburseDestBankId(v ?? '')}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="-- Pilih rekening tujuan --" /></SelectTrigger>
                      <SelectContent>
                        {bankAccounts.filter(b => b.id !== disburseBankId).map(b => (
                          <SelectItem key={b.id} value={b.id}>{b.name} ({formatRupiah(b.balance)})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Penanggung Jawab Sourcing</Label>
                    <Select value={disburseSourcingId} onValueChange={(v) => setDisburseSourcingId(v ?? '')}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="-- Pilih sourcing --" /></SelectTrigger>
                      <SelectContent>
                        {users.filter(u => u.role === 'sourcing').map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Operasional Tambahan (bensin/tol/parkir, opsional)</Label>
                    <Input value={disburseSpareRaw} onChange={(e) => setDisburseSpareRaw(formatNumber(e.target.value))} placeholder="Rp 0" className="h-11 rounded-xl" />
                    <p className="text-[9px] text-slate-400 font-bold">Ditransfer bareng belanja. Saat settlement dipisah: belanja → HPP, ops → beban.</p>
                  </div>
                </>
              )}

              {disburseType === 'expense' && (
                <>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ke Kontak</Label>
                      <button type="button" onClick={() => setCreatingContact(c => !c)} className="text-[9px] font-black uppercase tracking-widest text-emerald-600">
                        {creatingContact ? 'Batal' : '+ Kontak Baru'}
                      </button>
                    </div>
                    {creatingContact ? (
                      <div className="space-y-2 rounded-xl border border-slate-200 p-2">
                        <Input value={newContactName} onChange={(e) => setNewContactName(e.target.value)} placeholder="Nama kontak / toko / vendor" className="h-10 rounded-lg" />
                        <Select value={newContactKind} onValueChange={(v) => setNewContactKind((v as 'vendor' | 'toko' | 'perorangan') ?? 'vendor')}>
                          <SelectTrigger className="h-10 rounded-lg"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vendor">Vendor</SelectItem>
                            <SelectItem value="toko">Toko</SelectItem>
                            <SelectItem value="perorangan">Perorangan</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button type="button" onClick={handleCreateContact} className="w-full h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase">Simpan Kontak</Button>
                      </div>
                    ) : (
                      <Select value={disburseContactId} onValueChange={(v) => setDisburseContactId(v ?? '')}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="-- Pilih kontak --" /></SelectTrigger>
                        <SelectContent>
                          {vendors.map(v => (
                            <SelectItem key={v.id} value={v.id}>{v.companyName}{v.kind ? ` (${v.kind})` : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Jenis Pengeluaran</Label>
                    <Select value={disburseExpenseCode} onValueChange={(v) => setDisburseExpenseCode(v ?? '6-9000')}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PR_EXPENSE_TYPES.map(t => (
                          <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nominal (≤ {formatRupiah(activePR.amount)})</Label>
                <Input value={disburseAmountRaw} onChange={(e) => setDisburseAmountRaw(formatNumber(e.target.value))} className="h-11 rounded-xl" />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Keterangan (opsional)</Label>
                <Textarea value={disburseNote} onChange={(e) => setDisburseNote(e.target.value)} className="min-h-[60px] rounded-xl text-xs" />
              </div>

              <Button onClick={handleDisburse} disabled={isDisbursing} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold uppercase tracking-wider h-11 rounded-xl">
                {isDisbursing ? 'Memproses...' : 'Catat & Transfer'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

"use client"

import { useState, useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { getAdvanceWalletByUserId, recordPocketPurchase, recordPocketWithdrawal, recordPocketReturn, recordVendorTransferPurchase } from "@/lib/accounting"
import { computeBankBalances } from "@/lib/bank-balance"
import { pocketOwners, resolvePocket } from "@/lib/sourcing-pocket"
import { resolveActor } from "@/lib/actor"
import { buildMarketPriceRows } from "@/lib/market-price"
import { proofBlocker } from "@/lib/transcription-proof"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { CheckCircle2, ChevronRight, PackageCheck, ShoppingBag, Globe, Banknote, Wallet, Image as ImageIcon, XCircle, Send, Receipt, Truck } from "lucide-react"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import { OperationalExpense, PurchaseItem } from "@/types"
import { formatNumber, parseNumber, formatRupiah, cn } from "@/lib/utils"
import { selectableVendors } from "@/lib/vendor-status"
// Price history update moved to finance approval step
import ReceiptUpload from "@/components/ui/receipt-upload"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"

export default function SourcingDashboard() {
  const currentUser = useAppStore(state => state.currentUser)
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const products = useAppStore(state => state.products)
  const expenses = useAppStore(state => state.expenses)
  const updatePurchase = useAppStore(state => state.updatePurchase)
  const updatePurchaseItem = useAppStore(state => state.updatePurchaseItem)
  const addExpense = useAppStore(state => state.addExpense)
  const addReimbursement = useAppStore(state => state.addReimbursement)
  const vendors = useAppStore(state => state.vendors)
  const addVendor = useAppStore(state => state.addVendor)

  const [opsFormData, setOpsFormData] = useState<{
    transactionType: 'Biaya Operasional' | 'Kasbon'
    category: OperationalExpense['category'] | ''
    amount: number
    description: string
    receiptUrl: string
  }>({ transactionType: 'Biaya Operasional', category: '', amount: 0, description: '', receiptUrl: '' })
  const [opsLoading, setOpsLoading] = useState(false)
  const [activeItem, setActiveItem] = useState<PurchaseItem | null>(null)
  const [editPrice, setEditPrice] = useState<number>(0)
  const [editQty, setEditQty] = useState<number>(0)
  const [editNote, setEditNote] = useState<string>('')
  const [editVendorId, setEditVendorId] = useState<string>('')
  const [editPaymentMethod, setEditPaymentMethod] = useState<'Cash' | 'Tempo' | 'Transfer'>('Cash')
  const [isNewVendorOpen, setIsNewVendorOpen] = useState(false)
  const [newVendorName, setNewVendorName] = useState('')
  const [newVendorIsTempo, setNewVendorIsTempo] = useState(true)
  const [newVendorTermDays, setNewVendorTermDays] = useState(14)
  const [reconciliationNote, setReconciliationNote] = useState('')
  const [proofImage, setProofImage] = useState<string | null>(null)
  // Mode Salin: kalau yang mengetik bukan yang belanja, dia memilih atas nama siapa.
  const [onBehalfOfUserId, setOnBehalfOfUserId] = useState<string>("")

  const handleExpandItem = (item: PurchaseItem | null) => {
    setActiveItem(item)
    if (item) {
      setEditPrice(item.actualUnitPrice || 0)
      setEditQty(item.qtyPurchased || item.qtyTarget)
      setEditNote(item.notes || '')
      setEditVendorId(item.vendorId || '')
      const v = vendors.find(vd => vd.id === item.vendorId)
      setEditPaymentMethod(item.paymentMethod || (v?.isTempo ? 'Tempo' : 'Cash'))
    }
  }

  const handleCreateVendor = async () => {
    if (!newVendorName.trim()) {
      toast.error("Nama vendor harus diisi."); return
    }
    const newId = `v-${uuidv4().slice(0, 8)}`
    const vendorData = {
      id: newId,
      companyName: newVendorName.trim(),
      picName: '-',
      email: '',
      phone: '',
      address: '',
      paymentTermDays: newVendorIsTempo ? newVendorTermDays : 0,
      isTempo: newVendorIsTempo,
      createdAt: new Date().toISOString()
    }
    try {
      await addVendor(vendorData)
      setEditVendorId(newId)
      setIsNewVendorOpen(false)
      setNewVendorName('')
      setNewVendorIsTempo(true)
      setNewVendorTermDays(14)
      toast.success("Vendor baru ditambahkan!")
    } catch (e: any) {
      toast.error("Gagal membuat vendor: " + e.message)
    }
  }

  const bankAccounts = useAppStore(state => state.bankAccounts)
  const cashTransactions = useAppStore(state => state.cashTransactions)

  const derivedBanks = useMemo(() => computeBankBalances(bankAccounts, cashTransactions), [bankAccounts, cashTransactions])
  // Mode Salin: Finance/Admin PO menyalin belanja orang lapangan, jadi kantong yang
  // dipotong adalah kantong si pembelanja — bukan kantong si pengetik, dan bukan
  // tidak ada kantong sama sekali seperti sebelumnya.
  const pocketChoices = pocketOwners(derivedBanks)
  const ownPocket = resolvePocket(derivedBanks, currentUser?.id)
  const myPocket = resolvePocket(derivedBanks, currentUser?.id, onBehalfOfUserId || undefined)
  const pool = derivedBanks.find(b => b.purpose === 'sourcing')
  const pocketBalance = myPocket?.balance ?? 0

  // === DERIVED SOURCING WALLET (internal money tracker, terpisah dari buku kas perusahaan) ===
  // Modal = total budget yang sudah ditransfer finance untuk user ini (semua purchase yang sudah punya budgetTransferDate)
  // Nomor pengguna Hilman dulu ditulis mati di sini. Dengan satu orang sourcing
  // tidak terasa; dengan dua orang, keduanya melihat dompet yang sama dan bisa
  // melaporkan belanja orang lain — uangnya terpotong dari kantong yang salah.
  const myPurchases = purchases.filter(p => p.purchaserId === currentUser?.id)
  const fundedPurchases = myPurchases.filter(p => p.budgetTransferDate)
  const totalAdvanceReceived = fundedPurchases.reduce((sum, p) =>
    sum + (p.budgetAmount || 0) + (p.operationalSpareAmount || 0), 0
  )

  // Belanja yang sudah di-submit (status Selesai + rekon Laporan Masuk atau Terverifikasi)
  const submittedPurchases = myPurchases.filter(p =>
    p.reconciliationStatus === 'Laporan Masuk' || p.reconciliationStatus === 'Terverifikasi'
  )
  const totalShopSpent = submittedPurchases.reduce((sum, p) => sum + (p.actualSpent || 0), 0)

  // Expenses (ops) yang sudah di-report (Pending Audit + Approved — belum direject)
  const myExpenses = expenses.filter(e => e.reporterId === currentUser?.id)
  const pendingExpenses = myExpenses.filter(e => e.status === 'Pending Audit')
  const totalExpenses = myExpenses
    .filter(e => e.status !== 'Rejected')
    .reduce((sum, e) => sum + e.amount, 0)

  // Saldo = modal diterima - belanja - ops (semua derived, tidak pakai CashTransaction)
  const totalHolding = totalAdvanceReceived - totalShopSpent - totalExpenses

  const activePurchases = purchases.filter(p =>
    (p.status === 'Pending' || p.status === 'Belanja') && 
    // Dokumen yang belum dipegang siapa pun tetap terlihat semua orang sourcing —
    // kalau tidak, belanja yang belum ditugaskan tidak terlihat siapa pun.
    (!p.purchaserId || p.purchaserId === 'pending' || p.purchaserId === currentUser?.id)
  )
  
  // Vendor items skip sourcing entirely — vendor delivers direct, warehouse accepts via Inbound.
  const currentItems = purchaseItems.filter(pi =>
    activePurchases.some(p => p.id === pi.purchaseId) &&
    pi.purchaseMethod === 'Pasar'
  )

  const itemsByVendor = useMemo(() => {
    const groups: Record<string, typeof currentItems> = {}
    currentItems.forEach(item => {
      const vId = item.vendorId || 'unassigned'
      if (!groups[vId]) groups[vId] = []
      groups[vId].push(item)
    })
    return groups
  }, [currentItems])
 
  const completedItems = currentItems.filter(i => i.isChecked).length
  const totalItems = currentItems.length
  const isAllDone = totalItems > 0 && completedItems === totalItems
 
  const handleItemToggle = (item: PurchaseItem, checked: boolean) => {
    const updates: Partial<PurchaseItem> = { isChecked: checked }
    if (checked && !item.qtyPurchased) { updates.qtyPurchased = item.qtyTarget }
    updatePurchaseItem(item.id, updates)
  }
  
  // Handlers for local edits are now integrated into the completion/transfer functions
  // to avoid high-frequency database sync during typing.
 
  const handleTransferToOnline = async (item: PurchaseItem) => {
    await updatePurchaseItem(item.id, { 
      isChecked: true, 
      purchaseMethod: 'Online', 
      notes: editNote || 'Tidak ada di pasar - Alihkan ke Online (Finance)',
      actualUnitPrice: editPrice,
      qtyPurchased: editQty
    })
    handleExpandItem(null)
    toast.success(`${products.find(p => p.id === item.productId)?.name} dialihkan ke antrean Online Admin.`)
  }
 
  const handleSubmitLaporan = async () => {
    if (activePurchases.length === 0) return

    // Submit validation: all checked items must have a vendorId (currentItems is Pasar-only)
    const itemsWithoutVendor = currentItems.filter(item => {
      const vendorId = activeItem?.id === item.id ? editVendorId : item.vendorId;
      return item.isChecked && !vendorId;
    });

    if (itemsWithoutVendor.length > 0) {
      const names = itemsWithoutVendor.map(item => {
        const prod = products.find(p => p.id === item.productId);
        return prod ? prod.name : `Item ID ${item.id}`;
      });
      toast.error(`Semua item belanja wajib memiliki Vendor. Item berikut belum ada vendor: ${names.join(', ')}`);
      return;
    }

    // Belanja tunai hanya bisa dibukukan lewat kantong si pembelanja. Tanpa kantong,
    // recordPocketPurchase di bawah tidak pernah jalan dan uangnya tidak pernah keluar
    // dari kas mana pun — laporan tetap "berhasil" padahal saldo bank tidak berkurang.
    // Blokir di depan daripada kehilangan jejak uangnya.
    const cashSpendTotal = currentItems.reduce((sum, item) => {
      if (!item.isChecked || item.purchaseMethod === 'Online') return sum
      const method = activeItem?.id === item.id ? editPaymentMethod : (item.paymentMethod || 'Cash')
      if (method !== 'Cash') return sum
      const price = activeItem?.id === item.id ? editPrice : (item.actualUnitPrice || 0)
      const qty = activeItem?.id === item.id ? (editQty || item.qtyTarget) : (item.qtyPurchased || 0)
      return sum + qty * price
    }, 0)

    if (cashSpendTotal > 0 && !myPocket) {
      toast.error("Pilih dulu belanja ini atas nama siapa — uangnya harus dipotong dari kantong orang yang belanja. Kalau kantongnya belum ada, minta Finance membuatkan di Cash & Bank (purpose \"Kantong Sourcing\" + owner orangnya).")
      return
    }

    // Laporan salinan wajib membawa foto kertasnya. Kertas itu satu-satunya asli,
    // dan begitu hilang angka di sistem tidak punya bukti apa pun di belakangnya.
    const proofProblem = proofBlocker(onBehalfOfUserId, currentUser?.id, proofImage)
    if (proofProblem) {
      toast.error(proofProblem)
      return
    }

    const loadingToast = toast.loading("Mengirim laporan belanja...")
    
    try {
      // Final sync of the currently editing item if it exists
      if (activeItem) {
        updatePurchaseItem(activeItem.id, {
          actualUnitPrice: editPrice,
          qtyPurchased: editQty || activeItem.qtyTarget,
          notes: editNote,
          vendorId: editVendorId,
          paymentMethod: editPaymentMethod,
        })
      }

      for (const p of activePurchases) {
        const pItems = currentItems.filter(item => item.purchaseId === p.id && item.isChecked)
        const lineTotal = (item: PurchaseItem) => {
          const price = activeItem?.id === item.id ? editPrice : (item.actualUnitPrice || 0)
          const qty = activeItem?.id === item.id ? (editQty || item.qtyTarget) : (item.qtyPurchased || 0)
          return qty * price
        }
        const pm = (item: PurchaseItem) => (activeItem?.id === item.id ? editPaymentMethod : (item.paymentMethod || 'Cash'))
        const pTotalCost = pItems.reduce((sum, item) => sum + lineTotal(item), 0)
        // Only Cash draws the sourcer's cash advance/pocket — Tempo defers to AP, Transfer is paid by finance from BCA.
        const pCashCost = pItems.reduce((sum, item) => pm(item) === 'Cash' ? sum + lineTotal(item) : sum, 0)
        const pBudget = (p.budgetAmount || 0) + (p.operationalSpareAmount || 0)

        await updatePurchase(p.id, {
          status: 'Selesai',
          // Yang belanja di lapangan, bukan yang mengetik laporannya.
          purchaserId: resolveActor(onBehalfOfUserId, currentUser?.id),
          actualSpent: pTotalCost,
          changeReturned: pBudget > pCashCost ? pBudget - pCashCost : 0,
          reconciliationNote: reconciliationNote || 'Sesuai budget (Auto-Consolidated)',
          reconciliationStatus: 'Laporan Masuk',
          reconciliationProofUrl: proofImage || undefined
        })

        if (myPocket) {
          // Cash items draw the sourcer's pocket. Online is always paid from BCA by finance
          // regardless of paymentMethod field, so it's excluded here too.
          const pocketSpend = pItems.reduce((sum, item) =>
            (pm(item) === 'Cash' && item.purchaseMethod !== 'Online') ? sum + lineTotal(item) : sum, 0)
          if (pocketSpend > 0) {
            await recordPocketPurchase(p.id, myPocket.id, pocketSpend, currentUser?.name || 'Sourcing')
          }
        }

        // Transfer = paid immediately by finance from BCA, no queue/approval — post now.
        const transferSpend = pItems.reduce((sum, item) =>
          (pm(item) === 'Transfer' && item.purchaseMethod !== 'Online') ? sum + lineTotal(item) : sum, 0)
        if (transferSpend > 0) {
          const bca = bankAccounts.find(b => b.accountCode === '1-1200')
          if (bca) {
            await recordVendorTransferPurchase(p.id, bca.id, transferSpend, currentUser?.name || 'Sourcing')
          }
        }
      }

      // Cash belanja dibukukan real ke kantong via recordPocketPurchase; sisa derived dari saldo pocket
      // Harga rekomendasi produk baru di-update setelah finance approve rekon (bukan di sini)

      // Harga pasar hari ini ikut tercatat dari angka yang barusan diketik — tidak ada
      // ketikan tambahan, dan ini bahan untuk batas harga beli nanti. Kegagalan di sini
      // tidak boleh menggagalkan laporan belanjanya: yang dicatat cuma data pendukung.
      try {
        const today = new Date().toISOString().slice(0, 10)
        const addVendorPrice = useAppStore.getState().addVendorPrice
        for (const row of buildMarketPriceRows(currentItems, today, 'salin-belanja')) {
          await addVendorPrice({
            id: uuidv4(),
            vendorId: row.vendorId,
            productId: row.productId,
            price: row.price,
            uom: products.find(p => p.id === row.productId)?.uom || 'Kg',
            validFrom: row.validFrom,
            validTo: row.validTo,
            status: row.status,
            source: row.source,
            lastUpdated: new Date().toISOString(),
          } as never)
        }
      } catch (e) {
        console.warn('[market-price] gagal mencatat harga pasar harian:', e)
      }

      // Ambil semua salesOrderId unik dari items yang baru saja disubmit
      const purchaseIds = activePurchases.map(p => p.id)
      const involvedSOIds = new Set(
        currentItems
          .filter(item => purchaseIds.includes(item.purchaseId) && item.isChecked && item.salesOrderId)
          .map(item => item.salesOrderId as string)
      )

      const updateSO = useAppStore.getState().updateSalesOrder
      for (const soId of involvedSOIds) {
        await updateSO(soId, { status: 'QC' })
      }

      toast.success(`${activePurchases.length} sesi belanja berhasil diselesaikan!`, { id: loadingToast })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      toast.error("Gagal mengirim laporan: " + message, { id: loadingToast })
    }
  }

  const handleOpsSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!opsFormData.category) return toast.error("Pilih kategori biaya dulu!")
    if (opsFormData.amount <= 0) return toast.error("Nominal gak boleh nol!")
    if (!opsFormData.description) return toast.error("Isi keterangan singkat!")
    if (opsFormData.transactionType === 'Kasbon' && !opsFormData.receiptUrl) return toast.error("Foto bukti wajib untuk reimbursement!")
    // Biaya harus punya pemilik. Dulu ada nomor pengguna cadangan yang ditulis
    // mati di sini, jadi biaya tanpa sesi tercatat atas nama orang lain.
    if (!currentUser?.id) return toast.error("Sesi habis. Masuk ulang dulu sebelum mencatat biaya.")

    setOpsLoading(true)
    const id = uuidv4()
    
    // Find active purchase to link this expense to
    // Attach to the newest shopping run still open for this sourcer. Pool-funded
    // runs have no budgetTransferDate, so requiring it orphaned their ops costs.
    const activePurchase = myPurchases
      .filter(p => p.reconciliationStatus !== 'Laporan Masuk' && p.reconciliationStatus !== 'Terverifikasi')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
    const activePurchaseId = activePurchase?.id

    if (opsFormData.transactionType === 'Kasbon') {
      addReimbursement({
        id,
        date: new Date().toISOString(),
        userId: currentUser?.id || 'system',
        purchaseId: activePurchaseId,
        title: `${opsFormData.category}: ${opsFormData.description}`,
        amount: opsFormData.amount,
        description: opsFormData.description,
        receiptUrl: opsFormData.receiptUrl,
        status: 'Pending',
        kind: 'Manual'
      })
      toast.success("Pengajuan Reimbursement berhasil dikirim!")
    } else {
      const kasAmount = Math.max(0, Math.min(opsFormData.amount, pocketBalance))
      const reimbAmount = opsFormData.amount - kasAmount

      if (kasAmount > 0) {
        addExpense({
          id,
          date: new Date().toISOString(),
          reporterId: currentUser?.id,
          purchaseId: activePurchaseId,
          category: (opsFormData.category || 'Lainnya') as OperationalExpense['category'],
          amount: kasAmount,
          description: opsFormData.description,
          receiptUrl: opsFormData.receiptUrl,
          status: 'Pending Audit'
        })
      }

      if (reimbAmount > 0) {
        addReimbursement({
          id: uuidv4(),
          date: new Date().toISOString(),
          userId: currentUser?.id || 'system',
          purchaseId: activePurchaseId,
          title: `${opsFormData.category}: ${opsFormData.description} (Auto-Talangan)`,
          amount: reimbAmount,
          description: opsFormData.description,
          receiptUrl: opsFormData.receiptUrl,
          status: 'Pending',
          kind: 'Auto-Talangan'
        })
      }

      if (kasAmount > 0 && reimbAmount > 0) {
        toast.success(`Biaya dipecah: Potong Kas ${formatRupiah(kasAmount)} & Talangan ${formatRupiah(reimbAmount)}`)
      } else if (reimbAmount > 0) {
        toast.success("Saldo kurang, otomatis dialihkan ke Reimbursement (Talangan)!")
      } else {
        toast.success("Laporan biaya (Potong Kas) berhasil dikirim untuk audit!")
      }
    }
    setOpsFormData({ transactionType: 'Biaya Operasional', category: '', amount: 0, description: '', receiptUrl: '' })
    setOpsLoading(false)
  }

  // Belanjaan real-time (belum disubmit, hanya untuk progress bar saat masih belanja)
  const itemPM = (item: PurchaseItem) => (activeItem?.id === item.id ? editPaymentMethod : (item.paymentMethod || 'Cash'))
  const itemLineTotal = (item: PurchaseItem) => {
    const price = activeItem?.id === item.id ? editPrice : (item.actualUnitPrice || 0)
    const qty = activeItem?.id === item.id ? (editQty || item.qtyTarget) : (item.qtyPurchased || 0)
    return qty * price
  }
  const totalTempoActual = currentItems.reduce((sum, item) =>
    (item.isChecked && itemPM(item) === 'Tempo') ? sum + itemLineTotal(item) : sum, 0)

  const todayStr = new Date().toISOString().slice(0, 10)
  const myPocketTx = cashTransactions.filter(t => t.bankAccountId === myPocket?.id && t.date.slice(0, 10) === todayStr)
  const ditarikHariIni = myPocketTx.filter(t => t.type === 'In' && t.category === 'Tarik Kantong Sourcing').reduce((s, t) => s + t.amount, 0)
  const belanjaHariIni = myPocketTx.filter(t => t.type === 'Out' && t.category === 'Belanja Sourcing (HPP)').reduce((s, t) => s + t.amount, 0)
  const alreadyClosedToday = useAppStore.getState().tutupHariKantong.some(m => m.sourcerId === currentUser?.id && m.date === todayStr)

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-500 pb-20">
      {/* Bank Overview — 2 box layout */}
      <div className="grid grid-cols-2 gap-3">
        {/* Box 1: Advance received */}
        <div className="bg-slate-900 rounded-[2rem] p-5 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full blur-2xl -mr-6 -mt-6" />
          <div className="relative z-10 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/10 rounded-xl">
                <Wallet className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Kantong</span>
            </div>
            <div>
              <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest leading-none mb-1">Ditarik Hari Ini</p>
              <p className="text-2xl font-black tracking-tighter leading-none">{formatRupiah(ditarikHariIni)}</p>
            </div>
          </div>
        </div>

        {/* Box 2: Balance sheet mini */}
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-[2rem] p-5 flex flex-col gap-3">
          <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest leading-none">Estimasi Sisa</p>
          <p className={cn("text-2xl font-black tracking-tighter leading-none", pocketBalance < 0 ? "text-rose-500" : "text-emerald-600")}>
            {formatRupiah(pocketBalance)}
          </p>
          <div>
            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full bg-emerald-500 transition-all duration-700 rounded-full"
                style={{ width: `${ditarikHariIni > 0 ? Math.min(100, (belanjaHariIni / ditarikHariIni) * 100) : 0}%` }}
              />
            </div>
            <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">
              Pemakaian: {formatRupiah(belanjaHariIni)}
            </p>
          </div>
          {totalTempoActual > 0 && (
            <p className="text-[8px] font-black uppercase text-amber-500 tracking-widest">+ Tempo: {formatRupiah(totalTempoActual)}</p>
          )}
        </div>
      </div>

      {/* Pocket panel — always visible, independent of active shopping tasks */}
      {myPocket ? (
        <div className="bg-violet-50 border border-violet-200 rounded-[2rem] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-violet-600" />
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-700">Kantong Hari Ini · {myPocket.name}</p>
            </div>
            <p className="text-xl font-black text-violet-800">{formatRupiah(pocketBalance)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-violet-600">
            <span>Ditarik: {formatRupiah(ditarikHariIni)}</span>
            <span>Kepake: {formatRupiah(belanjaHariIni)}</span>
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-1 flex-1 bg-white border-2 border-violet-200 rounded-xl px-3 focus-within:border-violet-500">
              <span className="text-xs font-bold text-slate-400">Rp</span>
              <input type="text" inputMode="numeric" id="pocket-withdraw-input" placeholder="0"
                className="flex-1 h-12 bg-transparent text-lg font-bold outline-none" />
            </div>
            <Button className="h-12 px-5 bg-violet-600 hover:bg-violet-700 font-bold rounded-xl"
              onClick={async () => {
                const val = parseNumber((document.getElementById('pocket-withdraw-input') as HTMLInputElement).value)
                if (val <= 0) return toast.error('Masukkan nominal tarik.')
                if (!pool) return toast.error('Rekening Bank Jago (pool) belum di-set finance.')
                if (val > (pool.balance ?? 0)) return toast.error(`Pool Bank Jago tidak cukup (tersedia ${formatRupiah(pool.balance ?? 0)}). Minta finance top-up.`)
                const ok = await recordPocketWithdrawal(pool.id, myPocket.id, val, currentUser?.name || 'Sourcing')
                if (ok) { toast.success(`Tarik ${formatRupiah(val)} ke kantong.`); (document.getElementById('pocket-withdraw-input') as HTMLInputElement).value = '' }
                else toast.error('Gagal tarik.')
              }}>
              Tarik
            </Button>
          </div>
          <Button
            disabled={pocketBalance <= 0 || alreadyClosedToday}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 font-black rounded-xl uppercase text-[11px] tracking-widest disabled:opacity-40"
            onClick={async () => {
              if (!pool || !myPocket) return
              const ok = await recordPocketReturn(myPocket.id, pool.id, pocketBalance, currentUser?.name || 'Sourcing')
              if (!ok) return toast.error('Gagal setor sisa.')
              await useAppStore.getState().addTutupHariKantong({
                // Kantong siapa yang ditutup, bukan siapa yang menekan tombolnya.
                id: uuidv4(), sourcerId: myPocket.ownerUserId || currentUser?.id || 'unknown', pocketBankAccountId: myPocket.id,
                date: todayStr, ditarik: ditarikHariIni, belanja: belanjaHariIni,
                disetor: pocketBalance, defisit: pocketBalance < 0 ? Math.abs(pocketBalance) : 0,
                closedAt: new Date().toISOString(), closedBy: currentUser?.name || currentUser?.id || 'Sourcing',
              })
              toast.success('Hari ditutup, sisa disetor ke Bank Jago.')
            }}>
            {alreadyClosedToday ? 'Hari Sudah Ditutup' : 'Tutup Hari (Setor Sisa)'}
          </Button>
          <p className="text-[9px] text-violet-400 font-bold uppercase">Tarik sesuai kebutuhan (boleh berkali-kali). Tiap sore tutup hari — sisa balik ke Bank Jago.</p>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-5 text-[11px] font-bold text-amber-700">
          Kantong sourcing kamu belum di-set. Minta finance bikin rekening kantong (purpose "Kantong Sourcing" + owner kamu) di Cash & Bank.
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 px-1">Checklist Belanja</h2>
        <>
          {activePurchases.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-16 px-6">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-sm font-black uppercase tracking-widest text-slate-400">Tidak ada tugas belanja aktif</p>
            </div>
          )}
          {activePurchases.length > 0 && <>
          {/* Header Info */}
          <div className="bg-white dark:bg-slate-900 -mx-4 p-4 border-b shadow-sm mb-6 rounded-b-[2rem]">
            <h2 className="text-lg font-bold">Daftar Belanja Hari Ini</h2>
            <p className="text-sm text-slate-500">
              Target: {totalItems} jenis barang
            </p>
            
            {/* Progress */}
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-emerald-600">{completedItems} Selesai</span>
                <span className="text-slate-500">{totalItems - completedItems} Tersisa</span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-500 ease-out" 
                  style={{ width: `${totalItems > 0 ? (completedItems / totalItems) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>

      <div className="space-y-6">
        {Object.entries(itemsByVendor).map(([vendorId, items]) => {
          const vendor = vendors.find(v => v.id === vendorId)
          const vendorName = vendor ? vendor.companyName : "Vendor Belum Ditentukan"
          
          return (
            <div key={`vendor-group-${vendorId}`} className="space-y-3">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl">
                <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  {vendorName} ({items.length} barang)
                </h3>
              </div>
              <div className="space-y-3">
                {items.map((item) => {
                  const product = products.find(p => p.id === item.productId)
                  if (!product) return null

                  const isExpanded = activeItem?.id === item.id
                  const itemVendor = vendors.find(v => v.id === item.vendorId)
                  const itemVendorName = itemVendor ? itemVendor.companyName : "Belum Ditentukan"

                  return (
                    <Card 
                      key={item.id} 
                      className={`overflow-hidden transition-all ${
                        item.isChecked 
                          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/10' 
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {/* Base view (always visible) */}
                      <div 
                        className="p-4 flex items-center justify-between cursor-pointer"
                        onClick={() => handleExpandItem(isExpanded ? null : item)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="pt-0.5">
                            <Checkbox 
                              checked={item.isChecked}
                              onCheckedChange={(checked) => {
                                // Langsung jalankan update di background biar UI tidak ngelag
                                setTimeout(() => handleItemToggle(item, checked as boolean), 10)
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className={item.isChecked ? 'data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white' : ''}
                            />
                          </div>
                          <div>
                            <h3 className={`font-semibold text-[15px] leading-tight ${item.isChecked ? 'line-through text-slate-500' : ''}`}>
                              {product.name}
                              {(item.paymentMethod === 'Tempo') && (
                                <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">Tempo</span>
                              )}
                            </h3>
                            <div className="space-y-0.5 mt-1">
                              <p className="text-xs text-slate-500 font-medium">
                                Target Beli: <span className="text-emerald-600 font-bold">{item.qtyTarget} {product.uom}</span>
                                {item.estimatedUnitPrice > 0 && (
                                  <> • Target Harga: <span className="text-slate-800 font-black">{formatRupiah(item.estimatedUnitPrice)}</span></>
                                )}
                              </p>
                              <p className="text-[10px] text-slate-400 font-medium">
                                Vendor PO: <span className="text-slate-600 font-bold">{itemVendorName}</span>
                              </p>
                            </div>
                            {item.purchaseMethod === 'Online' && (
                               <Badge variant="outline" className="mt-1.5 bg-blue-50 text-blue-600 border-blue-200 text-[9px] font-black uppercase">🛒 Online Queue</Badge>
                            )}
                          </div>
                        </div>
                        {!item.isChecked && (
                          <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        )}
                      </div>

                      {/* Expanded details view for active items */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-0 border-t border-slate-100 dark:border-slate-800 mt-2">
                          <div className="pt-4 grid gap-4">

                            {/* currentItems is Pasar-only now — Vendor delivers direct via Inbound */}
                            <>
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg flex justify-between items-center">
                                  <span className="text-xs text-slate-500">Estimasi Harga Pusat:</span>
                                  <span className="text-sm font-bold">{formatRupiah(item.estimatedUnitPrice)} / {product.uom}</span>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                      Harga Satuan (Pasar)
                                    </Label>
                                    <div className="flex items-center gap-2">
                                      <span className="text-slate-400 font-bold text-xs">Rp</span>
                                      <Input
                                        type="text"
                                        inputMode="numeric"
                                        className="h-12 text-lg font-bold bg-white/50 border-2 transition-all focus:border-emerald-500"
                                        placeholder="0"
                                        value={formatNumber(editPrice)}
                                        onChange={(e) => setEditPrice(parseNumber(e.target.value))}
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                      Qty Dibeli ({product.uom})
                                    </Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="any"
                                      className="h-12 text-lg font-bold bg-white/50 border-2 transition-all focus:border-emerald-500"
                                      placeholder={`${item.qtyTarget}`}
                                      value={editQty || ''}
                                      onChange={(e) => setEditQty(parseFloat(e.target.value) || 0)}
                                    />
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex justify-between items-center">
                                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vendor</Label>
                                    <button
                                      type="button"
                                      onClick={() => setIsNewVendorOpen(true)}
                                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                                    >
                                      + Vendor Baru
                                    </button>
                                  </div>
                                  <Select value={editVendorId} onValueChange={val => setEditVendorId(val || '')}>
                                    <SelectTrigger className="h-12 bg-white/50 border-2 transition-all focus:border-emerald-500 rounded-xl">
                                      <SelectValue placeholder="— Pilih Vendor —" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {selectableVendors(vendors).map(v => (
                                        <SelectItem key={v.id} value={v.id}>
                                          {v.companyName} {v.isTempo ? `(tempo ${v.paymentTermDays || 14}d)` : '(cash)'}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Metode Bayar</Label>
                                  <Select value={editPaymentMethod} onValueChange={(val) => setEditPaymentMethod((val as 'Cash' | 'Tempo') ?? 'Cash')}>
                                    <SelectTrigger className="h-12 bg-white/50 border-2 transition-all focus:border-emerald-500 rounded-xl"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Cash">Cash (potong kas sourcing)</SelectItem>
                                      <SelectItem value="Tempo">Tempo (hutang ke vendor)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    Keterangan / Alasan (Opsional)
                                  </Label>
                                  <Input
                                    type="text"
                                    className="h-12 bg-white/50 border-2 transition-all focus:border-emerald-500"
                                    placeholder="Misal: Stok habis, atau barang sisa sedikit"
                                    value={editNote}
                                    onChange={(e) => setEditNote(e.target.value)}
                                  />
                                </div>

                                <div className="pt-2">
                                  <ReceiptUpload
                                    label="Foto Nota (Opsional)"
                                    onFileSelect={(url) => updatePurchaseItem(item.id, { receiptUrl: url })}
                                    currentFile={item.receiptUrl}
                                  />
                                </div>

                                <div className="flex flex-col gap-2 pt-2">
                                  <Button
                                    className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-base font-bold"
                                    onClick={() => {
                                      if (!editVendorId) {
                                        toast.error("Wajib memilih Vendor.");
                                        return;
                                      }
                                      handleExpandItem(null);
                                      setTimeout(() => {
                                        updatePurchaseItem(item.id, {
                                          actualUnitPrice: editPrice,
                                          qtyPurchased: editQty || item.qtyTarget,
                                          notes: editNote,
                                          vendorId: editVendorId,
                                          paymentMethod: editPaymentMethod,
                                          isChecked: true
                                        })
                                      }, 10);
                                    }}
                                    disabled={!editPrice || editPrice <= 0 || !editVendorId}
                                  >
                                    Tandai Selesai (Beli di Pasar)
                                  </Button>

                                  <div className="flex items-center gap-2">
                                    <div className="h-px flex-1 bg-slate-200" />
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Atau Alihkan</span>
                                    <div className="h-px flex-1 bg-slate-200" />
                                  </div>

                                  <Button
                                    variant="outline"
                                    className="w-full h-12 border-blue-200 text-blue-600 hover:bg-blue-50 font-bold"
                                    onClick={() => handleTransferToOnline(item)}
                                  >
                                    <Globe className="w-4 h-4 mr-2" /> Tidak ada di pasar, Beli Online
                                  </Button>
                                </div>
                            </>
                          </div>
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {isAllDone && activePurchases.length > 0 && (() => {
        const checkedItems = currentItems.filter(i => i.isChecked)
        const itemsCost = checkedItems.reduce((sum, item) => {
          const qty = item.qtyPurchased || item.qtyTarget
          return sum + (qty * (item.actualUnitPrice || 0))
        }, 0)
        const shoppingBudget = activePurchases.reduce((sum, p) => sum + (p.budgetAmount || 0), 0)
        const spareBudget = activePurchases.reduce((sum, p) => sum + (p.operationalSpareAmount || 0), 0)
        const totalBudgetGiven = shoppingBudget + spareBudget
        
        const diff = totalBudgetGiven - itemsCost
        const hasBudget = totalBudgetGiven > 0

        return (
          <div className="mt-8 pb-8 animate-in slide-in-from-bottom-5">
            {/* Mode Salin: yang mengetik bukan yang belanja, jadi dia harus menunjuk
                kantong siapa yang dipotong. Tanpa pilihan ini laporannya ditolak. */}
            {!ownPocket && pocketChoices.length > 0 && (
              <div className="mb-4 p-4 rounded-2xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900">
                <label className="text-xs font-black text-amber-800 dark:text-amber-500 uppercase tracking-wider">
                  Belanja atas nama
                </label>
                <select
                  className="mt-2 w-full h-11 rounded-xl border border-amber-200 bg-white dark:bg-slate-900 px-3 text-sm font-bold"
                  value={onBehalfOfUserId}
                  onChange={(e) => setOnBehalfOfUserId(e.target.value)}
                >
                  <option value="">— Pilih orang yang belanja —</option>
                  {pocketChoices.map(p => (
                    <option key={p.id} value={p.ownerUserId as string}>
                      {useAppStore.getState().users.find(u => u.id === p.ownerUserId)?.name || p.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-amber-700 dark:text-amber-600 mt-2 font-semibold">
                  Uangnya dipotong dari kantong orang yang dipilih, bukan kantong kamu.
                </p>
              </div>
            )}
            <Button
              className="w-full h-14 text-lg font-bold shadow-lg shadow-emerald-500/25 bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSubmitLaporan}
            >
              <PackageCheck className="w-6 h-6 mr-2" />
              Submit Laporan Belanja
            </Button>
          </div>
        )
      })()}
      </>}
        </>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 px-1">Dompet & Setor Kas</h2>
        <div className="space-y-4 animate-in slide-in-from-bottom-5 duration-500">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Riwayat Kas Sourcing</h3>
            <Badge variant="outline" className="text-[8px] font-black uppercase border-slate-200">Real-time POV</Badge>
          </div>

          {/* Cycle Clean State: semua sudah di-approve finance & saldo nol */}
          {pendingExpenses.length === 0 && submittedPurchases.filter(p => p.reconciliationStatus === 'Laporan Masuk').length === 0 && totalAdvanceReceived === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600">Siklus Selesai</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase">Semua laporan sudah diverifikasi Finance.<br/>Riwayat dibersihkan untuk siklus berikutnya.</p>
            </div>
          ) : (
          <div className="space-y-3">
             {/* Modal Masuk (from funded purchases) */}
             {fundedPurchases.map(p => (
               <Card key={`adv-${p.id}`} className="rounded-2xl border-none shadow-sm hover:shadow-md transition-all overflow-hidden bg-white">
                  <CardContent className="p-4 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm bg-emerald-50 text-emerald-600">
                           <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                           <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Dana Advance dari Finance</p>
                           <div className="flex items-center gap-2">
                             <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(p.budgetTransferDate!).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</p>
                             <span className="w-1 h-1 bg-slate-200 rounded-full" />
                             <p className="text-[9px] font-bold text-slate-400 uppercase">Modal Masuk</p>
                           </div>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="font-black tracking-tighter text-emerald-600">+{formatRupiah((p.budgetAmount || 0) + (p.operationalSpareAmount || 0))}</p>
                        <Badge variant="outline" className="text-[8px] font-black uppercase border-emerald-100 text-emerald-400 bg-emerald-50/50">Diterima</Badge>
                     </div>
                  </CardContent>
               </Card>
             ))}

             {/* Active Shopping Items (real-time, in-progress) */}
             {currentItems.filter(i => i.isChecked && (i.actualUnitPrice || 0) > 0).map(item => {
               const product = products.find(p => p.id === item.productId)
               const qty = item.qtyPurchased || item.qtyTarget
               const total = qty * (item.actualUnitPrice || 0)
               return (
                 <Card key={item.id} className="rounded-2xl border-none shadow-sm bg-rose-50/40 border-l-4 border-l-rose-400">
                   <CardContent className="p-4 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shadow-sm">
                         <ShoppingBag className="w-5 h-5" />
                       </div>
                       <div>
                         <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">{product?.name || 'Produk'}</p>
                         <p className="text-[9px] font-bold text-rose-400 uppercase italic">{qty} {product?.uom} × {formatRupiah(item.actualUnitPrice || 0)} · Belum Disubmit</p>
                       </div>
                     </div>
                     <div className="text-right">
                       <p className="font-black tracking-tighter text-rose-500">-{formatRupiah(total)}</p>
                       <Badge variant="outline" className="text-[8px] font-black uppercase border-rose-200 text-rose-400">Real-time</Badge>
                     </div>
                   </CardContent>
                 </Card>
               )
             })}

             {/* Submitted Shopping (awaiting finance approval) */}
             {submittedPurchases.filter(p => p.reconciliationStatus === 'Laporan Masuk').map(p => (
               <Card key={p.id} className="rounded-2xl border-none shadow-sm bg-slate-50/50 border-l-4 border-l-blue-400">
                  <CardContent className="p-4 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm">
                           <ShoppingBag className="w-5 h-5" />
                        </div>
                        <div>
                           <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Laporan Belanja - Ref: {p.id.slice(0, 8)}</p>
                           <p className="text-[9px] font-bold text-blue-500 uppercase italic">Menunggu Approval Finance</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="font-black tracking-tighter text-slate-400">
                           -{formatRupiah(p.actualSpent || 0)}
                        </p>
                        <Badge variant="outline" className="text-[8px] font-black uppercase border-blue-200 text-blue-500">Pending</Badge>
                     </div>
                  </CardContent>
               </Card>
             ))}

             {/* Approved Shopping */}
             {submittedPurchases.filter(p => p.reconciliationStatus === 'Terverifikasi').map(p => (
               <Card key={`v-${p.id}`} className="rounded-2xl border-none shadow-sm bg-emerald-50/30 border-l-4 border-l-emerald-400">
                  <CardContent className="p-4 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm">
                           <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                           <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Belanja Disetujui - Ref: {p.id.slice(0, 8)}</p>
                           <p className="text-[9px] font-bold text-emerald-500 uppercase italic">Verified by Finance</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="font-black tracking-tighter text-emerald-600">-{formatRupiah(p.actualSpent || 0)}</p>
                        <Badge variant="outline" className="text-[8px] font-black uppercase border-emerald-200 text-emerald-500">Approved</Badge>
                     </div>
                  </CardContent>
               </Card>
             ))}


             {/* Expenses (Operating) */}
             {myExpenses.filter(e => e.status !== 'Rejected').map(e => (
                 <Card key={e.id} className={cn(
                   "rounded-2xl border-none shadow-sm border-l-4",
                   e.status === 'Approved' ? "bg-emerald-50/30 border-l-emerald-400" : "bg-rose-50/30 border-l-rose-400"
                 )}>
                    <CardContent className="p-4 flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm",
                            e.status === 'Approved' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"
                          )}>
                             {e.status === 'Approved' ? <CheckCircle2 className="w-5 h-5" /> : <Banknote className="w-5 h-5" />}
                          </div>
                          <div>
                             <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">{e.description}</p>
                             <p className={cn("text-[9px] font-bold uppercase italic",
                               e.status === 'Approved' ? "text-emerald-500" : "text-rose-400"
                             )}>
                               {e.status === 'Approved' ? 'Verified by Finance' : 'Real-time'}
                             </p>
                          </div>
                       </div>
                       <div className="text-right">
                          <p className={cn("font-black tracking-tighter",
                            e.status === 'Approved' ? "text-emerald-600" : "text-rose-500"
                          )}>
                             -{formatRupiah(e.amount)}
                          </p>
                          <Badge variant="outline" className={cn("text-[8px] font-black uppercase",
                            e.status === 'Approved' ? "border-emerald-200 text-emerald-500" : "border-rose-200 text-rose-400"
                          )}>
                            {e.status === 'Approved' ? 'Approved' : 'Real-time'}
                          </Badge>
                       </div>
                    </CardContent>
                 </Card>
             ))}

             {fundedPurchases.length === 0 && myExpenses.length === 0 && (
               <div className="py-20 text-center space-y-3 opacity-50">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Wallet className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Belum ada riwayat transaksi</p>
               </div>
             )}
          </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 px-1">Pemakaian Operasional</h2>
        <div className="space-y-5 animate-in slide-in-from-bottom-5 duration-300 pb-8">
          <form onSubmit={handleOpsSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Jenis Transaksi</Label>
              <Tabs defaultValue="Biaya Operasional" className="w-full" onValueChange={(val) => setOpsFormData({...opsFormData, transactionType: val})}>
                <TabsList className="grid w-full grid-cols-2 h-12 rounded-xl">
                  <TabsTrigger value="Biaya Operasional" className="rounded-lg font-bold text-xs uppercase tracking-tight">Potong Saldo Kas</TabsTrigger>
                  <TabsTrigger value="Kasbon" className="rounded-lg font-bold text-xs uppercase tracking-tight">Reimbursement</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Kategori Biaya</Label>
              <Select value={opsFormData.category} onValueChange={(val) => setOpsFormData({...opsFormData, category: val || 'Lainnya'})}>
                <SelectTrigger className="h-12 bg-white dark:bg-slate-900">
                  <SelectValue placeholder="Pilih kategori..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bensin">Bensin / Transport</SelectItem>
                  <SelectItem value="Tol">Biaya Tol</SelectItem>
                  <SelectItem value="Parkir">Karcis Parkir</SelectItem>
                  <SelectItem value="Kuli">Kuli / Bongkar Muat</SelectItem>
                  <SelectItem value="Makan">Uang Makan</SelectItem>
                  <SelectItem value="Lainnya">Lainnya...</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nominal ({formatRupiah(opsFormData.amount || 0)})</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-slate-500 text-sm">Rp</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  className="h-14 pl-12 text-lg font-bold bg-white dark:bg-slate-900"
                  placeholder="0"
                  value={formatNumber(opsFormData.amount)}
                  onChange={(e) => setOpsFormData({...opsFormData, amount: parseNumber(e.target.value)})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Keterangan</Label>
              <Input
                className="h-12 bg-white dark:bg-slate-900"
                placeholder="Misal: Parkir Pasar Induk"
                value={opsFormData.description}
                onChange={(e) => setOpsFormData({...opsFormData, description: e.target.value})}
              />
            </div>

            <ReceiptUpload
              label="Bukti Struk/Kwitansi"
              onFileSelect={(val) => setOpsFormData({...opsFormData, receiptUrl: val})}
              currentFile={opsFormData.receiptUrl}
            />

            <Button
              type="submit"
              disabled={opsLoading}
              className="w-full h-14 text-base font-bold bg-emerald-600 hover:bg-emerald-700"
            >
              <Send className="w-5 h-5 mr-2" /> Submit Pengeluaran
            </Button>
          </form>
        </div>
      </section>
      {/* Rekon Catatan — internal read-only summary */}
      <section className="space-y-3 pb-8">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 px-1">Rekon Catatan</h2>
        <div className="rounded-[2rem] border border-slate-200 dark:border-slate-700 p-5 space-y-0.5">
          <div className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Advance Diterima</span>
            <span className="font-black text-sm text-slate-700 dark:text-slate-300">+{formatRupiah(totalAdvanceReceived)}</span>
          </div>
          <div className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Belanja</span>
            <span className="font-black text-sm text-rose-500">-{formatRupiah(totalShopSpent)}</span>
          </div>
          <div className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Operasional</span>
            <span className="font-black text-sm text-rose-500">-{formatRupiah(totalExpenses)}</span>
          </div>
          <div className="flex justify-between items-center py-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Estimasi Sisa</span>
            <span className={cn("font-black text-sm", totalHolding < 0 ? "text-rose-500" : "text-emerald-600")}>
              {formatRupiah(totalHolding)}
            </span>
          </div>
          <p className="text-[8px] font-bold uppercase text-slate-400 tracking-widest pt-2">Rekonsiliasi akhir dilakukan Finance Hub</p>
        </div>
      </section>

      {/* QUICK ADD VENDOR DIALOG */}
      <Dialog open={isNewVendorOpen} onOpenChange={setIsNewVendorOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">Tambah Vendor Baru</DialogTitle>
            <DialogDescription>Quick create vendor baru untuk belanja pasar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nama Vendor / Toko</Label>
              <Input
                placeholder="Nama Toko/Supplier"
                value={newVendorName}
                onChange={e => setNewVendorName(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <div className="space-y-0.5">
                <Label>Pembayaran Tempo</Label>
                <p className="text-[10px] text-slate-400">Aktifkan jika pembayaran tidak cash di tempat</p>
              </div>
              <Checkbox
                checked={newVendorIsTempo}
                onCheckedChange={checked => setNewVendorIsTempo(!!checked)}
              />
            </div>
            {newVendorIsTempo && (
              <div className="space-y-2">
                <Label>Termin Pembayaran (Hari)</Label>
                <Input
                  type="number"
                  placeholder="14"
                  value={newVendorTermDays}
                  onChange={e => setNewVendorTermDays(parseInt(e.target.value) || 0)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 font-bold"
              onClick={handleCreateVendor}
            >
              Simpan Vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

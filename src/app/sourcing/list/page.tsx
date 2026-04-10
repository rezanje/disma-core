"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { recordOperationalAdvanceTransfer } from "@/lib/accounting"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { CheckCircle2, ChevronRight, PackageCheck, ShoppingBag, Globe, Banknote, Wallet, Image as ImageIcon, XCircle, Send, Receipt } from "lucide-react"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import { OperationalExpense, PurchaseItem } from "@/types"
import { formatNumber, parseNumber, formatRupiah, cn } from "@/lib/utils"
// Price history update moved to finance approval step
import ReceiptUpload from "@/components/ui/receipt-upload"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function SourcingDashboard() {
  const currentUser = useAppStore(state => state.currentUser)
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const products = useAppStore(state => state.products)
  const expenses = useAppStore(state => state.expenses)
  const users = useAppStore(state => state.users)
  const cashTransactions = useAppStore(state => state.cashTransactions)
  const updatePurchase = useAppStore(state => state.updatePurchase)
  const updatePurchaseItem = useAppStore(state => state.updatePurchaseItem)
  const addExpense = useAppStore(state => state.addExpense)
  const addReimbursement = useAppStore(state => state.addReimbursement)

  const [activeTab, setActiveTab] = useState<'belanja' | 'dompet' | 'ops'>('belanja')
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
  const [reconciliationNote, setReconciliationNote] = useState('')
  const [proofImage, setProofImage] = useState<string | null>(null)
  const [returnTargetBank, setReturnTargetBank] = useState('bank-1')
  const [courierRecipientId, setCourierRecipientId] = useState('44444444-4444-4444-4444-444444444444')
  const [courierTransferAmount, setCourierTransferAmount] = useState(0)

  const handleExpandItem = (item: PurchaseItem | null) => {
    setActiveItem(item)
    if (item) {
      setEditPrice(item.actualUnitPrice || 0)
      setEditQty(item.qtyPurchased || item.qtyTarget)
      setEditNote(item.notes || '')
    }
  }

  const bankAccounts = useAppStore(state => state.bankAccounts)
  const courierUsers = users.filter(user => user.role === 'kurir')
  const courierTransferHistory = cashTransactions
    .filter(tx => tx.bankAccountId === 'bank-advance-sourcing' && tx.type === 'Out' && tx.category === 'Distribusi Kas Operasional')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // === DERIVED SOURCING WALLET (internal money tracker, terpisah dari buku kas perusahaan) ===
  // Modal = total budget yang sudah ditransfer finance untuk user ini (semua purchase yang sudah punya budgetTransferDate)
  const myPurchases = purchases.filter(p =>
    p.purchaserId === currentUser?.id ||
    p.purchaserId === '22222222-2222-2222-2222-222222222222'
  )
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

  const handleTransferToCourier = async () => {
    const recipient = courierUsers.find(user => user.id === courierRecipientId)
    const sourceWallet = bankAccounts.find(bank => bank.id === 'bank-advance-sourcing')
    const safeTransferLimit = Math.max(0, totalHolding)

    if (!recipient) return toast.error("Pilih kurir penerima dulu.")
    if (courierTransferAmount <= 0) return toast.error("Nominal distribusi harus lebih dari nol.")
    if (courierTransferAmount > safeTransferLimit) return toast.error("Saldo aman kas sourcing tidak cukup.")
    if (!sourceWallet || sourceWallet.balance < courierTransferAmount) return toast.error("Saldo buku kas sourcing belum cukup.")

    const loadingToast = toast.loading("Mengirim dana operasional ke kurir...")
    const transferReferenceId = uuidv4()
    const success = await recordOperationalAdvanceTransfer(
      courierTransferAmount,
      'bank-advance-sourcing',
      'bank-advance-courier',
      `Distribusi dana operasional ke ${recipient.name}`,
      transferReferenceId,
      currentUser?.name || 'Hilman (Sourcing)',
      recipient.name
    )

    if (!success) {
      toast.error("Distribusi dana ke kurir gagal dicatat.", { id: loadingToast })
      return
    }

    setCourierTransferAmount(0)
    toast.success(`Dana ${formatRupiah(courierTransferAmount)} berhasil dikirim ke ${recipient.name}.`, { id: loadingToast })
  }

  const handleReportReturn = async () => {
    if (totalHolding <= 0) return toast.error("Saldo kas sudah nol, tidak ada yang perlu disetor.");
    const loadingToast = toast.loading("Mengirim laporan pengembalian dana...");

    try {
      const addExpense = useAppStore.getState().addExpense;
      const targetBank = useAppStore.getState().bankAccounts.find(b => b.id === returnTargetBank)
      // Hanya buat expense record — saldo sourcing derived, jadi otomatis ter-deduct
      // Buku kas perusahaan baru dicatat saat finance approve di Finance Hub
      await addExpense({
        id: `return-${Date.now()}`,
        date: new Date().toISOString(),
        amount: totalHolding,
        category: 'Setoran Pengembalian',
        description: `Setoran Tunai Sisa Kas (${formatRupiah(totalHolding)}) - ${currentUser?.name || 'Sourcing'} → ${targetBank?.name || returnTargetBank}`,
        status: 'Pending Audit',
        reporterId: currentUser?.id || '22222222-2222-2222-2222-222222222222',
        receiptUrl: proofImage || undefined,
        targetBankAccountId: returnTargetBank
      });

      setProofImage(null);
      toast.success("Laporan setoran dikirim! Silakan serahkan uang ke Admin.", { id: loadingToast });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      toast.error("Gagal mengirim laporan: " + message, { id: loadingToast });
    }
  };

  const activePurchases = purchases.filter(p => 
    (p.status === 'Pending' || p.status === 'Belanja') && 
    (!p.purchaserId || p.purchaserId === currentUser?.id || p.purchaserId === 'pending' || p.purchaserId === '22222222-2222-2222-2222-222222222222')
  )
  
  const currentItems = purchaseItems.filter(pi => 
    activePurchases.some(p => p.id === pi.purchaseId) &&
    pi.purchaseMethod === 'Pasar'
  )
 
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
    const loadingToast = toast.loading("Mengirim laporan belanja...")
    
    try {
      // Final sync of the currently editing item if it exists
      if (activeItem) {
        updatePurchaseItem(activeItem.id, {
          actualUnitPrice: editPrice,
          qtyPurchased: editQty || activeItem.qtyTarget,
          notes: editNote,
        })
      }

      for (const p of activePurchases) {
        const pItems = currentItems.filter(item => item.purchaseId === p.id && item.isChecked)
        const pCost = pItems.reduce((sum, item) => {
           const price = activeItem?.id === item.id ? editPrice : (item.actualUnitPrice || 0)
           const qty = activeItem?.id === item.id ? (editQty || item.qtyTarget) : (item.qtyPurchased || 0)
           return sum + (qty * price)
        }, 0)
        const pBudget = (p.budgetAmount || 0) + (p.operationalSpareAmount || 0)
        
        await updatePurchase(p.id, { 
          status: 'Selesai',
          purchaserId: currentUser?.id || '22222222-2222-2222-2222-222222222222',
          actualSpent: pCost,
          changeReturned: pBudget > pCost ? pBudget - pCost : 0,
          reconciliationNote: reconciliationNote || 'Sesuai budget (Auto-Consolidated)',
          reconciliationStatus: 'Laporan Masuk',
          reconciliationProofUrl: proofImage || undefined
        })
      }

      // Saldo sourcing derived — tidak perlu CashTransaction, otomatis berkurang dari actualSpent
      // Harga rekomendasi produk baru di-update setelah finance approve rekon (bukan di sini)

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

    setOpsLoading(true)
    const id = uuidv4()
    if (opsFormData.transactionType === 'Kasbon') {
      addReimbursement({ id, date: new Date().toISOString(), userId: currentUser?.id || 'system', title: `${opsFormData.category}: ${opsFormData.description}`, amount: opsFormData.amount, description: opsFormData.description, receiptUrl: opsFormData.receiptUrl, status: 'Pending' })
      toast.success("Pengajuan Reimbursement berhasil dikirim!")
    } else {
      addExpense({
        id,
        date: new Date().toISOString(),
        reporterId: currentUser?.id || '22222222-2222-2222-2222-222222222222',
        category: (opsFormData.category || 'Lainnya') as OperationalExpense['category'],
        amount: opsFormData.amount,
        description: opsFormData.description,
        receiptUrl: opsFormData.receiptUrl,
        status: 'Pending Audit'
      })
      toast.success("Laporan biaya berhasil dikirim untuk audit!")
    }
    setOpsFormData({ transactionType: 'Biaya Operasional', category: '', amount: 0, description: '', receiptUrl: '' })
    setOpsLoading(false)
  }

  // Belanjaan real-time (belum disubmit, hanya untuk progress bar saat masih belanja)
  const totalShopSpentActual = currentItems.reduce((sum, item) => {
    const price = activeItem?.id === item.id ? editPrice : (item.actualUnitPrice || 0)
    const qty = activeItem?.id === item.id ? (editQty || item.qtyTarget) : (item.qtyPurchased || 0)
    return item.isChecked ? sum + (qty * price) : sum
  }, 0)

  // Sisa kas = totalHolding sudah derived (advance - submitted shop - all expenses)
  // Kurangi lagi dengan belanjaan yg sedang diisi tapi belum disubmit
  const remainingCash = totalHolding - totalShopSpentActual


  return (
    <div className="space-y-6 animate-in fade-in-50 duration-500 pb-20">
      {/* Wallet Summary */}
      <div className="bg-slate-900 rounded-[2.5rem] p-7 text-white shadow-2xl relative overflow-hidden -mx-2">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
        <div className="relative z-10 space-y-5">
          <div className="flex justify-between items-center">
             <div className="flex items-center gap-2">
               <div className="p-2.5 bg-white/10 rounded-2xl">
                 <Wallet className="w-5 h-5 text-emerald-400" />
               </div>
               <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pegang Kas (Advance)</span>
             </div>
             {totalHolding > 0 && (
               <div className="flex items-center gap-2">
                 <Select value={returnTargetBank} onValueChange={(v) => v && setReturnTargetBank(v)}>
                   <SelectTrigger className="h-9 w-36 rounded-xl bg-white/5 border-white/10 text-white text-[9px] font-black uppercase">
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     {bankAccounts.filter(b => b.id !== 'bank-advance-sourcing').map(b => (
                       <SelectItem key={b.id} value={b.id} className="text-xs font-bold">{b.name}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
                 <Button
                   variant="outline"
                   className="h-9 px-4 rounded-xl bg-white/5 border-white/10 hover:bg-emerald-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap"
                   onClick={handleReportReturn}
                 >
                   Setor Sisa Kas
                 </Button>
               </div>
             )}
          </div>
          
          <div className="grid grid-cols-2 gap-6 items-end">
             <div className="space-y-1">
               <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest leading-none">Modal Di Tangan</p>
               <p className="text-3xl font-black tracking-tighter">{formatRupiah(totalHolding)}</p>
             </div>
             <div className="space-y-1 text-right">
               <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest leading-none">Estimasi Sisa</p>
               <p className={cn("text-xl font-black tracking-tighter", remainingCash < 0 ? "text-rose-400" : "text-emerald-400")}>
                 {formatRupiah(remainingCash)}
               </p>
             </div>
          </div>
          
          <div className="pt-2">
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
               <div 
                 className="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all duration-700"
                 style={{ width: `${totalAdvanceReceived > 0 ? (Math.min(totalAdvanceReceived, totalAdvanceReceived - totalHolding + totalShopSpentActual) / totalAdvanceReceived) * 100 : 0}%` }}
               />
            </div>
            <p className="text-[9px] font-bold text-slate-500 uppercase mt-2 tracking-widest">Pemakaian: {formatRupiah(totalAdvanceReceived - totalHolding + totalShopSpentActual)}</p>
          </div>

          <div className="grid gap-3 pt-3 border-t border-white/10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Distribusi Dana Operasional</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Hilman bisa oper sebagian kas ke Rifai untuk bensin, tol, parkir, dan kebutuhan jalan.</p>
              </div>
              <Badge variant="outline" className="border-white/10 bg-white/5 text-[8px] font-black uppercase text-slate-300">
                Kas Kurir
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1.1fr_0.8fr_auto] gap-3">
              <Select value={courierRecipientId} onValueChange={(v) => v && setCourierRecipientId(v)}>
                <SelectTrigger className="h-11 rounded-2xl bg-white/5 border-white/10 text-white text-[10px] font-black uppercase">
                  <SelectValue placeholder="Pilih kurir..." />
                </SelectTrigger>
                <SelectContent>
                  {courierUsers.map(user => (
                    <SelectItem key={user.id} value={user.id} className="text-xs font-bold">
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="text"
                inputMode="numeric"
                className="h-11 rounded-2xl bg-white/5 border-white/10 text-white placeholder:text-slate-500 font-black"
                placeholder="Nominal distribusi"
                value={formatNumber(courierTransferAmount)}
                onChange={(e) => setCourierTransferAmount(parseNumber(e.target.value))}
              />

              <Button
                className="h-11 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase text-[10px]"
                onClick={handleTransferToCourier}
              >
                <Send className="w-4 h-4 mr-2" />
                Kirim
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl mx-1">
        <Button
          variant={activeTab === 'belanja' ? 'default' : 'ghost'}
          className={cn(
            "flex-1 h-11 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
            activeTab === 'belanja' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
          )}
          onClick={() => setActiveTab('belanja')}
        >
          <ShoppingBag className="w-3.5 h-3.5 mr-1" />
          Belanja
        </Button>
        <Button
          variant={activeTab === 'dompet' ? 'default' : 'ghost'}
          className={cn(
            "flex-1 h-11 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
            activeTab === 'dompet' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
          )}
          onClick={() => setActiveTab('dompet')}
        >
          <Wallet className="w-3.5 h-3.5 mr-1" />
          Riwayat
        </Button>
        <Button
          variant={activeTab === 'ops' ? 'default' : 'ghost'}
          className={cn(
            "flex-1 h-11 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
            activeTab === 'ops' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
          )}
          onClick={() => setActiveTab('ops')}
        >
          <Receipt className="w-3.5 h-3.5 mr-1" />
          Ops
        </Button>
      </div>

      {activeTab === 'belanja' ? (
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

      <div className="space-y-3">
        {currentItems.map((item) => {
          const product = products.find(p => p.id === item.productId)
          if (!product) return null

          const isExpanded = activeItem?.id === item.id

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
                      onCheckedChange={(checked) => handleItemToggle(item, checked as boolean)}
                      onClick={(e) => e.stopPropagation()}
                      className={item.isChecked ? 'data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white' : ''}
                    />
                  </div>
                  <div>
                    <h3 className={`font-semibold text-[15px] leading-tight ${item.isChecked ? 'line-through text-slate-500' : ''}`}>
                      {product.name}
                    </h3>
                    <p className="text-xs text-emerald-600 font-medium mt-0.5">
                      Target Beli: {item.qtyTarget} {product.uom}
                    </p>
                    {item.purchaseMethod === 'Online' && (
                       <Badge variant="outline" className="mt-1 bg-blue-50 text-blue-600 border-blue-200 text-[9px] font-black uppercase">🛒 Online Queue</Badge>
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
                            className="h-12 text-lg font-bold bg-white/50 border-2 transition-all focus:border-emerald-500"
                            placeholder={`${item.qtyTarget}`}
                            value={editQty || ''}
                            onChange={(e) => setEditQty(parseFloat(e.target.value) || 0)}
                        />
                      </div>
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
                            updatePurchaseItem(item.id, {
                              actualUnitPrice: editPrice,
                              qtyPurchased: editQty || item.qtyTarget,
                              notes: editNote,
                              isChecked: true
                            })
                            handleExpandItem(null);
                          }}
                          disabled={!editPrice || editPrice <= 0}
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
                  </div>
                </div>
              )}
            </Card>
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
          <div className="mt-8 space-y-4 pb-8 animate-in slide-in-from-bottom-5">
            {/* Reconciliation Panel */}
            {hasBudget && (
              <Card className="overflow-hidden border-2 border-primary/10 bg-primary/5 rounded-[2rem]">
                <CardContent className="p-4 space-y-4">
                  <h3 className="text-xs font-black text-primary uppercase flex items-center gap-2">
                    <span className="text-base text-primary">🧾</span> Rekonsiliasi Budget
                  </h3>

                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <div className="bg-white/40 p-2 rounded-xl border border-blue-100 flex justify-between items-center text-[9px]">
                      <span className="text-blue-600 font-bold uppercase">Budget</span>
                      <span className="font-black">{formatRupiah(shoppingBudget)}</span>
                    </div>
                    <div className="bg-white/40 p-2 rounded-xl border border-amber-100 flex justify-between items-center text-[9px]">
                      <span className="text-amber-600 font-bold uppercase">Spare</span>
                      <span className="font-black">{formatRupiah(spareBudget)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-2xl p-2 text-center border border-slate-100 shadow-sm">
                      <p className="text-[8px] font-black text-slate-400 uppercase">Dana Diterima</p>
                      <p className="text-xs font-black text-slate-800 mt-1">{formatRupiah(totalBudgetGiven)}</p>
                    </div>
                    <div className="bg-white rounded-2xl p-2 text-center border border-slate-100 shadow-sm">
                      <p className="text-[8px] font-black text-slate-400 uppercase">Pengeluaran</p>
                      <p className="text-xs font-black text-slate-800 mt-1">{formatRupiah(itemsCost)}</p>
                    </div>
                   <div className={cn("rounded-2xl p-2 text-center border shadow-sm", diff >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-200')}>
                      <p className={cn("text-[8px] font-black uppercase", diff >= 0 ? "text-emerald-600" : "text-rose-600")}>
                        {diff >= 0 ? 'Kembalian' : 'Kurang'}
                      </p>
                      <p className={cn("text-xs font-black mt-1", diff >= 0 ? "text-emerald-600" : "text-rose-600")}>
                        {formatRupiah(Math.abs(diff))}
                      </p>
                    </div>
                  </div>

         {diff !== 0 && (
           <div className="space-y-4">
             <div className="space-y-2">
               <Label className="text-[10px] font-black text-slate-500 uppercase">
                 Keterangan {diff > 0 ? 'Kembalian' : 'Kurang'} (wajib)
               </Label>
               <Input 
                 className="h-10 border-2 font-bold"
                 placeholder="Tulis alasan..."
                 value={reconciliationNote}
                 onChange={(e) => setReconciliationNote(e.target.value)}
               />
             </div>
             
             {diff > 0 && (
                <div className="space-y-2">
                   <Label className="text-[10px] font-black text-slate-500 uppercase">
                      Upload Foto Bukti Pengembalian / Transfer Kembalian
                   </Label>
                   <div className="flex items-center gap-3">
                      <div 
                         className="flex-1 h-12 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center bg-white cursor-pointer hover:border-emerald-400 transition-all group overflow-hidden"
                         onClick={() => {
                            // Mocking upload
                            const mockUrl = "https://images.unsplash.com/photo-1580519327383-64c8a3424e8e?auto=format&fit=crop&q=80&w=400"
                            setProofImage(mockUrl)
                            toast.success("Foto bukti ditambahkan!")
                         }}
                      >
                         {proofImage ? (
                           <img src={proofImage} className="w-full h-full object-cover" />
                         ) : (
                           <div className="flex items-center gap-2 text-slate-400 group-hover:text-emerald-600">
                             <ImageIcon className="w-4 h-4" />
                             <span className="text-[9px] font-black uppercase">Pilih Foto Bukti</span>
                           </div>
                         )}
                      </div>
                      {proofImage && (
                        <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl text-rose-500" onClick={() => setProofImage(null)}><XCircle className="w-4 h-4" /></Button>
                      )}
                   </div>
                </div>
             )}
           </div>
         )}
                </CardContent>
              </Card>
            )}
            
            <Button 
              className="w-full h-14 text-lg font-bold shadow-lg shadow-emerald-500/25 bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSubmitLaporan}
              disabled={hasBudget && diff !== 0 && !reconciliationNote.trim()}
            >
              <PackageCheck className="w-6 h-6 mr-2" />
              Submit Laporan Belanja
            </Button>
          </div>
        )
      })()}
      </>}
        </>
      ) : activeTab === 'dompet' ? (
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

             {courierTransferHistory.map(tx => (
               <Card key={tx.id} className="rounded-2xl border-none shadow-sm bg-indigo-50/40 border-l-4 border-l-indigo-400">
                 <CardContent className="p-4 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
                       <Send className="w-5 h-5" />
                     </div>
                     <div>
                       <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">{tx.description}</p>
                       <p className="text-[9px] font-bold text-indigo-500 uppercase italic">
                         {new Date(tx.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} · Dana operasional kurir
                       </p>
                     </div>
                   </div>
                   <div className="text-right">
                     <p className="font-black tracking-tighter text-indigo-600">-{formatRupiah(tx.amount)}</p>
                     <Badge variant="outline" className="text-[8px] font-black uppercase border-indigo-200 text-indigo-500">
                       Ke Kurir
                     </Badge>
                   </div>
                 </CardContent>
               </Card>
             ))}

             {/* Expenses (Operating) */}
             {myExpenses.filter(e => e.status !== 'Rejected').map(e => (
                 <Card key={e.id} className={cn(
                   "rounded-2xl border-none shadow-sm border-l-4",
                   e.status === 'Approved' ? "bg-emerald-50/30 border-l-emerald-400" : "bg-slate-50/50 border-l-amber-400"
                 )}>
                    <CardContent className="p-4 flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm",
                            e.status === 'Approved' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                          )}>
                             {e.status === 'Approved' ? <CheckCircle2 className="w-5 h-5" /> : <Banknote className="w-5 h-5" />}
                          </div>
                          <div>
                             <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">{e.description}</p>
                             <p className={cn("text-[9px] font-bold uppercase italic",
                               e.status === 'Approved' ? "text-emerald-500" : "text-amber-500"
                             )}>
                               {e.status === 'Approved' ? 'Verified by Finance' : 'Sedang Diaudit Office'}
                             </p>
                          </div>
                       </div>
                       <div className="text-right">
                          <p className={cn("font-black tracking-tighter",
                            e.status === 'Approved' ? "text-emerald-600" : "text-slate-400"
                          )}>
                             -{formatRupiah(e.amount)}
                          </p>
                          <Badge variant="outline" className={cn("text-[8px] font-black uppercase",
                            e.status === 'Approved' ? "border-emerald-200 text-emerald-500" : "border-amber-200 text-amber-500"
                          )}>
                            {e.status === 'Approved' ? 'Approved' : 'Unverified'}
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
      ) : null}

      {activeTab === 'ops' && (
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
      )}
    </div>
  )
}

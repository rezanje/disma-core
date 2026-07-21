"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah, cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  ShieldCheck, Wallet, Receipt, 
  ArrowRight, ShoppingBag, Banknote, 
  ChevronRight, AlertCircle, CheckCircle2,
  Image as ImageIcon, User, Clock, Package
} from "lucide-react"
import { toast } from "sonner"
import { recordReconciliationSettlement, recordOperationalExpense, recordReimbursementPayment, recordAdvanceReturn, updateProductPriceHistory, getAdvanceWalletByUserId, recordAdvanceExpense } from "@/lib/accounting"
import { computeSettlement } from "@/lib/settlement-model"
import AuthGuard from "@/components/auth/auth-guard"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
} from "@/components/ui/dialog"
import { motion, AnimatePresence } from "framer-motion"

export default function SourcingSettlementPage() {
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const expenses = useAppStore(state => state.expenses)
  const reimbursements = useAppStore(state => state.reimbursements)
  const products = useAppStore(state => state.products)
  const users = useAppStore(state => state.users)
  const bankAccounts = useAppStore(state => state.bankAccounts)
  
  const updatePurchase = useAppStore(state => state.updatePurchase)
  const updateExpense = useAppStore(state => state.updateExpense)
  const updateReimbursement = useAppStore(state => state.updateReimbursement)

  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // --- Direct Input State ---
  const [isDirectSettleOpen, setIsDirectSettleOpen] = useState(false)
  const [directSettleData, setDirectSettleData] = useState({
    hpp: 0,
    ops: 0,
    returned: 0,
    proofUrl: ""
  })

  // Queue on the report, not on the transfer. Purchases funded from the sourcing
  // pool never carry budgetTransferDate, so keying off it hid them entirely.
  // sourcing/list writes 'Laporan Masuk' on submit under both models.
  // Also require an approved budget: a shopping doc that was compiled but never
  // sent to Finance ("Kirim ke Finance") has no budgetAmount, yet the sourcer
  // checklist stamps it 'Laporan Masuk' on submit anyway — its baseline would
  // read 0 and the whole spend would render as overspend. Legacy purchases stay
  // visible via budgetTransferDate even if budgetAmount is missing.
  const pendingSettlements = purchases.filter(p => {
    return p.reconciliationStatus === 'Laporan Masuk' && ((p.budgetAmount || 0) > 0 || !!p.budgetTransferDate)
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const selectedPurchase = pendingSettlements.find(p => p.id === selectedPurchaseId)
  const purchaser = users.find(u => u.id === selectedPurchase?.purchaserId)

  // Sub-items for selected purchase
  const pItems = purchaseItems.filter(pi => pi.purchaseId === selectedPurchaseId && pi.isChecked)
  const isQcComplete = pItems.every(item => item.isQCed)
  const pExpenses = expenses.filter(e => e.purchaseId === selectedPurchaseId && e.status === 'Pending Audit' && e.category !== 'Setoran Pengembalian')
  const pReimbs = reimbursements.filter(r => r.purchaseId === selectedPurchaseId && r.status === 'Pending')
  const pReturns = expenses.filter(e => e.purchaseId === selectedPurchaseId && e.status === 'Pending Audit' && e.category === 'Setoran Pengembalian')

  const figures = selectedPurchase ? computeSettlement(selectedPurchase, pItems, pExpenses) : null
  const totalBudget = figures?.baseline || 0
  const totalShopSpent = figures?.shopSpent || 0
  const totalOpsSpent = figures?.opsSpent || 0
  const totalReimbRequested = pReimbs.reduce((sum, r) => sum + r.amount, 0)
  const totalReturns = pReturns.reduce((sum, r) => sum + r.amount, 0)

  // Calculation for returns vs budget
  const expectedReturns = figures?.expectedReturns ?? 0
  const returnDiscrepancy = totalReturns - expectedReturns
  const isLegacySettlement = figures?.isLegacy ?? false

  const handleAuditExpense = async (expenseId: string, status: 'Approved' | 'Rejected') => {
    const latestExpenses = useAppStore.getState().expenses
    const exp = latestExpenses.find(e => e.id === expenseId)
    if (!exp) return

    if (status === 'Approved') {
       const latestPurchases = useAppStore.getState().purchases
       const relatedPurchase = latestPurchases.find(p => p.id === exp.purchaseId)
       const walletUserId = (relatedPurchase?.purchaserId && relatedPurchase.purchaserId !== 'pending')
         ? relatedPurchase.purchaserId
         : exp.reporterId
       const advanceWallet = getAdvanceWalletByUserId(walletUserId)
       const selectedBank = relatedPurchase?.budgetBankAccountId || 'bank-1'
       const latestBankAccounts = useAppStore.getState().bankAccounts
       const bank = latestBankAccounts.find(b => b.id === selectedBank)

       if (exp.category === 'Setoran Pengembalian') {
          const success = await recordAdvanceReturn(exp.amount, walletUserId, selectedBank)
          if (!success) throw new Error("Gagal mencatat pengembalian dana.")
       } else if (advanceWallet) {
          const success = await recordAdvanceExpense(
            expenseId,
            walletUserId,
            exp.amount,
            exp.description || 'Biaya Ops',
            exp.date,
            exp.category || 'Operasional'
          )
          if (!success) throw new Error(`Gagal mencatat pengeluaran ${advanceWallet.label}.`)
       } else {
          const success = await recordOperationalExpense(
            expenseId, 
            exp.amount, 
            exp.description || '', 
            exp.date, 
            exp.category || 'Operasional', 
            bank?.accountCode || '1-1200', 
            selectedBank
          )
          if (!success) throw new Error("Gagal mencatat transaksi pengeluaran.")
       }
    }
    await updateExpense(expenseId, { status })
  }

  const handlePayReimbursement = async (reimbId: string) => {
    const latestReimbursements = useAppStore.getState().reimbursements
    const reimb = latestReimbursements.find(r => r.id === reimbId)
    if (!reimb) return
    const latestUsers = useAppStore.getState().users
    const user = latestUsers.find(u => u.id === reimb.userId)
    const latestPurchases = useAppStore.getState().purchases
    const relatedPurchase = latestPurchases.find(p => p.id === reimb.purchaseId)
    const selectedBank = relatedPurchase?.budgetBankAccountId || 'bank-1'
    
    const success = await recordReimbursementPayment(reimb.id, reimb.amount, reimb.title || 'Reimburse', selectedBank, user?.name || 'Karyawan')
    if (success) {
      await updateReimbursement(reimbId, { status: 'Paid' })
    } else {
      throw new Error("Gagal mencatat transaksi reimbursement.")
    }
  }

  const processApprovalCore = async (purchaseId: string) => {
    const state = useAppStore.getState()
    const latestPurchase = state.purchases.find(p => p.id === purchaseId)
    if (!latestPurchase) throw new Error("Sesi belanja tidak ditemukan.")

    // Fetch fresh items and expenses from the state to avoid stale closure variables
    const freshItems = state.purchaseItems.filter(pi => pi.purchaseId === purchaseId && pi.isChecked)
    const freshExpenses = state.expenses.filter(e => e.purchaseId === purchaseId && e.status === 'Pending Audit' && e.category !== 'Setoran Pengembalian')
    const freshReimbs = state.reimbursements.filter(r => r.purchaseId === purchaseId && r.status === 'Pending')
    const freshReturns = state.expenses.filter(e => e.purchaseId === purchaseId && e.status === 'Pending Audit' && e.category === 'Setoran Pengembalian')

    const figures = computeSettlement(latestPurchase, freshItems, freshExpenses)
    const totalShopSpent = figures.shopSpent

    // 1. Approve all operational expenses
    for (const op of freshExpenses) {
      await handleAuditExpense(op.id, 'Approved')
    }

    // 2. Approve all reimbursements
    for (const reimb of freshReimbs) {
      await handlePayReimbursement(reimb.id)
    }

    // 3. Approve all returns
    for (const ret of freshReturns) {
      await handleAuditExpense(ret.id, 'Approved')
    }

    // 4. Settle HPP and sync budget — legacy advances only. Under the pool model
    // recordPocketPurchase already booked Dr 2-1100 / Cr pocket at buy time, so
    // posting here would double-book, and the credit would land on the deleted
    // bank-advance-sourcing wallet whenever budgetDestBankAccountId is absent.
    if (figures.isLegacy) {
      const success = await recordReconciliationSettlement(
        purchaseId,
        totalShopSpent,
        0, // Ops already handled above as individual expenses
        figures.baseline,
        latestPurchase.budgetBankAccountId || 'bank-1'
      )
      if (!success) throw new Error("Gagal settle rekonsiliasi jurnal HPP.")
    }

    // 5. Update purchase status & sync actualSpent to live total
    await updatePurchase(purchaseId, {
      actualSpent: totalShopSpent,
      reconciliationStatus: 'Terverifikasi',
      status: 'Selesai' // unlock QC workflow (warehouse/qc filter requires this)
    })

    // 5b. Advance linked Sales Orders to QC so downstream (Packing → Kirim → Terkirim) can run
    const linkedSoIds = new Set(
      freshItems.map(pi => pi.salesOrderId).filter((id): id is string => !!id)
    )
    const updateSO = useAppStore.getState().updateSalesOrder
    for (const soId of linkedSoIds) {
      const so = useAppStore.getState().salesOrders.find(s => s.id === soId)
      if (so && (so.status === 'Belanja' || so.status === 'Draft')) {
        await updateSO(soId, { status: 'QC' })
      }
    }

    // 6. Update price history for checked items
    for (const item of freshItems) {
      if (item.actualUnitPrice > 0 && item.productId) {
        updateProductPriceHistory(item.productId, item.actualUnitPrice, 'Pasar (Verified)')
      }
    }
  }

  const handleApproveWholeSession = async () => {
    if (!selectedPurchaseId || !selectedPurchase) return
    
    setIsProcessing(true)
    const toastId = toast.loading("Memproses persetujuan seluruh sesi...")

    try {
      // Check if QC is complete before approving standard session
      const state = useAppStore.getState()
      const freshItems = state.purchaseItems.filter(pi => pi.purchaseId === selectedPurchaseId && pi.isChecked)
      const isQcComplete = freshItems.every(item => item.isQCed)
      if (!isQcComplete) {
         throw new Error("Menunggu QC Gudang selesai sebelum menyetujui.")
      }

      await processApprovalCore(selectedPurchaseId)
      toast.success("Sesi Sourcing berhasil diselesaikan!", { id: toastId })
      setSelectedPurchaseId(null)
    } catch (err: any) {
      toast.error(err.message || "Terjadi kesalahan saat memproses.", { id: toastId })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDirectSettle = async () => {
    if (!selectedPurchaseId || !selectedPurchase) return
    const toastId = toast.loading("Memproses settlement mandiri...")
    
    try {
      setIsProcessing(true)
      const now = new Date().toISOString()
      const addExpense = useAppStore.getState().addExpense
      const currentUser = useAppStore.getState().currentUser
      
      // 1. Create HPP Expense Record
      if (directSettleData.hpp > 0) {
        await addExpense({
          id: `hpp-${Date.now()}`,
          purchaseId: selectedPurchaseId,
          amount: directSettleData.hpp,
          category: 'Sourcing (HPP)',
          description: `Belanja Pasar (Direct Input Finance)`,
          date: now,
          status: 'Pending Audit',
          reporterId: currentUser?.id || 'system',
          receiptUrl: directSettleData.proofUrl
        })
      }

      // 2. Create Ops Expense Record
      if (directSettleData.ops > 0) {
        await addExpense({
          id: `ops-${Date.now()}`,
          purchaseId: selectedPurchaseId,
          amount: directSettleData.ops,
          category: 'Lainnya',
          description: `Biaya Operasional Pasar (Direct Input Finance)`,
          date: now,
          status: 'Pending Audit',
          reporterId: currentUser?.id || 'system',
          receiptUrl: directSettleData.proofUrl
        })
      }

      // 3. Create Return Record
      if (directSettleData.returned > 0) {
        await addExpense({
          id: `ret-${Date.now()}`,
          purchaseId: selectedPurchaseId,
          amount: directSettleData.returned,
          category: 'Setoran Pengembalian',
          description: `Sisa Dana Dikembalikan (Direct Input Finance)`,
          date: now,
          status: 'Pending Audit',
          reporterId: currentUser?.id || 'system',
          targetBankAccountId: selectedPurchase.budgetBankAccountId || 'bank-1',
          receiptUrl: directSettleData.proofUrl
        })
      }

      // 4. Update purchase actual spent & status
      await updatePurchase(selectedPurchaseId, { 
        actualSpent: directSettleData.hpp,
        changeReturned: directSettleData.returned,
        reconciliationStatus: 'Laporan Masuk'
      })

      // 5. Run the core approval flow (this will read the newly created records from the store)
      await processApprovalCore(selectedPurchaseId)
      
      toast.success("Sesi Sourcing berhasil diselesaikan via Direct Input!", { id: toastId })
      setIsDirectSettleOpen(false)
      setSelectedPurchaseId(null)
      setDirectSettleData({ hpp: 0, ops: 0, returned: 0, proofUrl: "" })
    } catch (err: any) {
      toast.error(err.message || "Gagal memproses settlement mandiri.", { id: toastId })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <AuthGuard allowedRoles={['finance', 'super_admin', 'ceo']}>
      <div className="p-4 md:p-10 max-w-[1400px] mx-auto space-y-10 pb-32">
        <header className="space-y-2">
          <div className="flex items-center gap-3">
             <Badge className="bg-orange-500/10 text-orange-600 border-none px-3 font-black text-[10px] tracking-widest uppercase">Finance Hub</Badge>
             <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Sourcing Settlement</h1>
          </div>
          <p className="text-slate-400 font-bold text-sm">Validasi laporan belanja pasar dan biaya operasional lapangan dalam satu klik.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* List of Pending Sessions */}
          <div className="lg:col-span-1 space-y-4">
             <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest px-2">Antrean Verifikasi ({pendingSettlements.length})</h3>
             {pendingSettlements.length === 0 ? (
               <Card className="liquid-card border-dashed bg-transparent shadow-none">
                 <CardContent className="p-10 text-center space-y-3">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
                       <CheckCircle2 className="w-6 h-6 text-slate-300" />
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Semua Sesi Selesai</p>
                 </CardContent>
               </Card>
             ) : (
               <div className="space-y-4">
                 {pendingSettlements.map(p => {
                    const pic = users.find(u => u.id === p.purchaserId)
                    const isActive = selectedPurchaseId === p.id
                    return (
                      <motion.div 
                        key={p.id}
                        layoutId={p.id}
                        onClick={() => setSelectedPurchaseId(p.id)}
                        className={cn(
                          "cursor-pointer p-6 rounded-[2.5rem] transition-all duration-300 border-2",
                          isActive 
                            ? "bg-slate-950 border-slate-950 text-white shadow-2xl scale-[1.02]" 
                            : "bg-white border-transparent hover:border-orange-200 shadow-xl"
                        )}
                      >
                         <div className="flex justify-between items-start mb-4">
                            <Badge className={cn(
                              "border-none px-2 font-black text-[9px]",
                              isActive ? "bg-white/10 text-white" : "bg-orange-50 text-orange-600"
                            )}>SESSION {p.id.slice(0,6).toUpperCase()}</Badge>
                            <span className={cn("text-[9px] font-black", isActive ? "text-slate-500" : "text-slate-300")}>
                               {new Date(p.date).toLocaleDateString()}
                            </span>
                         </div>
                         <h4 className="text-xl font-black tracking-tight mb-1">{pic?.name || 'Sourcing Team'}</h4>
                         <p className={cn("text-xs font-bold", isActive ? "text-slate-400" : "text-slate-400 uppercase tracking-widest")}>
                            {formatRupiah((p.budgetAmount || 0) + (p.operationalSpareAmount || 0))} Budget Drop
                         </p>
                         <div className="mt-6 flex justify-between items-end">
                            <div className="flex -space-x-2">
                               {[1,2,3].map(i => (
                                 <div key={i} className={cn("w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-black", isActive ? "bg-slate-800 border-slate-950 text-slate-400" : "bg-slate-100 border-white text-slate-400")}>
                                    {i === 1 ? 'H' : i === 2 ? 'O' : 'R'}
                                 </div>
                               ))}
                            </div>
                            <ChevronRight className={cn("w-5 h-5", isActive ? "text-white" : "text-slate-200")} />
                         </div>
                      </motion.div>
                    )
                 })}
               </div>
             )}
          </div>

          {/* Details Panel */}
          <div className="lg:col-span-2">
             <AnimatePresence mode="wait">
                {!selectedPurchaseId || !selectedPurchase ? (
                   <motion.div 
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     className="h-full flex flex-col items-center justify-center text-center p-10 bg-slate-50/50 rounded-[4rem] border-2 border-dashed border-slate-100"
                   >
                      <div className="w-24 h-24 bg-white rounded-[2.5rem] shadow-xl flex items-center justify-center mb-6">
                         <ShoppingBag className="w-10 h-10 text-slate-200" />
                      </div>
                      <h3 className="text-xl font-black text-slate-300 uppercase tracking-tighter">Pilih sesi untuk ditinjau</h3>
                      <p className="text-xs font-bold text-slate-400 mt-2 max-w-xs">Data belanja, bensin, dan kembalian akan muncul di sini.</p>
                   </motion.div>
                ) : (
                  <motion.div 
                    key={selectedPurchaseId}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-8"
                  >
                     {/* Summary Header */}
                     <Card className="liquid-card border-none bg-white p-10">
                        <div className="flex flex-col md:flex-row justify-between gap-10">
                           <div className="space-y-6">
                              <div>
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Penanggung Jawab</p>
                                 <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 bg-orange-500 rounded-3xl flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-orange-500/20">
                                       {purchaser?.name?.[0] || 'S'}
                                    </div>
                                    <div>
                                       <h2 className="text-3xl font-black text-slate-900 tracking-tighter">{purchaser?.name}</h2>
                                       <Badge variant="outline" className="bg-slate-50 border-slate-100 text-[10px] font-black text-slate-400 mt-1 uppercase">Sourcing Agent</Badge>
                                    </div>
                                 </div>
                              </div>
                              <div className="grid grid-cols-2 gap-8">
                                 <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Budget Dana</p>
                                    <p className="text-2xl font-black text-slate-900">{formatRupiah(totalBudget)}</p>
                                 </div>
                                 <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Status Laporan</p>
                                    <Badge className="bg-emerald-50 text-emerald-600 border-none font-black text-[9px] px-3 py-1 uppercase">{selectedPurchase?.reconciliationStatus}</Badge>
                                 </div>
                              </div>
                              {!isLegacySettlement && figures && (
                                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    Selisih vs Anggaran
                                  </span>
                                  <span className={cn(
                                    "text-sm font-black",
                                    figures.variance !== null && figures.variance > 0 ? "text-rose-600" : "text-emerald-600"
                                  )}>
                                    {figures.variance !== null && figures.variance > 0 ? '+' : ''}{formatRupiah(figures.variance || 0)}
                                  </span>
                                </div>
                              )}
                           </div>
                            <div className="md:w-72 space-y-3">
                               <div className="p-8 bg-slate-950 rounded-[3rem] text-white flex flex-col justify-between shadow-2xl relative overflow-hidden group">
                                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/10 transition-all" />
                                  <div className="relative z-10">
                                     <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Total Pengeluaran</p>
                                     <h3 className="text-4xl font-black tracking-tighter">{formatRupiah(totalShopSpent + totalOpsSpent)}</h3>
                                     <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                                        <div className="flex justify-between text-[10px] font-bold"><span className="text-slate-500">Shop</span><span>{formatRupiah(totalShopSpent)}</span></div>
                                        <div className="flex justify-between text-[10px] font-bold"><span className="text-slate-500">Ops</span><span>{formatRupiah(totalOpsSpent)}</span></div>
                                     </div>
                                  </div>
                                  <Button 
                                     onClick={handleApproveWholeSession}
                                     disabled={isProcessing || !isQcComplete}
                                     className={cn(
                                        "mt-8 h-14 w-full font-black rounded-2xl transition-all shadow-xl active:scale-95",
                                        !isQcComplete 
                                           ? "bg-slate-200 text-slate-400 border border-slate-300 shadow-none cursor-not-allowed" 
                                           : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20"
                                     )}
                                   >
                                     {isProcessing ? "Processing..." : isQcComplete ? "Approve Sesi Belanja" : "Menunggu QC Gudang"}
                                   </Button>
                                   {selectedPurchase && !isQcComplete && (
                                     <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] text-left">
                                       <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                       <div className="space-y-0.5">
                                         <p className="font-extrabold text-amber-800 uppercase tracking-wider text-left">QC Belum Selesai</p>
                                         <p className="text-amber-700 font-bold leading-normal text-left">
                                           Beberapa item belanjaan sedang diinspeksi oleh Warehouse. Harap tunggu QC selesai untuk verifikasi nominal aktual HPP.
                                         </p>
                                       </div>
                                     </div>
                                   )}
                               </div>
                               
                               {selectedPurchase.reconciliationStatus !== 'Laporan Masuk' && (
                                 <Button 
                                   variant="outline"
                                   onClick={() => setIsDirectSettleOpen(true)}
                                   className="w-full h-12 rounded-2xl border-orange-200 text-orange-600 font-black uppercase text-[9px] tracking-widest hover:bg-orange-50"
                                 >
                                   Direct Input Hasil Belanja
                                 </Button>
                               )}
                            </div>
                        </div>
                     </Card>

                     {/* Breakdown Sections */}
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* HPP Items */}
                        <Card className="liquid-card border-none bg-white h-fit">
                           <CardHeader className="p-8 pb-4">
                              <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                                 HPP Belanja Pasar <ShoppingBag className="w-4 h-4 text-orange-500" />
                              </CardTitle>
                              <CardDescription className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{pItems.length} Produk Dibeli</CardDescription>
                           </CardHeader>
                           <CardContent className="p-0">
                              <div className="px-8 pb-8 space-y-3">
                                 {pItems.map(item => {
                                     const prod = products.find(p => p.id === item.productId)
                                     const isQcPending = !item.isQCed
                                     return (
                                        <div key={item.id} className={cn(
                                           "flex justify-between items-center p-4 rounded-2xl border transition-all",
                                           isQcPending ? "bg-amber-50/40 border-amber-100" : "bg-slate-50 border-slate-50 hover:bg-white hover:border-slate-100"
                                        )}>
                                           <div>
                                              <div className="flex items-center gap-2 mb-1">
                                                 <p className="text-xs font-black text-slate-800 uppercase leading-none">{prod?.name}</p>
                                                 {isQcPending ? (
                                                    <Badge className="bg-amber-500/10 text-amber-600 border-none px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider">Menunggu QC</Badge>
                                                 ) : (
                                                    <Badge className="bg-emerald-500/10 text-emerald-600 border-none px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider">Lolos QC</Badge>
                                                 )}
                                              </div>
                                              <p className="text-[9px] font-bold text-slate-400 uppercase">
                                                 Sourcing: {item.qtyPurchased} {prod?.uom} @ {formatRupiah(item.actualUnitPrice)}
                                                 {!isQcPending && ` · Masuk QC: ${item.inboundQtyReceived ?? 0} ${prod?.uom}`}
                                              </p>
                                           </div>
                                           <div className="text-right">
                                              <span className="text-xs font-black text-slate-900">{formatRupiah(item.actualUnitPrice * item.qtyPurchased)}</span>
                                              {!isQcPending && item.inboundQtyReceived !== item.qtyPurchased && (
                                                 <p className="text-[8px] font-black text-rose-500 uppercase mt-0.5">Selisih: {item.qtyPurchased - (item.inboundQtyReceived ?? 0)} unit</p>
                                              )}
                                           </div>
                                        </div>
                                     )
                                  })}
                              </div>
                           </CardContent>
                        </Card>

                        {/* Ops & Reimburse */}
                        <div className="space-y-6">
                           {/* Ops Expenses */}
                           <Card className="liquid-card border-none bg-white">
                              <CardHeader className="p-8 pb-4">
                                 <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    Biaya Operasional <Banknote className="w-4 h-4 text-blue-500" />
                                 </CardTitle>
                                 <CardDescription className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Bensin, Parkir, dsb.</CardDescription>
                              </CardHeader>
                              <CardContent className="p-0">
                                 <div className="px-8 pb-8 space-y-3">
                                    {pExpenses.length === 0 ? (
                                       <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest text-center py-4 italic">Nihil</p>
                                    ) : (
                                       pExpenses.map(e => (
                                          <div key={e.id} className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50 flex justify-between items-center">
                                             <div>
                                                <p className="text-xs font-black text-slate-800 uppercase leading-none mb-1">{e.category}</p>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase line-clamp-1">{e.description}</p>
                                             </div>
                                             <div className="flex items-center gap-3">
                                                <span className="text-xs font-black text-slate-900">{formatRupiah(e.amount)}</span>
                                                {e.receiptUrl && <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-400" onClick={() => setPreviewImage(e.receiptUrl!)}><ImageIcon className="w-3.5 h-3.5" /></Button>}
                                             </div>
                                          </div>
                                       ))
                                    )}
                                 </div>
                              </CardContent>
                           </Card>

                           {/* Reimbursements */}
                           <Card className="liquid-card border-none bg-white">
                              <CardHeader className="p-8 pb-4">
                                 <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    Kasbon / Reimburse <Clock className="w-4 h-4 text-indigo-500" />
                                 </CardTitle>
                                 <CardDescription className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Dana Talangan Pribadi</CardDescription>
                              </CardHeader>
                              <CardContent className="p-0">
                                 <div className="px-8 pb-8 space-y-3">
                                    {pReimbs.length === 0 ? (
                                       <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest text-center py-4 italic">Nihil</p>
                                    ) : (
                                       pReimbs.map(r => (
                                          <div key={r.id} className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 flex justify-between items-center">
                                             <div>
                                                <p className="text-xs font-black text-slate-800 uppercase leading-none mb-1">{r.title}</p>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase line-clamp-1">{r.description}</p>
                                             </div>
                                             <div className="flex items-center gap-3">
                                                <span className="text-xs font-black text-indigo-600">{formatRupiah(r.amount)}</span>
                                                {r.receiptUrl && <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-400" onClick={() => setPreviewImage(r.receiptUrl!)}><ImageIcon className="w-3.5 h-3.5" /></Button>}
                                             </div>
                                          </div>
                                       ))
                                    )}
                                    {totalReimbRequested > 0 && (
                                       <div className="mt-4 p-4 rounded-2xl bg-indigo-600 text-white flex justify-between items-center shadow-lg shadow-indigo-200">
                                          <span className="text-[10px] font-black uppercase">Total Pencairan Reimburse</span>
                                          <span className="text-sm font-black">{formatRupiah(totalReimbRequested)}</span>
                                       </div>
                                    )}
                                 </div>
                              </CardContent>
                           </Card>
                        </div>
                     </div>

                     {/* Reconciliation Watcher — legacy cash-advance model only; the pool
                         model never hands cash to the sourcer, so there is nothing to
                         reconcile back to the office. */}
                     {isLegacySettlement && (
                       <Card className="liquid-card border-none bg-orange-50 overflow-hidden relative">
                          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-200/50 rounded-full blur-3xl -mr-32 -mt-32" />
                          <CardContent className="p-10 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                             <div className="flex items-center gap-6">
                                <div className="w-16 h-16 bg-white rounded-[2rem] flex items-center justify-center shadow-xl">
                                   <AlertCircle className="w-8 h-8 text-orange-500" />
                                </div>
                                <div>
                                   <h3 className="text-2xl font-black text-slate-900 tracking-tight">Reconciliation Watcher</h3>
                                   <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mt-1">Uang yang harus kembali ke kantor</p>
                                </div>
                             </div>
                             <div className="flex items-center gap-10">
                                <div className="text-center md:text-right">
                                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Dana Setoran Masuk</p>
                                   <p className="text-3xl font-black text-slate-900">{formatRupiah(totalReturns)}</p>
                                   <p className={cn(
                                     "text-[10px] font-bold mt-1 uppercase tracking-tighter",
                                     Math.abs(returnDiscrepancy) < 100 ? "text-emerald-500" : "text-rose-500"
                                   )}>
                                      {Math.abs(returnDiscrepancy) < 100 ? "✓ Sesuai Target" : `⚠ Selisih ${formatRupiah(returnDiscrepancy)}`}
                                   </p>
                                </div>
                                <div className="h-16 w-px bg-orange-200 hidden md:block" />
                                <div className="flex -space-x-3">
                                   {pReturns.map(ret => (
                                     <div
                                       key={ret.id}
                                       className="w-14 h-14 rounded-2xl bg-white border-2 border-orange-100 shadow-xl p-1 cursor-pointer hover:scale-110 hover:z-20 transition-all"
                                       onClick={() => setPreviewImage(ret.receiptUrl!)}
                                     >
                                        {ret.receiptUrl ? <img src={ret.receiptUrl} className="w-full h-full object-cover rounded-xl" /> : <div className="w-full h-full bg-slate-50 flex items-center justify-center rounded-xl"><ImageIcon className="w-4 h-4 text-slate-200" /></div>}
                                     </div>
                                   ))}
                                </div>
                             </div>
                          </CardContent>
                       </Card>
                     )}
                  </motion.div>
                )}
             </AnimatePresence>
          </div>
        </div>

        <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
           <DialogContent className="max-w-4xl w-[95vw] border-none rounded-[3.5rem] p-0 overflow-hidden bg-slate-900 shadow-2xl">
              <div className="w-full h-[75vh] flex items-center justify-center p-4">
                 {previewImage && <img src={previewImage} className="max-w-full max-h-full object-contain rounded-2xl" />}
              </div>
              <div className="p-8 bg-white flex justify-center border-t border-slate-100">
                 <Button className="rounded-2xl bg-slate-950 text-white font-black px-12 h-14" onClick={() => setPreviewImage(null)}>Tutup Preview</Button>
              </div>
           </DialogContent>
        </Dialog>

        {/* Direct Input Dialog */}
        <Dialog open={isDirectSettleOpen} onOpenChange={setIsDirectSettleOpen}>
           <DialogContent className="max-w-xl border-none rounded-[3rem] p-0 overflow-hidden bg-white shadow-2xl">
              <DialogHeader className="p-10 pb-2">
                 <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center">
                       <Banknote className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                       <DialogTitle className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Direct Input Hasil</DialogTitle>
                       <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Input manual belanja & sisa kas</p>
                    </div>
                 </div>
              </DialogHeader>
              <div className="px-10 py-6 space-y-6">
                 <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Belanja Barang (HPP)</label>
                       <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 text-xs">Rp</span>
                          <input 
                            type="number" 
                            className="w-full h-14 bg-slate-50 rounded-2xl pl-10 pr-4 font-black text-lg outline-none focus:ring-2 ring-orange-500 transition-all"
                            value={directSettleData.hpp || ''}
                            onChange={(e) => setDirectSettleData({...directSettleData, hpp: parseFloat(e.target.value) || 0})}
                            placeholder="0"
                          />
                       </div>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Biaya Ops</label>
                       <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 text-xs">Rp</span>
                          <input 
                            type="number" 
                            className="w-full h-14 bg-slate-50 rounded-2xl pl-10 pr-4 font-black text-lg outline-none focus:ring-2 ring-orange-500 transition-all"
                            value={directSettleData.ops || ''}
                            onChange={(e) => setDirectSettleData({...directSettleData, ops: parseFloat(e.target.value) || 0})}
                            placeholder="0"
                          />
                       </div>
                    </div>
                 </div>

                 <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 flex justify-between items-center">
                    <div>
                       <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Sisa Uang Kembali</p>
                       <p className="text-2xl font-black text-emerald-700 tracking-tighter">{formatRupiah(directSettleData.returned)}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-xl border-emerald-200 text-emerald-600 font-black h-10"
                      onClick={() => {
                        const calculated = totalBudget - directSettleData.hpp - directSettleData.ops
                        setDirectSettleData({...directSettleData, returned: Math.max(0, calculated)})
                      }}
                    >Hitung Sisa</Button>
                 </div>
                 
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Link Dokumentasi</label>
                    <input 
                      type="text" 
                      className="w-full h-12 bg-slate-50 rounded-xl px-4 font-bold text-xs border border-slate-100"
                      placeholder="https://..."
                      value={directSettleData.proofUrl}
                      onChange={(e) => setDirectSettleData({...directSettleData, proofUrl: e.target.value})}
                    />
                 </div>
              </div>
              <div className="p-10 pt-4 flex gap-4">
                 <Button variant="outline" className="flex-1 h-14 rounded-2xl font-black uppercase text-[10px]" onClick={() => setIsDirectSettleOpen(false)}>Batal</Button>
                 <Button className="flex-[2] h-14 rounded-2xl bg-slate-950 text-white font-black uppercase text-[10px]" onClick={handleDirectSettle}>Simpan & Settle</Button>
              </div>
           </DialogContent>
        </Dialog>
      </div>
    </AuthGuard>
  )
}

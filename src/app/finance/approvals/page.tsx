"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah, cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  ShieldCheck, Wallet, Send, 
  CheckCircle2, XCircle, Clock, 
  Banknote, Landmark, CreditCard,
  Receipt, User, FileText, Eye, Image as ImageIcon,
  AlertTriangle, ChevronRight, RefreshCw, Database, Truck, Globe
} from "lucide-react"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import { recordBudgetTransfer, recordReimbursementPayment, recordOperationalExpense, recordReconciliationSettlement, recordDeliveryAndInvoice, recordAdvanceReturn, updateProductPriceHistory, recordAdvanceExpense, getAdvanceWalletByRole, getAdvanceWalletByUserId } from "@/lib/accounting"
import AuthGuard from "@/components/auth/auth-guard"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
} from "@/components/ui/dialog"

export default function FinanceHubPage() {
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const reimbursements = useAppStore(state => state.reimbursements)
  const expenses = useAppStore(state => state.expenses)
  const products = useAppStore(state => state.products)
  const bankAccounts = useAppStore(state => state.bankAccounts)
  const users = useAppStore(state => state.users)
  const currentUser = useAppStore(state => state.currentUser)
  const deliveries = useAppStore(state => state.deliveries)
  const salesOrders = useAppStore(state => state.salesOrders)
  const salesOrderItems = useAppStore(state => state.salesOrderItems)
  const invoices = useAppStore(state => state.invoices)
  const clients = useAppStore(state => state.clients)
  
  const updatePurchase = useAppStore(state => state.updatePurchase)
  const updateReimbursement = useAppStore(state => state.updateReimbursement)
  const updateExpense = useAppStore(state => state.updateExpense)
  const updateDelivery = useAppStore(state => state.updateDelivery)
  const updateSalesOrder = useAppStore(state => state.updateSalesOrder)
  const bundleUpdateProducts = useAppStore(state => state.updateProduct)
  const addReimbursement = useAppStore(state => state.addReimbursement)
  const setIsSyncing = (v: boolean) => useAppStore.setState({ isSyncing: v })

  const [activeTab, setActiveTab] = useState("pencairan")
  const [selectedBank, setSelectedBank] = useState("bank-1")
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [selectedPurchasers, setSelectedPurchasers] = useState<Record<string, string>>({})
  const [spareAmounts, setSpareAmounts] = useState<Record<string, number>>({})
  const [returnBankOverrides, setReturnBankOverrides] = useState<Record<string, string>>({})

  // --- DATA FILTERING ---
  const needsTransfer = purchases.filter(p => {
    const items = purchaseItems.filter(pi => pi.purchaseId === p.id)
    const hasMarketItems = items.some(pi => pi.purchaseMethod === 'Pasar' || !pi.purchaseMethod)
    return p.status === 'Pending' && !p.budgetTransferDate && hasMarketItems
  })
  const pendingExpenses = expenses.filter(e => e.status === 'Pending Audit' && e.category !== 'Belanja Online' && e.category !== 'Sourcing (HPP)' && e.category !== 'Setoran Pengembalian')
  const pendingReturns = expenses.filter(e => e.status === 'Pending Audit' && e.category === 'Setoran Pengembalian')
  const awaitingOnlineAudit = expenses.filter(e => e.status === 'Pending Audit' && (e.category === 'Belanja Online' || e.category === 'Sourcing (HPP)'))
  const pendingReimbs = reimbursements.filter(r => r.status === 'Pending' || r.status === 'Approved')
  const awaitingVerification = purchases.filter(p => 
    p.reconciliationStatus === 'Laporan Masuk' || 
    (p.status === 'Selesai' && (!p.reconciliationStatus || p.reconciliationStatus === 'Belum Transfer'))
  )
  const awaitingDeliveryAudit = deliveries.filter(d => d.status === 'Awaiting Audit')

  // --- ACTIONS ---
  const handleTransferBudget = async (purchaseId: string) => {
    const purchaserId = selectedPurchasers[purchaseId]
    const spareAmount = spareAmounts[purchaseId] || 0
    if (!purchaserId) return toast.error("Pilih penerima dana terlebih dahulu.")

    const items = purchaseItems.filter(pi => pi.purchaseId === purchaseId && pi.purchaseMethod !== 'Online')
    const itemsBudget = items.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId)
      const estPrice = item.estimatedUnitPrice || product?.basePrice || 0
      return sum + (estPrice * item.qtyTarget)
    }, 0)

    const totalTransferAmount = itemsBudget + spareAmount
    if (totalTransferAmount <= 0) return toast.error("Total pencairan tidak bisa Rp 0.")

    const bank = bankAccounts.find(b => b.id === selectedBank)
    if (!bank || bank.balance < totalTransferAmount) return toast.error("Saldo rekening tidak mencukupi.")

    const now = new Date().toISOString()
    const user = users.find(u => u.id === purchaserId)
    
    toast.loading("Memproses transfer dana...", { id: "transfer-PO" })
    const success = await recordBudgetTransfer(purchaseId, totalTransferAmount, selectedBank, user?.name || 'Sourcing')

    if (success) {
      await updatePurchase(purchaseId, { 
        status: 'Belanja', 
        purchaserId, 
        budgetAmount: itemsBudget, 
        budgetTransferDate: now, 
        budgetTransferedBy: currentUser?.id || 'system', 
        budgetBankAccountId: selectedBank,
        operationalSpareAmount: spareAmount
      })
      toast.success(`Dana ${formatRupiah(totalTransferAmount)} berhasil ditransfer ke Sourcer. Sesi belanja aktif!`, { id: "transfer-PO" })
    } else {
      toast.error("Gagal memproses transfer. Cek koneksi & database.", { id: "transfer-PO" })
    }
  }

  const handleAuditExpense = async (expenseId: string, status: 'Approved' | 'Rejected') => {
    const exp = expenses.find(e => e.id === expenseId)
    if (!exp) return

    if (status === 'Approved') {
       const reporter = users.find(u => u.id === exp.reporterId)
       const advanceWallet = getAdvanceWalletByRole(reporter?.role)
       const bank = bankAccounts.find(b => b.id === selectedBank)

       toast.loading("Mencatat transaksi keuangan...", { id: "audit-exp" })

       if (exp.category === 'Setoran Pengembalian') {
          // Sourcing setor sisa kas → masuk ke bank perusahaan + jurnal credit 1-1500
          const effectiveBank = returnBankOverrides[expenseId] ?? exp.targetBankAccountId ?? selectedBank
          const success = await recordAdvanceReturn(exp.amount, exp.reporterId, effectiveBank)
          if (!success) {
             toast.error("Gagal mencatat pengembalian dana.", { id: "audit-exp" })
             return
          }
       } else if (advanceWallet) {
          const success = await recordAdvanceExpense(
            expenseId,
            exp.reporterId,
            exp.amount,
            exp.description || 'Biaya Ops',
            exp.date,
            exp.category || 'Operasional'
          )
          if (!success) {
            toast.error(`Gagal mencatat pengeluaran ${advanceWallet.label}.`, { id: "audit-exp" })
            return
          }
       } else {
          // Non-sourcing expense → catat penuh ke buku kas perusahaan
          const success = await recordOperationalExpense(expenseId, exp.amount, exp.description || '', exp.date, exp.category || 'Operasional', bank?.accountCode || '1-1200', selectedBank)
          if (!success) {
             toast.error("Gagal mencatat transaksi pengeluaran.", { id: "audit-exp" })
             return
          }
       }
       toast.success("Audit disetujui & transaksi tercatat.", { id: "audit-exp" })
    }

    await updateExpense(expenseId, { status })
    if (status === 'Rejected') toast.success("Audit ditolak.")
  }

  const handleVerifyReconciliation = async (purchaseId: string) => {
    const purchase = purchases.find(p => p.id === purchaseId)
    if (!purchase) return
    if (purchase.reconciliationStatus === 'Terverifikasi') {
      toast.info("Rekonsiliasi ini sudah pernah diverifikasi.")
      return
    }

    const advanceAmount = (purchase.budgetAmount || 0) + (purchase.operationalSpareAmount || 0)
    const syncTable = useAppStore.getState().syncTable

    toast.loading("Menutup sesi belanja & sinkronisasi stok...", { id: "rekon" })

    const success = await recordReconciliationSettlement(
       purchaseId,
       purchase.actualSpent || 0,
       0,
       advanceAmount,
       purchase.budgetBankAccountId || 'bank-1'
    )
    if (!success) {
      toast.error("Gagal settle rekonsiliasi jurnal.", { id: "rekon" })
      return
    }

    // Update Zustand local state immediately (no broadcast to avoid race with init())
    const updatedPurchase = { ...purchase, reconciliationStatus: 'Terverifikasi' as const }
    useAppStore.setState(state => ({
      purchases: state.purchases.map(p => p.id === purchaseId ? updatedPurchase : p)
    }))
    // Sync to DB silently (no broadcast)
    await syncTable('purchases', updatedPurchase, true)

    const pItems = useAppStore.getState().purchaseItems.filter(pi => pi.purchaseId === purchaseId && pi.isChecked)

    // Update harga rekomendasi produk setelah finance approve (bukan saat sourcing submit)
    for (const item of pItems) {
      if (item.actualUnitPrice > 0 && item.productId) {
        updateProductPriceHistory(item.productId, item.actualUnitPrice, 'Pasar (Verified)')
      }
    }

    toast.success("Rekonsiliasi terverifikasi! Advance disettle & harga rekomendasi diperbarui.", { id: "rekon" })
  }

  const handleVerifyDelivery = async (deliveryId: string) => {
    const delivery = deliveries.find(d => d.id === deliveryId)
    const soId = delivery?.salesOrderId
    const fallbackInvoice = invoices.find(inv => inv.salesOrderId === soId)
    const invoiceId = delivery?.invoiceId || fallbackInvoice?.id
    if (!delivery || !soId || !invoiceId) return

    const soItems = salesOrderItems.filter(i => i.salesOrderId === soId)
    const totalRevenue = soItems.reduce((sum, item) => sum + ((item.qtyFinal ?? item.qty) * item.unitPrice), 0)

    let totalCogs = 0
    const stockDeductionItems: { productId: string, qty: number }[] = []
    
    soItems.forEach(item => {
      const finalQty = item.qtyFinal ?? item.qty
      const pItem = purchaseItems.filter(pi => pi.productId === item.productId && pi.actualUnitPrice > 0).pop()
      const unitCogs = pItem ? pItem.actualUnitPrice : (products.find(p => p.id === item.productId)?.basePrice || 0)
      totalCogs += (unitCogs * finalQty)
      stockDeductionItems.push({ productId: item.productId, qty: finalQty })
    })

    toast.loading("Finalisasi pengiriman & invoice...", { id: "delivery" })
    const success = await recordDeliveryAndInvoice(deliveryId, invoiceId, totalRevenue, totalCogs, stockDeductionItems)
    if (success) {
      await updateDelivery(deliveryId, { status: 'Terkirim' })
      await updateSalesOrder(soId, { status: 'Terkirim' })
      toast.success("Audit pengiriman selesai! Omzet & HPP tercatat, stok inventory telah dikurangi.", { id: "delivery" })
    } else {
      toast.error("Gagal mencatat transaksi ke jurnal.", { id: "delivery" })
    }
  }

  const handlePayReimbursement = async (reimbId: string) => {
    const reimb = reimbursements.find(r => r.id === reimbId)
    if (!reimb) return
    const user = users.find(u => u.id === reimb.userId)
    
    toast.loading("Memproses pembayaran talangan...", { id: "reimb" })
    const success = await recordReimbursementPayment(reimb.id, reimb.amount, reimb.title || 'Reimburse', selectedBank, user?.name || 'Karyawan')
    if (success) {
      await updateReimbursement(reimbId, { status: 'Paid' })
      toast.success("Pembayaran reimbursement berhasil dicatat.", { id: "reimb" })
    } else {
      toast.error("Gagal mencatat transaksi reimbursement.", { id: "reimb" })
    }
  }

  const handleUpdateProductPrice = (productId: string, newPrice: number) => {
    bundleUpdateProducts(productId, { basePrice: newPrice })
    toast.success("Harga dasar katalog berhasil diperbarui!")
  }

  return (
    <AuthGuard allowedRoles={['finance', 'super_admin', 'ceo']}>
      <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8 pb-32">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white dark:bg-slate-900 -mx-4 md:mx-0 p-6 md:p-10 md:rounded-[3rem] shadow-xl border-b md:border border-slate-100">
           <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-slate-950 text-white rounded-[2rem] flex items-center justify-center shadow-2xl">
                 <ShieldCheck className="w-8 h-8" />
              </div>
              <div>
                 <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Finance Control Hub</h1>
                 <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] mt-3 bg-emerald-50 w-fit px-3 py-1 rounded-full">Secure Operational Audit</p>
              </div>
           </div>
           
           <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
              {bankAccounts.map(bank => (
                 <button 
                   key={bank.id}
                   onClick={() => setSelectedBank(bank.id)}
                   className={cn(
                     "p-4 rounded-3xl text-left border-2 transition-all",
                     selectedBank === bank.id ? "bg-slate-950 border-slate-950 text-white shadow-2xl scale-105" : "bg-slate-50 border-transparent text-slate-400 hover:bg-white hover:border-slate-100"
                   )}
                 >
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-60 flex items-center gap-2">
                       {selectedBank === bank.id ? <Landmark className="w-3 h-3" /> : <Clock className="w-3 h-3" />} {bank.name}
                    </p>
                    <p className="text-xl font-black mt-1 leading-none">{formatRupiah(bank.balance)}</p>
                 </button>
              ))}
           </div>
        </header>

        <Tabs defaultValue="pencairan" onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-slate-100/80 p-2 h-16 rounded-[2rem] -mx-2 md:mx-0 mb-10 overflow-x-auto overflow-y-hidden justify-start md:justify-center border border-white scrollbar-hide">
            <TabsTrigger value="pencairan" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <Wallet className="w-4 h-4 text-emerald-500" /> Pencairan PO ({needsTransfer.length})
            </TabsTrigger>
            <TabsTrigger value="audit" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <FileText className="w-4 h-4 text-slate-500" /> Audit Ops ({pendingExpenses.length})
            </TabsTrigger>
            <TabsTrigger value="reimburse" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <Receipt className="w-4 h-4 text-indigo-500" /> Reimburse ({pendingReimbs.length})
            </TabsTrigger>
            <TabsTrigger value="rekon" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <CheckCircle2 className="w-4 h-4 text-orange-500" /> Rekon ({awaitingVerification.length + awaitingOnlineAudit.length + pendingReturns.length})
            </TabsTrigger>
            <TabsTrigger value="delivery" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <Truck className="w-4 h-4 text-blue-500" /> Delivery ({awaitingDeliveryAudit.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pencairan" className="space-y-6">
            {needsTransfer.length === 0 ? (
              <EmptyState title="Antrean Pencairan Kosong" desc="Semua sesi belanja sudah ditransfer dananya." />
            ) : (
              <div className="grid gap-6">
                {needsTransfer.map(purchase => {
                  const items = purchaseItems.filter(pi => pi.purchaseId === purchase.id && pi.purchaseMethod !== 'Online')
                  const totalBudget = items.reduce((sum, item) => {
                    const product = products.find(p => p.id === item.productId)
                    const unitPrice = item.estimatedUnitPrice || product?.basePrice || 0
                    return sum + (unitPrice * item.qtyTarget)
                  }, 0)
                  return (
                    <Card key={purchase.id} className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
                      <div className="flex flex-col xl:flex-row items-stretch">
                        <div className="xl:w-1/3 p-8 bg-slate-950 text-white flex flex-col justify-between">
                           <div className="space-y-6">
                              <Badge className="bg-emerald-500/20 text-emerald-400 border-none font-black text-[9px] px-3">NEED DISBURSEMENT</Badge>
                              <div>
                                 <h3 className="text-3xl font-black tracking-tighter uppercase mb-4">Ref: {purchase.id.slice(0,8)}</h3>
                                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Estimasi Modal Dibutuhkan</p>
                                 <p className="text-4xl font-black text-white mt-1 leading-none tracking-tighter">{formatRupiah(totalBudget + (spareAmounts[purchase.id] || 0))}</p>
                              </div>
                           </div>
                           <div className="mt-12 space-y-4">
                              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                                 <div>
                                    <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block">Pilih Penanggung Jawab Sourcing</label>
                                    <select 
                                      className="w-full h-12 bg-white/10 rounded-xl px-4 text-sm font-bold focus:bg-white focus:text-slate-900 transition-all outline-none"
                                      value={selectedPurchasers[purchase.id] || ''}
                                      onChange={(e) => setSelectedPurchasers({...selectedPurchasers, [purchase.id]: e.target.value})}
                                    >
                                       <option value="">-- Pilih Sourcing --</option>
                                        {users.filter(u => ['sourcing', 'gudang', 'kurir'].includes(u.role)).map(u => (
                                           <option key={u.id} value={u.id} className="text-slate-900">{u.name}</option>
                                        ))}
                                    </select>
                                 </div>
                                 <div>
                                    <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block">Tambahkan Uang Saku / Spare (Bensin dsb)</label>
                                    <input 
                                      type="number" 
                                      className="w-full h-12 bg-white/10 rounded-xl px-4 text-sm font-bold focus:bg-white focus:text-slate-900 transition-all outline-none"
                                      placeholder="Rp 0"
                                      onChange={(e) => setSpareAmounts({...spareAmounts, [purchase.id]: parseFloat(e.target.value) || 0})}
                                    />
                                 </div>
                              </div>
                              <Button 
                                className="w-full h-16 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase"
                                onClick={() => handleTransferBudget(purchase.id)}
                              >
                                <Send className="w-5 h-5 mr-3" /> Cairkan Advance Belanja
                              </Button>
                           </div>
                        </div>
                        <div className="xl:w-2/3 p-8 border-l border-slate-50">
                           <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Daftar Barang Belanja ({items.length} item)</h4>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {items.map(item => {
                                 const product = products.find(p => p.id === item.productId)
                                 return (
                                    <div key={item.id} className="flex items-center gap-4 p-4 rounded-3xl bg-slate-50 border border-slate-100 hover:bg-white transition-all">
                                       <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center font-black text-slate-300">📦</div>
                                       <div>
                                          <p className="text-xs font-black text-slate-800 uppercase leading-none mb-1">{product?.name}</p>
                                          <p className="text-[10px] font-bold text-slate-400 uppercase">{item.qtyTarget} {product?.uom} @ {formatRupiah(item.estimatedUnitPrice)}</p>
                                       </div>
                                    </div>
                                 )
                              })}
                           </div>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="audit" className="space-y-6 text-center">
            {pendingExpenses.length === 0 ? (
              <EmptyState title="Audit Operasional Clear" desc="Semua pengajuan penda sudah diaudit." />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
                  {pendingExpenses.map(exp => {
                    const reporter = users.find(u => u.id === exp.reporterId)
                    return (
                        <Card key={exp.id} className="border-none shadow-xl rounded-[2.5rem] bg-white group hover:shadow-slate-500/5 transition-all">
                           <CardHeader className="p-6 pb-2">
                              <div className="flex justify-between items-start">
                                 <Badge className="bg-slate-100 text-slate-600 border-none font-black text-[9px] uppercase px-3 py-1">Operational Audit</Badge>
                                 <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(exp.date).toLocaleDateString()}</p>
                              </div>
                              <CardTitle className="text-lg font-black uppercase text-slate-900 mt-4 leading-tight">{exp.category}</CardTitle>
                              <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-2">
                                 <User className="w-3 h-3" /> {reporter?.name || 'Admin / System'}
                              </CardDescription>
                           </CardHeader>
                           <CardContent className="p-6 pt-2 space-y-6">
                              <div className="bg-slate-50/50 p-4 rounded-3xl border border-slate-100">
                                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Keterangan Biaya</p>
                                 <p className="text-xs font-bold text-slate-700 mt-1 italic whitespace-pre-wrap leading-relaxed opacity-70">&quot;{exp.description}&quot;</p>
                                 <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-baseline">
                                    <span className="text-[9px] font-black text-slate-400 uppercase">Nilai Transaksi</span>
                                    <span className="text-2xl font-black text-slate-900 tracking-tighter">{formatRupiah(exp.amount)}</span>
                                 </div>
                              </div>
                              <div className="flex gap-2 h-12">
                                 <Button 
                                   variant="outline" 
                                   className="flex-1 rounded-2xl border-rose-100 text-rose-500 font-black uppercase text-[10px] tracking-widest"
                                   onClick={() => handleAuditExpense(exp.id, 'Rejected')}
                                 >
                                   Tolak
                                 </Button>
                                 <Button 
                                   className="flex-[2] rounded-2xl bg-slate-950 text-white font-black uppercase text-[10px] tracking-widest"
                                   onClick={() => handleAuditExpense(exp.id, 'Approved')}
                                 >
                                   Approve Audit
                                 </Button>
                              </div>
                           </CardContent>
                        </Card>
                    )
                  })}
                </div>
            )}
          </TabsContent>

          <TabsContent value="reimburse" className="space-y-6">
            {pendingReimbs.length === 0 ? (
              <EmptyState title="Antrean Reimburse Kosong" desc="Semua talangan pribadi sudah diselesaikan." />
            ) : (
              <div className="grid gap-6">
                {pendingReimbs.map(reimb => {
                  const user = users.find(u => u.id === reimb.userId)
                  return (
                    <Card key={reimb.id} className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
                      <CardContent className="p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-6">
                          <div className="w-16 h-16 rounded-[2rem] bg-indigo-50 flex items-center justify-center shadow-inner">
                             <CreditCard className="w-8 h-8 text-indigo-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-xl font-black text-slate-800 uppercase leading-none tracking-tight">{reimb.title}</h3>
                              <Badge variant="outline" className={cn(
                                 "text-[9px] font-black uppercase border-indigo-200 px-3",
                                 reimb.status === 'Approved' ? 'bg-indigo-600 text-white' : 'text-indigo-500'
                              )}>{reimb.status}</Badge>
                            </div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                               <User className="w-3 h-3" /> {user?.name} — {new Date(reimb.date).toLocaleDateString()}
                            </p>
                            <p className="text-[10px] font-medium text-slate-400 mt-1 italic">&quot;{reimb.description}&quot;</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 w-full md:w-auto">
                           <div className="text-right">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nilai Talangan</p>
                              <p className="text-3xl font-black text-rose-600 tracking-tighter">{formatRupiah(reimb.amount)}</p>
                           </div>
                           <Button 
                              variant="outline" 
                              size="icon" 
                              className="h-14 w-14 rounded-[1.5rem] border-slate-100 bg-slate-50 hover:bg-white transition-all shadow-sm"
                              onClick={() => setPreviewImage(reimb.receiptUrl!)}
                           >
                              <ImageIcon className="w-5 h-5 text-slate-400" />
                           </Button>
                           <div className="flex gap-2">
                              {reimb.status === 'Pending' ? (
                                 <>
                                    <Button size="icon" variant="outline" className="h-14 w-14 rounded-2xl border-rose-100 text-rose-400" onClick={() => updateReimbursement(reimb.id, { status: 'Rejected' })}><XCircle className="w-6 h-6" /></Button>
                                    <Button className="h-14 px-8 rounded-2xl bg-indigo-600 text-white font-black uppercase text-[10px]" onClick={() => updateReimbursement(reimb.id, { status: 'Approved' })}>Setujui</Button>
                                 </>
                              ) : (
                                 <Button className="h-14 px-8 rounded-2xl bg-orange-500 text-white font-black uppercase text-[10px]" onClick={() => handlePayReimbursement(reimb.id)}><Banknote className="w-4 h-4 mr-2" /> Cairkan Duit</Button>
                              )}
                           </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="rekon" className="space-y-8">
             {awaitingVerification.length === 0 && awaitingOnlineAudit.length === 0 && pendingReturns.length === 0 ? (
               <EmptyState title="Semua Laporan Aman" desc="Tidak ada sesi belanja atau online purchase yang menunggu validasi rekonsiliasi." />
             ) : (
               <div className="grid gap-8">
                  {/* Category: Setoran Pengembalian Kas Operasional */}
                  {pendingReturns.length > 0 && (
                    <div className="space-y-4">
                       <div className="flex items-center gap-2 pl-4">
                          <Banknote className="w-4 h-4 text-emerald-500" />
                          <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest">Konfirmasi Setoran Kembalian Operasional</h3>
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {pendingReturns.map(exp => {
                             const reporter = users.find(u => u.id === exp.reporterId)
                             const sourceWallet = getAdvanceWalletByUserId(exp.reporterId)
                             return (
                                <Card key={exp.id} className="border-none shadow-xl rounded-[2.5rem] bg-white group hover:scale-[1.02] transition-all">
                                   <CardHeader className="p-6 pb-2">
                                      <div className="flex justify-between items-start mb-4">
                                         <Badge className="bg-emerald-50 text-emerald-700 border-none font-black text-[9px] tracking-widest">PINDAH KAS</Badge>
                                         <span className="text-[10px] font-black text-slate-400">{new Date(exp.date).toLocaleDateString()}</span>
                                      </div>
                                      <CardTitle className="text-sm font-black uppercase leading-tight text-slate-800">{exp.description}</CardTitle>
                                      <CardDescription className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">BY {reporter?.name || 'OPERASIONAL'}</CardDescription>
                                   </CardHeader>
                                   <CardContent className="p-6 pt-4 space-y-4">
                                      <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                                         <span className="text-[9px] font-black text-emerald-600 uppercase block mb-1">Dana Disetor</span>
                                         <span className="text-2xl font-black text-emerald-700 leading-none">{formatRupiah(exp.amount)}</span>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                          <p className="text-[10px] text-slate-500 font-bold">Bank tujuan setoran:</p>
                                          {exp.targetBankAccountId && !returnBankOverrides[exp.id] && (
                                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Pilihan Sourcing</span>
                                          )}
                                          {returnBankOverrides[exp.id] && (
                                            <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Dikoreksi Finance</span>
                                          )}
                                        </div>
                                        <Select
                                          value={returnBankOverrides[exp.id] ?? exp.targetBankAccountId ?? selectedBank}
                                          onValueChange={(v) => v && setReturnBankOverrides(prev => ({ ...prev, [exp.id]: v }))}
                                        >
                                          <SelectTrigger className="h-10 rounded-2xl border-slate-200 font-bold text-xs">
                                            <SelectValue placeholder="Pilih bank..." />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {bankAccounts.filter(b => b.id !== sourceWallet?.bankAccountId).map(b => (
                                              <SelectItem key={b.id} value={b.id} className="font-bold text-xs">{b.name} — {formatRupiah(b.balance)}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="flex gap-2 pt-2">
                                         <Button
                                           variant="outline"
                                           className="flex-1 h-12 rounded-2xl border-rose-100 text-rose-500 font-black uppercase text-[9px] hover:bg-rose-50"
                                           onClick={() => updateExpense(exp.id, { status: 'Rejected' })}
                                         >Tolak</Button>
                                         <Button
                                           className="flex-[2] h-12 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[9px] shadow-lg shadow-emerald-200"
                                           onClick={() => handleAuditExpense(exp.id, 'Approved')}
                                         >Terima Setoran</Button>
                                      </div>
                                   </CardContent>
                                </Card>
                             )
                          })}
                       </div>
                    </div>
                  )}
                  {/* Category: Online Purchase (HPP) */}
                  {awaitingOnlineAudit.length > 0 && (
                    <div className="space-y-4">
                       <div className="flex items-center gap-2 pl-4">
                          <Globe className="w-4 h-4 text-blue-500" />
                          <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest">Audit Belanja Online (HPP)</h3>
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {awaitingOnlineAudit.map(exp => {
                             const user = users.find(u => u.id === exp.reporterId)
                             return (
                                <Card key={exp.id} className="border-none shadow-xl rounded-[2.5rem] bg-white group hover:scale-[1.02] transition-all">
                                   <CardHeader className="p-6 pb-2">
                                      <div className="flex justify-between items-start mb-4">
                                         <Badge className="bg-blue-50 text-blue-600 border-none font-black text-[9px] tracking-widest">HPP RECONCILIATION</Badge>
                                         <span className="text-[10px] font-black text-slate-400">{new Date(exp.date).toLocaleDateString()}</span>
                                      </div>
                                      <CardTitle className="text-sm font-black uppercase leading-tight text-slate-800 line-clamp-1">{exp.description}</CardTitle>
                                      <CardDescription className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">BY {user?.name || 'ADMIN FINANCE'}</CardDescription>
                                   </CardHeader>
                                   <CardContent className="p-6 pt-4 space-y-6">
                                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50">
                                         <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">Nilai Transaksi</span>
                                         <span className="text-2xl font-black text-slate-900 leading-none">{formatRupiah(exp.amount)}</span>
                                      </div>
                                      <div className="flex gap-2 pt-2">
                                         <Button 
                                           variant="outline" 
                                           className="flex-1 h-12 rounded-2xl border-rose-100 text-rose-500 font-black uppercase text-[9px] hover:bg-rose-50"
                                           onClick={() => updateExpense(exp.id, { status: 'Rejected' })}
                                         >Tolak</Button>
                                         <Button 
                                           className="flex-[2] h-12 rounded-2xl bg-slate-900 text-white font-black uppercase text-[9px] shadow-lg shadow-slate-200"
                                           onClick={() => handleAuditExpense(exp.id, 'Approved')}
                                         >Approve Audit</Button>
                                      </div>
                                   </CardContent>
                                </Card>
                             )
                          })}
                       </div>
                    </div>
                  )}

                  {/* Category: Sourcing Reconciliation */}
                  {awaitingVerification.length > 0 && (
                    <div className="space-y-4">
                       <div className="flex items-center gap-2 pl-4">
                          <CheckCircle2 className="w-4 h-4 text-orange-500" />
                          <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest">Rekonsiliasi Laporan Sourcing (Market)</h3>
                       </div>
                       <div className="grid gap-6">
                          {awaitingVerification.map(purchase => (
                             <Card key={purchase.id} className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
                                <div className="flex flex-col xl:flex-row">
                                   <div className="xl:w-1/3 p-8 bg-slate-50 border-r border-slate-100">
                                      <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-6">Ref: {purchase.id.slice(0,8)}</h3>
                                      <div className="space-y-4">
                                         <div className="flex justify-between text-xs font-black uppercase"><span className="text-slate-400">Budget Given</span><span>{formatRupiah(purchase.budgetAmount || 0)}</span></div>
                                         <div className="flex justify-between text-xs font-black uppercase"><span className="text-slate-400">Actual Spent</span><span className="text-emerald-600">{formatRupiah(purchase.actualSpent || 0)}</span></div>
                                       <div className="flex justify-between text-xs font-black uppercase pt-4 border-t border-slate-200"><span className="text-slate-400">Returns</span><span className="text-orange-500 font-black">{formatRupiah(purchase.changeReturned || 0)}</span></div>
                                      </div>
        
                                      {purchase.reconciliationProofUrl && (
                                        <div 
                                          className="mt-6 aspect-square w-full rounded-2xl bg-white border border-slate-200 p-2 cursor-pointer hover:border-indigo-400 transition-all overflow-hidden"
                                          onClick={() => setPreviewImage(purchase.reconciliationProofUrl!)}
                                        >
                                           <img src={purchase.reconciliationProofUrl} className="w-full h-full object-cover rounded-xl" />
                                        </div>
                                      )}
        
                                      <Button className="w-full h-14 mt-8 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px]" onClick={() => handleVerifyReconciliation(purchase.id)}><ShieldCheck className="w-4 h-4 mr-2" /> Terima Rekonsiliasi</Button>
                                   </div>
                                   <div className="xl:w-2/3 p-8">
                                      <h4 className="text-[10px] font-black text-slate-400 uppercase mb-4">Itemized Expenses</h4>
                                      <div className="grid gap-2">
                                         {purchaseItems.filter(pi => pi.purchaseId === purchase.id && pi.isChecked).map(item => (
                                            <div key={item.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-50">
                                               <span className="text-xs font-black text-slate-800 uppercase">{products.find(p => p.id === item.productId)?.name}</span>
                                               <span className="text-xs font-black text-slate-900">{formatRupiah(item.actualUnitPrice * item.qtyPurchased)}</span>
                                            </div>
                                         ))}
                                      </div>
                                   </div>
                                </div>
                             </Card>
                          ))}
                       </div>
                    </div>
                  )}
               </div>
             )}
          </TabsContent>

          <TabsContent value="delivery" className="space-y-6">
             {awaitingDeliveryAudit.length === 0 ? (
               <EmptyState title="Audit Pengiriman Clear" desc="Semua laporan pengiriman kurir sudah tervalidasi." />
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {awaitingDeliveryAudit.map(delivery => {
                     const so = salesOrders.find(s => s.id === delivery.salesOrderId)
                     const client = clients.find(c => c.id === so?.clientId)
                     const courier = users.find(u => u.id === delivery.courierId)
                     const soItems = salesOrderItems.filter(i => i.salesOrderId === so?.id)
                     const totalRev = soItems.reduce((sum, item) => sum + ((item.qtyFinal ?? item.qty) * item.unitPrice), 0)
                     return (
                        <Card key={delivery.id} className="border-none shadow-xl rounded-[2.5rem] bg-white group overflow-hidden">
                           <CardHeader className="p-6 pb-2">
                              <Badge className="bg-blue-50 text-blue-600 border-none font-black text-[9px] w-fit mb-4">DELIVERY AUDIT</Badge>
                              <CardTitle className="text-base font-black uppercase text-slate-800">{client?.companyName}</CardTitle>
                              <CardDescription className="text-[10px] font-bold text-slate-400 uppercase">PO: {so?.poNumber} • {courier?.name}</CardDescription>
                           </CardHeader>
                           <CardContent className="p-6 pt-4 space-y-4">
                              <div className="aspect-video bg-slate-100 rounded-2xl flex items-center justify-center relative overflow-hidden">
                                 {delivery.baUrl ? <img src={delivery.baUrl} className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-slate-300" />}
                                 {delivery.baUrl && <Button variant="secondary" size="icon" className="absolute bottom-2 right-2 rounded-xl" onClick={() => setPreviewImage(delivery.baUrl!)}><Eye className="w-4 h-4" /></Button>}
                              </div>
                              <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
                                 <span className="text-[9px] font-black text-slate-400 uppercase">Invoice Value</span>
                                 <span className="text-xl font-black text-slate-900">{formatRupiah(totalRev)}</span>
                              </div>
                              <Button className="w-full rounded-2xl h-12 bg-blue-600 text-white font-black uppercase text-[10px]" onClick={() => handleVerifyDelivery(delivery.id)}>Approve & Record Revenue</Button>
                           </CardContent>
                        </Card>
                     )
                  })}
               </div>
             )}
          </TabsContent>
        </Tabs>

        <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
           <DialogContent className="max-w-4xl w-[95vw] border-none rounded-[2rem] p-0 overflow-hidden bg-slate-900">
              <div className="w-full h-[80vh] flex items-center justify-center p-4">
                 {previewImage && <img src={previewImage} className="max-w-full max-h-full object-contain" />}
              </div>
              <div className="p-4 bg-white flex justify-center border-t border-slate-100"><Button className="rounded-2xl bg-slate-950 text-white font-black px-12 h-12" onClick={() => setPreviewImage(null)}>Tutup Preview</Button></div>
           </DialogContent>
        </Dialog>
      </div>
    </AuthGuard>
  )
}

function EmptyState({ title, desc }: { title: string, desc: string }) {
  return (
    <Card className="border-none bg-slate-50/50 rounded-[3rem] py-32 shadow-inner">
       <div className="flex flex-col items-center text-center px-6">
          <div className="w-20 h-20 bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 flex items-center justify-center mb-6"><CheckCircle2 className="w-10 h-10 text-emerald-500/20" /></div>
          <h3 className="text-lg font-black text-slate-800 uppercase mb-2">{title}</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{desc}</p>
       </div>
    </Card>
  )
}

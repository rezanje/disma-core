"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah, cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  ShieldCheck, Wallet, Send, 
  CheckCircle2, XCircle, Clock, 
  Banknote, Landmark, CreditCard,
  Receipt, User, FileText, Eye, Image as ImageIcon,
  AlertTriangle, ChevronRight, RefreshCw, Database
} from "lucide-react"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import { createAccountingEntry, recordBudgetTransfer, recordReimbursementPayment, recordOnlinePurchase, recordOperationalExpense, recordReconciliationSettlement } from "@/lib/accounting"
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
  
  const updatePurchase = useAppStore(state => state.updatePurchase)
  const updateReimbursement = useAppStore(state => state.updateReimbursement)
  const updateExpense = useAppStore(state => state.updateExpense)
  const bundleUpdateProducts = useAppStore(state => state.updateProduct)
  const addCashTransaction = useAppStore(state => state.addCashTransaction)
  const addReimbursement = useAppStore(state => state.addReimbursement)

  const [activeTab, setActiveTab] = useState("pencairan")
  const [selectedBank, setSelectedBank] = useState("bank-1")
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [selectedPurchasers, setSelectedPurchasers] = useState<Record<string, string>>({})
  const [spareAmounts, setSpareAmounts] = useState<Record<string, number>>({})

  // --- DATA FILTERING ---
  // 1. Pencairan PO (Needs Transfer to Sourcing)
  // Only show purchases that have at least one MARKET (Pasar) item.
  // Online-only purchases are handled directly in Finance Online Hub and don't need transfer.
  const needsTransfer = purchases.filter(p => {
    const items = purchaseItems.filter(pi => pi.purchaseId === p.id)
    const hasMarketItems = items.some(pi => pi.purchaseMethod === 'Pasar' || !pi.purchaseMethod)
    return p.status === 'Pending' && !p.budgetTransferDate && hasMarketItems
  })
  
  // 2. Audit Ops (Potong Kas)
  const pendingExpenses = expenses.filter(e => e.status === 'Pending Audit')
  
  // 3. Reimbursement (Talangan Pribadi)
  const pendingReimbs = reimbursements.filter(r => r.status === 'Pending' || r.status === 'Approved')
  
  // 4. Rekonsiliasi (Verification)
  const awaitingVerification = purchases.filter(p => p.reconciliationStatus === 'Laporan Masuk')

  // --- ACTIONS ---
  const handleTransferBudget = (purchaseId: string) => {
    const purchaserId = selectedPurchasers[purchaseId]
    const spareAmount = spareAmounts[purchaseId] || 0
    
    if (!purchaserId) {
      toast.error("Pilih penerima dana terlebih dahulu.")
      return
    }

    const items = purchaseItems.filter(pi => pi.purchaseId === purchaseId && pi.purchaseMethod !== 'Online')
    const itemsBudget = items.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId)
      const estPrice = item.estimatedUnitPrice || product?.basePrice || 0
      return sum + (estPrice * item.qtyTarget)
    }, 0)

    const totalTransferAmount = itemsBudget + spareAmount

    if (totalTransferAmount <= 0) {
      toast.error("Total pencairan tidak bisa Rp 0.")
      return
    }

    const bank = bankAccounts.find(b => b.id === selectedBank)
    if (!bank || bank.balance < totalTransferAmount) {
      toast.error("Saldo rekening tidak mencukupi.")
      return
    }

    const now = new Date().toISOString()
    
    // New centralized accounting logic (Cash + Journal)
    recordBudgetTransfer(purchaseId, totalTransferAmount, selectedBank, users.find(u => u.id === purchaserId)?.name || 'Sourcing')

    updatePurchase(purchaseId, {
      budgetAmount: itemsBudget,
      operationalSpareAmount: spareAmount,
      budgetTransferDate: now,
      budgetTransferedBy: currentUser?.id || 'system',
      budgetBankAccountId: selectedBank,
      purchaserId: purchaserId,
      reconciliationStatus: 'Dana Ditransfer',
      status: 'Belanja' // Active shopping session
    })

    toast.success(`Total dana ${formatRupiah(totalTransferAmount)} berhasil ditransfer ke ${users.find(u => u.id === purchaserId)?.name}!`)
  }

  const handleVerifyReconciliation = (purchaseId: string) => {
    const purchase = purchases.find(p => p.id === purchaseId)
    if (!purchase) return

    const budgetAmount = (purchase.budgetAmount || 0) + (purchase.operationalSpareAmount || 0)
    const actualShopSpent = purchase.actualSpent || 0
    
    // --- FIX: AGGREGATE OPERATIONAL EXPENSES ---
    // Look for all APPROVED operational expenses by this purchaser during this trip
    const tripOps = expenses.filter(e => 
      e.reporterId === purchase.purchaserId && 
      e.status === 'Approved' && 
      e.category !== 'Belanja Online' &&
      purchase.budgetTransferDate && e.date >= purchase.budgetTransferDate
    ).reduce((sum, e) => sum + e.amount, 0)
    
    // 1. Audit logic: Calculate over/under with Ops included!
    const totalSpent = actualShopSpent + tripOps
    const diff = totalSpent - budgetAmount
    const bankId = purchase.budgetBankAccountId || 'bank-1'

    // 2. Perform Master Accounting Settlement
    recordReconciliationSettlement(
      purchaseId,
      actualShopSpent,
      tripOps, // Pass actual ops found
      budgetAmount,
      bankId
    )

    // 3. Handle Overspend (Nombok) -> Auto Reimburse
    if (diff > 0) {
      addReimbursement({
        id: uuidv4(),
        date: new Date().toISOString(),
        userId: purchase.purchaserId || 'u2',
        title: `Pelunasan Selisih Sourcing: REF-${purchaseId.slice(0,8)}`,
        amount: diff,
        description: `Kekurangan dana (nombok) saat belanja pasar & operasional. Berdasarkan audit rekonsiliasi.`,
        status: 'Approved',
        receiptUrl: '' 
      })
      toast.info(`Nombok terdeteksi (${formatRupiah(diff)}). Otomatis dibuatkan Reimbursement.`)
    }


    updatePurchase(purchaseId, { reconciliationStatus: 'Terverifikasi', status: 'Selesai' })

    // 4. Auto-Increment Physical Stock for checked items
    const pItems = purchaseItems.filter(pi => pi.purchaseId === purchaseId && pi.isChecked)
    pItems.forEach(item => {
      const product = products.find(p => p.id === item.productId)
      if (product) {
        bundleUpdateProducts(product.id, { 
          currentStock: (product.currentStock || 0) + (item.qtyPurchased || 0) 
        })
      }
    })

    toast.success("Rekonsiliasi terverifikasi! Advance disettle, kembalian dicatat, dan stok barang ditambahkan.")
  }

  const handlePayReimbursement = async (reimbId: string) => {
    const reimb = reimbursements.find(r => r.id === reimbId)
    if (!reimb) return

    const now = new Date().toISOString()
    const user = users.find(u => u.id === reimb.userId)
    
    // New centralized accounting logic (Cash + Journal)
    recordReimbursementPayment(reimbId, reimb.amount, reimb.title, selectedBank, user?.name || 'User')

    updateReimbursement(reimbId, { 
      status: 'Paid', 
      paymentDate: now
    })

    toast.success(`Pembayaran reimburse ${formatRupiah(reimb.amount)} berhasil!`)
  }

  const handleUpdateProductPrice = (productId: string, newPrice: number) => {
    bundleUpdateProducts(productId, { basePrice: newPrice })
    toast.success("Harga Dasar Produk di Katalog berhasil diperbarui!", {
      description: `Kini menggunakan harga terbaru: ${formatRupiah(newPrice)}`,
    })
  }

  const handleAuditExpense = (expenseId: string, status: 'Approved' | 'Rejected') => {
    const expense = expenses.find(e => e.id === expenseId)
    if (!expense) return

    updateExpense(expenseId, { status, auditDate: new Date().toISOString() })
    
    if (status === 'Approved') {
      let success = false
      if (expense.category === 'Belanja Online' && expense.referenceId) {
        const pItem = purchaseItems.find(i => i.id === expense.referenceId)
        const pName = pItem ? (products.find(p => p.id === pItem.productId)?.name || expense.description) : expense.description
        success = recordOnlinePurchase(
          expense.referenceId, 
          expense.amount + (expense.adminFee || 0) + (expense.shippingFee || 0), // Total inclusive of fees
          pName,
          expense.adminFee || 0,
          expense.shippingFee || 0
        )

      } else {
        const reporter = users.find(u => u.id === expense.reporterId)
        const isSourcing = reporter?.role === 'sourcing'
        const targetBankId = isSourcing ? 'bank-advance-sourcing' : 'bank-4'

        success = recordOperationalExpense(
          expense.id,
          expense.amount,
          `${expense.category}: ${expense.description}`,
          expense.date,
          expense.category,
          '1-1000', // Default credit COA
          targetBankId
        )
      }

      if (success) {
        toast.success(`Transaksi ${expense.category} Disetujui & Masuk Laporan Keuangan!`)
      } else {
        toast.error("Gagal mencatat transaksi ke jurnal.")
      }
    } else {
      // If REJECTED
      if (expense.category === 'Belanja Online' && expense.referenceId) {
        // Rollback purchaseItem status so it can be ordered again (with fix)
        useAppStore.getState().updatePurchaseItem(expense.referenceId, {
           isOnlineOrdered: false,
           actualUnitPrice: 0,
           qtyPurchased: 0
        })
        toast.warning("Pembelian Online ditolak. Item dikembalikan ke antrean belanja.")
      } else {
        toast.info(`Status audit diperbarui: ${status}`)
      }
    }
  }

  return (
    <AuthGuard allowedRoles={['finance', 'ceo', 'super_admin', 'cmo']}>
      <div className="space-y-8 pb-24">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">FINANCE <span className="text-emerald-600">HUB</span></h2>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> Pusat Kontrol & Otorisasi Transaksi DISMA
            </p>
          </div>
          
          <div className="bg-white/50 backdrop-blur-md p-2 rounded-2xl border flex items-center gap-3 shadow-sm">
             <Landmark className="w-5 h-5 text-slate-400 ml-2" />
             <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sumber Dana Utama</span>
                <select 
                  value={selectedBank} 
                  onChange={(e) => setSelectedBank(e.target.value)}
                  className="bg-transparent font-black text-xs text-slate-800 border-none focus:ring-0 p-0 cursor-pointer"
                >
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({formatRupiah(b.balance)})
                    </option>
                  ))}
                </select>
             </div>
          </div>
        </div>

        <Tabs defaultValue="pencairan" className="w-full" onValueChange={setActiveTab}>
          <TabsList className="bg-slate-100/50 p-1.5 rounded-[2rem] h-16 w-full max-w-4xl mb-8 border backdrop-blur-sm shadow-inner grid grid-cols-4">
            <TabsTrigger value="pencairan" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <Wallet className="w-4 h-4" /> Pencairan PO ({needsTransfer.length})
            </TabsTrigger>
            <TabsTrigger value="audit" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <FileText className="w-4 h-4" /> Audit Ops ({pendingExpenses.length})
            </TabsTrigger>
            <TabsTrigger value="reimburse" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <CreditCard className="w-4 h-4" /> Reimburse ({pendingReimbs.length})
            </TabsTrigger>
            <TabsTrigger value="rekon" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <CheckCircle2 className="w-4 h-4 text-orange-500" /> Rekon ({awaitingVerification.length})
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Pencairan PO */}
          <TabsContent value="pencairan" className="space-y-6">
            {needsTransfer.length === 0 ? (
              <EmptyState title="Antrean Pencairan Kosong" desc="Semua PO belanja sudah dicairkan dananya." />
            ) : (
              needsTransfer.map(purchase => {
                const items = purchaseItems.filter(pi => pi.purchaseId === purchase.id && pi.purchaseMethod !== 'Online')
                const totalBudget = items.reduce((sum, item) => {
                  const product = products.find(p => p.id === item.productId)
                  return sum + ((item.estimatedUnitPrice || product?.basePrice || 0) * item.qtyTarget)
                }, 0)
                
                return (
                  <Card key={purchase.id} className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
                    <div className="flex flex-col lg:flex-row">
                       <div className="lg:w-1/3 p-8 bg-slate-50/50 border-r border-slate-100">
                          <div className="space-y-6">
                             <div>
                                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Sesi Belanja PO</h3>
                                <p className="text-2xl font-black text-slate-800 uppercase tracking-tighter">REF-{purchase.id.slice(0,8)}</p>
                             </div>

                             <div className="space-y-4">
                                <div>
                                   <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Pilih Pemegang Dana (Sourcing)</label>
                                   <select 
                                      className="w-full h-12 bg-white border border-slate-200 rounded-xl px-4 font-bold text-sm"
                                      value={selectedPurchasers[purchase.id] || ""}
                                      onChange={(e) => setSelectedPurchasers({...selectedPurchasers, [purchase.id]: e.target.value})}
                                   >
                                      <option value="">- Pilih Orang -</option>
                                      {users.filter(u => u.role === 'sourcing').map(u => (
                                         <option key={u.id} value={u.id}>{u.name}</option>
                                      ))}
                                   </select>
                                </div>

                                <div>
                                   <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Input Dana Spare Ops (Bensin/Parkir)</label>
                                   <div className="relative">
                                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-300 text-sm">Rp</span>
                                      <input 
                                         type="number"
                                         className="w-full h-12 bg-white border border-slate-200 rounded-xl pl-10 pr-4 font-black text-emerald-600 text-lg"
                                         value={spareAmounts[purchase.id] || 0}
                                         onChange={(e) => setSpareAmounts({...spareAmounts, [purchase.id]: Number(e.target.value)})}
                                      />
                                   </div>
                                </div>
                             </div>

                             <div className="pt-6 border-t border-slate-200">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Dana Ditransfer</p>
                                <p className="text-3xl font-black text-emerald-600">{formatRupiah(totalBudget + (spareAmounts[purchase.id] || 0))}</p>
                                <p className="text-[9px] font-bold text-slate-400 mt-1 italic leading-tight">Berisi Budget Produk ({formatRupiah(totalBudget)}) + Spare Ops ({formatRupiah(spareAmounts[purchase.id] || 0)})</p>
                             </div>

                             <Button 
                                className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 rounded-2xl shadow-xl shadow-emerald-500/20 font-black uppercase text-[10px] tracking-widest mt-4"
                                onClick={() => handleTransferBudget(purchase.id)}
                             >
                                <Send className="w-4 h-4 mr-2" /> Proses Transfer Dana
                             </Button>
                          </div>
                       </div>
                       <div className="lg:w-2/3 p-8">
                           <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Breakdown Target Belanja</h4>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {items.map(item => {
                                 const product = products.find(p => p.id === item.productId)
                                 return (
                                   <div key={item.id} className="flex justify-between items-center p-4 rounded-3xl bg-slate-50 border border-slate-100/10">
                                      <div className="flex items-center gap-4">
                                         <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-inner">
                                            <Landmark className="w-4 h-4 text-emerald-300" />
                                         </div>
                                         <div>
                                            <p className="font-black text-slate-800 text-xs uppercase leading-none">{product?.name}</p>
                                            <p className="text-[9px] font-bold text-slate-400 mt-1">{item.qtyTarget} {product?.uom}</p>
                                         </div>
                                      </div>
                                      <div className="text-right">
                                         <p className="font-black text-slate-600 text-sm">{formatRupiah((item.estimatedUnitPrice || product?.basePrice || 0) * item.qtyTarget)}</p>
                                      </div>
                                   </div>
                                 )
                              })}
                           </div>
                       </div>
                    </div>
                  </Card>
                )
              })
            )}
          </TabsContent>

          {/* TAB 2: Audit Ops (Potong Kas) */}
          <TabsContent value="audit" className="space-y-6">
             {pendingExpenses.length === 0 ? (
               <EmptyState title="Audit Operasional Clear" desc="Semua laporan potong kas sudah tervalidasi." />
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pendingExpenses.map(exp => {
                     const reporter = users.find(u => u.id === exp.reporterId)
                     return (
                       <Card key={exp.id} className="border-none shadow-xl rounded-[2.5rem] bg-white group hover:shadow-emerald-500/5 transition-all">
                          <CardHeader className="p-6 pb-2">
                             <div className="flex justify-between items-start">
                                <Badge className="bg-emerald-50 text-emerald-600 border-none font-black text-[9px] uppercase px-3 py-1">Potong Kas</Badge>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(exp.date).toLocaleDateString()} • {reporter?.name}</p>
                             </div>
                             <CardTitle className="text-base font-black uppercase text-slate-800 mt-3">{exp.category}</CardTitle>
                          </CardHeader>
                          <CardContent className="p-6 pt-0 space-y-4">
                             <div className="relative group/img overflow-hidden rounded-2xl aspect-[4/3] bg-slate-100 border border-slate-100">
                                {exp.receiptUrl ? (
                                   <img src={exp.receiptUrl} className="w-full h-full object-cover group-hover/img:scale-105 transition-transform" />
                                ) : (
                                   <div className="flex items-center justify-center h-full text-slate-300">No Photo</div>
                                )}
                                <Button 
                                   variant="secondary" 
                                   size="sm" 
                                   className="absolute bottom-2 right-2 rounded-xl h-8 text-[9px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all bg-white/90 backdrop-blur-sm shadow-xl"
                                   onClick={() => setPreviewImage(exp.receiptUrl!)}
                                >
                                   <Eye className="w-3 h-3 mr-1.5" /> Lihat Bukti
                                </Button>
                             </div>
                             <div className="bg-slate-50 p-4 rounded-2xl">
                                <p className="text-xs font-bold text-slate-600 italic">"{exp.description}"</p>
                                <p className="text-2xl font-black text-slate-900 mt-2 tracking-tighter">{formatRupiah(exp.amount)}</p>
                             </div>
                             <div className="flex gap-2">
                                <Button 
                                  variant="outline" 
                                  className="flex-1 rounded-2xl h-12 border-rose-100 text-rose-500 font-bold text-xs"
                                  onClick={() => handleAuditExpense(exp.id, 'Rejected')}
                                >
                                  Tolak
                                </Button>
                                <Button 
                                  className="flex-[2] rounded-2xl h-12 bg-slate-950 text-white font-black uppercase text-[10px] tracking-widest"
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

          {/* TAB 3: Reimbursement (Talangan Pribadi) */}
          <TabsContent value="reimburse" className="space-y-6">
            {pendingReimbs.length === 0 ? (
              <EmptyState title="Antrean Reimburse Kosong" desc="Semua talangan pribadi sudah diselesaikan." />
            ) : (
              pendingReimbs.map(reimb => {
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
                          <p className="text-[10px] font-medium text-slate-400 mt-1 italic">"{reimb.description}"</p>
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
                                  <Button 
                                    size="icon" 
                                    variant="outline" 
                                    className="h-14 w-14 rounded-2xl border-rose-100 text-rose-400 hover:text-rose-600"
                                    onClick={() => updateReimbursement(reimb.id, { status: 'Rejected' })}
                                  >
                                    <XCircle className="w-6 h-6" />
                                  </Button>
                                  <Button 
                                    className="h-14 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] tracking-widest"
                                    onClick={() => updateReimbursement(reimb.id, { status: 'Approved' })}
                                  >
                                    Setujui
                                  </Button>
                               </>
                            ) : (
                               <Button 
                                 className="h-14 px-8 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-orange-500/20"
                                 onClick={() => handlePayReimbursement(reimb.id)}
                               >
                                 <Banknote className="w-4 h-4 mr-2" /> Cairkan Duit
                               </Button>
                            )}
                         </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </TabsContent>

          {/* TAB 4: Rekonsiliasi Belanja (Laporan PO) */}
          <TabsContent value="rekon" className="space-y-6">
             {awaitingVerification.length === 0 ? (
               <EmptyState title="Semua Laporan Aman" desc="Tidak ada sesi belanja yang menunggu validasi rekonsiliasi." />
             ) : (
               <div className="grid gap-6">
                  {awaitingVerification.map(purchase => {
                     const diff = (purchase.actualSpent || 0) - (purchase.budgetAmount || 0)
                     const isMatch = diff === 0
                     const isDeficit = diff > 0
                     
                     return (
                        <Card key={purchase.id} className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
                           <div className="flex flex-col xl:flex-row">
                              <div className="xl:w-1/3 p-8 border-r border-slate-50 bg-slate-50/30">
                                 <div className="space-y-6">
                                    <div className="flex justify-between items-start">
                                       <div>
                                          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">REF-{purchase.id.slice(0,8)}</h3>
                                          <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mt-1">Laporan Belanja Masuk</p>
                                       </div>
                                       {isDeficit && <Badge className="bg-rose-100 text-rose-600 border-none font-black text-[9px]">OVER BUDGET</Badge>}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                       <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Budget PO</p>
                                          <p className="text-lg font-black text-slate-800">{formatRupiah(purchase.budgetAmount || 0)}</p>
                                       </div>
                                       <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Aktual Nota</p>
                                          <p className="text-lg font-black text-emerald-600">{formatRupiah(purchase.actualSpent || 0)}</p>
                                       </div>
                                    </div>

                                    {purchase.reconciliationNote && (
                                       <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4">
                                          <p className="text-[9px] font-black text-amber-600 uppercase mb-1">Catatan Sourcer:</p>
                                          <p className="text-xs font-bold text-slate-700 italic">"{purchase.reconciliationNote}"</p>
                                       </div>
                                    )}

                                    <Button 
                                       className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-600/20"
                                       onClick={() => handleVerifyReconciliation(purchase.id)}
                                    >
                                       <ShieldCheck className="w-4 h-4 mr-2" /> Terima Rekonsiliasi
                                    </Button>
                                 </div>
                              </div>
                              <div className="xl:w-2/3 p-8">
                                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Detail Nota Tiap Item</h4>
                                 <div className="grid gap-2">
                                    {purchaseItems.filter(pi => pi.purchaseId === purchase.id && pi.isChecked).map(item => {
                                       const product = products.find(p => p.id === item.productId)
                                       return (
                                          <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-50 hover:bg-white transition-all group">
                                             <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 overflow-hidden flex items-center justify-center">
                                                   {item.receiptUrl ? (
                                                      <button onClick={() => setPreviewImage(item.receiptUrl!)} className="w-full h-full">
                                                         <img src={item.receiptUrl} className="w-full h-full object-cover" />
                                                      </button>
                                                   ) : <ImageIcon className="w-4 h-4 text-slate-200" />}
                                                </div>
                                                <div>
                                                   <p className="text-[11px] font-black text-slate-800 uppercase leading-none">{product?.name}</p>
                                                   <p className="text-[9px] font-bold text-slate-400 mt-1">{item.qtyPurchased} {product?.uom} @ {formatRupiah(item.actualUnitPrice)}</p>
                                                </div>
                                             </div>
                                             <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                   <p className="text-xs font-black text-slate-900">{formatRupiah(item.actualUnitPrice * item.qtyPurchased)}</p>
                                                   <p className={cn("text-[8px] font-black uppercase", item.actualUnitPrice > (item.estimatedUnitPrice || 0) ? 'text-rose-500' : 'text-emerald-500')}>
                                                      {item.actualUnitPrice > (item.estimatedUnitPrice || 0) ? `↑ ${formatRupiah(item.actualUnitPrice - (item.estimatedUnitPrice || 0))}` : '✓ OK'}
                                                   </p>
                                                </div>
                                                
                                                {/* Option to update Catalog Price */}
                                                {item.actualUnitPrice !== product?.basePrice && (
                                                  <Button 
                                                     variant="outline" 
                                                     size="sm" 
                                                     className="h-10 px-3 md:px-4 rounded-xl border-emerald-100 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all flex items-center gap-2 group/cat"
                                                     onClick={() => handleUpdateProductPrice(item.productId, item.actualUnitPrice)}
                                                     title="Jadikan Harga Dasar Katalog"
                                                  >
                                                     <Database className="w-3.5 h-3.5 group-hover/cat:scale-125 transition-transform" />
                                                     <span className="hidden md:inline text-[9px] font-black uppercase tracking-widest leading-none">Sinkron Katalog</span>
                                                  </Button>
                                                )}

                                                {item.receiptUrl && (
                                                   <Button 
                                                      variant="ghost" 
                                                      size="icon" 
                                                      className="h-10 w-10 rounded-xl bg-slate-50 text-slate-400 group-hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-all border border-slate-100"
                                                      onClick={() => setPreviewImage(item.receiptUrl!)}
                                                   >
                                                      <Eye className="w-4 h-4" />
                                                   </Button>
                                                )}
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
        </Tabs>

        {/* IMAGE PREVIEW MODAL */}
        <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
           <DialogContent className="max-w-4xl w-[95vw] border-none rounded-[2rem] p-0 overflow-hidden bg-slate-100 shadow-2xl">
              <DialogHeader className="p-6 absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-slate-900/40 to-transparent">
                 <DialogTitle className="text-white font-black uppercase tracking-widest text-xs flex items-center gap-2 drop-shadow-md">
                    <ImageIcon className="w-4 h-4 text-emerald-400" /> Preview Bukti Nota / Bon
                 </DialogTitle>
              </DialogHeader>
              <div className="w-full h-[75vh] md:h-[80vh] overflow-auto flex items-start justify-center p-4 pt-20 bg-slate-900/5">
                 {previewImage && (
                    <img 
                       src={previewImage} 
                       className="w-full h-auto shadow-2xl rounded-xl object-contain min-h-full" 
                       alt="Preview Nota Besar" 
                    />
                 )}
              </div>
              <div className="p-4 bg-white flex justify-center border-t border-slate-100">
                 <Button 
                    className="rounded-2xl bg-slate-900 hover:bg-black text-white font-black px-12 h-12" 
                    onClick={() => setPreviewImage(null)}
                 >
                    Tutup Preview
                 </Button>
              </div>
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
          <div className="w-20 h-20 bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 flex items-center justify-center mb-6">
             <CheckCircle2 className="w-10 h-10 text-emerald-500/20" />
          </div>
          <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest leading-none mb-2">{title}</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{desc}</p>
       </div>
    </Card>
  )
}

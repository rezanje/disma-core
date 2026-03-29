"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
// import { recordPurchaseComplete } from "@/lib/accounting"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Camera, CheckCircle2, ChevronRight, PackageCheck, ShoppingBag, Globe, Banknote, Wallet } from "lucide-react"
import { toast } from "sonner"
import { PurchaseItem } from "@/types"
import { formatNumber, parseNumber, formatRupiah, cn } from "@/lib/utils"
import ReceiptUpload from "@/components/ui/receipt-upload"

export default function SourcingDashboard() {
  const currentUser = useAppStore(state => state.currentUser)
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const products = useAppStore(state => state.products)
  const expenses = useAppStore(state => state.expenses)
  const updatePurchase = useAppStore(state => state.updatePurchase)
  const updatePurchaseItem = useAppStore(state => state.updatePurchaseItem)

  const [activeItem, setActiveItem] = useState<PurchaseItem | null>(null)
  const [reconciliationNote, setReconciliationNote] = useState('')
  
  // --- ROBUST WALLET CALCULATION (SHARED LOGIC) ---
  const bankAccounts = useAppStore(state => state.bankAccounts)
  const sourcingBank = bankAccounts.find(b => b.id === 'bank-advance-sourcing')
  
  // Total modal is the active unsettled balance held in Sourcing's internal bank account
  const totalHolding = sourcingBank?.balance || 0
  
  // Items checked in the current shopping list BEFORE they are submitted/settled
  const myPurchaseItems = purchaseItems.filter(pi => 
    purchases.some(p => p.id === pi.purchaseId && (p.purchaserId === currentUser?.id || p.purchaserId === 'u2' || p.purchaserId === 'pending'))
  )
  const totalShopSpent = myPurchaseItems
    .filter(i => i.isChecked)
    .reduce((sum, i) => sum + (i.qtyPurchased * i.actualUnitPrice), 0)
  
  // Active operating expenses (bensin, etc) that have not been audited
  const totalExpenses = expenses
    .filter(e => (e.reporterId === currentUser?.id || e.reporterId === 'u2') && e.status === 'Pending Audit')
    .reduce((sum, e) => sum + e.amount, 0)
  
  // Remaining cash he expects to have in his physical pocket right now
  const remainingCash = totalHolding - totalShopSpent - totalExpenses

  // Find ALL active purchases that this user can work on
  const activePurchases = purchases.filter(p => 
    (p.status === 'Pending' || p.status === 'Belanja') && 
    (!p.purchaserId || p.purchaserId === currentUser?.id || p.purchaserId === 'pending')
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
 
  const handleActualPriceChange = (item: PurchaseItem, price: number) => { updatePurchaseItem(item.id, { actualUnitPrice: price }) }
  const handleActualQtyChange = (item: PurchaseItem, qty: number) => { updatePurchaseItem(item.id, { qtyPurchased: qty }) }
  const handleNotesChange = (item: PurchaseItem, notes: string) => { updatePurchaseItem(item.id, { notes }) }
 
  const handleTransferToOnline = (item: PurchaseItem) => {
    updatePurchaseItem(item.id, { isChecked: true, purchaseMethod: 'Online', notes: item.notes || 'Tidak ada di pasar - Alihkan ke Online (Finance)' })
    setActiveItem(null)
    toast.success(`${products.find(p => p.id === item.productId)?.name} dialihkan ke antrean Online Admin.`)
  }
 
  const handleSubmitLaporan = () => {
    if (activePurchases.length === 0) return
    const itemsCost = currentItems.filter(item => item.isChecked).reduce((sum, item) => sum + (item.qtyPurchased * item.actualUnitPrice), 0)
 
    activePurchases.forEach(p => {
      const pItems = currentItems.filter(item => item.purchaseId === p.id && item.isChecked)
      const pCost = pItems.reduce((sum, item) => sum + (item.qtyPurchased * item.actualUnitPrice), 0)
      const pBudget = (p.budgetAmount || 0) + (p.operationalSpareAmount || 0)
      
      updatePurchase(p.id, { 
        status: 'Selesai',
        purchaserId: currentUser?.id || 'u2',
        actualSpent: pCost,
        changeReturned: pBudget > pCost ? pBudget - pCost : 0,
        reconciliationNote: reconciliationNote || 'Sesuai budget (Auto-Consolidated)',
        reconciliationStatus: 'Laporan Masuk',
      })
      // recordPurchaseComplete removed - settlement now happens via Finance Hub Reconciliation
    })
 
    const salesOrders = useAppStore.getState().salesOrders
    const updateSO = useAppStore.getState().updateSalesOrder
    salesOrders.filter(so => so.status === 'Belanja').forEach(so => {
      updateSO(so.id, { status: 'QC' })
    })
 
    toast.success(`${activePurchases.length} sesi belanja berhasil diselesaikan!`)
  }

  if (activePurchases.length === 0) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center text-center py-20">
        <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-slate-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">Semua Tugas Selesai</h2>
        <p className="text-slate-500 max-w-[250px]">
          Belum ada daftar belanja baru dari Admin untuk hari ini.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-500 pb-20">
      {/* Wallet Summary */}
      <div className="bg-slate-900 rounded-[2.5rem] p-6 text-white shadow-2xl relative overflow-hidden -mx-2">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
        <div className="relative z-10 space-y-4">
          <div className="flex justify-between items-center">
             <div className="flex items-center gap-2">
               <div className="p-2 bg-white/10 rounded-xl">
                 <Wallet className="w-4 h-4 text-emerald-400" />
               </div>
               <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Kas Di Tangan</span>
             </div>
             <Badge className="bg-emerald-500/20 text-emerald-400 border-none text-[9px] font-black uppercase">Monitoring Saldo</Badge>
          </div>
          
          <div className="grid grid-cols-2 gap-6 pt-2">
             <div className="space-y-1">
               <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest leading-none">Total Modal Pegangan</p>
               <p className="text-xl font-black">{formatRupiah(totalHolding)}</p>
             </div>
             <div className="space-y-1 text-right">
               <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest leading-none">Sisa Saldo Kas</p>
               <p className="text-xl font-black text-emerald-400">{formatRupiah(remainingCash)}</p>
             </div>
          </div>
          
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
             <div 
               className="h-full bg-emerald-500 transition-all duration-700"
               style={{ width: `${totalHolding > 0 ? ((totalShopSpent + totalExpenses) / totalHolding) * 100 : 0}%` }}
             />
          </div>
        </div>
      </div>

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
                onClick={() => setActiveItem(isExpanded ? null : item)}
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
                            value={formatNumber(item.actualUnitPrice || 0)}
                            onChange={(e) => handleActualPriceChange(item, parseNumber(e.target.value))}
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
                          value={item.qtyPurchased || ''}
                          onChange={(e) => handleActualQtyChange(item, parseFloat(e.target.value) || 0)}
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
                        value={item.notes || ''}
                        onChange={(e) => handleNotesChange(item, e.target.value)}
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
                            if (!item.qtyPurchased) { handleActualQtyChange(item, item.qtyTarget); }
                            handleItemToggle(item, true);
                            setActiveItem(null);
                          }}
                          disabled={!item.actualUnitPrice || item.actualUnitPrice <= 0}
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
        const itemsCost = checkedItems.reduce((sum, i) => sum + (i.qtyPurchased * i.actualUnitPrice), 0)
        
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
    </div>
  )
}

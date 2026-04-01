"use client"

import { useState, useEffect } from "react"
import { useAppStore } from "@/lib/store"
import { recordOnlinePurchase } from "@/lib/accounting"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ShoppingBag, Globe, CheckCircle2, Package, Search, Calculator, Truck, ShieldCheck, Plus } from "lucide-react"
import { toast } from "sonner"
import { formatRupiah, formatNumber, parseNumber } from "@/lib/utils"
import { cn } from "@/lib/utils"

export default function OnlinePurchasePage() {
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const products = useAppStore(state => state.products)
  const updatePurchaseItem = useAppStore(state => state.updatePurchaseItem)

  const [searchTerm, setSearchTerm] = useState("")
  
  // Local state for calculators
  const [calculatorState, setCalculatorState] = useState<Record<string, {
    unitPrice: number,
    adminFee: number,
    shippingFee: number,
    totalPrice: number,
    ref: string
  }>>({})

  // Pending Online Items
  const pendingOnlineItems = purchaseItems
    .filter(pi => 
       pi.purchaseMethod === 'Online' && 
       !pi.isOnlineOrdered &&
       (products.find(p => p.id === pi.productId)?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        pi.notes?.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .map(item => ({
      ...item,
      product: products.find(p => p.id === item.productId)
    }))

  // Sync items to calculator state
  useEffect(() => {
    const newState = { ...calculatorState }
    let changed = false
    pendingOnlineItems.forEach(item => {
      if (!newState[item.id]) {
        newState[item.id] = {
          unitPrice: 0,
          adminFee: 0,
          shippingFee: 0,
          totalPrice: 0,
          ref: ""
        }
        changed = true
      }
    })
    if (changed) setCalculatorState(newState)
  }, [pendingOnlineItems.length])

  const updateCalc = (itemId: string, updates: any) => {
    setCalculatorState(prev => {
      const current = prev[itemId] || { unitPrice: 0, adminFee: 0, shippingFee: 0, totalPrice: 0, ref: "" }
      const item = pendingOnlineItems.find(i => i.id === itemId)
      const qty = item?.qtyTarget || 1
      
      let next = { ...current, ...updates }

      // Logic Auto-Sync
      if ('unitPrice' in updates || 'adminFee' in updates || 'shippingFee' in updates) {
        next.totalPrice = (next.unitPrice * qty) + next.adminFee + next.shippingFee
      } else if ('totalPrice' in updates) {
        next.unitPrice = (next.totalPrice - next.adminFee - next.shippingFee) / qty
      }

      return { ...prev, [itemId]: next }
    })
  }

  const currentUser = useAppStore(state => state.currentUser)
  const addExpense = useAppStore(state => state.addExpense)

  const handleCompleteOrder = (itemId: string) => {
    const calc = calculatorState[itemId]
    if (!calc || calc.totalPrice <= 0) {
      toast.error("Masukkan detail harga yang valid.")
      return
    }

    const item = purchaseItems.find(i => i.id === itemId)
    const product = products.find(p => p.id === item?.productId)
    if (!item || !product) return

    // Calculate final unit price including fees for stock valuation
    const landedUnitPrice = calc.totalPrice / item.qtyTarget
    
    // 1. Update status to Ordered
    updatePurchaseItem(itemId, {
      isOnlineOrdered: true,
      actualUnitPrice: calc.unitPrice, // Product core cost
      qtyPurchased: item.qtyTarget,
      onlineRef: calc.ref,
      onlineOrderDate: new Date().toISOString(),
      notes: `${item.notes || ''} (Detailed Cost: Unit @${calc.unitPrice}, Admin: ${calc.adminFee}, Ship: ${calc.shippingFee})`
    })

    // 2. Redirect to Finance Hub instead of direct journaling
    const expenseId = Math.random().toString(36).substr(2, 9);
    addExpense({
      id: `exp-online-${expenseId}`,
      date: new Date().toISOString(),
      reporterId: currentUser?.id || '00000000-0000-0000-0000-000000000000',
      category: 'Belanja Online',
      amount: calc.totalPrice, // Total paid
      adminFee: calc.adminFee,
      shippingFee: calc.shippingFee,
      description: `Online Purchase: ${product.name} (Ref: ${calc.ref})`,
      status: 'Pending Audit',
      referenceId: itemId
    })

    toast.success(`Order ${product.name} diproses! Silakan validasi pembayaran di Finance Hub.`)

    // 3. Auto-advance Sales Order if ALL items are now ready/sourced
    if (item.salesOrderId) {
      const store = useAppStore.getState()
      const soId = item.salesOrderId
      const allPOItems = store.purchaseItems.filter(pi => pi.salesOrderId === soId)
      
      // All items are READY if: (Market: isChecked) AND (Online: isOnlineOrdered)
      // Note: In sourcing list, Market items are marked isChecked. 
      // In this hub, Online items are marked isOnlineOrdered.
      const isAllReady = allPOItems.every(pi => {
        if (pi.id === itemId) return true; // Just finished this one
        if (pi.purchaseMethod === 'Online') return pi.isOnlineOrdered;
        return pi.isChecked; // For Market items
      })

      if (isAllReady) {
        store.updateSalesOrder(soId, { status: 'QC' })
        toast.info(`PO ${store.salesOrders.find(s => s.id === soId)?.poNumber} kini masuk ke Antrean QC (Semua barang sudah dibeli/dipesan).`)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white dark:bg-slate-900 -mx-4 -mt-4 p-6 border-b shadow-sm">
        <div>
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
             <span className="text-3xl emoji-3d">🛒</span> Belanja Online <span className="text-blue-600">& Cost Calc</span>
          </h2>
          <p className="text-sm text-slate-500 font-bold mt-1">Estimasi & kalkulasi biaya pengadaan barang online (Marketplace).</p>
        </div>
        <div className="flex items-center gap-2">
           <Badge className="bg-blue-100 text-blue-600 border-blue-200 px-3 py-1 font-black uppercase text-xs">
              {pendingOnlineItems.length} Waiting
           </Badge>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input 
          placeholder="Cari produk atau catatan..." 
          className="pl-10 h-12 bg-white rounded-2xl border-none shadow-sm focus:ring-4 focus:ring-blue-500/10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid gap-6">
        {pendingOnlineItems.length === 0 ? (
          <Card className="border-dashed py-20 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-[3rem]">
            <ShoppingBag className="w-16 h-16 mb-4 opacity-10" />
            <p className="font-bold text-lg">Semua task online clear!</p>
            <p className="text-sm">Tidak ada antrean belanja di Finance.</p>
          </Card>
        ) : (
          pendingOnlineItems.map(item => {
            const calc = calculatorState[item.id] || { unitPrice: 0, adminFee: 0, shippingFee: 0, totalPrice: 0, ref: "" }
            return (
              <Card key={item.id} className="overflow-hidden border-none shadow-xl shadow-blue-900/5 dark:shadow-none bg-white dark:bg-slate-900 rounded-[3rem]">
                <div className="flex flex-col lg:flex-row">
                  {/* Left: Product Info */}
                  <div className="p-8 lg:w-80 bg-slate-50 dark:bg-slate-800/50 flex flex-col justify-between">
                    <div>
                      <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-[2rem] flex items-center justify-center shadow-sm border border-slate-100 mb-6 mx-auto lg:mx-0">
                         <Package className="w-8 h-8 text-blue-500" />
                      </div>
                      <h3 className="font-black text-xl leading-tight mb-2 text-center lg:text-left">{item.product?.name}</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center lg:text-left">{item.product?.skuCode}</p>
                      
                      <div className="mt-8 space-y-4">
                        <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-100 shadow-sm">
                           <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Target Quantity</p>
                           <p className="text-xl font-black text-blue-600">{item.qtyTarget} <span className="text-xs">{item.product?.uom}</span></p>
                        </div>

                        {/* Price Recommendations */}
                        <div className="space-y-2">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-emerald-500" /> Rekomendasi Harga
                           </p>
                           <div className="p-4 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-3xl border border-emerald-100/50 space-y-2">
                              <div className="flex justify-between items-center">
                                 <span className="text-[10px] font-bold text-slate-500">Estimasi Terencana:</span>
                                 <span className="text-xs font-black text-emerald-600">
                                   {formatRupiah(item.estimatedUnitPrice || item.product?.basePrice || 0)}
                                 </span>
                              </div>
                              <Button 
                                 variant="ghost" 
                                 size="sm" 
                                 className="w-full h-8 text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl mt-1 shadow-sm"
                                 onClick={() => updateCalc(item.id, { unitPrice: item.estimatedUnitPrice || item.product?.basePrice || 0 })}
                              >
                                 Pakai Harga Ini
                              </Button>
                           </div>
                        </div>

                        {item.notes && (
                          <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-3xl border border-amber-100 italic text-xs text-slate-600 dark:text-slate-400">
                             "{item.notes}"
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Calculator Form */}
                  <div className="flex-1 p-8 space-y-8">
                     <div className="flex items-center gap-3 mb-2">
                        <Calculator className="w-5 h-5 text-blue-500" />
                        <h4 className="font-black text-slate-800 uppercase tracking-tight">Kalkulator Biaya Online</h4>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Harga Unit (Barang)</Label>
                          <div className="relative">
                             <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-300">Rp</span>
                             <Input 
                                type="text"
                                className="h-14 pl-12 text-lg font-black bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-500/20"
                                value={formatNumber(calc.unitPrice)}
                                onChange={(e) => updateCalc(item.id, { unitPrice: parseNumber(e.target.value) })}
                             />
                          </div>
                          <p className="text-[9px] font-bold text-slate-400 pl-2">Subtotal: {formatRupiah(calc.unitPrice * item.qtyTarget)}</p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Biaya Admin Platform</Label>
                          <div className="relative">
                             <Plus className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                             <Input 
                                type="text"
                                className="h-14 pl-12 text-lg font-black bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-500/20"
                                value={formatNumber(calc.adminFee)}
                                onChange={(e) => updateCalc(item.id, { adminFee: parseNumber(e.target.value) })}
                             />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Ongkos Kirim</Label>
                          <div className="relative">
                             <Truck className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                             <Input 
                                type="text"
                                className="h-14 pl-12 text-lg font-black bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-blue-500/20"
                                value={formatNumber(calc.shippingFee)}
                                onChange={(e) => updateCalc(item.id, { shippingFee: parseNumber(e.target.value) })}
                             />
                          </div>
                        </div>
                     </div>

                     <div className="h-px bg-slate-100" />

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                        <div className="space-y-2">
                           <Label className="text-[10px] font-black text-blue-600 uppercase tracking-widest pl-2">Total Bayar (Check out)</Label>
                           <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-blue-400">Rp</span>
                              <Input 
                                 type="text"
                                 className="h-16 pl-14 text-2xl font-black bg-blue-50 text-blue-600 border-none rounded-3xl focus:ring-4 focus:ring-blue-500/20 shadow-inner"
                                 value={formatNumber(calc.totalPrice)}
                                 onChange={(e) => updateCalc(item.id, { totalPrice: parseNumber(e.target.value) })}
                              />
                           </div>
                           <p className="text-[9px] font-bold text-amber-600 pl-2 italic">*Mengubah total akan menyesuaikan harga unit otomatis</p>
                        </div>

                        <div className="space-y-2">
                           <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Ref Order / Link</Label>
                           <div className="relative">
                              <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                              <Input 
                                 className="h-16 pl-12 font-bold bg-slate-50 border-none rounded-3xl focus:ring-4 focus:ring-blue-500/20"
                                 placeholder="ID Pesanan Shopee / Tokped..."
                                 value={calc.ref}
                                 onChange={(e) => updateCalc(item.id, { ref: e.target.value })}
                              />
                           </div>
                        </div>
                     </div>

                     <Button 
                        className={cn(
                           "w-full h-16 rounded-[2rem] font-black uppercase text-sm tracking-widest shadow-xl transition-all",
                           calc.totalPrice > 0 
                              ? "bg-slate-900 hover:bg-black text-white shadow-slate-200" 
                              : "bg-slate-100 text-slate-400 cursor-not-allowed"
                        )}
                        disabled={calc.totalPrice <= 0}
                        onClick={() => handleCompleteOrder(item.id)}
                      >
                         <CheckCircle2 className="w-5 h-5 mr-3" /> Konfirmasi Order Selesai
                      </Button>
                  </div>
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

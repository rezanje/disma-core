"use client"

import type { SVGProps } from "react"
import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { recordShrinkage } from "@/lib/accounting"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ShieldAlert, ShieldCheck, Tag, RefreshCcw, PackageSearch, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import { cn } from "@/lib/utils"
import { recordStockMovement } from "@/lib/accounting"

export default function QCPage() {
  const products = useAppStore(state => state.products)
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const pendingReturns = useAppStore(state => state.pendingReturns)
  const salesOrders = useAppStore(state => state.salesOrders)
  
  const updatePurchaseItem = useAppStore(state => state.updatePurchaseItem)
  const removePendingReturn = useAppStore(state => state.removePendingReturn)
  const updateSalesOrder = useAppStore(state => state.updateSalesOrder)

  // --- TAB 1: SOURCING QC LOGIC ---
  const pendingQCItems = purchaseItems
    .filter(pi => {
       if (pi.isQCed) return false;
       const parentP = purchases.find(p => p.id === pi.purchaseId);
       if (!parentP) return false;
       if ((pi.purchaseMethod === 'Pasar' || !pi.purchaseMethod) && parentP.status === 'Selesai') return true;
       if (pi.purchaseMethod === 'Online' && pi.isOnlineOrdered) return true;
       return false;
    })
    .map(item => ({
      ...item,
      product: products.find(p => p.id === item.productId)
    }))
    .filter(item => item.product)
  
  const [selectedPurchaseItemId, setSelectedPurchaseItemId] = useState("")
  const [qtyPassToInventory, setQtyPassToInventory] = useState(0)
  const [qtyPassToClient, setQtyPassToClient] = useState(0)
  const [qtyReject, setQtyReject] = useState(0)
  const [rejectReason, setRejectReason] = useState("")
  const [unbalanceReason, setUnbalanceReason] = useState("")
  const [qcPhoto, setQcPhoto] = useState<string | null>(null)

  const activePurchaseItem = pendingQCItems.find(i => i.id === selectedPurchaseItemId)
  const activeProduct = products.find(p => p.id === activePurchaseItem?.productId)

  const handleProcessQC = async () => {
    if (!activeProduct || !activePurchaseItem) return
    const totalIncoming = activePurchaseItem.qtyPurchased
    const totalProcessed = qtyPassToInventory + qtyPassToClient + qtyReject

    if (totalProcessed !== totalIncoming && !unbalanceReason) {
      toast.error(`Jumlah tidak balance! Harap masukkan alasan ketidakteraturan.`)
      return
    }

    const currentUser = useAppStore.getState().currentUser

    await recordStockMovement({
      productId: activeProduct.id,
      quantity: totalIncoming,
      stockDelta: 0,
      direction: 'Info',
      kind: 'QC_RECEIPT',
      source: 'Sourcing',
      destination: 'QC Inspection',
      referenceType: 'QC',
      referenceId: activePurchaseItem.id,
      purchaseItemId: activePurchaseItem.id,
      note: `Barang masuk QC dari sourcing untuk ${activeProduct.name}`,
      createdByUserId: currentUser?.id || 'system',
    })

    // 1. Process Passed items to Inventory
    if (qtyPassToInventory > 0) {
      await recordStockMovement({
        productId: activeProduct.id,
        quantity: qtyPassToInventory,
        stockDelta: qtyPassToInventory,
        direction: 'In',
        kind: 'QC_INVENTORY',
        source: 'QC',
        destination: 'Inventory',
        referenceType: 'QC',
        referenceId: activePurchaseItem.id,
        purchaseItemId: activePurchaseItem.id,
        note: `Lolos QC dan masuk inventory`,
        createdByUserId: currentUser?.id || 'system',
      })
      toast.success(`${qtyPassToInventory} unit masuk stok inventory.`)
    }

    // 2. Process Passed items to Client (Update SO)
    if (qtyPassToClient > 0 && activePurchaseItem.salesOrderId) {
      const soItems = useAppStore.getState().salesOrderItems.filter(i => i.salesOrderId === activePurchaseItem.salesOrderId)
      const matchingSOItem = soItems.find(i => i.productId === activePurchaseItem.productId)
      if (matchingSOItem) {
        await useAppStore.getState().updateSalesOrderItem(matchingSOItem.id, { 
          qtyFinal: qtyPassToClient, 
          subtotalFinal: qtyPassToClient * (matchingSOItem.unitPrice || 0)
        })
        await recordStockMovement({
          productId: activeProduct.id,
          quantity: qtyPassToClient,
          stockDelta: 0,
          direction: 'Transfer',
          kind: 'QC_CLIENT_ALLOCATION',
          source: 'QC',
          destination: 'Client Allocation',
          referenceType: 'QC',
          referenceId: activePurchaseItem.id,
          purchaseItemId: activePurchaseItem.id,
          salesOrderId: activePurchaseItem.salesOrderId,
          note: `Lolos QC dan dialokasikan ke client`,
          createdByUserId: currentUser?.id || 'system',
        })
        toast.info(`${qtyPassToClient} unit dialokasikan ke klien.`)
      }
    }

    // 3. Process Reject
    if (qtyReject > 0) {
      const rejectId = uuidv4()
      await recordShrinkage(rejectId, qtyReject * (activeProduct.basePrice || 0), `Reject QC - ${activeProduct.name}: ${rejectReason || 'Tanpa alasan'}`)
      await recordStockMovement({
        productId: activeProduct.id,
        quantity: qtyReject,
        stockDelta: 0,
        direction: 'Info',
        kind: 'ADJUSTMENT',
        source: 'QC',
        destination: 'Reject/Write-off',
        referenceType: 'QC',
        referenceId: activePurchaseItem.id,
        purchaseItemId: activePurchaseItem.id,
        note: `Reject QC: ${rejectReason || 'Tanpa alasan'}`,
        createdByUserId: currentUser?.id || 'system',
      })
      
      // Log to Rejection Monitor
      await useAppStore.getState().addRejectedItem({
        id: rejectId,
        date: new Date().toISOString(),
        productId: activeProduct.id,
        qty: qtyReject,
        reason: rejectReason || 'Tanpa alasan',
        source: 'QC',
        referenceId: activePurchaseItem.id,
        reportedBy: currentUser?.id || 'system',
        imageUrl: qcPhoto || undefined
      })
      toast.error(`${qtyReject} unit reject dicatat di monitor.`)
    }

    await updatePurchaseItem(activePurchaseItem.id, { isQCed: true })
    
    // Antarkan SO ke status Packing jika semua itemnya sudah di-QC
    if (activePurchaseItem.salesOrderId) {
      const soId = activePurchaseItem.salesOrderId
      const allPIs = useAppStore.getState().purchaseItems
      const soPIs = allPIs.filter(pi => pi.salesOrderId === soId)
      
      const allQCed = soPIs.every(pi => pi.isQCed || pi.purchaseMethod === 'Online')
      
      if (allQCed) {
        await updateSalesOrder(soId, { status: 'Packing' })
        toast.success("Semua barang untuk PO ini telah masuk QC. Status SO: DI GUDANG.")
      }
    }
    
    // Cleanup
    setSelectedPurchaseItemId("")
    setQtyPassToInventory(0)
    setQtyPassToClient(0)
    setQtyReject(0)
    setRejectReason("")
    setUnbalanceReason("")
    setQcPhoto(null)
  }

  // --- TAB 2: CUSTOMER RETURN QC LOGIC ---
  const [selectedReturnId, setSelectedReturnId] = useState("")
  const activeReturn = pendingReturns.find(r => r.id === selectedReturnId)
  const activeReturnProduct = products.find(p => p.id === activeReturn?.productId)
  const [retQtyPass, setRetQtyPass] = useState(0)
  const [retQtyReject, setRetQtyReject] = useState(0)
  const [retReason, setRetReason] = useState("")

  const handleProcessReturnQC = async () => {
    if (!activeReturn || !activeReturnProduct) return
    const currentUser = useAppStore.getState().currentUser

    if (retQtyPass + retQtyReject !== activeReturn.qty) {
      toast.error(`Total QC harus match dengan jumlah retur (${activeReturn.qty})`)
      return
    }

    if (retQtyPass > 0) {
      await recordStockMovement({
        productId: activeReturnProduct.id,
        quantity: retQtyPass,
        stockDelta: retQtyPass,
        direction: 'In',
        kind: 'RETURN_RESTOCK',
        source: 'Return QC',
        destination: 'Inventory',
        referenceType: 'QC',
        referenceId: activeReturn.id,
        note: `Retur customer lolos QC dan kembali ke inventory`,
        createdByUserId: currentUser?.id || 'system',
      })
      toast.success(`${retQtyPass} unit dikembalikan ke stok layak jual.`)
    }

    if (retQtyReject > 0) {
      const rejectId = uuidv4()
      await recordShrinkage(rejectId, retQtyReject * (activeReturnProduct.basePrice || 0), `Return Reject - ${activeReturnProduct.name}: ${retReason || activeReturn.reason}`)
      await recordStockMovement({
        productId: activeReturnProduct.id,
        quantity: retQtyReject,
        stockDelta: 0,
        direction: 'Info',
        kind: 'RETURN_REJECT',
        source: 'Return QC',
        destination: 'Reject/Write-off',
        referenceType: 'QC',
        referenceId: activeReturn.id,
        note: `Retur customer reject: ${retReason || activeReturn.reason}`,
        createdByUserId: currentUser?.id || 'system',
      })
      
      // Log to Rejection Monitor
      await useAppStore.getState().addRejectedItem({
        id: rejectId,
        date: new Date().toISOString(),
        productId: activeReturnProduct.id,
        qty: retQtyReject,
        reason: retReason || activeReturn.reason,
        source: 'Return',
        referenceId: activeReturn.id,
        reportedBy: currentUser?.id || 'system'
      })
      toast.error(`${retQtyReject} unit rusak/dibuang.`)
    }

    removePendingReturn(activeReturn.id)
    setSelectedReturnId("")
    setRetQtyPass(0)
    setRetQtyReject(0)
    setRetReason("")
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 uppercase">Input <span className="text-emerald-600">QC & Inspeksi</span></h2>
          <p className="text-slate-500 font-bold mt-1 uppercase text-[10px] tracking-widest">Validasi barang masuk dari Sourcing & Retur Customer.</p>
        </div>
      </div>

      <Tabs defaultValue="sourcing" className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-2xl mb-6">
          <TabsTrigger value="sourcing" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest">
            QC Barang Baru (Sourcing)
          </TabsTrigger>
          <TabsTrigger value="returns" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
            Retur dari Customer
            {pendingReturns.length > 0 && (
              <span className="bg-rose-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[8px] animate-pulse">
                {pendingReturns.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sourcing">
          <Card className="liquid-card border-none shadow-xl shadow-slate-200/50">
            <CardHeader className="bg-white rounded-t-[3rem] border-b border-slate-50 px-8 py-6">
              <CardTitle className="text-lg font-black text-slate-800 flex items-center gap-3">
                <PackageSearch className="w-6 h-6 text-emerald-600" /> Inspeksi Kedatangan Sourcing
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
               <div className="space-y-3">
                 <Label className="font-black text-xs uppercase tracking-widest text-slate-400">Pilih Barang untuk di-QC</Label>
                 <select 
                   className="flex h-14 w-full rounded-2xl border-none bg-slate-50 px-4 py-2 font-bold text-slate-700 focus:ring-4 focus:ring-emerald-500/20 transition-all cursor-pointer"
                   value={selectedPurchaseItemId}
                   onChange={(e) => {
                     const itemId = e.target.value
                     const item = pendingQCItems.find(i => i.id === itemId)
                     setSelectedPurchaseItemId(itemId)
                     if (item) {
                       setQtyPassToClient(item.salesOrderId ? item.qtyPurchased : 0)
                       setQtyPassToInventory(item.salesOrderId ? 0 : item.qtyPurchased)
                       setQtyReject(0)
                     }
                   }}
                 >
                   <option value="">-- Pilih Barang Datang --</option>
                     {pendingQCItems.map(item => (
                     <option key={item.id} value={item.id}>
                       {item.product?.name} ({item.qtyPurchased} {item.product?.uom})
                     </option>
                   ))}
                 </select>
               </div>

               {activeProduct && activePurchaseItem && (
                 <div className="pt-6 border-t border-slate-50 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    
                    <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden group">
                       <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-emerald-500/20 transition-all" />
                       <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400 mb-2">Total Barang Datang (Fisik)</p>
                       <div className="flex items-baseline gap-3">
                          <h3 className="text-6xl font-black">{activePurchaseItem.qtyPurchased}</h3>
                          <span className="text-xl font-bold opacity-50 uppercase">{activeProduct.uom}</span>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {activePurchaseItem.salesOrderId && (
                        <div className="bg-indigo-50/50 p-6 rounded-[2.5rem] border border-indigo-100/50 space-y-4">
                          <Label className="text-indigo-700 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                            <Tag className="w-4 h-4" /> Passed to Client
                          </Label>
                          <div className="flex items-center gap-3">
                             <Input 
                               type="number" 
                               className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                               value={qtyPassToClient || ''}
                               onChange={(e) => setQtyPassToClient(parseInt(e.target.value) || 0)}
                             />
                          </div>
                          <p className="text-[8px] font-bold text-indigo-400 uppercase">Langsung untuk PO Customer</p>
                        </div>
                      )}
                      
                      <div className="bg-emerald-50/50 p-6 rounded-[2.5rem] border border-emerald-100/50 space-y-4">
                        <Label className="text-emerald-700 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4" /> Passed to Inventory
                        </Label>
                        <Input 
                           type="number" 
                           className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                           value={qtyPassToInventory || ''}
                           onChange={(e) => setQtyPassToInventory(parseInt(e.target.value) || 0)}
                         />
                         <p className="text-[8px] font-bold text-emerald-400 uppercase">Masuk Stok Gudang (Ready)</p>
                      </div>

                      <div className="bg-rose-50/50 p-6 rounded-[2.5rem] border border-rose-100/50 space-y-4">
                        <Label className="text-rose-700 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4" /> Reject / Rusak
                        </Label>
                        <Input 
                           type="number" 
                           className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                           value={qtyReject || ''}
                           onChange={(e) => setQtyReject(parseInt(e.target.value) || 0)}
                         />
                         <p className="text-[8px] font-bold text-rose-400 uppercase">Buang / Shrinkage</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                       <div className="flex justify-between items-center px-4">
                          <span className={cn(
                            "text-xs font-black uppercase tracking-widest",
                            qtyPassToInventory + qtyPassToClient + qtyReject === activePurchaseItem.qtyPurchased ? "text-emerald-600" : "text-rose-600 animate-pulse"
                          )}>
                            Status: {qtyPassToInventory + qtyPassToClient + qtyReject === activePurchaseItem.qtyPurchased ? "Balance ✓" : "Tidak Balance !"}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">Processed: {qtyPassToInventory + qtyPassToClient + qtyReject} / {activePurchaseItem.qtyPurchased}</span>
                       </div>

                       {(qtyPassToInventory + qtyPassToClient + qtyReject !== activePurchaseItem.qtyPurchased) && (
                          <div className="space-y-3 p-6 bg-rose-50 rounded-[2rem] border border-rose-100 animate-in zoom-in-95">
                             <Label className="text-rose-700 font-black uppercase text-[10px] tracking-widest">Alasan Selisih / Tidak Balance (Wajib)</Label>
                             <Input 
                               placeholder="Kenapa jumlah fisik beda?"
                               className="h-14 rounded-xl border-rose-200 bg-white"
                               value={unbalanceReason}
                               onChange={(e) => setUnbalanceReason(e.target.value)}
                             />
                             <div className="flex items-center gap-3 mt-4">
                               <div 
                                 className="h-14 flex-1 border-2 border-dashed border-rose-200 rounded-xl flex items-center justify-center bg-white cursor-pointer hover:border-rose-400 transition-all text-slate-400"
                                 onClick={() => {
                                   setQcPhoto("https://images.unsplash.com/photo-1582285273767-42f01eb0a316?auto=format&fit=crop&q=80&w=400")
                                   toast.success("Foto bukti selisih ditambahkan!")
                                 }}
                               >
                                  {qcPhoto ? <img src={qcPhoto} className="w-full h-full object-cover rounded-lg" /> : <div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4" /><span className="text-[10px] font-black uppercase">Foto Bukti (Opsional)</span></div>}
                               </div>
                               {qcPhoto && <Button variant="outline" size="icon" className="h-14 w-14 rounded-xl" onClick={() => setQcPhoto(null)}>✕</Button>}
                             </div>
                          </div>
                       )}

                       {qtyReject > 0 && (
                         <div className="space-y-3 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                            <Label className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Keterangan Reject</Label>
                            <Input 
                              placeholder="Kondisi barang reject (pecah, busuk, dll)"
                              className="h-14 rounded-xl border-slate-200 bg-white"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                            />
                         </div>
                       )}
                    </div>

                    <Button 
                      className="w-full h-20 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all text-lg"
                      onClick={handleProcessQC}
                    >
                      Konfirmasi QC Sourcing
                    </Button>
                 </div>
               )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="returns">
          <Card className="liquid-card border-none shadow-xl shadow-slate-200/50">
            <CardHeader className="bg-white rounded-t-[3rem] border-b border-slate-50 px-8 py-6">
              <CardTitle className="text-lg font-black text-slate-800 flex items-center gap-3">
                <RefreshCcw className="w-6 h-6 text-blue-600" /> Inspeksi Retur Customer (QC Balik)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
               <div className="space-y-3">
                 <Label className="font-black text-xs uppercase tracking-widest text-slate-400">Items Dibawa Balik Kurir</Label>
                 {pendingReturns.length === 0 ? (
                   <div className="h-40 border border-dashed rounded-[2.5rem] flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                      <RefreshCcw className="w-8 h-8 opacity-20 mb-2" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Tidak ada barang retur yang menunggu QC</p>
                   </div>
                 ) : (
                   <div className="grid gap-3">
                      {pendingReturns.map(ret => {
                        const p = products.find(prod => prod.id === ret.productId)
                        const so = salesOrders.find(s => s.id === ret.originalSoId)
                        return (
                          <button 
                            key={ret.id} 
                            onClick={() => {
                              setSelectedReturnId(ret.id)
                              setRetQtyPass(ret.qty)
                              setRetQtyReject(0)
                            }}
                            className={cn(
                              "p-5 rounded-[2rem] border text-left flex justify-between items-center transition-all",
                              selectedReturnId === ret.id ? "bg-blue-50 border-blue-200 shadow-md ring-2 ring-blue-500/10" : "bg-white border-slate-100 hover:bg-slate-50"
                            )}
                          >
                             <div>
                                <h4 className="font-black text-slate-800 uppercase tracking-tight">{p?.name}</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Ref PO: {so?.poNumber} • Alasan: {ret.reason}</p>
                             </div>
                             <div className="bg-slate-100 px-4 py-2 rounded-2xl font-black text-sm text-slate-600">
                                {ret.qty} {p?.uom}
                             </div>
                          </button>
                        )
                      })}
                   </div>
                 )}
               </div>

               {activeReturnProduct && activeReturn && (
                 <div className="pt-8 border-t border-slate-50 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-amber-50 border border-amber-100 p-5 rounded-[2rem] flex items-start gap-4">
                       <AlertTriangle className="w-5 h-5 text-amber-600 mt-1" />
                       <div>
                          <p className="font-black text-[10px] uppercase text-amber-700 tracking-widest mb-1">Peringatan QC Retur</p>
                          <p className="text-xs font-bold text-amber-800/80 leading-relaxed">Cek kondisi fisik barang retur. Barang yang lolos (Restock) akan dikembalikan ke stok layak jual untuk dijual ke customer lain.</p>
                       </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100/50 space-y-4">
                        <Label className="text-emerald-700 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                          <RefreshCcw className="w-4 h-4" /> Layak (Restock)
                        </Label>
                        <Input 
                           type="number" 
                           className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                           value={retQtyPass || ''}
                           onChange={(e) => setRetQtyPass(parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div className="bg-rose-50/50 p-6 rounded-[2rem] border border-rose-100/50 space-y-4">
                        <Label className="text-rose-700 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                          <Trash2 className="w-4 h-4" /> Rusak (Write-off)
                        </Label>
                        <Input 
                           type="number" 
                           className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                           value={retQtyReject || ''}
                           onChange={(e) => setRetQtyReject(parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <Button 
                      className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-3xl font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all"
                      disabled={retQtyPass + retQtyReject !== activeReturn.qty}
                      onClick={handleProcessReturnQC}
                    >
                      Input Hasil QC Retur
                    </Button>
                 </div>
               )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Trash2(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

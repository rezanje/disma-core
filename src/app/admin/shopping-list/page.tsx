"use client"

import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ShoppingBasket, RefreshCw, Printer, Plus, Search, Check, ChevronsUpDown, Trash2, Globe, ShoppingBag } from "lucide-react"
import { useState } from "react"
import { v4 as uuidv4 } from "uuid"
import { toast } from "sonner"
import { generateShoppingListPDF } from "@/lib/pdf"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn, formatRupiah } from "@/lib/utils"

export default function ShoppingListPage() {
  const salesOrders = useAppStore(state => state.salesOrders)
  const salesOrderItems = useAppStore(state => state.salesOrderItems)
  const products = useAppStore(state => state.products)
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const addPurchase = useAppStore(state => state.addPurchase)
  const addPurchaseItem = useAppStore(state => state.addPurchaseItem)
  const updateSalesOrder = useAppStore(state => state.updateSalesOrder)

  const [isLoading, setIsLoading] = useState(false)
  const [manualItems, setManualItems] = useState<Array<{id: string, productId: string, qty: number, price: number}>>([])
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({})
  
  // UI States for adding manual item
  const [isAddManualOpen, setIsAddManualOpen] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState("")
  const [manualQty, setManualQty] = useState(0)
  const [manualPrice, setManualPrice] = useState(0)
  const [productSearch, setProductSearch] = useState("")
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false)
  const [onlineProductIds, setOnlineProductIds] = useState<Set<string>>(new Set())
  const [manualPurchaseMethod, setManualPurchaseMethod] = useState<'Pasar' | 'Online'>('Pasar')

  const toggleOnline = (productId: string) => {
    setOnlineProductIds(prev => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  const filteredProducts = products
    .filter(p => 
      p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
      p.skuCode.toLowerCase().includes(productSearch.toLowerCase())
    )
    .slice(0, 50)

  // Find SOs that are marked 'Belanja' but haven't been fully moved to Sourcing yet
  const activeSOs = salesOrders.filter(so => so.status === 'Belanja')
  const activeSOItemIds = activeSOs.flatMap(so => 
    salesOrderItems.filter(item => item.salesOrderId === so.id)
  )

  const allRequirementItems = [
    ...activeSOItemIds.map(item => {
      const product = products.find(p => p.id === item.productId);
      return { 
        productId: item.productId, 
        qty: item.qty, 
        buyPrice: product?.basePrice || 0,
        sellPrice: item.unitPrice,
        salesOrderId: item.salesOrderId // Extract the SO ID
      }
    }),
    ...manualItems.map(item => ({ 
      productId: item.productId, 
      qty: item.qty, 
      buyPrice: item.price,
      sellPrice: 0,
      salesOrderId: undefined
    }))
  ]

  const consolidatedList = allRequirementItems.reduce((acc: any[], curr: any) => {
    // We consolidate if it's the same product AND same salesOrderId (to maintain traceability for QC)
    // If the user wants to group them regardless of SO, we'd lose the link. 
    // For now, let's group by Product + SO for maximum data integrity.
    const existing = acc.find(item => item.productId === curr.productId && item.salesOrderId === curr.salesOrderId)
    
    if (existing) {
      existing.totalQty += curr.qty
      if (curr.sellPrice > existing.sellPrice) {
        existing.sellPrice = curr.sellPrice
      }
    } else {
      const product = products.find(p => p.id === curr.productId)
      if (product) {
        const customPrice = customPrices[curr.productId]
        acc.push({
          productId: curr.productId,
          productName: product.name,
          skuCode: product.skuCode,
          totalQty: curr.qty,
          estimatedPrice: customPrice !== undefined ? customPrice : (curr.buyPrice || product.basePrice || 0),
          sellPrice: curr.sellPrice,
          purchaseMethod: onlineProductIds.has(curr.productId) ? 'Online' : 'Pasar',
          salesOrderId: curr.salesOrderId // Preserve the link!
        })
      }
    }
    return acc
  }, [] as Array<{productId: string, productName: string, skuCode: string, totalQty: number, estimatedPrice: number, sellPrice: number, purchaseMethod: 'Pasar' | 'Online', salesOrderId?: string}>)

  const handleAddManualItem = () => {
    if (!selectedProductId || manualQty <= 0) {
      toast.error("Pilih barang dan masukkan jumlah yang valid.")
      return
    }

    setManualItems(prev => [
      ...prev,
      { id: uuidv4(), productId: selectedProductId, qty: manualQty, price: manualPrice }
    ])

    // Update global purchase method preference for this product
    if (manualPurchaseMethod === 'Online') {
      setOnlineProductIds(prev => new Set(prev).add(selectedProductId))
    } else {
      setOnlineProductIds(prev => {
        const next = new Set(prev)
        next.delete(selectedProductId)
        return next
      })
    }

    // Reset
    setSelectedProductId("")
    setManualQty(0)
    setManualPrice(0)
    setManualPurchaseMethod('Pasar')
    setProductSearch("")
    setIsAddManualOpen(false)
    toast.success("Barang stok ditambahkan ke antrean konsolidasi.")
  }

  const handleRemoveManualItem = (id: string) => {
    setManualItems(prev => prev.filter(item => item.id !== id))
  }

  const handleGeneratePurchase = () => {
    if (consolidatedList.length === 0) {
      toast.error("No items to purchase right now.")
      return
    }

    setIsLoading(true)
    setTimeout(() => {
      const purchaseId = uuidv4()
      
      addPurchase({
        id: purchaseId,
        date: new Date().toISOString(),
        purchaserId: 'pending',
        status: 'Pending'
      })

      consolidatedList.forEach(item => {
        addPurchaseItem({
          id: uuidv4(),
          purchaseId: purchaseId,
          productId: item.productId,
          qtyTarget: item.totalQty,
          qtyPurchased: 0,
          estimatedUnitPrice: item.estimatedPrice,
          actualUnitPrice: 0,
          isChecked: false, // Must be checked manually by Sourcing/Buyer
          purchaseMethod: item.purchaseMethod,
          salesOrderId: item.salesOrderId // Pass the link to the purchase item!
        })
      })

      // Advance all active SOs from 'Belanja' to 'Packing'
      activeSOs.forEach(so => {
        updateSalesOrder(so.id, { status: 'Packing' })
      })

      // Clear manual items
      setManualItems([])

      toast.success("Master Shopping List generated & sent to Tim Pasar!")
      setIsLoading(false)
    }, 600)
  }

  const handlePrint = () => {
    generateShoppingListPDF(consolidatedList)
    toast.success("PDF generated successfully.")
  }

  const activePurchases = purchases.filter(p => p.status === 'Pending')

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Shopping Master List</h2>
          <p className="text-muted-foreground">Auto-consolidate all active PO items into a single market list.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <RefreshCw className="mr-2 h-5 w-5 text-emerald-500" />
                Auto-Consolidator
              </div>
              
              <Dialog open={isAddManualOpen} onOpenChange={setIsAddManualOpen}>
                <DialogTrigger render={
                  <Button size="sm" variant="outline" className="h-8 gap-1">
                    <Plus className="h-4 w-4" /> Tambah Belanja Stok
                  </Button>
                } />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Tambah Kebutuhan Stok</DialogTitle>
                    <DialogDescription>
                      Masukkan barang yang ingin dibeli untuk stok gudang (bukan dari PO Client).
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label>Produk</Label>
                      <Popover open={isProductSearchOpen} onOpenChange={setIsProductSearchOpen}>
                        <PopoverTrigger render={
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={isProductSearchOpen}
                            className="w-full justify-between font-normal"
                          >
                            <span className="truncate">
                              {selectedProductId
                                ? products.find((p) => p.id === selectedProductId)?.name
                                : "Cari produk..."}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        } />
                        <PopoverContent className="w-[300px] p-0" align="start">
                          <div className="flex items-center border-b px-3">
                            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                            <input
                              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                              placeholder="Cari nama atau SKU..."
                              value={productSearch}
                              onChange={(e) => setProductSearch(e.target.value)}
                            />
                          </div>
                          <div className="max-h-[300px] overflow-y-auto p-1 text-slate-900 dark:text-slate-100">
                            {filteredProducts.length === 0 ? (
                              <div className="py-6 text-center text-sm text-muted-foreground">
                                Produk tidak ditemukan.
                              </div>
                            ) : (
                              filteredProducts.map((product) => (
                                <div
                                  key={product.id}
                                  className={cn(
                                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-800",
                                    selectedProductId === product.id && "bg-slate-100 dark:bg-slate-800"
                                  )}
                                  onClick={() => {
                                    setSelectedProductId(product.id)
                                    setIsProductSearchOpen(false)
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedProductId === product.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col">
                                    <div className="flex justify-between items-center w-full">
                                      <span className="font-semibold">{product.name}</span>
                                      {product.weeklyPriceRange && (
                                        <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0 rounded border border-amber-200">
                                          Patokan: {formatRupiah(product.weeklyPriceRange.min)} - {formatRupiah(product.weeklyPriceRange.max)}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-slate-500">{product.skuCode} • Stok: {product.currentStock} {product.uom}</span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="qty">Jumlah (Qty)</Label>
                      <Input
                        id="qty"
                        type="number"
                        placeholder="0"
                        value={manualQty || ''}
                        onChange={(e) => setManualQty(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="price">Budget (Estimasi Harga Satuan)</Label>
                      <Input
                        id="price"
                        type="number"
                        placeholder="0"
                        value={manualPrice || ''}
                        onChange={(e) => setManualPrice(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="grid gap-2">
                       <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">Metode Belanja</Label>
                       <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                          <button 
                             className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2 text-xs font-black rounded-lg transition-all",
                                manualPurchaseMethod === 'Pasar' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:bg-white/50"
                             )}
                             onClick={() => setManualPurchaseMethod('Pasar')}
                          >
                             <ShoppingBag className="w-3.5 h-3.5" /> PASAR
                          </button>
                          <button 
                             className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2 text-xs font-black rounded-lg transition-all",
                                manualPurchaseMethod === 'Online' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:bg-white/50"
                             )}
                             onClick={() => setManualPurchaseMethod('Online')}
                          >
                             <Globe className="w-3.5 h-3.5" /> ONLINE
                          </button>
                       </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddManualOpen(false)}>Batal</Button>
                    <Button onClick={handleAddManualItem}>Tambah ke List</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardTitle>
            <CardDescription>
              {activeSOs.length} PO Client & {manualItems.length} Item Stok sedang menunggu Sourcing
            </CardDescription>
          </CardHeader>
          <CardContent>
            {consolidatedList.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p>Belum ada daftar belanja aktif.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-md border bg-slate-50 dark:bg-slate-900 max-h-[300px] overflow-auto shadow-inner">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Sell Price</TableHead>
                        <TableHead className="text-right">Est. Buy</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead className="w-[100px] text-center">Metode</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {consolidatedList.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs text-slate-500">{item.skuCode}</TableCell>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span>{item.productName}</span>
                              {products.find(p => p.id === item.productId)?.weeklyPriceRange && (
                                <span className="text-[9px] font-bold text-amber-600 w-fit whitespace-nowrap" title="Harga terendah-tertinggi minggu ini (Kamis-Rabu)">
                                  Patokan: {formatRupiah(products.find(p => p.id === item.productId)!.weeklyPriceRange!.min)} - {formatRupiah(products.find(p => p.id === item.productId)!.weeklyPriceRange!.max)}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-bold text-slate-600">{item.totalQty}</TableCell>
                          <TableCell className="text-right">
                             <div className="flex flex-col items-end">
                                <span className="font-black text-blue-600">{formatRupiah(item.sellPrice)}</span>
                                {item.sellPrice > 0 && item.estimatedPrice > 0 && (
                                   <span className={cn(
                                      "text-[9px] font-bold px-1 rounded",
                                      item.sellPrice > item.estimatedPrice ? "text-emerald-500 bg-emerald-50" : "text-rose-500 bg-rose-50"
                                   )}>
                                      {item.sellPrice > item.estimatedPrice ? 'Margin OK' : 'Low Margin!'}
                                   </span>
                                )}
                             </div>
                          </TableCell>
                          <TableCell className="text-right text-slate-500">
                             <div className="flex items-center justify-end gap-1">
                                <span className="text-[10px] text-slate-400 font-bold">Rp</span>
                                <Input 
                                   type="number"
                                   className="h-8 w-24 text-right text-xs font-black border-slate-200"
                                   placeholder="0"
                                   value={item.estimatedPrice || ''}
                                   onChange={(e) => setCustomPrices(prev => ({ 
                                      ...prev, 
                                      [item.productId]: parseFloat(e.target.value) || 0 
                                   }))}
                                />
                             </div>
                          </TableCell>
                          <TableCell className="text-right font-bold text-emerald-600">{formatRupiah(item.estimatedPrice * item.totalQty)}</TableCell>
                          <TableCell className="text-center">
                             <button 
                                onClick={() => toggleOnline(item.productId)}
                                className={cn(
                                   "p-2 rounded-xl border transition-all flex items-center justify-center mx-auto hover:scale-110",
                                   item.purchaseMethod === 'Online' 
                                      ? "bg-blue-50 border-blue-200 text-blue-600" 
                                      : "bg-emerald-50 border-emerald-200 text-emerald-600"
                                )}
                                title={item.purchaseMethod === 'Online' ? "Pindah ke Beli di Pasar" : "Pindah ke Beli Online"}
                             >
                                {item.purchaseMethod === 'Online' ? <Globe className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                             </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {manualItems.length > 0 && (
                  <div className="space-y-2 p-3 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-lg border border-emerald-100 dark:border-emerald-900/50">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-emerald-500">
                      Item Belanja Manual (Antrean Produk)
                    </Label>
                    <div className="grid gap-2">
                      {manualItems.map(item => {
                        const product = products.find(p => p.id === item.productId)
                        return (
                          <div key={item.id} className="flex items-center justify-between text-sm bg-white dark:bg-slate-900 p-2 rounded-md border shadow-sm group">
                            <div className="flex flex-col">
                              <span className="font-semibold">{product?.name}</span>
                              <span className="text-[10px] text-slate-400">{product?.skuCode}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-emerald-600">{item.qty} {product?.uom}</span>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 text-rose-400 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleRemoveManualItem(item.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                
                <div className="flex justify-end pt-2 gap-3">
                  <Button variant="outline" onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" /> Print PDF
                  </Button>
                  <Button onClick={handleGeneratePurchase} disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-500/20">
                    <ShoppingBasket className="mr-2 h-4 w-4" /> 
                    {isLoading ? "Generating..." : "Generate Master List"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active Purchasing Sessions</CardTitle>
            <CardDescription>Sourcing in progress by the team</CardDescription>
          </CardHeader>
          <CardContent>
            {activePurchases.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p>No active purchases.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activePurchases.map(purchase => {
                  const items = purchaseItems.filter(pi => pi.purchaseId === purchase.id)
                  const checkedCount = items.filter(pi => pi.isChecked).length
                  
                  return (
                    <div key={purchase.id} className="border rounded-lg p-4 space-y-3 bg-white dark:bg-slate-900 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-sm">Target List: {new Date(purchase.date).toLocaleDateString()}</p>
                          <p className="text-xs text-slate-500">Items: {items.length} unique products</p>
                        </div>
                        <div className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                          In Progress
                        </div>
                      </div>
                      
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-bold text-slate-400">
                          <span>PROGRESS</span>
                          <span className="text-slate-600">{checkedCount} / {items.length} ITEMS</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 transition-all duration-700 ease-in-out" 
                            style={{ width: `${Math.round((checkedCount / items.length) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

"use client"

import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ShoppingBasket, RefreshCw, Printer, Plus, Search, Check, ChevronsUpDown, Trash2, Globe, ShoppingBag, FileText, X, Download, Loader2, Send, CheckCircle2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { v4 as uuidv4 } from "uuid"
import { toast } from "sonner"
import { generateShoppingListPDFDataUrl } from "@/lib/pdf"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn, formatRupiah } from "@/lib/utils"

type ShoppingListDocumentItem = {
  productId: string
  productName: string
  skuCode: string
  totalQty: number
  estimatedPrice: number
  sellPrice: number
  purchaseMethod: 'Pasar' | 'Online'
  salesOrderId?: string
}

const toDateInputValue = (date?: string) => {
  if (!date) return ''
  const isoDate = date.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (isoDate) return isoDate

  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return ''

  const year = parsed.getFullYear()
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsed.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function ShoppingListPage() {
  const salesOrders = useAppStore(state => state.salesOrders)
  const salesOrderItems = useAppStore(state => state.salesOrderItems)
  const products = useAppStore(state => state.products)
  const clients = useAppStore(state => state.clients)
  const currentUser = useAppStore(state => state.currentUser)
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const addPurchase = useAppStore(state => state.addPurchase)
  const addPurchaseItems = useAppStore(state => state.addPurchaseItems)
  const deletePurchase = useAppStore(state => state.deletePurchase)
  const updateSalesOrder = useAppStore(state => state.updateSalesOrder)
  const updatePurchase = useAppStore(state => state.updatePurchase)

  const [isLoading, setIsLoading] = useState(false)
  const [isDeletingPurchase, setIsDeletingPurchase] = useState<string | null>(null)
  const [isSendingToFinance, setIsSendingToFinance] = useState<string | null>(null)
  const [manualItems, setManualItems] = useState<Array<{id: string, productId: string, qty: number, price: number}>>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('shopping_manualItems') || '[]') } catch { return [] }
  })
  const [customPrices, setCustomPrices] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {}
    try { return JSON.parse(localStorage.getItem('shopping_customPrices') || '{}') } catch { return {} }
  })

  // UI States for adding manual item
  const [isAddManualOpen, setIsAddManualOpen] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState("")
  const [manualQty, setManualQty] = useState(0)
  const [manualPrice, setManualPrice] = useState(0)
  const [productSearch, setProductSearch] = useState("")
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false)
  const [onlineProductIds, setOnlineProductIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('shopping_onlineProductIds') || '[]')) } catch { return new Set() }
  })
  const [manualPurchaseMethod, setManualPurchaseMethod] = useState<'Pasar' | 'Online'>('Pasar')
  const [shoppingDate, setShoppingDate] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('shopping_shoppingDate') || ''
  })
  const [selectedSOIds, setSelectedSOIds] = useState<Set<string>>(new Set())
  const [lastGeneratedDoc, setLastGeneratedDoc] = useState<{
    purchaseId: string
    generatedAt: string
    items: ShoppingListDocumentItem[]
  } | null>(() => {
    if (typeof window === 'undefined') return null
    try { return JSON.parse(localStorage.getItem('shopping_lastGeneratedDoc') || 'null') } catch { return null }
  })
  const [pdfPreview, setPdfPreview] = useState<{ url: string, title: string } | null>(null)

  // Persist state to localStorage on change
  useEffect(() => { localStorage.setItem('shopping_manualItems', JSON.stringify(manualItems)) }, [manualItems])
  useEffect(() => { localStorage.setItem('shopping_customPrices', JSON.stringify(customPrices)) }, [customPrices])
  useEffect(() => { localStorage.setItem('shopping_onlineProductIds', JSON.stringify(Array.from(onlineProductIds))) }, [onlineProductIds])
  useEffect(() => { localStorage.setItem('shopping_shoppingDate', shoppingDate) }, [shoppingDate])
  useEffect(() => { localStorage.setItem('shopping_lastGeneratedDoc', JSON.stringify(lastGeneratedDoc)) }, [lastGeneratedDoc])

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

  const candidateSOs = useMemo(() => {
    return salesOrders
      .filter(so => so.status !== 'Batal')
      .filter(so => !shoppingDate || toDateInputValue(so.orderDate) === shoppingDate)
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
  }, [salesOrders, shoppingDate])
  const candidateSOKey = candidateSOs.map(so => so.id).join('|')

  useEffect(() => {
    setSelectedSOIds(new Set(candidateSOs.map(so => so.id)))
  }, [candidateSOKey])

  const selectedSOs = candidateSOs.filter(so => selectedSOIds.has(so.id))
  const activeSOItemIds = selectedSOs.flatMap(so => 
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

  const handleGenerateDocument = async () => {
    if (consolidatedList.length === 0) {
      toast.error("Pilih minimal 1 PO atau tambahkan item stok dulu.")
      return
    }

    // Include BOTH Pasar and Online items so Finance Online Purchase page can pick up the online ones.
    const documentItems = consolidatedList.map(item => ({ ...item }))
    const documentId = uuidv4()
    const generatedAt = new Date().toISOString()
    const advanceCode = `ADV-${toDateInputValue(generatedAt).replaceAll('-', '')}-${String(purchases.length + 1).padStart(3, '0')}`
    setIsLoading(true)
    const title = `Daftar_Belanja_${new Date().toISOString().slice(0, 10)}`
    await addPurchase({
      id: documentId,
      date: generatedAt,
      purchaserId: 'pending',
      status: 'Pending',
      advanceCode,
      shoppingListDocumentId: documentId,
      shoppingListCompiledBy: currentUser?.id
    })
    await addPurchaseItems(documentItems.map(item => ({
      id: uuidv4(),
      purchaseId: documentId,
      productId: item.productId,
      salesOrderId: item.salesOrderId,
      qtyTarget: item.totalQty,
      qtyPurchased: 0,
      estimatedUnitPrice: item.estimatedPrice,
      actualUnitPrice: 0,
      isChecked: false,
      purchaseMethod: item.purchaseMethod
    })))
    setLastGeneratedDoc({
      purchaseId: documentId,
      generatedAt,
      items: documentItems
    })
    for (const so of selectedSOs) {
      await updateSalesOrder(so.id, {
        shoppingListCompiledAt: generatedAt,
        shoppingListDocumentId: documentId,
        shoppingListCompiledBy: currentUser?.id
      })
    }
    setPdfPreview({
      title,
      url: generateShoppingListPDFDataUrl(documentItems)
    })
    toast.success("Dokumen list belanja berhasil dibuat.")
    setIsLoading(false)
  }

  const handleSendToFinance = async (purchaseId: string) => {
    if (isSendingToFinance) return
    const purchase = purchases.find(p => p.id === purchaseId)
    if (!purchase) return toast.error("Purchase tidak ditemukan.")
    if (purchase.reconciliationStatus === 'Belum Transfer') return toast.info("Sudah dikirim ke Finance.")
    
    setIsSendingToFinance(purchaseId)
    try {
      // Advance hanya untuk Pasar. Online tetap masuk purchase_items tapi gak dihitung di budget cair.
      const items = purchaseItems.filter(pi => pi.purchaseId === purchaseId && pi.purchaseMethod !== 'Online')
      const totalBudget = items.reduce((sum, item) => sum + (item.estimatedUnitPrice * item.qtyTarget), 0)

      await updatePurchase(purchaseId, {
        reconciliationStatus: 'Belum Transfer',
        budgetAmount: totalBudget
      })
      toast.success("List belanja berhasil dikirim ke Finance untuk pencairan dana. Item Online masuk ke Finance › Online Purchase.")
    } finally {
      setIsSendingToFinance(null)
    }
  }

  const handleDeletePurchase = async (purchaseId: string) => {
    if (isDeletingPurchase) return
    const purchase = purchases.find(p => p.id === purchaseId)
    if (!purchase) return toast.error("Dokumen tidak ditemukan.")
    if (purchase.reconciliationStatus === 'Terverifikasi') {
      return toast.error("Dokumen sudah Selesai, tidak bisa dihapus.")
    }
    if (purchase.budgetTransferDate) {
      return toast.error("Dana sudah ditransfer, tidak bisa dihapus.")
    }
    if (!window.confirm(`Hapus dokumen ${purchase.advanceCode || purchase.id.slice(0,8)}? PO terkait akan kembali ke status Draft.`)) return

    setIsDeletingPurchase(purchaseId)
    try {
      await deletePurchase(purchaseId)
      if (lastGeneratedDoc?.purchaseId === purchaseId) setLastGeneratedDoc(null)
      toast.success("Dokumen list belanja dihapus.")
    } catch (e) {
      toast.error("Gagal hapus dokumen.")
    } finally {
      setIsDeletingPurchase(null)
    }
  }

  const handleOpenPdfPreview = (items: ShoppingListDocumentItem[]) => {
    const title = `Daftar_Belanja_${new Date().toISOString().slice(0, 10)}`
    setPdfPreview({
      title,
      url: generateShoppingListPDFDataUrl(items)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Shopping Master List</h2>
          <p className="text-muted-foreground">Pilih PO mana saja, lalu compile jadi satu dokumen daftar belanja.</p>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1">
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
              {selectedSOs.length} dari {candidateSOs.length} PO dipilih • {manualItems.length} Item Stok manual
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-[1.75rem] border border-slate-100 bg-white/80 p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="grid gap-2">
                  <Label htmlFor="shopping-date" className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Filter Tanggal PO
                  </Label>
                  <Input
                    id="shopping-date"
                    type="date"
                    value={shoppingDate}
                    onChange={(e) => setShoppingDate(e.target.value)}
                    className="h-11 w-full rounded-xl border-slate-200 font-black text-slate-700 lg:w-[220px]"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    className="h-10 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400"
                    disabled={!shoppingDate}
                    onClick={() => setShoppingDate('')}
                  >
                    Semua Tanggal
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 rounded-xl text-[10px] font-black uppercase tracking-widest"
                    disabled={candidateSOs.length === 0}
                    onClick={() => setSelectedSOIds(new Set(candidateSOs.map(so => so.id)))}
                  >
                    Pilih Semua
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-10 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400"
                    disabled={candidateSOs.length === 0}
                    onClick={() => setSelectedSOIds(new Set())}
                  >
                    Kosongkan
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80">
                {candidateSOs.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm font-bold text-slate-400">
                    Tidak ada PO untuk filter ini.
                  </div>
                ) : (
                  <div className="max-h-[220px] overflow-auto divide-y divide-slate-100">
                    {candidateSOs.map(so => {
                      const client = clients.find(c => c.id === so.clientId)
                      const items = salesOrderItems.filter(item => item.salesOrderId === so.id)
                      const total = items.reduce((sum, item) => sum + item.subtotal, 0)
                      const isSelected = selectedSOIds.has(so.id)

                      return (
                        <label
                          key={so.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-white",
                            isSelected && "bg-emerald-50/60"
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              setSelectedSOIds(prev => {
                                const next = new Set(prev)
                                if (checked) next.add(so.id)
                                else next.delete(so.id)
                                return next
                              })
                            }}
                            className="h-5 w-5 rounded-md"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-black text-slate-800">{so.poNumber}</span>
                              <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 shadow-sm">
                                {items.length} item
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-500">
                                {so.status}
                              </span>
                              {so.shoppingListCompiledAt && (
                                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white shadow-sm">
                                  Sudah Masuk List
                                </span>
                              )}
                            </div>
                            <p className="mt-1 truncate text-xs font-bold text-slate-500">
                              {client?.companyName || 'Unknown Client'} • PO {toDateInputValue(so.orderDate)} • Kirim {toDateInputValue(so.targetDeliveryDate)} • {formatRupiah(total)}
                            </p>
                            {so.shoppingListCompiledAt && (
                              <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-emerald-600">
                                Dicompile {new Date(so.shoppingListCompiledAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                              </p>
                            )}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {consolidatedList.length === 0 ? (
              lastGeneratedDoc ? (
                <div className="rounded-[2rem] border border-emerald-100 bg-emerald-50/60 p-6 shadow-inner">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
                        <FileText className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Dokumen List Belanja Siap</p>
                        <h3 className="mt-1 text-lg font-black text-slate-900">Daftar Belanja untuk Tim Sourcing</h3>
                        <p className="mt-1 text-sm font-bold text-slate-500">
                          {lastGeneratedDoc.items.length} item • {formatRupiah(lastGeneratedDoc.items.reduce((sum, item) => sum + (item.estimatedPrice * item.totalQty), 0))}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const p = purchases.find(pr => pr.id === lastGeneratedDoc.purchaseId)
                        const alreadySent = p?.reconciliationStatus === 'Belum Transfer' || !!p?.budgetTransferDate
                        return alreadySent ? (
                          <div className="flex items-center gap-2 h-11 px-4 rounded-xl bg-emerald-100 text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-[10px] font-black uppercase tracking-widest">
                              {p?.budgetTransferDate ? 'Dana Sudah Ditransfer' : 'Sudah Dikirim ke Finance'}
                            </span>
                          </div>
                        ) : (
                          <Button
                            className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest text-[10px] shadow-md shadow-blue-500/20"
                            onClick={() => handleSendToFinance(lastGeneratedDoc.purchaseId)}
                            disabled={isSendingToFinance === lastGeneratedDoc.purchaseId}
                          >
                            {isSendingToFinance === lastGeneratedDoc.purchaseId ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="mr-2 h-4 w-4" />
                            )}
                            {isSendingToFinance === lastGeneratedDoc.purchaseId ? 'Mengirim...' : 'Kirim ke Finance'}
                          </Button>
                        )
                      })()}
                      <Button
                        variant="outline"
                        className="h-11 rounded-xl bg-white font-black uppercase tracking-widest text-[10px]"
                        onClick={() => handleOpenPdfPreview(lastGeneratedDoc.items)}
                      >
                        <Printer className="mr-2 h-4 w-4" /> Print / PDF
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 rounded-xl text-slate-400 hover:bg-white hover:text-slate-700"
                        onClick={() => setLastGeneratedDoc(null)}
                        title="Tutup dokumen"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-5 max-h-[260px] overflow-auto rounded-2xl border border-emerald-100 bg-white">
                    <Table className="min-w-[720px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[90px]">SKU</TableHead>
                          <TableHead>Produk</TableHead>
                          <TableHead className="w-[80px] text-right">Qty</TableHead>
                          <TableHead className="w-[130px] text-right">Budget</TableHead>
                          <TableHead className="w-[130px] text-right">Subtotal</TableHead>
                          <TableHead className="w-[100px] text-center">Metode</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lastGeneratedDoc.items.map((item, idx) => (
                          <TableRow key={`${item.productId}-${item.salesOrderId || 'manual'}-${idx}`}>
                            <TableCell className="text-xs font-bold text-slate-400">{item.skuCode}</TableCell>
                            <TableCell className="text-xs font-black text-slate-700">{item.productName}</TableCell>
                            <TableCell className="text-right text-sm font-black text-slate-700">{item.totalQty}</TableCell>
                            <TableCell className="text-right text-xs font-bold text-slate-500">{formatRupiah(item.estimatedPrice)}</TableCell>
                            <TableCell className="text-right text-xs font-black text-emerald-600">{formatRupiah(item.estimatedPrice * item.totalQty)}</TableCell>
                            <TableCell className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400">{item.purchaseMethod}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <p>Belum ada daftar belanja aktif.</p>
                </div>
              )
            ) : (
              <div className="space-y-6">
                <div className="rounded-md border bg-slate-50 dark:bg-slate-900 max-h-[300px] overflow-auto shadow-inner">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[70px]">SKU</TableHead>
                        <TableHead className="min-w-[200px]">Product</TableHead>
                        <TableHead className="w-[60px] text-right">Qty</TableHead>
                        <TableHead className="w-[110px] text-right">Sell Price</TableHead>
                        <TableHead className="w-[140px] text-right">Est. Buy</TableHead>
                        <TableHead className="w-[110px] text-right">Subtotal</TableHead>
                        <TableHead className="w-[90px] text-center">Metode</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {consolidatedList.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs text-slate-500 truncate">{item.skuCode}</TableCell>
                          <TableCell className="font-medium leading-tight">
                            <div className="flex flex-col gap-1 w-full max-w-[200px] whitespace-normal">
                              <span className="text-xs">{item.productName}</span>
                              {products.find(p => p.id === item.productId)?.weeklyPriceRange && (
                                <span className="text-[9px] font-bold text-amber-600 w-fit" title="Harga terendah-tertinggi minggu ini (Kamis-Rabu)">
                                  Patokan: {formatRupiah(products.find(p => p.id === item.productId)!.weeklyPriceRange!.min)} - {formatRupiah(products.find(p => p.id === item.productId)!.weeklyPriceRange!.max)}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-bold text-slate-600 pr-4">{item.totalQty}</TableCell>
                          <TableCell className="text-right pr-4">
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
                          <TableCell className="text-right text-slate-500 pr-4">
                             <div className="flex items-center justify-end gap-1">
                                <span className="text-[10px] text-slate-400 font-bold shrink-0">Rp</span>
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
                          <TableCell className="text-right font-bold text-emerald-600 pr-4">{formatRupiah(item.estimatedPrice * item.totalQty)}</TableCell>
                          <TableCell className="text-center">
                             <div className="flex items-center justify-center gap-1">
                                <button
                                   onClick={() => toggleOnline(item.productId)}
                                   className={cn(
                                      "p-2 rounded-xl border transition-all flex items-center justify-center hover:scale-110",
                                      item.purchaseMethod === 'Online'
                                         ? "bg-blue-50 border-blue-200 text-blue-600"
                                         : "bg-emerald-50 border-emerald-200 text-emerald-600"
                                   )}
                                   title={item.purchaseMethod === 'Online' ? "Pindah ke Beli di Pasar" : "Pindah ke Beli Online"}
                                >
                                   {item.purchaseMethod === 'Online' ? <Globe className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                                </button>
                                <button
                                   onClick={() => {
                                      const manualMatch = manualItems.find(mi => mi.productId === item.productId && mi.qty === item.totalQty)
                                      if (manualMatch) {
                                         handleRemoveManualItem(manualMatch.id)
                                         toast.success("Item manual dihapus.")
                                         return
                                      }
                                      if (item.salesOrderId) {
                                         setSelectedSOIds(prev => {
                                            const next = new Set(prev)
                                            next.delete(item.salesOrderId!)
                                            return next
                                         })
                                         toast.success("PO dikeluarkan dari list belanja.")
                                         return
                                      }
                                      toast.error("Item ini tidak bisa dihapus dari sini.")
                                   }}
                                   className="p-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:scale-110 transition-all"
                                   title="Hapus item dari list"
                                >
                                   <Trash2 className="w-4 h-4" />
                                </button>
                             </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-emerald-50 dark:bg-emerald-950/30 font-bold border-t-2 border-emerald-200 dark:border-emerald-900">
                        <TableCell colSpan={5} className="text-right pr-4">Total Modal Belanja:</TableCell>
                        <TableCell className="text-right text-lg text-emerald-600 pr-4">{formatRupiah(consolidatedList.filter(item => item.purchaseMethod !== 'Online').reduce((sum, item) => sum + (item.estimatedPrice * item.totalQty), 0))}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {manualItems.filter(item => !onlineProductIds.has(item.productId)).length > 0 && (
                  <div className="space-y-2 p-3 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-lg border border-emerald-100 dark:border-emerald-900/50">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-emerald-500">
                      Item Belanja Manual (Antrean Produk)
                    </Label>
                    <div className="grid gap-2">
                      {manualItems.filter(item => !onlineProductIds.has(item.productId)).map(item => {
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
                  <Button variant="outline" onClick={() => handleOpenPdfPreview(consolidatedList.filter(item => item.purchaseMethod !== 'Online'))}>
                    <Printer className="mr-2 h-4 w-4" /> Print PDF
                  </Button>
                  <Button onClick={handleGenerateDocument} disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-500/20">
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingBasket className="mr-2 h-4 w-4" />}
                    {isLoading ? "Generating..." : "Buat Dokumen List"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* --- RIWAYAT LIST BELANJA --- */}
        {purchases.filter(p => p.shoppingListDocumentId).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-blue-500" />
                Riwayat List Belanja
              </CardTitle>
              <CardDescription>Semua dokumen belanja yang pernah dibuat</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50/80">
                {purchases
                  .filter(p => p.shoppingListDocumentId)
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map(purchase => {
                    const items = purchaseItems.filter(pi => pi.purchaseId === purchase.id)
                    const totalBudget = items.reduce((sum, item) => sum + (item.estimatedUnitPrice * item.qtyTarget), 0)
                    const hasBeenTransferred = !!purchase.budgetTransferDate
                    const sentToFinance = purchase.reconciliationStatus === 'Belum Transfer'
                    const isSettled = purchase.reconciliationStatus === 'Terverifikasi'

                    return (
                      <div key={purchase.id} className="flex items-center justify-between px-4 py-3 gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-black text-slate-700">{purchase.advanceCode || purchase.id.slice(0, 8)}</span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-blue-600 shadow-sm border">
                              {items.length} item
                            </span>
                            {isSettled ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-700">
                                ✓ Selesai
                              </span>
                            ) : hasBeenTransferred ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-700">
                                Dana Ditransfer
                              </span>
                            ) : sentToFinance ? (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-blue-700">
                                Menunggu Finance
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-500">
                                Draft
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] font-bold text-slate-400">
                            {new Date(purchase.date).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })} • {formatRupiah(totalBudget)}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {!sentToFinance && !hasBeenTransferred && !isSettled && (
                            <Button
                              size="sm"
                              className="h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest shadow-sm"
                              onClick={() => handleSendToFinance(purchase.id)}
                              disabled={isSendingToFinance === purchase.id}
                            >
                              {isSendingToFinance === purchase.id ? (
                                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                              ) : (
                                <Send className="mr-1.5 h-3 w-3" />
                              )}
                              {isSendingToFinance === purchase.id ? 'Mengirim...' : 'Kirim'}
                            </Button>
                          )}
                          {!hasBeenTransferred && !isSettled && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-black uppercase tracking-widest"
                              onClick={() => handleDeletePurchase(purchase.id)}
                              disabled={isDeletingPurchase === purchase.id}
                              title="Hapus dokumen list belanja"
                            >
                              {isDeletingPurchase === purchase.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!pdfPreview} onOpenChange={(open) => !open && setPdfPreview(null)}>
        <DialogContent className="max-w-5xl h-[90vh] p-0 rounded-[2rem] overflow-hidden border-none bg-slate-900 shadow-2xl flex flex-col">
          <DialogHeader className="p-6 bg-slate-900 text-white flex flex-row items-center justify-between shrink-0 space-y-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black tracking-tight">Preview Daftar Belanja</DialogTitle>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cek dokumen sebelum download atau print</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
              onClick={() => setPdfPreview(null)}
            >
              <X className="w-5 h-5" />
            </Button>
          </DialogHeader>
          <div className="flex-1 bg-slate-800 p-4 overflow-hidden">
            {pdfPreview && (
              <iframe
                src={`${pdfPreview.url}#toolbar=0&navpanes=0&scrollbar=0`}
                className="w-full h-full rounded-sm border-none bg-white shadow-2xl"
                title="Preview Daftar Belanja"
              />
            )}
          </div>
          <DialogFooter className="p-5 bg-slate-900 border-t border-white/10 gap-3 sm:justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              File belum diunduh sampai klik Download.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="h-11 rounded-xl border-white/10 bg-white/10 text-white hover:bg-white hover:text-slate-900 font-black uppercase tracking-widest text-[10px]"
                onClick={() => {
                  if (!pdfPreview) return
                  const printWindow = window.open(pdfPreview.url, '_blank')
                  printWindow?.addEventListener('load', () => printWindow.print())
                }}
              >
                <Printer className="w-4 h-4 mr-2" /> Print
              </Button>
              <Button
                className="h-11 rounded-xl bg-white text-slate-900 hover:bg-slate-100 font-black uppercase tracking-widest text-[10px]"
                onClick={() => {
                  if (!pdfPreview) return
                  const link = document.createElement('a')
                  link.href = pdfPreview.url
                  link.download = `${pdfPreview.title}.pdf`
                  link.click()
                }}
              >
                <Download className="w-4 h-4 mr-2" /> Download PDF
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

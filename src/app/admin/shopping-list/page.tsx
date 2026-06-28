"use client"

import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ShoppingBasket, RefreshCw, Printer, Plus, Search, Check, ChevronsUpDown, Trash2, Globe, ShoppingBag, FileText, X, Download, Loader2, Send, CheckCircle2, Banknote, Store, Carrot, Apple, Laptop, ShoppingCart, ArrowRightLeft, CircleDollarSign, Warehouse, AlertTriangle, Undo2, ChevronDown, ChevronUp } from "lucide-react"
import React, { useEffect, useMemo, useState } from "react"
import { v4 as uuidv4 } from "uuid"
import { toast } from "sonner"
import { generateShoppingListPDFDataUrl } from "@/lib/pdf"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn, formatRupiah } from "@/lib/utils"
import GlobalUndoButton from "@/components/global-undo-button"

type ShoppingListDocumentItem = {
  productId: string
  productName: string
  skuCode: string
  uom?: string
  totalQty: number
  estimatedPrice: number
  sellPrice: number
  purchaseMethod: 'Pasar' | 'Online' | 'Transfer'
  salesOrderId?: string
  vendorId?: string
  vendorName?: string
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
  const vendors = useAppStore(state => state.vendors)
  const currentUser = useAppStore(state => state.currentUser)
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const addPurchase = useAppStore(state => state.addPurchase)
  const addPurchaseItems = useAppStore(state => state.addPurchaseItems)
  const deletePurchase = useAppStore(state => state.deletePurchase)
  const updateSalesOrder = useAppStore(state => state.updateSalesOrder)
  const updatePurchase = useAppStore(state => state.updatePurchase)
  const purchaseRequests = useAppStore(state => state.purchaseRequests) || []
  const updatePurchaseRequest = useAppStore(state => state.updatePurchaseRequest)
  const addPurchaseRequest = useAppStore(state => state.addPurchaseRequest)
  const stockMovements = useAppStore(state => state.stockMovements)
  const addStockMovement = useAppStore(state => state.addStockMovement)
  const rejectedItems = useAppStore(state => state.rejectedItems) || []
  const updateRejectedItem = useAppStore(state => state.updateRejectedItem)

  const [isLoading, setIsLoading] = useState(false)
  const [isDeletingPurchase, setIsDeletingPurchase] = useState<string | null>(null)
  const [isSendingToFinance, setIsSendingToFinance] = useState<string | null>(null)
  const [selectedHistoryPurchaseId, setSelectedHistoryPurchaseId] = useState<string | null>(null)

  const addVendor = useAppStore(state => state.addVendor)
  const [isAddVendorOpen, setIsAddVendorOpen] = useState(false)
  const [autoAssignProductId, setAutoAssignProductId] = useState<string | null>(null)
  const [newVendorData, setNewVendorData] = useState({
    companyName: "",
    picName: "",
    phone: "",
    address: "",
    isTempo: false,
    paymentTermDays: 14
  })

  const handleSaveVendor = () => {
    if (!newVendorData.companyName.trim()) {
      toast.error("Nama Perusahaan Vendor wajib diisi.")
      return
    }
    const vendorId = uuidv4()
    const newVendor = {
      id: vendorId,
      companyName: newVendorData.companyName.trim(),
      picName: newVendorData.picName.trim(),
      email: "",
      phone: newVendorData.phone.trim(),
      address: newVendorData.address.trim(),
      isTempo: newVendorData.isTempo,
      paymentTermDays: newVendorData.isTempo ? newVendorData.paymentTermDays : 0,
      createdAt: new Date().toISOString()
    }
    addVendor(newVendor)
    toast.success(`Vendor ${newVendor.companyName} berhasil ditambahkan!`)
    if (autoAssignProductId) {
      setVendorAssignments(prev => ({
        ...prev,
        [autoAssignProductId]: vendorId
      }))
      setAutoAssignProductId(null)
    } else {
      setBulkVendorId(vendorId)
    }
    setNewVendorData({
      companyName: "",
      picName: "",
      phone: "",
      address: "",
      isTempo: false,
      paymentTermDays: 14
    })
    setIsAddVendorOpen(false)
  }
  const [manualItems, setManualItems] = useState<Array<{id: string, productId: string, qty: number, price: number}>>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('shopping_manualItems') || '[]') } catch { return [] }
  })
  const [customPrices, setCustomPrices] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {}
    try { return JSON.parse(localStorage.getItem('shopping_customPrices') || '{}') } catch { return {} }
  })
  const [vendorAssignments, setVendorAssignments] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    try { return JSON.parse(localStorage.getItem('shopping_vendorAssignments') || '{}') } catch { return {} }
  })
  const [customQtys, setCustomQtys] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {}
    try { return JSON.parse(localStorage.getItem('shopping_customQtys') || '{}') } catch { return {} }
  })
  const [compiledRejectIds, setCompiledRejectIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('shopping_compiledRejectIds') || '[]')) } catch { return new Set() }
  })
  const [isSusulanExpanded, setIsSusulanExpanded] = useState(true)

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
  const [transferProductIds, setTransferProductIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('shopping_transferProductIds') || '[]')) } catch { return new Set() }
  })
  // Products fulfilled from warehouse stock (booking) — excluded from the buy list
  const [stockBookedProductIds, setStockBookedProductIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('shopping_stockBookedProductIds') || '[]')) } catch { return new Set() }
  })
  const [manualPurchaseMethod, setManualPurchaseMethod] = useState<'Pasar' | 'Online'>('Pasar')
  const [shoppingDate, setShoppingDate] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('shopping_shoppingDate') || ''
  })
  const [filterDeliveryDate, setFilterDeliveryDate] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('shopping_filterDeliveryDate') || ''
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
  const [selectedPRId, setSelectedPRId] = useState<string>('')
  const [bulkVendorId, setBulkVendorId] = useState<string>('')
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())

  // Persist state to localStorage on change
  useEffect(() => { localStorage.setItem('shopping_manualItems', JSON.stringify(manualItems)) }, [manualItems])
  useEffect(() => { localStorage.setItem('shopping_customPrices', JSON.stringify(customPrices)) }, [customPrices])
  useEffect(() => { localStorage.setItem('shopping_customQtys', JSON.stringify(customQtys)) }, [customQtys])
  useEffect(() => { localStorage.setItem('shopping_compiledRejectIds', JSON.stringify(Array.from(compiledRejectIds))) }, [compiledRejectIds])
  useEffect(() => { localStorage.setItem('shopping_vendorAssignments', JSON.stringify(vendorAssignments)) }, [vendorAssignments])
  useEffect(() => { localStorage.setItem('shopping_onlineProductIds', JSON.stringify(Array.from(onlineProductIds))) }, [onlineProductIds])
  useEffect(() => { localStorage.setItem('shopping_transferProductIds', JSON.stringify(Array.from(transferProductIds))) }, [transferProductIds])
  useEffect(() => { localStorage.setItem('shopping_stockBookedProductIds', JSON.stringify(Array.from(stockBookedProductIds))) }, [stockBookedProductIds])
  useEffect(() => { localStorage.setItem('shopping_shoppingDate', shoppingDate) }, [shoppingDate])
  useEffect(() => { localStorage.setItem('shopping_filterDeliveryDate', filterDeliveryDate) }, [filterDeliveryDate])
  useEffect(() => { localStorage.setItem('shopping_lastGeneratedDoc', JSON.stringify(lastGeneratedDoc)) }, [lastGeneratedDoc])

  // State Snapshot history for undoing actions
  const [history, setHistory] = useState<Array<{
    manualItems: Array<{id: string, productId: string, qty: number, price: number}>;
    customPrices: Record<string, number>;
    customQtys: Record<string, number>;
    vendorAssignments: Record<string, string>;
    onlineProductIds: Set<string>;
    transferProductIds: Set<string>;
    stockBookedProductIds: Set<string>;
    selectedSOIds: Set<string>;
    compiledRejectIds: Set<string>;
  }>>([])
  const [isUndoing, setIsUndoing] = useState(false)

  const saveToHistory = () => {
    setHistory(prev => [
      ...prev,
      {
        manualItems: [...manualItems],
        customPrices: { ...customPrices },
        customQtys: { ...customQtys },
        vendorAssignments: { ...vendorAssignments },
        onlineProductIds: new Set(onlineProductIds),
        transferProductIds: new Set(transferProductIds),
        stockBookedProductIds: new Set(stockBookedProductIds),
        selectedSOIds: new Set(selectedSOIds),
        compiledRejectIds: new Set(compiledRejectIds)
      }
    ])
  }

  const handleUndo = () => {
    if (history.length === 0) return
    setIsUndoing(true)
    setTimeout(() => {
      setHistory(prev => {
        const next = [...prev]
        const last = next.pop()
        if (last) {
          setManualItems(last.manualItems)
          setCustomPrices(last.customPrices)
          setCustomQtys(last.customQtys)
          setVendorAssignments(last.vendorAssignments)
          setOnlineProductIds(last.onlineProductIds)
          setTransferProductIds(last.transferProductIds)
          setStockBookedProductIds(last.stockBookedProductIds)
          setSelectedSOIds(last.selectedSOIds)
          setCompiledRejectIds(last.compiledRejectIds)
          toast.success("Aksi berhasil dibatalkan (Undone).")
        }
        return next
      })
      setIsUndoing(false)
    }, 500)
  }

  const setShoppingListUndo = useAppStore(state => state.setShoppingListUndo)
  useEffect(() => {
    setShoppingListUndo(handleUndo, history.length)
    return () => setShoppingListUndo(null, 0)
  }, [history.length, handleUndo, setShoppingListUndo])

  const selectPasar = (productId: string) => {
    saveToHistory()
    setStockBookedProductIds(prev => {
      const next = new Set(prev)
      next.delete(productId)
      return next
    })
    setOnlineProductIds(prev => {
      const next = new Set(prev)
      next.delete(productId)
      return next
    })
    setTransferProductIds(prev => {
      const next = new Set(prev)
      next.delete(productId)
      return next
    })
  }

  const selectOnline = (productId: string) => {
    saveToHistory()
    setStockBookedProductIds(prev => {
      const next = new Set(prev)
      next.delete(productId)
      return next
    })
    setOnlineProductIds(prev => {
      const next = new Set(prev)
      next.add(productId)
      return next
    })
    setTransferProductIds(prev => {
      const next = new Set(prev)
      next.delete(productId)
      return next
    })
  }

  const selectTransfer = (productId: string) => {
    saveToHistory()
    setStockBookedProductIds(prev => {
      const next = new Set(prev)
      next.delete(productId)
      return next
    })
    setTransferProductIds(prev => {
      const next = new Set(prev)
      next.add(productId)
      return next
    })
    setOnlineProductIds(prev => {
      const next = new Set(prev)
      next.delete(productId)
      return next
    })
  }

  const toggleStockBooked = (productId: string) => {
    saveToHistory()
    setStockBookedProductIds(prev => {
      const next = new Set(prev)
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
        // Clear vendor assignments when taken from warehouse
        setVendorAssignments(v => {
          const n = { ...v }
          delete n[productId]
          return n
        })
      }
      return next
    })
  }

  const toggleSelectItem = (productId: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  // Assign the chosen vendor to all checked items at once.
  const applyVendorToSelected = () => {
    if (!bulkVendorId) { toast.error("Pilih vendor dulu di dropdown."); return }
    if (selectedItemIds.size === 0) { toast.error("Centang item dulu yang mau di-set."); return }
    saveToHistory()
    setVendorAssignments(prev => {
      const next = { ...prev }
      selectedItemIds.forEach(pid => {
        if (stockBookedProductIds.has(pid)) return
        next[pid] = bulkVendorId
      })
      return next
    })
    const vName = vendors.find(v => v.id === bulkVendorId)?.companyName || 'vendor'
    toast.success(`${selectedItemIds.size} item di-assign ke ${vName}.`)
    setSelectedItemIds(new Set())
  }

  // Quantity already reserved (booked) against warehouse stock from prior bookings.
  // Used to compute available-to-promise stock = currentStock - alreadyBooked.
  const bookedQtyByProduct = useMemo(() => {
    const map: Record<string, number> = {}
    ;(stockMovements || []).forEach(m => {
      if (m.kind === 'BOOKING') map[m.productId] = (map[m.productId] || 0) + Number(m.quantity || 0)
    })
    return map
  }, [stockMovements])

  const pendingRejects = useMemo(() => {
    return rejectedItems
      .filter(item => !item.shoppingCompiledAt && !compiledRejectIds.has(item.id))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [rejectedItems, compiledRejectIds])

  const filteredProducts = products
    .filter(p => 
      p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
      p.skuCode.toLowerCase().includes(productSearch.toLowerCase())
    )
    .slice(0, 50)

  const candidateSOs = useMemo(() => {
    return salesOrders
      // Draft = belum diapprove; Belanja = sudah "Go to Sourcing", siap dibelanjakan.
      // Keduanya valid untuk dikompilasi selama belum masuk dokumen belanja.
      .filter(so => (so.status === 'Draft' || so.status === 'Belanja') && !so.shoppingListCompiledAt)
      .filter(so => !shoppingDate || toDateInputValue(so.orderDate) === shoppingDate)
      .filter(so => !filterDeliveryDate || toDateInputValue(so.targetDeliveryDate) === filterDeliveryDate)
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
  }, [salesOrders, shoppingDate, filterDeliveryDate])
  const candidateSOKey = candidateSOs.map(so => so.id).join('|')

  // PR Approved bisa dipakai untuk banyak Shopping List — tidak ada batasan 1:1
  const approvedPRs = purchaseRequests.filter(pr => pr.status === 'Approved' && pr.category === 'Sourcing')

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
        buyPrice: item.estimatedHpp !== undefined ? item.estimatedHpp : (product?.basePrice || 0),
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

  const rekapPOByProduct = useMemo(() => {
    const map: Record<string, number> = {}
    const selectedSOIdSet = new Set(selectedSOs.map(so => so.id))
    purchaseItems.forEach(pi => {
      if (!pi.salesOrderId || !selectedSOIdSet.has(pi.salesOrderId)) return
      map[pi.productId] = (map[pi.productId] || 0) + Number(pi.qtyTarget || 0)
    })
    return map
  }, [purchaseItems, selectedSOs])

  const rawConsolidatedList = allRequirementItems.reduce((acc: any[], curr: any) => {
    const existing = acc.find(item => item.productId === curr.productId && item.salesOrderId === curr.salesOrderId)
    
    if (existing) {
      existing.kebutuhan += curr.qty
      if (curr.sellPrice > existing.sellPrice) {
        existing.sellPrice = curr.sellPrice
      }
    } else {
      const product = products.find(p => p.id === curr.productId)
      if (product) {
        const customPrice = customPrices[curr.productId]
        const vId = vendorAssignments[curr.productId] || product.defaultVendorId || undefined
        const vName = vendors.find(v => v.id === vId)?.companyName
        acc.push({
          productId: curr.productId,
          productName: product.name,
          skuCode: product.skuCode,
          uom: product.uom,
          kebutuhan: curr.qty,
          totalQty: curr.qty,
          estimatedPrice: customPrice !== undefined ? customPrice : (curr.buyPrice || product.basePrice || 0),
          sellPrice: curr.sellPrice,
          purchaseMethod: transferProductIds.has(curr.productId) ? 'Transfer' : onlineProductIds.has(curr.productId) ? 'Online' : 'Pasar',
          salesOrderId: curr.salesOrderId,
          vendorId: vId,
          vendorName: vName,
          fromStock: stockBookedProductIds.has(curr.productId)
        })
      }
    }
    return acc
  }, [] as Array<{productId: string, productName: string, skuCode: string, uom?: string, kebutuhan: number, totalQty: number, estimatedPrice: number, sellPrice: number, purchaseMethod: 'Pasar' | 'Online' | 'Transfer', salesOrderId?: string, vendorId?: string, vendorName?: string, fromStock?: boolean}>)

  const consolidatedList = useMemo(() => {
    return rawConsolidatedList.map(item => {
      const product = products.find(p => p.id === item.productId)
      const currentStock = product?.currentStock || 0
      const alreadyBought = rekapPOByProduct[item.productId] || 0
      const kebutuhan = item.kebutuhan

      const defaultQty = item.fromStock 
        ? 0 
        : Math.max(0, kebutuhan - currentStock - alreadyBought)

      const uniqueKey = `${item.productId}_${item.salesOrderId || 'manual'}`
      const qtyToBuy = customQtys[uniqueKey] !== undefined 
        ? customQtys[uniqueKey] 
        : defaultQty

      return {
        ...item,
        totalQty: qtyToBuy
      }
    })
  }, [rawConsolidatedList, products, rekapPOByProduct, customQtys])


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

  const handleAddRejectToShoppingList = (reject: any) => {
    const product = products.find(p => p.id === reject.productId)
    saveToHistory()
    
    // Add to manualItems list
    const manualId = uuidv4()
    setManualItems(prev => [
      ...prev,
      { id: manualId, productId: reject.productId, qty: reject.qty, price: product?.basePrice || 0 }
    ])
    
    // Mark reject ID as compiled locally
    setCompiledRejectIds(prev => {
      const next = new Set(prev)
      next.add(reject.id)
      return next
    })
    
    toast.success(`Susulan ${product?.name || 'barang'} ditambahkan.`)
  }

  const handleRemoveManualItem = (id: string) => {
    setManualItems(prev => prev.filter(item => item.id !== id))
  }

  const handleGenerateDocument = async () => {
    if (isLoading) return
    if (consolidatedList.length === 0) {
      toast.error("Pilih minimal 1 PO atau tambahkan item stok dulu.")
      return
    }

    let linkedPR = null
    if (selectedPRId) {
      linkedPR = purchaseRequests.find(pr => pr.id === selectedPRId)
      if (!linkedPR || linkedPR.status !== 'Approved') {
        toast.error('PR yang dipilih belum berstatus Approved.')
        return
      }
    }

    // Items fulfilled from warehouse stock are booked (reserved), NOT bought.
    const buyItems = consolidatedList.filter(item => !item.fromStock)
    const stockItems = consolidatedList.filter(item => item.fromStock)
    const documentItems = buyItems.map(item => ({ ...item }))
    const documentId = uuidv4()
    const generatedAt = new Date().toISOString()
    const advanceCode = `ADV-${toDateInputValue(generatedAt).replaceAll('-', '')}-${String(purchases.length + 1).padStart(3, '0')}`
    setIsLoading(true)
    const loadingId = toast.loading("Membuat dokumen list belanja...")
    const title = `Daftar_Belanja_${new Date().toISOString().slice(0, 10)}`
    try {
      useAppStore.getState().takeDevSnapshot()
      await addPurchase({
        id: documentId,
        date: generatedAt,
        purchaserId: 'pending',
        status: 'Pending',
        advanceCode,
        shoppingListDocumentId: documentId,
        shoppingListCompiledBy: currentUser?.id,
        purchaseRequestId: selectedPRId || '',
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

      // Reserve (book) warehouse stock for items fulfilled from inventory. These were
      // excluded from the buy list above so Sourcing won't purchase them. The movement
      // uses stockDelta 0 — on-hand stock is NOT reduced yet; this is a reservation
      // until the warehouse actually pulls it for delivery.
      for (const item of stockItems) {
        const product = products.find(p => p.id === item.productId)
        await addStockMovement({
          id: uuidv4(),
          date: generatedAt,
          productId: item.productId,
          productName: product?.name,
          skuCode: product?.skuCode,
          quantity: item.totalQty,
          stockDelta: 0,
          resultingStock: product?.currentStock ?? 0,
          direction: 'Info',
          kind: 'BOOKING',
          source: 'Booking Gudang (Shopping List)',
          referenceType: 'Delivery',
          referenceId: documentId,
          salesOrderId: item.salesOrderId,
          createdByUserId: currentUser?.id,
          note: `Booking ${item.totalQty} ${product?.uom || ''} dari stok gudang`,
        })
      }
      setLastGeneratedDoc({
        purchaseId: documentId,
        generatedAt,
        items: documentItems
      })
      for (const so of selectedSOs) {
        await updateSalesOrder(so.id, {
          status: 'Belanja',
          shoppingListCompiledAt: generatedAt,
          shoppingListDocumentId: documentId,
          shoppingListCompiledBy: currentUser?.id
        })
      }

      // Update DB for all compiled rejected items
      for (const rejectId of compiledRejectIds) {
        const originalReject = rejectedItems.find(ri => ri.id === rejectId)
        if (originalReject) {
          await updateRejectedItem({
            ...originalReject,
            shoppingCompiledAt: generatedAt
          })
        }
      }

      // Reset local compiledRejectIds state
      setCompiledRejectIds(new Set())
      localStorage.setItem('shopping_compiledRejectIds', '[]')

      setSelectedPRId('')
      // Clear "from stock" selections that were just processed into bookings.
      if (stockItems.length > 0) {
        setStockBookedProductIds(prev => {
          const next = new Set(prev)
          stockItems.forEach(it => next.delete(it.productId))
          return next
        })
      }
      setPdfPreview({
        title,
        url: generateShoppingListPDFDataUrl(documentItems)
      })
      toast.success(
        stockItems.length > 0
          ? `Dokumen dibuat. ${buyItems.length} item dibeli, ${stockItems.length} item dibooking dari gudang.`
          : "Dokumen list belanja berhasil dibuat.",
        { id: loadingId }
      )
    } catch (e) {
      toast.error(`Gagal buat dokumen: ${e instanceof Error ? e.message : String(e)}`, { id: loadingId })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendToFinance = async (purchaseId: string) => {
    if (isSendingToFinance) return
    const purchase = purchases.find(p => p.id === purchaseId)
    if (!purchase) return toast.error("Purchase tidak ditemukan.")
    if (purchase.reconciliationStatus === 'Belum Transfer') return toast.info("Sudah dikirim ke Finance.")

    setIsSendingToFinance(purchaseId)
    const loadingId = toast.loading("Mengirim ke Finance...")
    try {
      useAppStore.getState().takeDevSnapshot()
      const items = purchaseItems.filter(pi => pi.purchaseId === purchaseId && pi.purchaseMethod === 'Pasar')
      const totalBudget = items.reduce((sum, item) => sum + (item.estimatedUnitPrice * item.qtyTarget), 0)

      let prId = purchase.purchaseRequestId
      if (!prId) {
        // Auto-generate Purchase Request for Sourcing
        prId = `pr-${uuidv4().slice(0, 8)}`
        const linkedSOs = salesOrders.filter(so => so.shoppingListDocumentId === purchaseId)
        const salesOrderIds = linkedSOs.map(so => so.id)

        await addPurchaseRequest({
          id: prId,
          title: `Belanja PO Sourcing #${purchase.advanceCode || purchase.id.slice(0,8)}`,
          description: `Perencanaan list belanja #${purchase.advanceCode || purchase.id.slice(0,8)} diajukan oleh Tim Sourcing.`,
          amount: totalBudget,
          category: 'Sourcing',
          status: 'Pending_Finance',
          requestedBy: currentUser?.name || currentUser?.id || 'Sourcing',
          salesOrderIds,
          createdAt: new Date().toISOString(),
        })
      }

      await updatePurchase(purchaseId, {
        reconciliationStatus: 'Belum Transfer',
        budgetAmount: totalBudget,
        purchaseRequestId: prId
      })
      toast.success("List belanja berhasil diajukan ke Finance / Admin PO (PR dibuat).", { id: loadingId })
    } catch (e) {
      toast.error(`Gagal kirim ke Finance: ${e instanceof Error ? e.message : String(e)}`, { id: loadingId })
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
      useAppStore.getState().takeDevSnapshot()
      await deletePurchase(purchaseId)
      if (lastGeneratedDoc?.purchaseId === purchaseId) setLastGeneratedDoc(null)
      toast.success("Dokumen list belanja dihapus.")
    } catch (e) {
      toast.error("Gagal hapus dokumen.")
    } finally {
      setIsDeletingPurchase(null)
    }
  }

  const handleOpenPdfPreview = (items: ShoppingListDocumentItem[], titleOverride?: string) => {
    const title = titleOverride || `Daftar_Belanja_${new Date().toISOString().slice(0, 10)}`
    setPdfPreview({
      title,
      url: generateShoppingListPDFDataUrl(items, titleOverride)
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
              
              <div className="flex items-center gap-2">
                <GlobalUndoButton inline />
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
                                        {product.weeklyPriceRange && product.weeklyPriceRange.min > 0 && product.weeklyPriceRange.max > 0 ? (
                                          <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0 rounded border border-amber-200">
                                            Patokan: {formatRupiah(product.weeklyPriceRange.min)} - {formatRupiah(product.weeklyPriceRange.max)}
                                          </span>
                                        ) : (
                                          <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0 rounded border border-amber-200">
                                            Patokan: {formatRupiah(product.basePrice)}
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
                          min="0.001"
                          step="any"
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
                               <div className="relative flex items-center justify-center w-4 h-4"><Store className="w-4 h-4" /><div className="absolute -bottom-1 -right-1 flex bg-white/80 rounded-full"><Carrot className="w-2 h-2 text-orange-500 -mr-[1px]" /><Apple className="w-2 h-2 text-rose-500" /></div></div> PASAR
                            </button>
                            <button 
                               className={cn(
                                  "flex-1 flex items-center justify-center gap-2 py-2 text-xs font-black rounded-lg transition-all",
                                  manualPurchaseMethod === 'Online' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:bg-white/50"
                               )}
                               onClick={() => setManualPurchaseMethod('Online')}
                            >
                               <div className="relative flex items-center justify-center w-4 h-4"><Laptop className="w-4 h-4" /><ShoppingCart className="w-2 h-2 absolute top-[2px]" /></div> ONLINE
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
              </div>
            </CardTitle>
            <CardDescription>
              {selectedSOs.length} dari {candidateSOs.length} PO dipilih • {manualItems.length} Item Stok manual
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <div className="rounded-[1.75rem] border border-slate-100 bg-white/80 p-4 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex flex-wrap gap-3">
                      <div className="grid gap-2">
                        <Label htmlFor="shopping-date" className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Filter Tanggal PO
                        </Label>
                        <Input
                          id="shopping-date"
                          type="date"
                          value={shoppingDate}
                          onChange={(e) => setShoppingDate(e.target.value)}
                          className="h-11 w-full rounded-xl border-slate-200 font-black text-slate-700 lg:w-[200px]"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="filter-delivery-date" className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Filter Tanggal Kirim
                        </Label>
                        <Input
                          id="filter-delivery-date"
                          type="date"
                          value={filterDeliveryDate}
                          onChange={(e) => setFilterDeliveryDate(e.target.value)}
                          className="h-11 w-full rounded-xl border-slate-200 font-black text-slate-700 lg:w-[200px]"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        className="h-10 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400"
                        disabled={!shoppingDate && !filterDeliveryDate}
                        onClick={() => { setShoppingDate(''); setFilterDeliveryDate('') }}
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
              </div>
              <div className="lg:col-span-1">
                <div className="rounded-[1.75rem] border border-slate-100 bg-white/80 p-4 shadow-sm flex flex-col h-full">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs">
                        {pendingRejects.length}
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">
                          Susulan (Reject & Retur)
                        </h4>
                        <p className="text-[10px] text-slate-500 font-bold">
                          Barang tidak lolos QC / Retur klien
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      onClick={() => setIsSusulanExpanded(!isSusulanExpanded)}
                    >
                      {isSusulanExpanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-500" />
                      )}
                    </Button>
                  </div>

                  {isSusulanExpanded && (
                    <div className="mt-4 flex-1">
                      {pendingRejects.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-100 px-4 h-[220px]">
                          <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-2">
                            <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                            Semua Bersih
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                            Tidak ada barang reject / retur yang perlu susulan belanja.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                          {pendingRejects.map(item => {
                            const product = products.find(p => p.id === item.productId);
                            const isQC = item.source === 'QC';
                            const isReturn = item.source === 'Return';
                            const sourceLabel = isQC ? 'QC Reject' : isReturn ? 'Client Return' : item.source;

                            return (
                              <div
                                key={item.id}
                                className="p-3 rounded-2xl border border-slate-100 hover:border-slate-200 bg-white hover:bg-slate-50/50 transition-all flex flex-col justify-between gap-2 shadow-sm"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <span className={cn(
                                      "inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest mb-1.5",
                                      isQC ? "bg-rose-50 text-rose-600 border border-rose-100" :
                                      isReturn ? "bg-amber-50 text-amber-600 border border-amber-100" :
                                      "bg-blue-50 text-blue-600 border border-blue-100"
                                    )}>
                                      {sourceLabel}
                                    </span>
                                    <h5 className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                                      {product?.name || 'Unknown Product'}
                                    </h5>
                                    <p className="text-[10px] text-slate-400 font-bold mt-0.5 truncate">
                                      {product?.skuCode || 'No SKU'}
                                    </p>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                                      {item.qty} {product?.uom || 'pcs'}
                                    </span>
                                    <p className="text-[9px] text-slate-400 font-bold mt-0.5">
                                      {new Date(item.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-50">
                                  <p className="text-[9px] text-slate-500 font-bold italic truncate max-w-[150px]" title={item.reason}>
                                    "{item.reason || 'Tanpa keterangan'}"
                                  </p>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[9px] font-black uppercase tracking-widest text-emerald-600 hover:text-white hover:bg-emerald-600 border-emerald-100 hover:border-emerald-600 rounded-lg gap-1 shrink-0"
                                    onClick={() => handleAddRejectToShoppingList(item)}
                                  >
                                    <Plus className="w-2.5 h-2.5" /> Susulan
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
                {/* Banner Susulan Pendek / Pending Rejects */}
                {pendingRejects.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-amber-100 text-amber-800 rounded-xl flex items-center justify-center font-bold text-lg">
                        {pendingRejects.length}
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                          Susulan Retur & Reject QC Pending
                        </h4>
                        <p className="text-[10px] text-slate-500">
                          Ada {pendingRejects.length} barang retur/reject yang belum dimasukkan ke list belanja.
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] uppercase tracking-widest rounded-xl"
                      onClick={() => {
                        saveToHistory()
                        const newManualItems = [...manualItems]
                        const nextCompiled = new Set(compiledRejectIds)
                        
                        pendingRejects.forEach(item => {
                          const product = products.find(p => p.id === item.productId)
                          newManualItems.push({
                            id: uuidv4(),
                            productId: item.productId,
                            qty: item.qty,
                            price: product?.basePrice || 0
                          })
                          nextCompiled.add(item.id)
                        })

                        setManualItems(newManualItems)
                        setCompiledRejectIds(nextCompiled)
                        localStorage.setItem('shopping_compiledRejectIds', JSON.stringify(Array.from(nextCompiled)))
                        toast.success(`Berhasil mem-prefill ${pendingRejects.length} barang susulan ke antrean.`)
                      }}
                    >
                      Pre-fill Semua Susulan ({pendingRejects.length} item)
                    </Button>
                  </div>
                )}

                {/* Banner Alokasi Gudang */}
                {(() => {
                  const suggestions = consolidatedList.filter(item => {
                    if (item.fromStock) return false
                    const prod = products.find(p => p.id === item.productId)
                    const avail = (prod?.currentStock ?? 0) - (bookedQtyByProduct[item.productId] || 0)
                    return avail > 0
                  })
                  if (suggestions.length === 0) return null
                  return (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-emerald-100 text-emerald-800 rounded-xl flex items-center justify-center">
                          <Warehouse className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                            Saran Alokasi dari Gudang
                          </h4>
                          <p className="text-[10px] text-slate-500">
                            Terdapat {suggestions.length} produk yang memiliki stok tersedia di gudang. Mau dialokasikan dari gudang?
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest rounded-xl"
                        onClick={() => {
                          saveToHistory()
                          setStockBookedProductIds(prev => {
                            const next = new Set(prev)
                            suggestions.forEach(item => next.add(item.productId))
                            return next
                          })
                          setVendorAssignments(v => {
                            const n = { ...v }
                            suggestions.forEach(item => delete n[item.productId])
                            return n
                          })
                          toast.success(`Berhasil mengalokasikan ${suggestions.length} produk dari gudang.`)
                        }}
                      >
                        Alokasikan Semua ({suggestions.length} produk)
                      </Button>
                    </div>
                  )
                })()}

                {/* Bulk vendor assignment — select items then apply */}
                <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40">
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-emerald-600"
                      checked={consolidatedList.length > 0 && selectedItemIds.size === consolidatedList.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedItemIds(new Set(consolidatedList.map(i => i.productId)))
                        else setSelectedItemIds(new Set())
                      }}
                    />
                    Pilih Semua
                  </label>
                  <span className="text-[10px] font-bold text-slate-500">{selectedItemIds.size} dipilih</span>
                  <div className="h-5 w-px bg-emerald-200 mx-1" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Set Vendor</span>
                  <div className="flex items-center gap-1">
                    <select
                      className="text-xs p-2 border rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 min-w-[160px]"
                      value={bulkVendorId}
                      onChange={(e) => setBulkVendorId(e.target.value)}
                    >
                      <option value="">-- Pilih Vendor --</option>
                      {vendors.map(v => (
                        <option key={v.id} value={v.id}>{v.companyName}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={() => {
                        setAutoAssignProductId(null)
                        setIsAddVendorOpen(true)
                      }}
                      className="h-9 w-9 p-0 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200"
                      title="Tambah Vendor Baru"
                    >
                      <Plus className="h-4 w-4 text-emerald-600" />
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest"
                    disabled={!bulkVendorId || selectedItemIds.size === 0}
                    onClick={applyVendorToSelected}
                  >
                    Terapkan ke {selectedItemIds.size} item
                  </Button>
                  {selectedItemIds.size > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 font-black text-[10px] uppercase tracking-widest text-slate-400 hover:text-slate-700"
                      onClick={() => setSelectedItemIds(new Set())}
                    >
                      Batal Pilih
                    </Button>
                  )}
                </div>

                <div className="rounded-md border bg-slate-50 dark:bg-slate-900 max-h-[300px] overflow-auto shadow-inner">

                  {/* Vendor Grouping Logic */}
                  {(() => {
                    const groups: Record<string, typeof consolidatedList> = { unassigned: [] };
                    consolidatedList.forEach(item => {
                      const key = item.vendorId || 'unassigned';
                      if (!groups[key]) groups[key] = [];
                      groups[key].push(item);
                    });
                    const vendorKeys = Object.keys(groups).filter(k => k !== 'unassigned');
                    return (
                      <Table className="min-w-[1000px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[70px]">SKU</TableHead>
                            <TableHead className="min-w-[200px]">Product</TableHead>
                            <TableHead className="w-[120px]">Vendor</TableHead>
                            <TableHead className="w-[85px] text-right">Kebutuhan</TableHead>
                            <TableHead className="w-[90px] text-right">Stok Gudang</TableHead>
                            <TableHead className="w-[95px] text-right">Qty Beli</TableHead>
                            <TableHead className="w-[110px] text-right">Sell Price</TableHead>
                            <TableHead className="w-[140px] text-right">Est. Buy</TableHead>
                            <TableHead className="w-[110px] text-right">Subtotal</TableHead>
                            <TableHead className="w-[140px] text-center">Metode</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...vendorKeys, 'unassigned'].map(vKey => {
                            const items = groups[vKey];
                            if (items.length === 0) return null;
                            const vName = vKey === 'unassigned' ? 'Tanpa Vendor / Bebas' : vendors.find(v => v.id === vKey)?.companyName || 'Unknown Vendor';
                            
                            return (
                              <React.Fragment key={vKey}>
                                <TableRow className="bg-slate-100/50 dark:bg-slate-800/50 border-y-2 border-slate-200">
                                  <TableCell colSpan={10} className="py-1.5 px-4">
                                    <div className="flex items-center justify-between w-full gap-2 flex-wrap">
                                      <span className="text-xs font-black uppercase tracking-widest text-slate-500">{vName}</span>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {/* Bulk metode pembayaran - hanya tampil untuk vendor yang teridentifikasi */}
                                        {vKey !== 'unassigned' && items.length > 0 && (
                                          <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-0.5 bg-white">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 pl-1.5 pr-0.5">Bulk:</span>
                                            <button
                                              onClick={() => { saveToHistory(); items.forEach(i => selectPasar(i.productId)) }}
                                              className="px-2 py-1 text-[9px] font-black uppercase rounded-md border transition-all hover:scale-105 bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                              title={`Set semua ${items.length} item di ${vName} ke Pasar`}
                                            >
                                              Pasar
                                            </button>
                                            <button
                                              onClick={() => { saveToHistory(); items.forEach(i => selectOnline(i.productId)) }}
                                              className="px-2 py-1 text-[9px] font-black uppercase rounded-md border transition-all hover:scale-105 bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                                              title={`Set semua ${items.length} item di ${vName} ke Online`}
                                            >
                                              Online
                                            </button>
                                            <button
                                              onClick={() => { saveToHistory(); items.forEach(i => selectTransfer(i.productId)) }}
                                              className="px-2 py-1 text-[9px] font-black uppercase rounded-md border transition-all hover:scale-105 bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
                                              title={`Set semua ${items.length} item di ${vName} ke Transfer`}
                                            >
                                              Transfer
                                            </button>
                                          </div>
                                        )}
                                        {items.length > 0 && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            type="button"
                                            className="h-7 px-2.5 text-[10px] font-black uppercase tracking-wider text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 flex items-center gap-1 border border-emerald-200 bg-white"
                                            onClick={() => handleOpenPdfPreview(items, `DAFTAR BELANJA VENDOR: ${vName.toUpperCase()}`)}
                                          >
                                            <Printer className="h-3.5 w-3.5" /> Print PDF Vendor
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                                {items.map((item, idx) => {
                                  const product = products.find(p => p.id === item.productId);
                                  return (
                                    <TableRow key={idx} className={cn(selectedItemIds.has(item.productId) && "bg-emerald-50/40")}>
                                      <TableCell className="text-xs text-slate-500 truncate">
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            className="w-4 h-4 accent-emerald-600 shrink-0"
                                            checked={selectedItemIds.has(item.productId)}
                                            onChange={() => toggleSelectItem(item.productId)}
                                          />
                                          <span className="truncate">{item.skuCode}</span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="font-medium leading-tight">
                                        <div className="flex flex-col gap-1 w-full max-w-[200px] whitespace-normal">
                                          <span className="text-xs">{item.productName}</span>
                                           {(() => {
                                             const alreadyBought = rekapPOByProduct[item.productId] || 0
                                             if (alreadyBought <= 0) return null
                                             const stillNeeded = item.totalQty - alreadyBought
                                             return (
                                               <span
                                                 className={cn(
                                                   "w-fit text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded flex items-center gap-1",
                                                   stillNeeded <= 0 ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"
                                                 )}
                                                 title={`Sudah dibeli ${alreadyBought} di PO sebelumnya. Sisa: ${Math.max(0, stillNeeded)}`}
                                               >
                                                 {stillNeeded <= 0 ? '✓ Sudah Terbeli' : `Rekap: ${alreadyBought} dibeli, sisa ${stillNeeded}`}
                                               </span>
                                             )
                                           })()}
                                          {product?.weeklyPriceRange && product.weeklyPriceRange.min > 0 && product.weeklyPriceRange.max > 0 ? (
                                            <span className="text-[9px] font-bold text-amber-600 w-fit" title="Harga terendah-tertinggi minggu ini (Kamis-Rabu)">
                                              Patokan: {formatRupiah(product.weeklyPriceRange.min)} - {formatRupiah(product.weeklyPriceRange.max)}
                                            </span>
                                          ) : (
                                            <span className="text-[9px] font-bold text-amber-600 w-fit" title="Harga Acuan (Base Price)">
                                              Patokan: {formatRupiah(product?.basePrice || 0)}
                                            </span>
                                          )}
                                          {item.fromStock && (() => {
                                            const avail = (product?.currentStock ?? 0) - (bookedQtyByProduct[item.productId] || 0)
                                            const short = item.totalQty > avail
                                            return (
                                              <span className={cn(
                                                "w-fit text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded flex items-center gap-1",
                                                short ? "bg-rose-50 text-rose-600" : "bg-amber-100 text-amber-700"
                                              )}>
                                                <Warehouse className="w-2.5 h-2.5" /> Dari Gudang
                                                {short && (
                                                  <span className="flex items-center gap-0.5" title="Stok tersedia kurang dari kebutuhan">
                                                    <AlertTriangle className="w-2.5 h-2.5" /> stok {avail}/{item.totalQty}
                                                  </span>
                                                )}
                                              </span>
                                            )
                                          })()}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        {item.fromStock ? (
                                          <span className="text-[10px] font-black uppercase bg-slate-100 text-slate-600 px-2 py-1 rounded inline-flex items-center gap-1" title="Barang diambil dari Gudang">
                                            <Warehouse className="w-3.5 h-3.5 text-slate-500" /> Gudang
                                          </span>
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <select
                                              className="text-[10px] w-full max-w-[120px] p-1 border rounded bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                              value={vendorAssignments[item.productId] || ''}
                                              onChange={(e) => {
                                                saveToHistory();
                                                setVendorAssignments(prev => {
                                                  const next = { ...prev };
                                                  if (e.target.value) next[item.productId] = e.target.value;
                                                  else delete next[item.productId];
                                                  return next;
                                                });
                                              }}
                                            >
                                              <option value="">-- Pilih --</option>
                                              {vendors.map(v => (
                                                <option key={v.id} value={v.id}>{v.companyName}</option>
                                              ))}
                                            </select>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              type="button"
                                              onClick={() => {
                                                setAutoAssignProductId(item.productId)
                                                setIsAddVendorOpen(true)
                                              }}
                                              className="h-7 w-7 p-0 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md border border-slate-200 shrink-0"
                                              title="Tambah Vendor Baru"
                                            >
                                              <Plus className="h-3.5 w-3.5 text-slate-500" />
                                            </Button>
                                          </div>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-right font-medium text-slate-600 pr-4">
                                        {item.kebutuhan}
                                      </TableCell>
                                      <TableCell className="text-right font-medium text-slate-500 pr-4">
                                        {product?.currentStock || 0}
                                      </TableCell>
                                      <TableCell className="text-right pr-4">
                                        <div className="flex flex-col items-end gap-1">
                                          <Input 
                                            type="number"
                                            className="h-8 w-20 text-right text-xs font-black border-slate-200"
                                            placeholder="0"
                                            value={item.totalQty || ''}
                                            onChange={(e) => {
                                              saveToHistory()
                                              const val = Math.max(0, parseFloat(e.target.value) || 0)
                                              const uniqueKey = `${item.productId}_${item.salesOrderId || 'manual'}`
                                              setCustomQtys(prev => ({
                                                ...prev,
                                                [uniqueKey]: val
                                              }))
                                            }}
                                          />
                                          {(() => {
                                            const alreadyBought = rekapPOByProduct[item.productId] || 0
                                            if (alreadyBought <= 0) return null
                                            const stillNeeded = Math.max(0, item.totalQty - alreadyBought)
                                            return (
                                              <span className={cn(
                                                "text-[9px] font-black px-1.5 py-0.5 rounded",
                                                stillNeeded === 0 ? "text-emerald-600 bg-emerald-50" : "text-orange-600 bg-orange-50"
                                              )}>
                                                beli {stillNeeded}
                                              </span>
                                            )
                                          })()}
                                        </div>
                                      </TableCell>
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
                                               onChange={(e) => {
                                                  saveToHistory();
                                                  setCustomPrices(prev => ({ 
                                                     ...prev, 
                                                     [item.productId]: parseFloat(e.target.value) || 0 
                                                  }));
                                               }}
                                            />
                                         </div>
                                      </TableCell>
                                      <TableCell className="text-right font-bold text-emerald-600 pr-4">{formatRupiah(item.estimatedPrice * item.totalQty)}</TableCell>
                                      <TableCell className="text-center">
                                         <div className="flex flex-wrap items-center justify-center gap-1 w-[140px]">
                                            {/* Button Pasar */}
                                            <button
                                               onClick={() => selectPasar(item.productId)}
                                               className={cn(
                                                  "px-2 py-1 text-[9px] font-black uppercase rounded-md border transition-all hover:scale-105",
                                                  item.purchaseMethod === 'Pasar' && !item.fromStock
                                                     ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                                                     : "bg-slate-50 border-slate-200 text-slate-400"
                                               )}
                                               title="Pindah ke Beli di Pasar"
                                            >
                                               Pasar
                                            </button>
  
                                            {/* Button Online */}
                                            <button
                                               onClick={() => selectOnline(item.productId)}
                                               className={cn(
                                                  "px-2 py-1 text-[9px] font-black uppercase rounded-md border transition-all hover:scale-105",
                                                  item.purchaseMethod === 'Online' && !item.fromStock
                                                     ? "bg-blue-100 border-blue-300 text-blue-700"
                                                     : "bg-slate-50 border-slate-200 text-slate-400"
                                               )}
                                               title="Pindah ke Beli Online"
                                            >
                                               Online
                                            </button>
  
                                            {/* Button Transfer */}
                                            <button
                                               onClick={() => selectTransfer(item.productId)}
                                               className={cn(
                                                  "px-2 py-1 text-[9px] font-black uppercase rounded-md border transition-all hover:scale-105",
                                                  item.purchaseMethod === 'Transfer' && !item.fromStock
                                                     ? "bg-purple-100 border-purple-300 text-purple-700"
                                                     : "bg-slate-50 border-slate-200 text-slate-400"
                                               )}
                                               title="Tandai dibayar via Transfer (finance)"
                                            >
                                               Transfer
                                            </button>
  
                                            {/* Button Gudang */}
                                            <button
                                               onClick={() => toggleStockBooked(item.productId)}
                                               className={cn(
                                                  "px-2 py-1 text-[9px] font-black uppercase rounded-md border transition-all hover:scale-105",
                                                  item.fromStock
                                                     ? "bg-amber-100 border-amber-300 text-amber-700"
                                                     : "bg-slate-50 border-slate-200 text-slate-400"
                                               )}
                                               title="Ambil dari stok Gudang (booking)"
                                            >
                                               Gudang
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
                                               className="p-1.5 rounded-md border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:scale-105 transition-all"
                                               title="Hapus item dari list"
                                            >
                                               <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                         </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    );
                  })()}
                </div>

                {manualItems.length > 0 && (
                  <div className="space-y-2 p-3 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-lg border border-emerald-100 dark:border-emerald-900/50">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-emerald-500">
                      Item Belanja Manual (Antrean Produk)
                    </Label>
                    <div className="grid gap-2">
                      {manualItems.map(item => {
                        const product = products.find(p => p.id === item.productId)
                        const purchaseMethod = transferProductIds.has(item.productId)
                          ? 'Transfer'
                          : onlineProductIds.has(item.productId)
                            ? 'Online'
                            : 'Pasar';

                        return (
                          <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between text-sm bg-white dark:bg-slate-900 p-3 rounded-xl border shadow-sm group gap-3">
                            <div className="flex flex-col min-w-[200px]">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">{product?.name}</span>
                              <span className="text-[10px] text-slate-400 font-medium">{product?.skuCode}</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-4">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vendor:</span>
                                {stockBookedProductIds.has(item.productId) ? (
                                  <span className="text-[10px] font-black uppercase bg-slate-100 text-slate-600 px-2 py-1 rounded inline-flex items-center gap-1" title="Barang diambil dari Gudang">
                                    <Warehouse className="w-3.5 h-3.5 text-slate-500" /> Gudang
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <select
                                      className="text-[10px] p-1 border rounded bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 min-w-[130px]"
                                      value={vendorAssignments[item.productId] || ''}
                                      onChange={(e) => {
                                        saveToHistory();
                                        setVendorAssignments(prev => {
                                          const next = { ...prev };
                                          if (e.target.value) next[item.productId] = e.target.value;
                                          else delete next[item.productId];
                                          return next;
                                        });
                                      }}
                                    >
                                      <option value="">-- Pilih --</option>
                                      {vendors.map(v => (
                                        <option key={v.id} value={v.id}>{v.companyName}</option>
                                      ))}
                                    </select>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      type="button"
                                      onClick={() => {
                                        setAutoAssignProductId(item.productId)
                                        setIsAddVendorOpen(true)
                                      }}
                                      className="h-7 w-7 p-0 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md border border-slate-200 shrink-0"
                                      title="Tambah Vendor Baru"
                                    >
                                      <Plus className="h-3.5 w-3.5 text-slate-500" />
                                    </Button>
                                  </div>
                                )}
                              </div>

                              {/* Purchase Method Toggles */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Metode:</span>
                                <div className="flex items-center gap-1">
                                  {/* Button Pasar */}
                                  <button
                                    onClick={() => selectPasar(item.productId)}
                                    className={cn(
                                      "p-1.5 rounded-lg border transition-all flex items-center justify-center hover:scale-105",
                                      purchaseMethod === 'Pasar' && !stockBookedProductIds.has(item.productId)
                                        ? "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/40 dark:border-emerald-900 ring-2 ring-emerald-100"
                                        : "bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700"
                                    )}
                                    title="Pindah ke Beli di Pasar"
                                  >
                                    <div className="relative flex items-center justify-center w-4 h-4">
                                      <Store className="w-4 h-4" />
                                      <div className="absolute -bottom-1 -right-1 flex bg-white/80 dark:bg-slate-800 rounded-full p-[0.5px]">
                                        <Carrot className="w-2.5 h-2.5 text-orange-500" />
                                      </div>
                                    </div>
                                  </button>

                                  {/* Button Online */}
                                  <button
                                    onClick={() => selectOnline(item.productId)}
                                    className={cn(
                                      "p-1.5 rounded-lg border transition-all flex items-center justify-center hover:scale-105",
                                      purchaseMethod === 'Online' && !stockBookedProductIds.has(item.productId)
                                        ? "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/40 dark:border-blue-900 ring-2 ring-blue-100"
                                        : "bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700"
                                    )}
                                    title="Pindah ke Beli Online"
                                  >
                                    <div className="relative flex items-center justify-center w-4 h-4">
                                      <Laptop className="w-4 h-4" />
                                      <ShoppingCart className="w-2 h-2 absolute top-[2px]" />
                                    </div>
                                  </button>

                                  {/* Button Transfer */}
                                  <button
                                    onClick={() => selectTransfer(item.productId)}
                                    className={cn(
                                      "p-1.5 rounded-lg border transition-all flex items-center justify-center hover:scale-105",
                                      purchaseMethod === 'Transfer' && !stockBookedProductIds.has(item.productId)
                                        ? "bg-purple-50 border-purple-200 text-purple-600 dark:bg-purple-950/40 dark:border-purple-900 ring-2 ring-purple-100"
                                        : "bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700"
                                    )}
                                    title="Transfer: dibayar finance"
                                  >
                                    <div className="relative flex items-center justify-center w-4 h-4">
                                      <ArrowRightLeft className="w-4 h-4" />
                                      <CircleDollarSign className="w-2.5 h-2.5 text-amber-500 absolute -top-1 -right-1 bg-white dark:bg-slate-800 rounded-full" />
                                    </div>
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 ml-auto sm:ml-0">
                              <span className="font-bold text-emerald-600">{item.qty} {product?.uom}</span>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
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
                
                {/* PR Selector — opsional sebelum compile */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Pilih Purchase Request (Opsional — Bisa diajukan otomatis)
                    </p>
                    {selectedPRId && (
                      <button
                        className="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline"
                        onClick={() => setSelectedPRId('')}
                      >
                        Batal pilih
                      </button>
                    )}
                  </div>
                  {approvedPRs.length === 0 ? (
                    <div className="text-xs font-bold text-slate-400 py-1">
                      Belum ada PR Sourcing yang Approved. Anda bisa langsung compile, lalu gunakan tombol **Kirim ke Finance** untuk membuat pengajuan baru otomatis.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[240px] overflow-auto pr-1">
                      {approvedPRs.map(pr => {
                        const usageCount = purchases.filter(p => p.purchaseRequestId === pr.id).length
                        const isSelected = selectedPRId === pr.id
                        return (
                          <label
                            key={pr.id}
                            className={cn(
                              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all',
                              isSelected
                                ? 'border-emerald-400 bg-emerald-50 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-emerald-300'
                            )}
                          >
                            <input
                              type="radio"
                              name="pr-select"
                              value={pr.id}
                              checked={isSelected}
                              onChange={() => setSelectedPRId(pr.id)}
                              className="accent-emerald-600 mt-0.5 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-black text-slate-800 leading-tight">{pr.title}</p>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {usageCount > 0 && (
                                    <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest">
                                      {usageCount}× dipakai
                                    </span>
                                  )}
                                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white">
                                    Approved
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                <span className="text-[10px] font-bold text-slate-500">{pr.category}</span>
                                <span className="text-[10px] font-black text-emerald-700">{formatRupiah(pr.amount)}</span>
                                {pr.approvedByCfo && (
                                  <span className="text-[10px] font-bold text-slate-400">CFO: {pr.approvedByCfo}</span>
                                )}
                                {pr.description && (
                                  <span className="text-[10px] text-slate-400 truncate max-w-[200px]" title={pr.description}>{pr.description}</span>
                                )}
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2 gap-3">
                  <Button variant="outline" onClick={() => handleOpenPdfPreview(consolidatedList.filter(item => item.purchaseMethod === 'Pasar'))}>
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
                      <div
                        key={purchase.id}
                        className="flex items-center justify-between px-4 py-3 gap-4 cursor-pointer hover:bg-blue-50/60 transition-colors group"
                        onClick={() => setSelectedHistoryPurchaseId(purchase.id)}
                        title="Klik untuk lihat detail isi dokumen"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-black text-slate-700 group-hover:text-blue-700 transition-colors">{purchase.advanceCode || purchase.id.slice(0, 8)}</span>
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
                        <div className="flex gap-2 shrink-0 items-center">
                          <span className="text-[9px] font-black uppercase tracking-widest text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                            <Search className="w-3 h-3" /> Detail
                          </span>
                          {!sentToFinance && !hasBeenTransferred && !isSettled && (
                            <Button
                              size="sm"
                              className="h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest shadow-sm"
                              onClick={(e) => { e.stopPropagation(); handleSendToFinance(purchase.id) }}
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
                              onClick={(e) => { e.stopPropagation(); handleDeletePurchase(purchase.id) }}
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
        <DialogContent className="max-w-[96vw] w-[96vw] h-[96vh] p-0 rounded-[2rem] overflow-hidden border-none bg-slate-900 shadow-2xl flex flex-col">
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

      {/* --- DIALOG DETAIL RIWAYAT LIST BELANJA --- */}
      {(() => {
        const histPurchase = selectedHistoryPurchaseId ? purchases.find(p => p.id === selectedHistoryPurchaseId) : null
        const histItems = histPurchase ? purchaseItems.filter(pi => pi.purchaseId === histPurchase.id) : []
        const histTotal = histItems.reduce((sum, i) => sum + (i.estimatedUnitPrice * i.qtyTarget), 0)
        const histSettled = histPurchase?.reconciliationStatus === 'Terverifikasi'
        const histTransferred = !!histPurchase?.budgetTransferDate
        const histSentToFinance = histPurchase?.reconciliationStatus === 'Belum Transfer'

        return (
          <Dialog open={!!selectedHistoryPurchaseId} onOpenChange={(open) => !open && setSelectedHistoryPurchaseId(null)}>
            <DialogContent className="max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col rounded-2xl">
              <DialogHeader className="shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <DialogTitle className="text-base font-black tracking-tight">
                      Detail Dokumen Belanja #{histPurchase?.advanceCode || histPurchase?.id.slice(0, 8)}
                    </DialogTitle>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {histPurchase ? new Date(histPurchase.date).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }) : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-blue-600 border border-blue-100">
                    {histItems.length} item
                  </span>
                  {histSettled ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-700">✓ Selesai</span>
                  ) : histTransferred ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-700">Dana Ditransfer</span>
                  ) : histSentToFinance ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-blue-700">Menunggu Finance</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-500">Draft</span>
                  )}
                  <span className="text-[11px] font-black text-slate-700">Total: {formatRupiah(histTotal)}</span>
                </div>
              </DialogHeader>
              <div className="flex-1 overflow-auto min-h-0">
                {histItems.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-slate-400 text-sm font-bold">Tidak ada item dalam dokumen ini.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-[10px] font-black uppercase tracking-widest w-[80px]">SKU</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest">Nama Produk</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-right w-[80px]">Qty</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-right w-[120px]">Est. Harga</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-right w-[120px]">Subtotal</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-center w-[90px]">Metode</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest w-[120px]">Vendor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {histItems.map((item, idx) => {
                        const prod = products.find(p => p.id === item.productId)
                        const vnd = vendors.find(v => v.id === item.vendorId)
                        const methodColor = item.purchaseMethod === 'Pasar'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : item.purchaseMethod === 'Online'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-purple-50 text-purple-700 border-purple-200'
                        return (
                          <TableRow key={idx} className="text-sm">
                            <TableCell className="text-[10px] text-slate-400 font-bold">{prod?.skuCode || item.productId.slice(0, 8)}</TableCell>
                            <TableCell className="font-medium text-xs">{prod?.name || item.productId}</TableCell>
                            <TableCell className="text-right text-xs font-bold">{item.qtyTarget} {prod?.uom || ''}</TableCell>
                            <TableCell className="text-right text-xs">{formatRupiah(item.estimatedUnitPrice)}</TableCell>
                            <TableCell className="text-right text-xs font-bold text-emerald-600">{formatRupiah(item.estimatedUnitPrice * item.qtyTarget)}</TableCell>
                            <TableCell className="text-center">
                              <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-black uppercase border", methodColor)}>
                                {item.purchaseMethod}
                              </span>
                            </TableCell>
                            <TableCell className="text-[10px] text-slate-500 font-bold">{vnd?.companyName || '—'}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
              <DialogFooter className="shrink-0 border-t pt-4">
                <Button variant="outline" onClick={() => setSelectedHistoryPurchaseId(null)}>Tutup</Button>
                {histPurchase && (
                  <Button
                    className="bg-slate-800 hover:bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest"
                    onClick={() => {
                      const docItems: ShoppingListDocumentItem[] = histItems.map(i => ({
                        productId: i.productId,
                        productName: products.find(p => p.id === i.productId)?.name || i.productId,
                        skuCode: products.find(p => p.id === i.productId)?.skuCode || '',
                        uom: products.find(p => p.id === i.productId)?.uom,
                        totalQty: i.qtyTarget,
                        estimatedPrice: i.estimatedUnitPrice,
                        sellPrice: products.find(p => p.id === i.productId)?.sellPrice || 0,
                        purchaseMethod: i.purchaseMethod as 'Pasar' | 'Online' | 'Transfer',
                        vendorId: i.vendorId,
                        vendorName: vendors.find(v => v.id === i.vendorId)?.companyName,
                      }))
                      handleOpenPdfPreview(docItems, `DAFTAR BELANJA #${histPurchase.advanceCode || histPurchase.id.slice(0, 8)}`)
                      setSelectedHistoryPurchaseId(null)
                    }}
                  >
                    <Printer className="w-3.5 h-3.5 mr-1.5" /> Print PDF
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      })()}

      <Dialog open={isAddVendorOpen} onOpenChange={setIsAddVendorOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Tambah Vendor Baru</DialogTitle>
            <DialogDescription>
              Masukkan detail vendor baru untuk langsung digunakan dalam belanja stok ini.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 text-slate-900 dark:text-slate-100">
            <div className="grid gap-2">
              <Label htmlFor="vendor-companyName">Nama Perusahaan Vendor</Label>
              <Input 
                id="vendor-companyName" 
                value={newVendorData.companyName}
                onChange={(e) => setNewVendorData({...newVendorData, companyName: e.target.value})}
                placeholder="Supplier Sayur Maju" 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-picName">Nama PIC</Label>
              <Input 
                id="vendor-picName" 
                value={newVendorData.picName}
                onChange={(e) => setNewVendorData({...newVendorData, picName: e.target.value})}
                placeholder="Pak Budi" 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-phone">No. Telepon / WA</Label>
              <Input 
                id="vendor-phone" 
                value={newVendorData.phone}
                onChange={(e) => setNewVendorData({...newVendorData, phone: e.target.value})}
                placeholder="0812345678" 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-address">Alamat</Label>
              <Input 
                id="vendor-address" 
                value={newVendorData.address}
                onChange={(e) => setNewVendorData({...newVendorData, address: e.target.value})}
                placeholder="Pasar Induk Kramat Jati" 
              />
            </div>
            
            <div className="flex items-center gap-2 pt-2">
              <Checkbox 
                id="vendor-isTempo" 
                checked={newVendorData.isTempo} 
                onCheckedChange={(checked) => setNewVendorData({...newVendorData, isTempo: !!checked})}
              />
              <Label htmlFor="vendor-isTempo" className="cursor-pointer">Pembayaran Tempo</Label>
            </div>

            {newVendorData.isTempo && (
              <div className="grid gap-2">
                <Label htmlFor="vendor-paymentTermDays">Jatuh Tempo (Hari)</Label>
                <Input 
                  id="vendor-paymentTermDays" 
                  type="number"
                  value={newVendorData.paymentTermDays}
                  onChange={(e) => setNewVendorData({...newVendorData, paymentTermDays: parseInt(e.target.value) || 0})}
                  placeholder="14" 
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddVendorOpen(false)}>Batal</Button>
            <Button onClick={handleSaveVendor}>Simpan Vendor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

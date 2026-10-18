"use client"

import { useAppStore } from "@/lib/store"
import { groupOrdersByDeliveryDate } from "@/lib/po-grouping"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ShoppingBasket, RefreshCw, Printer, Plus, Search, Check, ChevronsUpDown, Trash2, FileText, X, Download, Loader2, CheckCircle2, Store, Carrot, Apple, Laptop, ShoppingCart, Warehouse, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import Link from "next/link"
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
import { executePurchaseCommand, type PurchaseCommand } from "@/lib/purchase-command"
import { warehouseReservationDetails } from "@/lib/purchase-plan"
import { shoppingQuantities, shoppingDocumentItems } from "@/lib/shopping-quantities"
import { qtyOwed } from "@/lib/backorder"
import GlobalUndoButton from "@/components/global-undo-button"
import { PdfCanvasPreview } from "@/components/pdf-canvas-preview"

type ShoppingListDocumentItem = {
  productId: string
  productName: string
  skuCode: string
  uom?: string
  totalQty: number
  estimatedPrice: number
  sellPrice: number
  purchaseMethod: 'Pasar' | 'Online' | 'Vendor' | 'Dropship'
  paymentMethod?: 'Cash' | 'Tempo' | 'Transfer'
  salesOrderId?: string
  vendorId?: string
  vendorName?: string
}
type ShoppingRequirementItem = ShoppingListDocumentItem & { kebutuhan: number; fromStock?: boolean }

const LOKASI_LABEL: Record<string, string> = { Pasar: 'Pasar', Online: 'Beli Online', Vendor: 'Vendor' }
const METODE_BAYAR_LABEL: Record<string, string> = { Cash: 'Cash', Tempo: 'Tempo', Transfer: 'Transfer' }

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
  const deletePurchase = useAppStore(state => state.deletePurchase)
  const purchaseRequests = useAppStore(state => state.purchaseRequests) || []
  const deliveries = useAppStore(state=>state.deliveries)
  const stockMovements = useAppStore(state => state.stockMovements)
  const rejectedItems = useAppStore(state => state.rejectedItems) || []

  const [isLoading, setIsLoading] = useState(false)
  const [isDeletingPurchase, setIsDeletingPurchase] = useState<string | null>(null)
  const [selectedHistoryPurchaseId, setSelectedHistoryPurchaseId] = useState<string | null>(null)


  const [manualItems, setManualItems] = useState<Array<{id: string, productId: string, qty: number, price: number, source: 'manual' | 'susulan'}>>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = JSON.parse(localStorage.getItem('shopping_manualItems') || '[]')
      // Older entries had no `source`; default them to 'manual'.
      return raw.map((it: any) => ({ ...it, source: it.source === 'susulan' ? 'susulan' : 'manual' }))
    } catch { return [] }
  })
  const [customPrices, setCustomPrices] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {}
    try { return JSON.parse(localStorage.getItem('shopping_customPrices_v2') || '{}') } catch { return {} }
  })
  const [vendorAssignments, setVendorAssignments] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    try { return JSON.parse(localStorage.getItem('shopping_vendorAssignments_v2') || '{}') } catch { return {} }
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
    try { return new Set(JSON.parse(localStorage.getItem('shopping_onlineProductIds_v2') || '[]')) } catch { return new Set() }
  })
  const [vendorProductIds, setVendorProductIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('shopping_vendorProductIds_v2') || '[]')) } catch { return new Set() }
  })
  // Baris yang diantar vendor langsung ke klien — tidak lewat gudang sama sekali.
  const [dropshipProductIds, setDropshipProductIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('shopping_dropshipProductIds_v2') || '[]')) } catch { return new Set() }
  })
  // Metode bayar per baris — independen dari lokasi ambil barang. Default Cash bila belum di-set.
  const [paymentByProduct, setPaymentByProduct] = useState<Record<string, 'Cash' | 'Tempo' | 'Transfer'>>(() => {
    if (typeof window === 'undefined') return {}
    try { return JSON.parse(localStorage.getItem('shopping_paymentByProduct_v2') || '{}') } catch { return {} }
  })
  // Rows fulfilled from warehouse stock (booking) — excluded from the buy list
  const [pendingCompile, setPendingCompile] = useState<PurchaseCommand | null>(null)
  const [stockBookedProductIds, setStockBookedProductIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('shopping_stockBookedProductIds_v2') || '[]')) } catch { return new Set() }
  })
  const [manualPurchaseMethod, setManualPurchaseMethod] = useState<'Pasar' | 'Online'>('Pasar')
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
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())

  // Persist state to localStorage on change
  useEffect(() => { localStorage.setItem('shopping_manualItems', JSON.stringify(manualItems)) }, [manualItems])
  useEffect(() => { localStorage.setItem('shopping_customPrices_v2', JSON.stringify(customPrices)) }, [customPrices])
  useEffect(() => { localStorage.setItem('shopping_customQtys', JSON.stringify(customQtys)) }, [customQtys])
  useEffect(() => { localStorage.setItem('shopping_compiledRejectIds', JSON.stringify(Array.from(compiledRejectIds))) }, [compiledRejectIds])
  useEffect(() => { localStorage.setItem('shopping_vendorAssignments_v2', JSON.stringify(vendorAssignments)) }, [vendorAssignments])
  useEffect(() => { localStorage.setItem('shopping_onlineProductIds_v2', JSON.stringify(Array.from(onlineProductIds))) }, [onlineProductIds])
  useEffect(() => { localStorage.setItem('shopping_vendorProductIds_v2', JSON.stringify(Array.from(vendorProductIds))) }, [vendorProductIds])
  useEffect(() => { localStorage.setItem('shopping_dropshipProductIds_v2', JSON.stringify(Array.from(dropshipProductIds))) }, [dropshipProductIds])
  useEffect(() => { localStorage.setItem('shopping_paymentByProduct_v2', JSON.stringify(paymentByProduct)) }, [paymentByProduct])
  useEffect(() => { localStorage.setItem('shopping_stockBookedProductIds_v2', JSON.stringify(Array.from(stockBookedProductIds))) }, [stockBookedProductIds])
  useEffect(() => { localStorage.setItem('shopping_filterDeliveryDate', filterDeliveryDate) }, [filterDeliveryDate])
  useEffect(() => { localStorage.setItem('shopping_lastGeneratedDoc', JSON.stringify(lastGeneratedDoc)) }, [lastGeneratedDoc])

  // --- Draft rencana belanja: localStorage di atas cuma cache biar halaman
  // langsung tampil; sumber kebenarannya baris `shopping_draft` di database,
  // supaya Finance (dan Admin PO di laptop lain) lihat rencana yang sama dan
  // rencananya tidak hilang kalau browser dibersihkan.
  const [draftLoaded, setDraftLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/shopping-draft', { cache: 'no-store' })
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (cancelled) return
        const d = json?.draft
        if (d && typeof d === 'object') {
          if (Array.isArray(d.manualItems)) {
            setManualItems(d.manualItems.map((it: { source?: string }) => ({
              ...it,
              source: it.source === 'susulan' ? 'susulan' : 'manual'
            } as { id: string, productId: string, qty: number, price: number, source: 'manual' | 'susulan' })))
          }
          if (d.customPrices) setCustomPrices(d.customPrices)
          if (d.customQtys) setCustomQtys(d.customQtys)
          if (d.vendorAssignments) setVendorAssignments(d.vendorAssignments)
          if (d.paymentByProduct) setPaymentByProduct(d.paymentByProduct)
          if (Array.isArray(d.onlineProductIds)) setOnlineProductIds(new Set(d.onlineProductIds))
          if (Array.isArray(d.vendorProductIds)) setVendorProductIds(new Set(d.vendorProductIds))
          if (Array.isArray(d.dropshipProductIds)) setDropshipProductIds(new Set(d.dropshipProductIds))
          if (Array.isArray(d.stockBookedProductIds)) setStockBookedProductIds(new Set(d.stockBookedProductIds))
          if (Array.isArray(d.compiledRejectIds)) setCompiledRejectIds(new Set(d.compiledRejectIds))
        }
      })
      .catch(() => { /* offline: jalan pakai cache localStorage */ })
      .finally(() => { if (!cancelled) setDraftLoaded(true) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    // Jangan menimpa draft server sebelum salinannya selesai dimuat.
    if (!draftLoaded) return
    const draft = {
      manualItems,
      customPrices,
      customQtys,
      vendorAssignments,
      paymentByProduct,
      onlineProductIds: Array.from(onlineProductIds),
      vendorProductIds: Array.from(vendorProductIds),
      dropshipProductIds: Array.from(dropshipProductIds),
      stockBookedProductIds: Array.from(stockBookedProductIds),
      compiledRejectIds: Array.from(compiledRejectIds),
    }
    // ponytail: debounce sederhana, last-write-wins. Kalau dua Admin PO menyusun
    // daftar bersamaan, yang menyimpan terakhir menang — pecah drafnya per user
    // (lihat migrasi) kalau itu jadi masalah nyata.
    const timer = setTimeout(() => {
      fetch('/api/shopping-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft, updatedBy: currentUser?.id })
      }).catch(() => { /* offline: localStorage sudah menyimpan */ })
    }, 800)
    return () => clearTimeout(timer)
  }, [draftLoaded, manualItems, customPrices, customQtys, vendorAssignments, paymentByProduct,
      onlineProductIds, vendorProductIds, dropshipProductIds, stockBookedProductIds, compiledRejectIds,
      currentUser?.id])

  // State Snapshot history for undoing actions
  const [history, setHistory] = useState<Array<{
    manualItems: Array<{id: string, productId: string, qty: number, price: number, source: 'manual' | 'susulan'}>;
    customPrices: Record<string, number>;
    customQtys: Record<string, number>;
    vendorAssignments: Record<string, string>;
    onlineProductIds: Set<string>;
    vendorProductIds: Set<string>;
    paymentByProduct: Record<string, 'Cash' | 'Tempo' | 'Transfer'>;
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
        vendorProductIds: new Set(vendorProductIds),
        paymentByProduct: { ...paymentByProduct },
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
          setVendorProductIds(last.vendorProductIds)
          setPaymentByProduct(last.paymentByProduct)
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

  // Satu baris daftar belanja = satu SKU untuk satu PO. Vendor, harga beli, lokasi ambil
  // dan metode bayar dulu disimpan per `productId` saja, jadi kalau dua PO memesan SKU yang
  // sama, setelan baris kedua menimpa baris pertama diam-diam (set Tempo di PO A, lalu Cash
  // di PO B → dua-duanya jadi Cash). Semua map itu sekarang di-key per baris.
  const rowKey = (row: { productId: string; salesOrderId?: string }) =>
    `${row.productId}::${row.salesOrderId || ''}`




  // Vendor mengantar langsung ke klien. Hanya untuk baris yang terikat sebuah PO —
  // baris stok manual tidak punya tujuan pengiriman. Uang tunai tidak berlaku:
  // tidak ada orang kita di lokasi serah terima, jadi naikkan Cash ke Transfer.


  const resetPurchaseQuantity = (id: string) => {
    saveToHistory()
    setCustomQtys(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const toggleSelectItem = (key: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Assign the chosen vendor to all checked items at once.

  // Quantity already reserved (booked) against warehouse stock from prior bookings.
  // Used to compute available-to-promise stock = currentStock - alreadyBooked.
  const warehouseStock = useMemo(
    () => {
      const details = warehouseReservationDetails(salesOrderItems, salesOrders, deliveries)
      const totals: Record<string, number> = {}
      const owners: Record<string, typeof details> = {}
      for (const detail of details) {
        totals[detail.productId] = (totals[detail.productId] || 0) + detail.quantity
        if (detail.quantity > 0) (owners[detail.productId] ||= []).push(detail)
      }
      return { totals, owners }
    },
    [salesOrderItems, salesOrders, deliveries],
  )
  const bookedQtyByProduct = warehouseStock.totals

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
      //
      // "Kurang Kirim" = PO yang sudah dikirim sebagian dan sisanya masih terutang ke
      // klien. Dulu dua syarat di bawah sama-sama menolaknya (statusnya bukan
      // Draft/Belanja, DAN dia sudah pernah masuk dokumen belanja ronde pertama), jadi
      // sisa pesanan tidak pernah muncul di layar belanja siapa pun — pesan "masuk
      // antrean susulan" di serah terima tidak menuju ke mana-mana. Gudang sudah siap
      // menerimanya (QC mengizinkan alokasi ke PO berstatus ini); yang ketutup cuma
      // pintu belanjanya.
      .filter(so =>
        so.status === 'Kurang Kirim' ||
        ((so.status === 'Draft' || so.status === 'Belanja') && !so.shoppingListCompiledAt))
      .filter(so => !filterDeliveryDate || toDateInputValue(so.targetDeliveryDate) === filterDeliveryDate)
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
  }, [salesOrders, filterDeliveryDate])
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
    // Yang dibelanjakan adalah sisa yang masih terutang ke klien, bukan jumlah pesanan
    // awal. Untuk PO baru keduanya sama (belum ada yang dikirim); untuk PO Kurang Kirim
    // inilah yang membuat ronde susulan membeli 15 Kg, bukan mengulang 80 Kg.
    ...activeSOItemIds.map(item => {
      const product = products.find(p => p.id === item.productId);
      return {
        productId: item.productId,
        qty: qtyOwed(item),
        buyPrice: item.estimatedHpp !== undefined ? item.estimatedHpp : (product?.basePrice || 0),
        sellPrice: item.unitPrice,
        salesOrderId: item.salesOrderId // Extract the SO ID
      }
    }).filter(r => r.qty > 0),
    ...manualItems.map(item => ({ 
      productId: item.productId, 
      qty: item.qty, 
      buyPrice: item.price,
      sellPrice: 0,
      salesOrderId: undefined
    }))
  ]

  const rawConsolidatedList = allRequirementItems.reduce<ShoppingRequirementItem[]>((acc, curr) => {
    const existing = acc.find(item => item.productId === curr.productId && item.salesOrderId === curr.salesOrderId)
    
    if (existing) {
      existing.kebutuhan += curr.qty
      if (curr.sellPrice > existing.sellPrice) {
        existing.sellPrice = curr.sellPrice
      }
    } else {
      const product = products.find(p => p.id === curr.productId)
      if (product) {
        const key = rowKey(curr)
        const customPrice = customPrices[key]
        const vId = vendorAssignments[key] || product.defaultVendorId || undefined
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
          purchaseMethod: dropshipProductIds.has(key) ? 'Dropship'
            : vendorProductIds.has(key) ? 'Vendor'
            : onlineProductIds.has(key) ? 'Online'
            : 'Pasar',
          paymentMethod: paymentByProduct[key] || 'Cash',
          salesOrderId: curr.salesOrderId,
          vendorId: vId,
          vendorName: vName,
          fromStock: stockBookedProductIds.has(key)
        })
      }
    }
    return acc
  }, [])

  const consolidatedList = useMemo(() => {
    const onHand = Object.fromEntries(products.map(p => [p.id, Math.max(0, p.currentStock || 0)]))
    // Current-round QC allocations and warehouse reservations are both owned by the PO.
    const reserved = bookedQtyByProduct
    const sourced: Record<string, number> = {}
    for (const row of purchaseItems) {
      if (row.isQCed) continue
      const key = `${row.productId}_${row.salesOrderId || 'manual'}`
      sourced[key] = (sourced[key] || 0) + Math.max(0, Number(row.qtyTarget || 0) - Number(row.qcProcessedQty || 0))
    }
    for (const row of salesOrderItems) {
      const key = `${row.productId}_${row.salesOrderId}`
      sourced[key] = (sourced[key] || 0) + Math.max(0, Number(row.qtyFinal || 0))
    }
    const demand = rawConsolidatedList.map(item => ({ ...item, id: `${item.productId}_${item.salesOrderId || 'manual'}`, quantity: item.kebutuhan }))
    return shoppingQuantities(demand, onHand, reserved, sourced, customQtys)
  }, [rawConsolidatedList, products, bookedQtyByProduct, purchaseItems, salesOrders, salesOrderItems, customQtys])


  const handleAddManualItem = () => {
    if (!selectedProductId || manualQty <= 0) {
      toast.error("Pilih barang dan masukkan jumlah yang valid.")
      return
    }

    setManualItems(prev => [
      ...prev,
      { id: uuidv4(), productId: selectedProductId, qty: manualQty, price: manualPrice, source: 'manual' }
    ])

    // Item manual tidak terikat PO, jadi kunci barisnya productId dengan bagian PO kosong.
    const manualKey = rowKey({ productId: selectedProductId })
    if (manualPurchaseMethod === 'Online') {
      setOnlineProductIds(prev => new Set(prev).add(manualKey))
    } else {
      setOnlineProductIds(prev => {
        const next = new Set(prev)
        next.delete(manualKey)
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
      { id: manualId, productId: reject.productId, qty: reject.qty, price: product?.basePrice || 0, source: 'susulan' }
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
    if (!pendingCompile && consolidatedList.some(row=>!Number.isFinite(row.totalQty) || row.totalQty < 0)) return toast.error('Jumlah beli harus angka valid dan tidak negatif.')
    if (!pendingCompile && consolidatedList.length === 0) {
      toast.error("Pilih minimal 1 PO atau tambahkan item stok dulu.")
      return
    }

    // Penjaga "dropship wajib punya vendor" pindah ke layar Rencana Pembelian, karena
    // di situlah jalur beli dan vendornya sekarang diputuskan. Di sini belum ada yang
    // bisa dicek — dokumennya memang belum punya rencana.

    let linkedPR = null
    if (selectedPRId && !pendingCompile) {
      linkedPR = purchaseRequests.find(pr => pr.id === selectedPRId)
      if (!linkedPR || linkedPR.status !== 'Approved') {
        toast.error('PR yang dipilih belum berstatus Approved.')
        return
      }
    }

    // Items fulfilled from warehouse stock are booked (reserved), NOT bought.
    const buyItems = consolidatedList.filter(item => item.totalQty > 0)
    const stockItems = consolidatedList.filter(item => item.salesOrderId && item.allocatedStock > 0)
    const documentItems = shoppingDocumentItems(consolidatedList)
    const documentId = uuidv4()
    const generatedAt = new Date().toISOString()
    const advanceCode = `ADV-${toDateInputValue(generatedAt).replaceAll('-', '')}-${String(purchases.length + 1).padStart(3, '0')}`
    setIsLoading(true)
    const loadingId = toast.loading("Membuat dokumen list belanja...")
    try {
      const command:PurchaseCommand = pendingCompile || {
        eventId:documentId,stage:'compile',sourceId:documentId,payload:{
          occurredAt:generatedAt,advanceCode,purchaseRequestId:selectedPRId || '',salesOrderIds:selectedSOs.map(s=>s.id),
          items:documentItems.map(item=>({id:uuidv4(),productId:item.productId,salesOrderId:item.salesOrderId,qtyTarget:item.totalQty,estimatedUnitPrice:item.estimatedPrice})),
          reservations:stockItems.map(item=>({salesOrderItemId:salesOrderItems.find(r=>r.salesOrderId===item.salesOrderId && r.productId===item.productId)?.id,qty:item.allocatedStock})),
          rejectedIds:[...compiledRejectIds],
        },
      }
      setPendingCompile(command)
      await executePurchaseCommand(useAppStore.getState,command)
      setPendingCompile(null)
      setLastGeneratedDoc({purchaseId:command.sourceId,generatedAt,items:documentItems})

      // Reset local compiledRejectIds state
      setCompiledRejectIds(new Set())
      localStorage.setItem('shopping_compiledRejectIds', '[]')

      // Manual + susulan stock items were folded into this document too, so clear
      // them like the PO items (which drop out via shoppingListCompiledAt). The
      // persist effect syncs localStorage.
      setManualItems([])
      setCustomQtys(prev => {
        const next = { ...prev }
        consolidatedList.forEach(item => delete next[item.id])
        return next
      })

      setSelectedPRId('')
      // Clear "from stock" selections that were just processed into bookings.
      if (stockItems.length > 0) {
        setStockBookedProductIds(prev => {
          const next = new Set(prev)
          stockItems.forEach(it => next.delete(rowKey(it)))
          return next
        })
      }
      // Baris dropship sudah jadi purchase item; setelannya tidak boleh menempel
      // ke putaran belanja berikutnya.
      const dropshipKeys = documentItems.filter(i => i.purchaseMethod === 'Dropship').map(i => rowKey(i))
      if (dropshipKeys.length > 0) {
        setDropshipProductIds(prev => {
          const next = new Set(prev)
          dropshipKeys.forEach(k => next.delete(k))
          return next
        })
      }
      toast.success(
        documentItems.length === 0
          ? 'Stok sudah direservasi. PO siap untuk packing; buka Operasi barang.'
          : stockItems.length > 0
          ? `Dokumen dibuat. ${buyItems.length} item dibeli, ${stockItems.length} item dibooking dari gudang. Kirim ke Finance dulu — daftar belanjanya bisa dicetak setelah vendornya ditentukan.`
          : "Dokumen dibuat. Kirim ke Finance dulu — daftar belanjanya bisa dicetak setelah vendornya ditentukan.",
        { id: loadingId }
      )
    } catch (e) {
      toast.error(`Gagal buat dokumen: ${e instanceof Error ? e.message : String(e)}`, { id: loadingId })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeletePurchase = async (purchaseId: string) => {
    if (isDeletingPurchase) return
    const purchase = purchases.find(p => p.id === purchaseId)
    if (!purchase) return toast.error("Dokumen tidak ditemukan.")
    if (purchase.status !== 'Menunggu Rencana') return toast.error('Rencana sudah dilepas; dokumen harus dipertahankan.')
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

  /**
   * Daftar belanja yang dicetak selalu dibaca dari dokumen yang TERSIMPAN, bukan dari
   * pilihan lokal di layar ini. Sejak rencana pembelian pindah ke Finance, vendor dan
   * cara bayar baru ada setelah Sifa melepas dokumennya — lembar yang dicetak sebelum
   * itu isinya tebakan Admin PO, dan itu yang dibawa orang ke pasar.
   */
  const savedDocumentItems = (purchaseId?: string | null): ShoppingListDocumentItem[] => {
    if (!purchaseId) return []
    return purchaseItems.filter(pi => pi.purchaseId === purchaseId).map(i => {
      const product = products.find(p => p.id === i.productId)
      // Vendor pilihan Finance ditulis ke plannedVendorId; vendorId baru terisi setelah
      // barangnya benar-benar dibeli. Membaca vendorId saja bikin lembar yang dibawa ke
      // pasar tertulis "Tanpa Vendor" padahal Finance sudah menunjuk satu.
      const vendorId = i.vendorId || i.plannedVendorId
      return {
        productId: i.productId,
        productName: product?.name || i.productId,
        skuCode: product?.skuCode || '',
        uom: product?.uom,
        totalQty: i.qtyTarget,
        estimatedPrice: i.estimatedUnitPrice,
        sellPrice: product?.sellingPrice || 0,
        purchaseMethod: i.purchaseMethod as 'Pasar' | 'Online' | 'Vendor',
        paymentMethod: i.paymentMethod,
        vendorId,
        vendorName: vendors.find(v => v.id === vendorId)?.companyName,
      }
    })
  }

  const printSavedDocument = (purchaseId: string, titleOverride?: string) => {
    handleOpenPdfPreview(
      savedDocumentItems(purchaseId).filter(item => item.purchaseMethod === 'Pasar'),
      titleOverride,
    )
  }

  /** Dokumen yang rencananya belum diisi Finance belum boleh dicetak. */
  const belumDirencanakan = (purchaseId?: string | null) =>
    !purchaseId || purchases.find(p => p.id === purchaseId)?.status === 'Menunggu Rencana'

  // Ke mana dokumen yang sudah dicompile itu pergi.
  //
  // Begitu dicompile, PO-nya hilang dari layar ini — disengaja, supaya tidak dibeli dua
  // kali. Tapi selama tidak ada yang menyebut perginya ke mana, layar kosong ini terbaca
  // "tidak ada apa-apa" padahal pekerjaannya sedang mengantre di meja orang lain.
  const dokumenBerjalan = useMemo(() => ({
    nungguFinance: purchases.filter(p => p.status === 'Menunggu Rencana').length,
    siapCetak: purchases.filter(p => p.status === 'Siap Cetak').length,
    diSourcing: purchases.filter(p => p.status === 'Pending' || p.status === 'Belanja').length,
  }), [purchases])

  /** Papan penunjuk arah ke meja berikutnya. */
  const PenunjukLangkahBerikutnya = ({
    nungguFinance,
    siapCetak,
    diSourcing,
  }: { nungguFinance: number; siapCetak: number; diSourcing: number }) => {
    if (nungguFinance === 0 && siapCetak === 0 && diSourcing === 0) return null
    return (
      <div className="space-y-3 text-left">
        {nungguFinance > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-[11px] font-bold  text-amber-700">Menunggu Finance</p>
            <p className="mt-1 text-sm font-bold text-slate-800">
              {nungguFinance} dokumen belum ditentukan vendor & cara bayarnya.
            </p>
            <p className="mt-1 text-xs font-bold text-slate-500">
              Ini pekerjaan Finance. Tunggu sampai dikembalikan ke sini.
            </p>
          </div>
        )}
        {siapCetak > 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
            <p className="text-[11px] font-bold  text-emerald-700">Giliran lo lagi</p>
            <p className="mt-1 text-sm font-bold text-slate-800">
              {siapCetak} dokumen sudah direncanakan Finance dan menunggu disatukan & dicetak.
            </p>
            <Link
              href="/admin/konsolidasi-belanja"
              className="mt-3 inline-flex h-10 items-center rounded-xl bg-emerald-600 px-4 text-[11px] font-bold  text-white hover:bg-emerald-700"
            >
              Buka Konsolidasi Belanja
            </Link>
          </div>
        )}
        {diSourcing > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-bold  text-slate-500">Sudah di tim sourcing</p>
            <p className="mt-1 text-sm font-bold text-slate-700">
              {diSourcing} dokumen sedang dibelanjakan.
            </p>
          </div>
        )}
      </div>
    )
  }

  const handleOpenPdfPreview = (items: ShoppingListDocumentItem[], titleOverride?: string) => {
    const title = titleOverride || `Daftar_Belanja_${new Date().toISOString().slice(0, 10)}`
    setPdfPreview({
      title,
      url: generateShoppingListPDFDataUrl(items, titleOverride)
    })
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          {pendingCompile && <div role="alert" className="p-3 border border-amber-300 rounded">Kompilasi belum selesai. <Button disabled={isLoading} onClick={handleGenerateDocument}>Coba transaksi yang sama</Button></div>}
        <h2 className="text-2xl font-bold tracking-tight">Shopping Master List</h2>
          <p className="text-muted-foreground">Pilih PO mana saja, lalu compile jadi satu dokumen daftar belanja.</p>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1">
        <Card className="min-w-0">
          <CardHeader className="min-w-0 max-sm:px-4">
            <CardTitle className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center">
                <RefreshCw className="mr-2 h-5 w-5 shrink-0 text-emerald-500" />
                Auto-Consolidator
              </div>
              
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center [&>button]:h-auto [&>button]:min-h-11 [&>button]:w-full [&>button]:whitespace-normal sm:[&>button]:w-auto">
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
                                          <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0 rounded border border-amber-200">
                                            Patokan: {formatRupiah(product.weeklyPriceRange.min)} - {formatRupiah(product.weeklyPriceRange.max)}
                                          </span>
                                        ) : (
                                          <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0 rounded border border-amber-200">
                                            Patokan: {formatRupiah(product.basePrice)}
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[11px] text-slate-500">{product.skuCode} • Stok: {product.currentStock} {product.uom}</span>
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
                         <Label className="text-xs font-bold text-slate-500 ">Metode Belanja</Label>
                         <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                            <button 
                               className={cn(
                                  "flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all",
                                  manualPurchaseMethod === 'Pasar' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:bg-card"
                               )}
                               onClick={() => setManualPurchaseMethod('Pasar')}
                            >
                               <div className="relative flex items-center justify-center w-4 h-4"><Store className="w-4 h-4" /><div className="absolute -bottom-1 -right-1 flex bg-card rounded-full"><Carrot className="w-2 h-2 -mr-[1px]" /><Apple className="w-2 h-2 text-rose-500" /></div></div> PASAR
                            </button>
                            <button 
                               className={cn(
                                  "flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all",
                                  manualPurchaseMethod === 'Online' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:bg-card"
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
          <CardContent className="min-w-0 space-y-5 max-sm:px-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="min-w-0 lg:col-span-2">
                <div className="rounded-xl border border-slate-100 bg-card p-4 shadow-sm">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="min-w-0 lg:flex-1">
                      <div className="grid min-w-0 gap-2">
                        <Label htmlFor="filter-delivery-date" className="text-[11px] font-bold  text-slate-400">
                          Filter Tanggal Kirim
                        </Label>
                        <Input
                          id="filter-delivery-date"
                          type="date"
                          value={filterDeliveryDate}
                          onChange={(e) => setFilterDeliveryDate(e.target.value)}
                          className="h-11 w-full rounded-xl border-slate-200 font-bold text-slate-700 lg:w-[200px]"
                        />
                      </div>
                    </div>
                    <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>button]:h-auto [&>button]:min-h-11 [&>button]:min-w-0 [&>button]:whitespace-normal [&>button]:px-2 [&>button:first-child]:col-span-2">
                      <Button
                        variant="ghost"
                        className="h-10 rounded-xl text-[11px] font-bold  text-slate-400"
                        disabled={!filterDeliveryDate}
                        onClick={() => { setFilterDeliveryDate('') }}
                      >
                        Semua Tanggal
                      </Button>
                      <Button
                        data-tour="sl-picker"
                        variant="outline"
                        className="h-10 rounded-xl text-[11px] font-bold "
                        disabled={candidateSOs.length === 0}
                        onClick={() => setSelectedSOIds(new Set(candidateSOs.map(so => so.id)))}
                      >
                        Pilih Semua
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-10 rounded-xl text-[11px] font-bold  text-slate-400"
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
                        {(dokumenBerjalan.nungguFinance + dokumenBerjalan.diSourcing) > 0 && (
                          <span className="mt-1 block text-xs font-bold text-slate-500">
                            {dokumenBerjalan.nungguFinance + dokumenBerjalan.diSourcing} dokumen sudah dicompile dan sedang berjalan — lihat keterangannya di bawah.
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="max-h-[320px] overflow-auto divide-y divide-slate-100">
                        {groupOrdersByDeliveryDate(candidateSOs).map(grup => (
                        <div key={grup.tanggal || 'tanpa-tanggal'}>
                          {/* Yang menentukan satu dokumen belanja itu tanggal kirimnya,
                              bukan PO mana yang kebetulan tercentang. */}
                          <div className="flex items-center justify-between gap-3 bg-slate-100/80 px-4 py-2">
                            <span className="text-[11px] font-bold  text-slate-500">
                              Kirim {grup.label} · {grup.orders.length} PO
                            </span>
                            <button
                              type="button"
                              className="text-[11px] font-bold  text-emerald-600 hover:text-emerald-700"
                              onClick={() => setSelectedSOIds(prev => {
                                const ids = grup.orders.map(o => o.id)
                                const semua = ids.every(id => prev.has(id))
                                const next = new Set(prev)
                                ids.forEach(id => semua ? next.delete(id) : next.add(id))
                                return next
                              })}
                            >
                              {grup.orders.every(o => selectedSOIds.has(o.id)) ? 'Kosongkan tanggal ini' : 'Pilih tanggal ini'}
                            </button>
                          </div>
                        {grup.orders.map(so => {
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
                                  <span className="text-sm font-bold text-slate-800">{so.poNumber}</span>
                                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold  text-emerald-600 shadow-sm">
                                    {items.length} item
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold  text-slate-500">
                                    {so.status}
                                  </span>
                                  {so.shoppingListCompiledAt && (
                                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold  text-white shadow-sm">
                                      Sudah Masuk List
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 truncate text-xs font-bold text-slate-500">
                                  {client?.companyName || 'Unknown Client'} • PO {toDateInputValue(so.orderDate)} • Kirim {toDateInputValue(so.targetDeliveryDate)} • {formatRupiah(total)}
                                </p>
                                {so.shoppingListCompiledAt && (
                                  <p className="mt-1 text-[11px] font-bold  text-emerald-600">
                                    Dicompile {new Date(so.shoppingListCompiledAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                                  </p>
                                )}
                              </div>
                            </label>
                          )
                        })}
                        </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="min-w-0 lg:col-span-1">
                <div className="rounded-xl border border-slate-100 bg-card p-4 shadow-sm flex flex-col h-full">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs">
                        {pendingRejects.length}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold  text-slate-800 dark:text-slate-200">
                          Susulan (Reject & Retur)
                        </h4>
                        <p className="text-[11px] text-slate-500 font-bold">
                          Barang tidak lolos QC / Retur klien
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 rounded-lg"
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
                          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 ">
                            Semua Bersih
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">
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
                                      "inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold  mb-1.5",
                                      isQC ? "bg-rose-50 text-rose-600 border border-rose-100" :
                                      isReturn ? "bg-amber-50 text-amber-600 border border-amber-100" :
                                      "bg-blue-50 text-blue-600 border border-blue-100"
                                    )}>
                                      {sourceLabel}
                                    </span>
                                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                      {product?.name || 'Unknown Product'}
                                    </h5>
                                    <p className="text-[11px] text-slate-400 font-bold mt-0.5 truncate">
                                      {product?.skuCode || 'No SKU'}
                                    </p>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                      {item.qty} {product?.uom || 'pcs'}
                                    </span>
                                    <p className="text-[11px] text-slate-400 font-bold mt-0.5">
                                      {new Date(item.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-50">
                                  <p className="text-[11px] text-slate-500 font-bold italic truncate max-w-[150px]" title={item.reason}>
                                    "{item.reason || 'Tanpa keterangan'}"
                                  </p>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[11px] font-bold  text-emerald-600 hover:text-white hover:bg-emerald-600 border-emerald-100 hover:border-emerald-600 rounded-lg gap-1 shrink-0"
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
              <div className="mx-auto max-w-md py-8 text-center text-slate-500">
                <p className="font-bold">Tidak ada PO yang menunggu disatukan.</p>
                <div className="mt-4">
                  <PenunjukLangkahBerikutnya {...dokumenBerjalan} />
                </div>
              </div>
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
                        <h4 className="text-xs font-bold  text-slate-800">
                          Susulan Retur & Reject QC Pending
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Ada {pendingRejects.length} barang retur/reject yang belum dimasukkan ke list belanja.
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px]  rounded-xl"
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
                            price: product?.basePrice || 0,
                            source: 'susulan'
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

                <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-slate-600">
                  Qty Beli otomatis mengisi kekurangan setelah stok gudang yang masih bebas diperhitungkan. Bisa diedit untuk membeli tambahan stok; gunakan Otomatis untuk menghitung ulang.
                </p>

                {/* Pemilihan vendor dihapus dari layar ini (23 Agu 2026). Yang tahu
                    vendor dan harganya adalah Finance, dan sejak 16 Agu pilihan di sini
                    memang tidak pernah tersimpan — dibuang saat dokumen dibuat. Layar ini
                    sekarang murni: PO mana, barang apa, berapa banyak, mana yang diambil
                    dari gudang. Vendor, jalur beli, cara bayar dan harga diisi Finance di
                    Rencana Pembelian. */}

                <div className="rounded-md border bg-slate-50 dark:bg-slate-900 shadow-inner">

                  {/* Dikelompokkan per vendor sampai 23 Agu 2026. Vendornya diputuskan
                      Finance sekarang, jadi di layar ini semua barang selalu jatuh ke satu
                      kelompok "belum ada vendor" — judul kelompok yang tersisa cuma
                      membingungkan. Daftarnya jadi satu, urut apa adanya. */}
                  {(() => {
                    return (
                      <Table className="min-w-[1000px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[70px]">SKU</TableHead>
                            <TableHead className="min-w-[200px]">Product</TableHead>
                            <TableHead className="w-[85px] text-right">Kebutuhan</TableHead>
                            <TableHead className="w-[90px] text-right">Stok Gudang</TableHead>
                            <TableHead className="w-[95px] text-right">Qty Beli</TableHead>
                            <TableHead className="w-[110px] text-right">Sell Price</TableHead>
                            <TableHead className="w-[140px] text-right">Est. Buy</TableHead>
                            <TableHead className="w-[110px] text-right">Subtotal</TableHead>
                            <TableHead className="w-[140px] text-center">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[consolidatedList].map((items, gIdx) => {
                            if (items.length === 0) return null;
                            return (
                              <React.Fragment key={gIdx}>
                                {items.map((item, idx) => {
                                  const product = products.find(p => p.id === item.productId);
                                  return (
                                    <TableRow key={idx} className={cn(selectedItemIds.has(rowKey(item)) && "bg-emerald-50/40")}>
                                      <TableCell className="text-xs text-slate-500 truncate">
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            className="w-4 h-4 accent-emerald-600 shrink-0"
                                            checked={selectedItemIds.has(rowKey(item))}
                                            onChange={() => toggleSelectItem(rowKey(item))}
                                          />
                                          <span className="truncate">{item.skuCode}</span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="font-medium leading-tight">
                                        <div className="flex flex-col gap-1 w-full max-w-[200px] whitespace-normal">
                                          <span className="text-xs">{item.productName}</span>
                                          {(() => {
                                            const cat = item.salesOrderId
                                              ? { label: 'PO', cls: 'bg-indigo-100 text-indigo-700' }
                                              : manualItems.find(mi => mi.productId === item.productId)?.source === 'susulan'
                                                ? { label: 'Susulan', cls: 'bg-orange-100 text-orange-700' }
                                                : { label: 'Manual', cls: 'bg-slate-200 text-slate-600' }
                                            return (
                                              <span className={cn("w-fit text-[11px] font-bold  px-1.5 py-0.5 rounded", cat.cls)}>
                                                {cat.label}
                                              </span>
                                            )
                                          })()}

                                          {product?.weeklyPriceRange && product.weeklyPriceRange.min > 0 && product.weeklyPriceRange.max > 0 ? (
                                            <span className="text-[11px] font-bold text-amber-600 w-fit" title="Harga terendah-tertinggi minggu ini (Kamis-Rabu)">
                                              Patokan: {formatRupiah(product.weeklyPriceRange.min)} - {formatRupiah(product.weeklyPriceRange.max)}
                                            </span>
                                          ) : (
                                            <span className="text-[11px] font-bold text-amber-600 w-fit" title="Harga Acuan (Base Price)">
                                              Patokan: {formatRupiah(product?.basePrice || 0)}
                                            </span>
                                          )}
                                          {item.allocatedStock > 0 && (
                                            <span className="w-fit text-[11px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 bg-amber-100 text-amber-700">
                                              <Warehouse className="w-2.5 h-2.5" /> {item.allocatedStock} {item.uom} dari gudang
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right font-medium text-slate-600 pr-4">
                                        {item.kebutuhan}
                                      </TableCell>
                                      <TableCell className="text-right font-medium text-slate-500 pr-4">
                                        <div className="flex flex-col items-end gap-1 text-[11px]">
                                          <span>Fisik: {product?.currentStock || 0}</span>
                                          <span className="text-amber-700">Terikat PO: {bookedQtyByProduct[item.productId] || 0}</span>
                                          <span className="font-bold text-emerald-700">Bebas: {Math.max(0, (product?.currentStock || 0) - (bookedQtyByProduct[item.productId] || 0))}</span>
                                          {(warehouseStock.owners[item.productId] || []).length > 0 && (
                                            <details className="max-w-48 text-right">
                                              <summary className="cursor-pointer text-slate-500 underline">Lihat PO pemakai</summary>
                                              <ul className="mt-1 space-y-1 break-words text-slate-600">
                                                {warehouseStock.owners[item.productId].map(owner => (
                                                  <li key={owner.salesOrderItemId}>{owner.poNumber}: {owner.quantity} {item.uom} ({owner.status})</li>
                                                ))}
                                              </ul>
                                            </details>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right pr-4">
                                        <div className="flex flex-col items-end gap-1">
                                          <Input 
                                            type="number"
                                            aria-label={`Qty Beli ${item.productName}`}
                                            className="h-8 w-20 text-right text-xs font-bold border-slate-200"
                                            placeholder="0"
                                            min={0}
                                            step="any"
                                            value={item.totalQty}
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

                                          {item.stockPurchaseQty > 0 && (
                                            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded text-emerald-700 bg-emerald-50">
                                              Tambahan stok: {item.stockPurchaseQty} {item.uom}
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right pr-4">
                                         <div className="flex flex-col items-end">
                                            <span className="font-bold text-blue-600">{formatRupiah(item.sellPrice)}</span>
                                            {item.sellPrice > 0 && item.estimatedPrice > 0 && (
                                               <span className={cn(
                                                  "text-[11px] font-bold px-1 rounded",
                                                  item.sellPrice > item.estimatedPrice ? "text-emerald-500 bg-emerald-50" : "text-rose-500 bg-rose-50"
                                               )}>
                                                  {item.sellPrice > item.estimatedPrice ? 'Margin OK' : 'Low Margin!'}
                                               </span>
                                            )}
                                         </div>
                                      </TableCell>
                                      {/* Harga cuma ditampilkan di sini, tidak diketik. Yang tahu
                                          harga vendor dan harga pasar adalah Finance, dan angka itulah
                                          yang jadi uang tunai yang dia serahkan sendiri — jadi dia yang
                                          mengisinya, di Rencana Pembelian. */}
                                      <TableCell className="text-right text-slate-500 pr-4 text-xs font-bold">
                                         {formatRupiah(item.estimatedPrice)}
                                         <span className="block text-[11px] text-slate-400 font-bold">patokan</span>
                                      </TableCell>
                                      <TableCell className="text-right font-bold text-emerald-600 pr-4">{formatRupiah(item.estimatedPrice * item.totalQty)}</TableCell>
                                      <TableCell className="text-center">
                                         <div className="flex flex-wrap items-center justify-center gap-1 w-[140px]">
                                            {/* Jalur beli (Pasar / Online / Vendor / Ke Klien) dan cara
                                                bayar TIDAK lagi dipilih di sini. Sejak 16 Agu itu wewenang
                                                Finance di Rencana Pembelian — dan pilihan di layar ini tidak
                                                pernah tersimpan, jadi yang tersisa cuma kerja sia-sia dan
                                                kesan bahwa Admin PO yang memutuskan. Tombol Otomatis mengembalikan jumlah beli ke kekurangan stok. */}
                                            {/* Button Gudang */}
                                            <button
                                               onClick={() => resetPurchaseQuantity(item.id)}
                                               className={cn(
                                                  "px-2 py-1 text-[11px] font-bold uppercase rounded-md border transition-all",
                                                  item.fromStock
                                                     ? "bg-amber-100 border-amber-300 text-amber-700"
                                                     : "bg-slate-50 border-slate-200 text-slate-400"
                                               )}
                                               title="Hitung ulang Qty Beli dari kebutuhan dan stok bebas"
                                            >
                                               Otomatis
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
                                               className="p-1.5 rounded-md border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all"
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

                
                {/* PR Selector — opsional sebelum compile */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 mt-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-bold  text-slate-500">
                      Pilih Purchase Request (Opsional — Bisa diajukan otomatis)
                    </p>
                    {selectedPRId && (
                      <button
                        className="text-[11px] font-bold text-slate-400 hover:text-slate-600 underline"
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
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <p className="text-sm font-bold text-slate-800 leading-tight">{pr.title}</p>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {usageCount > 0 && (
                                    <span className="rounded-full bg-muted text-slate-600 px-2 py-0.5 text-[11px] font-bold ">
                                      {usageCount}× dipakai
                                    </span>
                                  )}
                                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold  text-white">
                                    Approved
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                <span className="text-[11px] font-bold text-slate-500">{pr.category}</span>
                                <span className="text-[11px] font-bold text-emerald-700">{formatRupiah(pr.amount)}</span>
                                {pr.approvedByCfo && (
                                  <span className="text-[11px] font-bold text-slate-400">CFO: {pr.approvedByCfo}</span>
                                )}
                                {pr.description && (
                                  <span className="text-[11px] text-slate-400 truncate max-w-[200px]" title={pr.description}>{pr.description}</span>
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
                  <Button data-tour="sl-generate" onClick={handleGenerateDocument} disabled={isLoading} className="min-h-11 w-full bg-emerald-600 hover:bg-emerald-700 shadow-md sm:w-auto">
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
                <FileText className="h-5 w-5" />
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
                    const sentToFinance = purchase.status !== 'Menunggu Rencana'
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
                            <span className="text-xs font-bold text-slate-700 group-hover:text-blue-700 transition-colors">{purchase.advanceCode || purchase.id.slice(0, 8)}</span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold  text-blue-600 shadow-sm border">
                              {items.length} item
                            </span>
                            {isSettled ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold  text-emerald-700">
                                ✓ Selesai
                              </span>
                            ) : hasBeenTransferred ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold  text-amber-700">
                                Dana Ditransfer
                              </span>
                            ) : sentToFinance ? (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold  text-blue-700">
                                Sudah Direncanakan
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold  text-slate-500">
                                Menunggu Rencana
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] font-bold text-slate-400">
                            {new Date(purchase.date).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })} • {formatRupiah(totalBudget)}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0 items-center">
                          <span className="text-[11px] font-bold  text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                            <Search className="w-3 h-3" /> Detail
                          </span>
                          {!hasBeenTransferred && !isSettled && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[11px] font-bold "
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
        <DialogContent className="max-w-[96vw] sm:max-w-[96vw] w-[96vw] h-[96vh] p-0 rounded-xl overflow-hidden border-none bg-slate-900 shadow-sm flex flex-col">
          <DialogHeader className="p-6 bg-slate-900 text-white flex flex-row items-center justify-between shrink-0 space-y-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold tracking-tight">Preview Daftar Belanja</DialogTitle>
                <p className="text-[11px] font-bold text-slate-400 ">Cek dokumen sebelum download atau print</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-slate-400 hover:bg-slate-700 hover:text-white"
              onClick={() => setPdfPreview(null)}
            >
              <X className="w-5 h-5" />
            </Button>
          </DialogHeader>
          <div className="flex-1 bg-slate-800 p-4 overflow-hidden">
            {pdfPreview && <PdfCanvasPreview url={pdfPreview.url} />}
          </div>
          <DialogFooter className="p-5 bg-slate-900 border-t border-border gap-3 sm:justify-between">
            <p className="text-[11px] font-bold  text-slate-500">
              File belum diunduh sampai klik Download.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="h-11 rounded-xl border-slate-700 bg-slate-800 text-white hover:bg-white hover:text-slate-900 font-bold  text-[11px]"
                onClick={() => {
                  if (!pdfPreview) return
                  const printWindow = window.open(pdfPreview.url, '_blank')
                  printWindow?.addEventListener('load', () => printWindow.print())
                }}
              >
                <Printer className="w-4 h-4 mr-2" /> Print
              </Button>
              <Button
                className="h-11 rounded-xl bg-white text-slate-900 hover:bg-slate-100 font-bold  text-[11px]"
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
                    <DialogTitle className="text-base font-bold tracking-tight">
                      Detail Dokumen Belanja #{histPurchase?.advanceCode || histPurchase?.id.slice(0, 8)}
                    </DialogTitle>
                    <p className="text-[11px] font-bold text-slate-400 ">
                      {histPurchase ? new Date(histPurchase.date).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }) : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold  text-blue-600 border border-blue-100">
                    {histItems.length} item
                  </span>
                  {histSettled ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold  text-emerald-700">✓ Selesai</span>
                  ) : histTransferred ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold  text-amber-700">Dana Ditransfer</span>
                  ) : histSentToFinance ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold  text-blue-700">Menunggu Finance</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold  text-slate-500">Draft</span>
                  )}
                  <span className="text-[11px] font-bold text-slate-700">Total: {formatRupiah(histTotal)}</span>
                </div>
              </DialogHeader>
              <div className="flex-1 overflow-auto min-h-0">
                {histItems.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-slate-400 text-sm font-bold">Tidak ada item dalam dokumen ini.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-[11px] font-bold  w-[80px]">SKU</TableHead>
                        <TableHead className="text-[11px] font-bold ">Nama Produk</TableHead>
                        <TableHead className="text-[11px] font-bold  text-right w-[80px]">Qty</TableHead>
                        <TableHead className="text-[11px] font-bold  text-right w-[120px]">Est. Harga</TableHead>
                        <TableHead className="text-[11px] font-bold  text-right w-[120px]">Subtotal</TableHead>
                        <TableHead className="text-[11px] font-bold  text-center w-[110px]">Lokasi · Bayar</TableHead>
                        <TableHead className="text-[11px] font-bold  w-[120px]">Vendor</TableHead>
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
                            <TableCell className="text-[11px] text-slate-400 font-bold">{prod?.skuCode || item.productId.slice(0, 8)}</TableCell>
                            <TableCell className="font-medium text-xs">{prod?.name || item.productId}</TableCell>
                            <TableCell className="text-right text-xs font-bold">{item.qtyTarget} {prod?.uom || ''}</TableCell>
                            <TableCell className="text-right text-xs">{formatRupiah(item.estimatedUnitPrice)}</TableCell>
                            <TableCell className="text-right text-xs font-bold text-emerald-600">{formatRupiah(item.estimatedUnitPrice * item.qtyTarget)}</TableCell>
                            <TableCell className="text-center">
                              <span className={cn("px-1.5 py-0.5 rounded text-[11px] font-bold uppercase border", methodColor)}>
                                {LOKASI_LABEL[item.purchaseMethod || ''] || item.purchaseMethod} · {METODE_BAYAR_LABEL[item.paymentMethod || ''] || item.paymentMethod || 'Cash'}
                              </span>
                            </TableCell>
                            <TableCell className="text-[11px] text-slate-500 font-bold">{vnd?.companyName || '—'}</TableCell>
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
                    className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-[11px] "
                    disabled={belumDirencanakan(histPurchase.id)}
                    title={belumDirencanakan(histPurchase.id)
                      ? 'Vendor dan cara bayarnya belum ditentukan Finance — lembar ini belum final.'
                      : undefined}
                    onClick={() => {
                      printSavedDocument(histPurchase.id, `DAFTAR BELANJA #${histPurchase.advanceCode || histPurchase.id.slice(0, 8)}`)
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

    </div>
  )
}

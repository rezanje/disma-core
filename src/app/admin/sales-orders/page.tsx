"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { cn, formatRupiah, formatNumber, parseNumber } from "@/lib/utils"
import { Plus, Trash2, ShoppingCart, Search, ChevronsUpDown, Check, Eye, FileText, Download, Loader2, X, Pencil } from "lucide-react"
import { v4 as uuidv4 } from "uuid"

const toDateInputValue = (date?: string) => {
  if (!date) return ""
  const isoDate = date.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (isoDate) return isoDate

  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return ""

  const year = parsed.getFullYear()
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0")
  const day = `${parsed.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import GlobalUndoButton from "@/components/global-undo-button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { STATUS_COLORS } from "@/lib/constants"
import { SalesOrderStatus, SalesOrderItem, SalesOrder } from "@/types"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { format } from "date-fns"
import { Printer } from "lucide-react"
import { toast } from "sonner"
import { generateDocumentNumber, updateProductPriceHistory } from "@/lib/accounting"
import { generateSuratJalan, generateBA } from "@/lib/pdf"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface LineItem {
  id: string
  productId: string
  productName: string
  qty: number
  unitPrice: number
  isCustomPrice?: boolean
  priceSource?: string
  estimatedHpp?: number
}

/**
 * Number input that keeps a local string buffer so the field can be cleared and
 * retyped freely (no forced "0" that traps the cursor — fixes the "gabisa balik"
 * editing bug). Commits a parsed number to the parent on every keystroke.
 *  - format=true  → thousand-separated currency display (integer), uses parseNumber
 *  - decimal=true → allows decimals (e.g. qty in Kg)
 */
function EditNumber({
  value, onCommit, format = false, decimal = false, ...rest
}: {
  value: number
  onCommit: (n: number) => void
  format?: boolean
  decimal?: boolean
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const display = (v: number) => (format ? formatNumber(v) : v === 0 ? "" : String(v))
  const [raw, setRaw] = useState<string>(display(value))
  const lastNum = useRef<number>(value)

  // Re-sync when the parent value changes from the outside (not from our own typing)
  useEffect(() => {
    if (value !== lastNum.current) {
      lastNum.current = value
      setRaw(display(value))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const parse = (s: string): number => {
    if (format) return parseNumber(s)
    if (s.trim() === "") return 0
    const n = decimal ? parseFloat(s.replace(",", ".")) : parseInt(s.replace(/[^\d]/g, ""), 10)
    return isNaN(n) ? 0 : n
  }

  return (
    <Input
      {...rest}
      value={raw}
      onChange={(e) => {
        let v = e.target.value
        if (!format && decimal) v = v.replace(/[^0-9.,]/g, "")
        setRaw(v)
        const n = parse(v)
        lastNum.current = n
        onCommit(n)
      }}
    />
  )
}

export default function SalesOrdersPage() {
  const salesOrders = useAppStore(state => state.salesOrders)
  const salesOrderItems = useAppStore(state => state.salesOrderItems)
  const clients = useAppStore(state => state.clients)
  const products = useAppStore(state => state.products)
  const invoices = useAppStore(state => state.invoices)
  const addSalesOrder = useAppStore(state => state.addSalesOrder)
  const addSalesOrderItems = useAppStore(state => state.addSalesOrderItems)
  const addSalesOrderItem = useAppStore(state => state.addSalesOrderItem)
  const updateSalesOrder = useAppStore(state => state.updateSalesOrder)
  const updateSalesOrderItem = useAppStore(state => state.updateSalesOrderItem)
  const deleteSalesOrderItem = useAppStore(state => state.deleteSalesOrderItem)
  const getHistoricalClientPrice = useAppStore(state => state.getHistoricalClientPrice)
  const clientPrices = useAppStore(state => state.clientPrices) || []
  const addDelivery = useAppStore(state => state.addDelivery)
  const addInvoice = useAppStore(state => state.addInvoice)
  const currentUser = useAppStore(state => state.currentUser)
  const deleteSalesOrder = useAppStore(state => state.deleteSalesOrder)
  const deleteMultipleSalesOrders = useAppStore(state => state.deleteMultipleSalesOrders)
  const updateProduct = useAppStore(state => state.updateProduct)
  const tierMargins = useAppStore(state => state.tierMargins)
  
  const [isOpen, setIsOpen] = useState(false)
  const [clientId, setClientId] = useState("")
  const [targetDate, setTargetDate] = useState(() => format(new Date(Date.now() + 86400000 * 3), 'yyyy-MM-dd')) // 3 days from now
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  
  const [filterOrderDate, setFilterOrderDate] = useState("")
  const [filterDeliveryDate, setFilterDeliveryDate] = useState("")

  const filteredSalesOrders = useMemo(() => {
    return salesOrders.filter(so => {
      const matchOrderDate = !filterOrderDate || toDateInputValue(so.orderDate) === filterOrderDate;
      const matchDeliveryDate = !filterDeliveryDate || toDateInputValue(so.targetDeliveryDate) === filterDeliveryDate;
      return matchOrderDate && matchDeliveryDate;
    });
  }, [salesOrders, filterOrderDate, filterDeliveryDate]);

  const pendingSos = useMemo(() => {
    return filteredSalesOrders.filter(so => so.status === 'Pending Approval');
  }, [filteredSalesOrders]);

  // Detail view state
  const [detailSOId, setDetailSOId] = useState<string | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  // Listen to URL search param detailId to auto-open details
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const detailId = searchParams.get('detailId');
      if (detailId && detailId !== detailSOId) {
        const exists = salesOrders.some(so => so.id === detailId);
        if (exists) {
          setDetailSOId(detailId);
          setIsDetailOpen(true);
        }
      }
    }
  }, [salesOrders, detailSOId]);

  // Clean URL query param and state when the detail modal is closed
  useEffect(() => {
    if (!isDetailOpen) {
      setDetailSOId(null);
      const params = new URLSearchParams(window.location.search);
      if (params.has('detailId')) {
        params.delete('detailId');
        const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
        window.history.replaceState(null, '', newUrl);
      }
    }
  }, [isDetailOpen]);

  const [activeTab, setActiveTab] = useState("active")
  const [shareClientId, setShareClientId] = useState<string>("")
  const [isShareClientSearchOpen, setIsShareClientSearchOpen] = useState(false)
  const [selectedSoIds, setSelectedSoIds] = useState<string[]>([])
  const [isClientQuickAddOpen, setIsClientQuickAddOpen] = useState(false)
  const [isProductQuickAddOpen, setIsProductQuickAddOpen] = useState(false)
  const [newClientData, setNewClientData] = useState({ companyName: "", picName: "", email: "", phone: "", address: "", parentId: "" })
  const [newProductData, setNewProductData] = useState({ skuCode: "", name: "", uom: "kg", basePrice: 0, sellingPrice: 0 })
  const [editingItems, setEditingItems] = useState<{ [id: string]: { qty: number, price: number } }>({})

  // Add-item-to-existing-order (detail modal) state
  const [addItemProductId, setAddItemProductId] = useState("")
  const [addItemQty, setAddItemQty] = useState(1)
  const [addItemSearch, setAddItemSearch] = useState("")
  const [isAddItemOpen, setIsAddItemOpen] = useState(false)
  
  // New line item draft
  const [newLineProductId, setNewLineProductId] = useState("")
  const [newLineQty, setNewLineQty] = useState(1)
  const [newLinePrice, setNewLinePrice] = useState(0)
  const [newLineIsCustomPrice, setNewLineIsCustomPrice] = useState(false)
  const [newLinePriceSource, setNewLinePriceSource] = useState("")
  const [newLineTier, setNewLineTier] = useState<string>("Standard")
  const [newLineHpp, setNewLineHpp] = useState(0)

  const addClient = useAppStore(state => state.addClient)
  const addProduct = useAppStore(state => state.addProduct)

  // Search and Select states
  const [clientSearch, setClientSearch] = useState("")
  const [pdfPreview, setPdfPreview] = useState<{ url: string, title: string } | null>(null)
  const [productSearch, setProductSearch] = useState("")
  const [isClientSearchOpen, setIsClientSearchOpen] = useState(false)
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false)
  const [poNumberDraft, setPoNumberDraft] = useState("")
  const [isSavingOrder, setIsSavingOrder] = useState(false)
  const [editingSO, setEditingSO] = useState<SalesOrder | null>(null)
  // ponytail: toggle state to filter products by client's custom pricelist
  const [showPricelistOnly, setShowPricelistOnly] = useState(true)
  // ponytail: checklist draft { productId -> qty } for pricelist bulk-add
  const [pricelistDraft, setPricelistDraft] = useState<Record<string, number>>({})
  const [showManualAdd, setShowManualAdd] = useState(false)

  const closeSOModal = () => {
    setIsOpen(false)
    setEditingSO(null)
    setClientId("")
    setLineItems([])
    setPoNumberDraft("")
    setShowPricelistOnly(true)
    setPricelistDraft({})
    setShowManualAdd(false)
  }

  const handleEditSO = (so: SalesOrder) => {
    setEditingSO(so)
    setClientId(so.clientId)
    setTargetDate(toDateInputValue(so.targetDeliveryDate))
    setPoNumberDraft(so.poNumber)
    setShowPricelistOnly(true)
    setPricelistDraft({})
    setShowManualAdd(false)
    
    // load line items
    const relatedItems = salesOrderItems.filter(item => item.salesOrderId === so.id)
    const formattedItems = relatedItems.map(item => {
      const product = products.find(p => p.id === item.productId)
      return {
        id: item.id,
        productId: item.productId,
        productName: product ? product.name : "Unknown",
        qty: item.qty,
        unitPrice: item.unitPrice,
        estimatedHpp: item.estimatedHpp || 0
      }
    })
    setLineItems(formattedItems)
    setIsOpen(true)
  }

  // Generate initial PO number when opening dialog
  useEffect(() => {
    if (isOpen && !editingSO) {
      setPoNumberDraft(generateDocumentNumber('PO'))
    }
  }, [isOpen, editingSO])

  const filteredClients = clients.filter(c => 
    c.companyName.toLowerCase().includes(clientSearch.toLowerCase())
  ).slice(0, 50)

  const filteredProducts = products.filter(p => {
    const matchesSearch = 
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.skuCode.toLowerCase().includes(productSearch.toLowerCase())
    if (!matchesSearch) return false

    if (clientId && showPricelistOnly) {
      const hasOverride = clientPrices.some(cp => cp.clientId === clientId && cp.productId === p.id)
      return hasOverride
    }

    return true
  }).slice(0, 50)

  // Auto-switch to pending tab if new requests arrive
  useEffect(() => {
    const pendingCount = salesOrders.filter(so => so.status === 'Pending Approval').length
    if (pendingCount > 0 && activeTab === 'active') {
      setActiveTab('pending')
      toast.info(`Ada ${pendingCount} pesanan baru dari Client yang perlu di-approve.`)
    }
  }, [salesOrders.filter(so => so.status === 'Pending Approval').length, activeTab])

  useEffect(() => {
    if (detailSOId) {
      const so = salesOrders.find(s => s.id === detailSOId)
      if (so?.status === 'Pending Approval') {
        setPoNumberDraft(generateDocumentNumber('PO'))
      } else if (so) {
        setPoNumberDraft(so.poNumber)
      }

      const items = salesOrderItems.filter(item => item.salesOrderId === detailSOId)
      const editingObj: { [id: string]: { qty: number, price: number } } = {}
      items.forEach(item => {
        editingObj[item.id] = { qty: item.qty, price: item.unitPrice }
      })
      setEditingItems(editingObj)
    }
  }, [detailSOId])

  const getFinancialStatus = (so: any) => {
    if (so.status === 'Batal') return { label: 'Batal', color: 'bg-rose-100 text-rose-800' }
    
    // Check for any invoice (single or consolidated)
    const relatedInvoice = invoices.find(inv => 
      inv.salesOrderId === so.id || (inv.salesOrderIds && inv.salesOrderIds.includes(so.id))
    )

    if (!relatedInvoice) {
      return { 
        label: 'Invoice Pending', // "Belum Terbit Tukar Faktur" too long? Let's use user's term but maybe with tooltips? 
        // User asked: "belum terbit tukar faktur"
        fullLabel: 'Belum Terbit Tukar Faktur',
        color: 'bg-slate-100 text-slate-500 border-slate-200' 
      }
    }

    if (relatedInvoice.status === 'Paid') {
      return { label: 'Lunas', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
    }

    return { label: 'Outstanding', color: 'bg-amber-100 text-amber-800 border-amber-200' }
  }

  const handleUpdateItem = (itemId: string, field: 'qty' | 'price', value: number) => {
    setEditingItems(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value }
    }))
  }

  const saveOrderEdits = () => {
    Object.entries(editingItems).forEach(([itemId, data]) => {
      updateSalesOrderItem(itemId, {
        qty: data.qty,
        unitPrice: data.price,
        subtotal: data.qty * data.price
      })
    })
    toast.success("Perubahan pesanan berhasil disimpan")
  }

  // Add a new line item to the order currently open in the detail modal (Draft / Pending only)
  const handleAddItemToOrder = () => {
    const so = salesOrders.find(s => s.id === detailSOId)
    if (!so) return
    if (!addItemProductId) { toast.error("Pilih produk dulu"); return }
    if (addItemQty <= 0) { toast.error("Qty harus lebih dari 0"); return }

    const existing = salesOrderItems.find(it => it.salesOrderId === so.id && it.productId === addItemProductId)
    if (existing) {
      toast.error("Produk sudah ada di pesanan. Ubah qty-nya di tabel.")
      return
    }

    const { price } = resolveClientPrice(addItemProductId, so.clientId)
    const newItem: SalesOrderItem = {
      id: uuidv4(),
      salesOrderId: so.id,
      productId: addItemProductId,
      qty: addItemQty,
      unitPrice: price,
      subtotal: addItemQty * price,
    }
    addSalesOrderItem(newItem)
    setEditingItems(prev => ({ ...prev, [newItem.id]: { qty: addItemQty, price } }))
    setAddItemProductId("")
    setAddItemQty(1)
    setAddItemSearch("")
    toast.success("Item ditambahkan ke pesanan")
  }

  const handleRemoveItemFromOrder = (itemId: string) => {
    deleteSalesOrderItem(itemId)
    setEditingItems(prev => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
    toast.success("Item dihapus dari pesanan")
  }

  const handleQuickAddClient = () => {
    if (!newClientData.companyName || !newClientData.picName) {
      toast.error("Nama Perusahaan & PIC wajib diisi")
      return
    }
    const id = uuidv4()
    addClient({
      id,
      companyName: newClientData.companyName,
      picName: newClientData.picName,
      email: newClientData.email,
      phone: newClientData.phone,
      address: newClientData.address,
      paymentTermDays: 30,
      createdAt: new Date().toISOString(),
      parentId: newClientData.parentId || null
    })
    setClientId(id)
    setShareClientId(id)
    setShowPricelistOnly(true)
    setPricelistDraft({})
    setShowManualAdd(false)
    setIsClientQuickAddOpen(false)
    setNewClientData({ companyName: "", picName: "", email: "", phone: "", address: "", parentId: "" })
    toast.success("Client added and selected")
  }

  const handleQuickAddProduct = () => {
    if (!newProductData.name || !newProductData.skuCode) return
    const id = uuidv4()
    addProduct({
      id,
      ...newProductData,
      currentStock: 0
    })
    handleProductSelect(id)
    setIsProductQuickAddOpen(false)
    setNewProductData({ skuCode: "", name: "", uom: "kg", basePrice: 0, sellingPrice: 0 })
    toast.success("Product added and selected")
  }

  const resolveClientPrice = (pid: string, targetClientId: string) => {
    const product = products.find(p => p.id === pid)
    if (!product) return { price: 0, isCustom: false, source: "" }

    if (targetClientId) {
      const activeRecord = clientPrices.find(cp => cp.clientId === targetClientId && cp.productId === pid)
      if (activeRecord) {
        let specializedPrice = product.sellingPrice
        if (activeRecord.tier === 'Custom') specializedPrice = activeRecord.agreedPrice
        else {
          const marginPct = (tierMargins as any)[activeRecord.tier] || 0
          specializedPrice = (product as any)[`tier${activeRecord.tier.replace('Tier ', '')}Price`] || Math.round(product.basePrice * (1 + marginPct / 100)) || product.sellingPrice
        }
        return { price: specializedPrice, isCustom: true, source: activeRecord.tier }
      }

      // Check client-wide default tier
      const client = clients.find(c => c.id === targetClientId)
      if (client?.defaultPriceTier && client.defaultPriceTier !== 'Standard') {
        const tier = client.defaultPriceTier
        const marginPct = (tierMargins as any)[tier] || 0
        const specializedPrice = (product as any)[`tier${tier.replace('Tier ', '')}Price`] || Math.round(product.basePrice * (1 + marginPct / 100)) || product.sellingPrice
        return { price: specializedPrice, isCustom: true, source: `${tier} (Default)` }
      }

      const historicalPrice = getHistoricalClientPrice(targetClientId, pid)
      if (historicalPrice) {
        return { price: historicalPrice, isCustom: false, source: "History" }
      }
    }

    return { price: product.sellingPrice, isCustom: false, source: "" }
  }

  const recalculatePricesForClient = (newClientId: string) => {
    // 1. Update lineItems in cart
    if (lineItems.length > 0) {
      let pricesChanged = false
      const updatedLines = lineItems.map(item => {
        const { price, isCustom, source } = resolveClientPrice(item.productId, newClientId)
        if (price !== item.unitPrice) pricesChanged = true
        return { ...item, unitPrice: price, isCustomPrice: isCustom, priceSource: source }
      })

      if (pricesChanged) {
        setLineItems(updatedLines)
        toast.info("Harga di keranjang otomatis disesuaikan dengan Price List Klien ini.", {
          style: { background: '#f8fafc', border: '1px solid #cbd5e1' }
        })
      }
    }

    // 2. Update the new line draft if it has a product selected
    if (newLineProductId) {
      const { price, isCustom, source } = resolveClientPrice(newLineProductId, newClientId)
      setNewLinePrice(price)
      setNewLineIsCustomPrice(isCustom)
      setNewLinePriceSource(source)
      const cleanTier = source ? source.replace(' (Default)', '') : "Standard"
      setNewLineTier(cleanTier)
    }
  }

  const getPriceForTier = (product: any, tier: string, overrideHpp?: number) => {
    if (!product) return 0
    const hpp = overrideHpp ?? product.basePrice
    const cleanTier = tier.replace(' (Default)', '')
    if (cleanTier === 'Standard') return product.sellingPrice
    if (cleanTier === 'HPP') return hpp
    if (cleanTier.startsWith('Tier')) {
      const marginPct = (tierMargins as any)[cleanTier] || 0
      return (product as any)[`tier${cleanTier.replace('Tier ', '')}Price`] || Math.round(hpp * (1 + marginPct / 100))
    }
    return product.sellingPrice
  }

  const handleTierChange = (tier: string | null) => {
    if (!tier) return
    setNewLineTier(tier)
    if (tier === 'Custom') {
      setNewLineIsCustomPrice(true)
      setNewLinePriceSource('Custom')
      return
    }
    const product = products.find(p => p.id === newLineProductId)
    if (product) {
      const price = getPriceForTier(product, tier, newLineHpp || undefined)
      setNewLinePrice(price)
      setNewLineIsCustomPrice(tier !== 'Standard')
      setNewLinePriceSource(tier)
    }
  }

  const handleProductSelect = (pid: string) => {
    setNewLineProductId(pid)
    const product = products.find(p => p.id === pid)
    setNewLineHpp(product?.basePrice || 0)
    const { price, isCustom, source } = resolveClientPrice(pid, clientId)
    
    setNewLinePrice(price)
    setNewLineIsCustomPrice(isCustom)
    setNewLinePriceSource(source)
    const cleanTier = source ? source.replace(' (Default)', '') : "Standard"
    setNewLineTier(cleanTier)
    
    if (isCustom) {
      toast.info(`Harga diisi otomatis dari ${source === 'Custom' ? 'Price List Kustom' : 'Price List ' + source} Klien ini.`, {
         style: { background: '#ecfdf5', color: '#047857', border: '1px solid #10b981' },
         duration: 4000
      })
    }
  }

  const addLineItem = () => {
    if (!newLineProductId || newLineQty <= 0 || newLinePrice <= 0) return
    
    const product = products.find(p => p.id === newLineProductId)
    if (!product) return

    // If user entered/changed HPP, save it as the product's basePrice for this period
    if (newLineHpp > 0 && newLineHpp !== (product.basePrice || 0)) {
      updateProduct(product.id, { basePrice: newLineHpp })
      updateProductPriceHistory(product.id, newLineHpp, 'Input HPP (Sales Order)')
    }

    setLineItems([...lineItems, {
      id: uuidv4(),
      productId: product.id,
      productName: product.name,
      qty: newLineQty,
      unitPrice: newLinePrice,
      isCustomPrice: newLineIsCustomPrice,
      priceSource: newLinePriceSource,
      estimatedHpp: newLineHpp
    }])

    setNewLineProductId("")
    setNewLineQty(1)
    setNewLinePrice(0)
    setNewLineIsCustomPrice(false)
    setNewLinePriceSource("")
    setNewLineTier("Standard")
    setNewLineHpp(0)
  }

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter(item => item.id !== id))
  }

  // ponytail: bulk-add all checked pricelist rows to lineItems
  const addFromPricelist = () => {
    const toAdd = Object.entries(pricelistDraft).filter(([, qty]) => qty > 0)
    if (!toAdd.length) return
    const newItems = toAdd.flatMap(([pid, qty]) => {
      const product = products.find(p => p.id === pid)
      if (!product) return []
      const { price, isCustom, source } = resolveClientPrice(pid, clientId)
      return [{ id: uuidv4(), productId: product.id, productName: product.name, qty, unitPrice: price, isCustomPrice: isCustom, priceSource: source, estimatedHpp: product.basePrice || 0 }]
    })
    setLineItems(prev => {
      const existingIds = new Set(prev.map(i => i.productId))
      return [...prev, ...newItems.filter(i => !existingIds.has(i.productId))]
    })
    setPricelistDraft({})
    setShowManualAdd(false)
  }


  const handleSaveSO = async () => {
    if (!clientId) {
      toast.error("Please select a client")
      return
    }
    if (lineItems.length === 0) {
      toast.error("Please add at least one item")
      return
    }

    setIsSavingOrder(true)
    try {
      if (editingSO) {
        // --- EDIT MODE ---
        // 1. Update the Sales Order record
        await updateSalesOrder(editingSO.id, {
          poNumber: poNumberDraft || editingSO.poNumber,
          clientId,
          targetDeliveryDate: new Date(targetDate).toISOString()
        })

        // 2. Diff line items:
        const existingItems = salesOrderItems.filter(item => item.salesOrderId === editingSO.id)
        
        // Items to delete (exist in DB but not in lineItems)
        const itemsToDelete = existingItems.filter(ext => !lineItems.some(item => item.id === ext.id))
        // Items to add (new items, don't exist in existingItems)
        const itemsToAdd = lineItems.filter(item => !existingItems.some(ext => ext.id === item.id))
        // Items to update (exist in both, but qty or unitPrice changed)
        const itemsToUpdate = lineItems.filter(item => {
          const ext = existingItems.find(e => e.id === item.id)
          return ext && (ext.qty !== item.qty || ext.unitPrice !== item.unitPrice)
        })

        // Execute deletions
        for (const item of itemsToDelete) {
          await deleteSalesOrderItem(item.id)
        }

        // Execute updates
        for (const item of itemsToUpdate) {
          await updateSalesOrderItem(item.id, {
            qty: item.qty,
            unitPrice: item.unitPrice,
            subtotal: item.qty * item.unitPrice
          })
        }

        // Execute additions
        if (itemsToAdd.length > 0) {
          const newItems: SalesOrderItem[] = itemsToAdd.map(item => ({
            id: uuidv4(),
            salesOrderId: editingSO.id,
            productId: item.productId,
            qty: item.qty,
            unitPrice: item.unitPrice,
            subtotal: item.qty * item.unitPrice,
            estimatedHpp: item.estimatedHpp
          }))
          await addSalesOrderItems(newItems)
        }

        toast.success("Sales Order updated successfully")
      } else {
        // --- CREATE MODE ---
        const soId = uuidv4()

        // Create SO FIRST (Sequential)
        await addSalesOrder({
          id: soId,
          poNumber: poNumberDraft || generateDocumentNumber('PO'),
          clientId,
          orderDate: new Date().toISOString(),
          targetDeliveryDate: new Date(targetDate).toISOString(),
          status: 'Draft' // Start as Draft for manual approval
        })

        // Create Line Items in Batch (Sequential after SO)
        const itemsToAdd: SalesOrderItem[] = lineItems.map(item => ({
          id: uuidv4(),
          salesOrderId: soId,
          productId: item.productId,
          qty: item.qty,
          unitPrice: item.unitPrice,
          subtotal: item.qty * item.unitPrice,
          estimatedHpp: item.estimatedHpp
        }))

        await addSalesOrderItems(itemsToAdd)

        toast.success("Sales Order created successfully")
      }

      closeSOModal()
    } catch (e: any) {
      console.error(e)
      toast.error("Failed to save Sales Order: " + e.message)
    } finally {
      setIsSavingOrder(false)
    }
  }

  const advanceStatus = async (soId: string, currentStatus: string) => {
    const nextStatus =
      currentStatus === 'Draft' ? 'Belanja' :
      currentStatus === 'Belanja' ? 'Packing' :
      currentStatus === 'Packing' ? 'Dikirim' :
      currentStatus === 'Siap Kirim' ? 'Dikirim' :
      currentStatus === 'Dikirim' ? 'Terkirim' : currentStatus;

    updateSalesOrder(soId, { status: nextStatus as SalesOrderStatus })

    // Manual ship from PO page bypasses courier handover. If warehouse outbound
    // auto-created a courier pickup mission that no courier has picked up yet
    // (status 'Menunggu'), delete it so it doesn't linger as a phantom task in
    // the courier list. If a courier already picked it up ('Dikirim'+), leave it.
    if (currentStatus === 'Siap Kirim') {
      const phantom = useAppStore.getState().deliveries.find(
        d => d.salesOrderId === soId && d.status === 'Menunggu'
      )
      if (phantom) await useAppStore.getState().deleteDelivery(phantom.id)
    }

    toast.success(`Status updated to ${nextStatus}`)
  }


  // Toggle selection helpers
  const toggleSelectSo = (id: string) => {
    setSelectedSoIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const activeSos = useMemo(() => filteredSalesOrders.filter(so => so.status !== 'Pending Approval'), [filteredSalesOrders])
  const allSelected = activeSos.length > 0 && activeSos.every(so => selectedSoIds.includes(so.id))

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedSoIds(prev => prev.filter(id => !activeSos.some(so => so.id === id)))
    } else {
      const newIds = [...selectedSoIds]
      activeSos.forEach(so => {
        if (!newIds.includes(so.id)) newIds.push(so.id)
      })
      setSelectedSoIds(newIds)
    }
  }

  // Individual Delete
  const handleDeleteSO = async (soId: string) => {
    const so = salesOrders.find(s => s.id === soId)
    if (!so) {
      toast.error("Sales Order tidak ditemukan.")
      return
    }

    if (!window.confirm(`Apakah Anda yakin ingin menghapus PO ${so.poNumber} beserta seluruh itemnya? Tindakan ini tidak dapat dibatalkan.`)) {
      return
    }

    toast.loading("Menghapus PO...", { id: "delete_so" })
    try {
      await deleteSalesOrder(soId)
      setSelectedSoIds(prev => prev.filter(id => id !== soId))
      toast.success(`PO ${so.poNumber} berhasil dihapus.`, { id: "delete_so" })
    } catch (e) {
      console.error(e)
      toast.error("Gagal menghapus PO.", { id: "delete_so" })
    }
  }

  // Bulk Delete
  const handleBulkDeleteSOs = async () => {
    if (selectedSoIds.length === 0) {
      toast.error("Tidak ada PO terpilih.")
      return
    }

    if (!window.confirm(`Apakah Anda yakin ingin menghapus ${selectedSoIds.length} PO terpilih? Tindakan ini tidak dapat dibatalkan.`)) {
      return
    }

    toast.loading(`Menghapus ${selectedSoIds.length} PO...`, { id: "bulk_delete" })
    try {
      await deleteMultipleSalesOrders(selectedSoIds)
      setSelectedSoIds([])
      toast.success("PO terpilih berhasil dihapus.", { id: "bulk_delete" })
    } catch (e) {
      console.error(e)
      toast.error("Gagal menghapus beberapa PO.", { id: "bulk_delete" })
    }
  }

  const selectedSO = salesOrders.find(so => so.id === detailSOId)
  const selectedClient = clients.find(c => c.id === selectedSO?.clientId)
  const selectedItems = salesOrderItems.filter(item => item.salesOrderId === detailSOId)
  const selectedTotal = selectedItems.reduce((sum, item) => sum + item.subtotal, 0)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Sales Orders (PO Masuk)</h2>
          <p className="text-muted-foreground">Manage incoming client orders and track their fulfillment status.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <GlobalUndoButton inline />
          <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open) {
              closeSOModal()
            } else {
              setIsOpen(true)
            }
          }}>
            <DialogTrigger render={
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New Sales Order
              </Button>
            } />
          <DialogContent className="sm:max-w-[95vw] w-[95vw] max-h-[95vh] overflow-y-auto rounded-[2rem]">
            <DialogHeader>
              <DialogTitle>{editingSO ? `Edit Sales Order: ${editingSO.poNumber}` : "Create New Sales Order"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-6 py-4">
              
              <div className="space-y-2">
                <Label className="text-emerald-600 font-black uppercase text-[10px] tracking-widest">PO Number (Dapat Diubah)</Label>
                <Input 
                  value={poNumberDraft}
                  onChange={(e) => setPoNumberDraft(e.target.value)}
                  className="font-black text-lg border-emerald-100 bg-emerald-50/30 focus:bg-white transition-all"
                  placeholder="PO-XXXXXX"
                />
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Sesuaikan dengan nomor PO dari Client jika perlu.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Client (Customer)</Label>
                    <button 
                      type="button" 
                      onClick={() => setIsClientQuickAddOpen(true)}
                      className="text-[10px] text-emerald-600 font-bold hover:underline"
                    >
                      + Add New Client
                    </button>
                  </div>
                  <Popover open={isClientSearchOpen} onOpenChange={setIsClientSearchOpen}>
                    <PopoverTrigger render={
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={isClientSearchOpen}
                        className="w-full justify-between font-normal bg-white dark:bg-slate-950"
                      >
                        <span className="truncate">
                          {clientId 
                            ? clients.find((c) => c.id === clientId)?.companyName 
                            : "Select client..."}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    } />
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <div className="flex items-center border-b px-3 h-10">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <input
                          placeholder="Search client..."
                          className="flex h-full w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                        />
                      </div>
                      <div className="max-h-[300px] overflow-y-auto p-1">
                        {filteredClients.length === 0 ? (
                          <div className="py-6 text-center text-sm">No client found.</div>
                        ) : (
                          filteredClients.map((c) => (
                            <button
                              key={c.id}
                              className={cn(
                                "relative flex w-full cursor-default select-none items-start rounded-md py-3 pl-10 pr-3 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors",
                                clientId === c.id && "bg-slate-100 dark:bg-slate-800"
                              )}
                              onClick={() => {
                                setClientId(c.id)
                                setIsClientSearchOpen(false)
                                setClientSearch("")
                                recalculatePricesForClient(c.id)
                                setShowPricelistOnly(true)
                              }}
                            >
                              <span className="absolute left-3 top-3.5 flex h-4 w-4 items-center justify-center">
                                {clientId === c.id && <Check className="h-4 w-4 text-emerald-600" />}
                              </span>
                              <div className="flex flex-col text-left">
                                <span className="font-bold text-slate-900 dark:text-slate-100">{c.companyName}</span>
                                {c.address && (
                                  <span className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{c.address}</span>
                                )}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Target Delivery Date</Label>
                  <Input 
                    type="date" 
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-emerald-600" /> Detail Pesanan (List SKU)
                  </h3>
                </div>
                
                {/* === Detail Pesanan: checklist when pricelist exists, single-select otherwise === */}
                {(() => {
                  const clientPriceRows = clientPrices.filter(cp => cp.clientId === clientId)
                  const hasPricelist = clientId && clientPriceRows.length > 0

                  if (hasPricelist) {
                    const checkedCount = Object.values(pricelistDraft).filter(q => q > 0).length
                    return (
                      <div className="space-y-3 animate-in fade-in duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Price List Client ({clientPriceRows.length} produk)
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setIsProductQuickAddOpen(true)}
                              className="text-[10px] text-slate-400 font-bold hover:text-emerald-600 hover:underline"
                            >
                              + SKU Baru
                            </button>
                            {checkedCount > 0 && (
                              <Button
                                type="button"
                                size="sm"
                                onClick={addFromPricelist}
                                className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                              >
                                Tambah {checkedCount} item ke Order
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Checklist table */}
                        <div className="rounded-lg border bg-white dark:bg-slate-950 overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-slate-900/60 border-b">
                                <th className="w-8 px-3 py-2"></th>
                                <th className="text-left text-xs font-bold text-slate-500 py-2">Produk</th>
                                <th className="text-right text-xs font-bold text-slate-500 py-2 pr-3">Harga</th>
                                <th className="text-center text-xs font-bold text-slate-500 py-2 w-28">Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {clientPriceRows.map(cp => {
                                const product = products.find(p => p.id === cp.productId)
                                if (!product) return null
                                const { price } = resolveClientPrice(cp.productId, clientId)
                                const qty = pricelistDraft[cp.productId] ?? 0
                                const checked = qty > 0
                                return (
                                  <tr
                                    key={cp.productId}
                                    className={cn(
                                      "border-b last:border-b-0 transition-colors",
                                      checked ? "bg-emerald-50/60 dark:bg-emerald-950/20" : "hover:bg-slate-50 dark:hover:bg-slate-900/30"
                                    )}
                                  >
                                    <td className="px-3 py-2.5">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) => setPricelistDraft(prev => ({
                                          ...prev,
                                          [cp.productId]: e.target.checked ? (prev[cp.productId] || 1) : 0
                                        }))}
                                        className="w-4 h-4 accent-emerald-600 cursor-pointer"
                                      />
                                    </td>
                                    <td className="py-2.5">
                                      <div className="flex flex-col gap-0.5">
                                        <span className={cn("font-semibold", checked && "text-emerald-800 dark:text-emerald-300")}>{product.name}</span>
                                        <span className="text-[10px] text-slate-400 font-medium">{product.skuCode} • {product.uom}</span>
                                      </div>
                                    </td>
                                    <td className="text-right pr-3 font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                      {formatRupiah(price)}
                                      {cp.tier !== 'Standard' && (
                                        <span className="ml-1 text-[9px] font-black text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200 uppercase">{cp.tier}</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={qty || ""}
                                        placeholder="0"
                                        onChange={(e) => {
                                          const v = parseFloat(e.target.value) || 0
                                          setPricelistDraft(prev => ({ ...prev, [cp.productId]: v }))
                                        }}
                                        onFocus={(e) => e.target.select()}
                                        className="w-20 h-8 text-center text-sm font-bold border rounded-md bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                      />
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Manual add toggle */}
                        <button
                          type="button"
                          onClick={() => setShowManualAdd(v => !v)}
                          className="text-[11px] font-bold text-slate-400 hover:text-emerald-600 flex items-center gap-1 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          {showManualAdd ? "Tutup tambah manual" : "Tambah SKU Manual (di luar price list)"}
                        </button>

                        {/* Manual add panel */}
                        {showManualAdd && (
                          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-dashed animate-in fade-in duration-200">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                              <div className="md:col-span-6 space-y-1">
                                <Label className="text-xs font-semibold px-1">Pilih Produk</Label>
                                <Popover open={isProductSearchOpen} onOpenChange={setIsProductSearchOpen}>
                                  <PopoverTrigger render={
                                    <Button variant="outline" role="combobox" aria-expanded={isProductSearchOpen} className="w-full justify-between font-normal bg-white dark:bg-slate-950 h-10">
                                      <span className="truncate">{newLineProductId ? products.find((p) => p.id === newLineProductId)?.name : "Pilih barang..."}</span>
                                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                  } />
                                  <PopoverContent className="w-[350px] p-0" align="start">
                                    <div className="flex items-center border-b px-3 h-10">
                                      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                      <input placeholder="Cari nama atau SKU..." className="flex h-full w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                                    </div>
                                    <div className="max-h-[300px] overflow-y-auto p-1">
                                      {products.filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.skuCode.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 50).map((p) => (
                                        <button key={p.id} className={cn("relative flex w-full cursor-default select-none flex-col items-start rounded-sm py-2 pl-8 pr-2 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-800", newLineProductId === p.id && "bg-slate-100 dark:bg-slate-800")} onClick={() => { handleProductSelect(p.id); setIsProductSearchOpen(false); setProductSearch("") }}>
                                          <span className="absolute left-2 top-2.5 flex h-3.5 w-3.5 items-center justify-center">{newLineProductId === p.id && <Check className="h-4 w-4" />}</span>
                                          <span className="font-semibold">{p.name}</span>
                                          <span className="text-[10px] text-muted-foreground">{p.skuCode} • {formatRupiah(p.sellingPrice)}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <div className="md:col-span-2 space-y-1">
                                <Label className="text-xs font-semibold">Qty{newLineProductId ? <span className="ml-1 text-[10px] font-normal text-slate-400">({products.find(p => p.id === newLineProductId)?.uom || '-'})</span> : null}</Label>
                                <EditNumber decimal inputMode="decimal" placeholder="0" className="bg-white dark:bg-slate-950 h-10" value={newLineQty} onCommit={setNewLineQty} />
                              </div>
                              <div className="md:col-span-3 space-y-1">
                                <Label className="text-xs font-semibold">Margin / Tier</Label>
                                <Select value={newLineTier} onValueChange={handleTierChange} disabled={!newLineProductId}>
                                  <SelectTrigger className="w-full bg-white dark:bg-slate-950 h-10"><SelectValue placeholder="Pilih Margin/Tier" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Standard">Standard</SelectItem>
                                    <SelectItem value="Tier 1">Tier 1 (+50%)</SelectItem>
                                    <SelectItem value="Tier 2">Tier 2 (+30%)</SelectItem>
                                    <SelectItem value="Tier 3">Tier 3 (+20%)</SelectItem>
                                    <SelectItem value="Tier 4">Tier 4 (+15%)</SelectItem>
                                    <SelectItem value="Tier 5">Tier 5 (+10%)</SelectItem>
                                    <SelectItem value="HPP">HPP</SelectItem>
                                    <SelectItem value="Custom">Custom</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="md:col-span-1 flex items-end justify-end h-full">
                                <Button type="button" variant="default" onClick={addLineItem} disabled={!newLineProductId} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10">
                                  <Plus className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                            {newLineProductId && (() => {
                              const hpp = newLineHpp || 0
                              const marginAmount = newLinePrice - hpp
                              const marginPercent = hpp > 0 ? (marginAmount / hpp) * 100 : 0
                              const isLoss = marginAmount < 0
                              return (
                                <div className={cn("flex justify-between items-center p-2 rounded-lg border text-xs font-semibold mt-3 transition-all", isLoss ? "bg-rose-50 text-rose-700 border-rose-100" : "bg-emerald-50 text-emerald-700 border-emerald-100")}>
                                  <span>Harga: {formatRupiah(newLinePrice)}</span>
                                  <span className="font-bold">{isLoss ? "" : "+"}{formatRupiah(marginAmount)} ({marginPercent.toFixed(1)}%)</span>
                                </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    )
                  }

                  // Fallback: no pricelist configured — show original single-select panel
                  return (
                    <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-dashed animate-in fade-in duration-300">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                        <div className="md:col-span-6 space-y-1">
                          <div className="flex justify-between items-center px-1">
                            <Label className="text-xs font-semibold">Pilih Produk</Label>
                            <button type="button" onClick={() => setIsProductQuickAddOpen(true)} className="text-[10px] text-emerald-600 font-bold hover:underline">+ SKU Baru</button>
                          </div>
                          <Popover open={isProductSearchOpen} onOpenChange={setIsProductSearchOpen}>
                            <PopoverTrigger render={
                              <Button variant="outline" role="combobox" aria-expanded={isProductSearchOpen} className="w-full justify-between font-normal bg-white dark:bg-slate-950 h-10">
                                <span className="truncate">{newLineProductId ? products.find((p) => p.id === newLineProductId)?.name : "Pilih barang..."}</span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            } />
                            <PopoverContent className="w-[350px] p-0" align="start">
                              <div className="flex items-center border-b px-3 h-10">
                                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                <input placeholder="Cari nama atau SKU..." className="flex h-full w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                              </div>
                              <div className="max-h-[300px] overflow-y-auto p-1">
                                {filteredProducts.length === 0 ? (
                                  <div className="py-6 text-center text-sm text-slate-500">Barang tidak ditemukan.</div>
                                ) : filteredProducts.map((p) => (
                                  <button key={p.id} className={cn("relative flex w-full cursor-default select-none flex-col items-start rounded-sm py-2 pl-8 pr-2 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-800", newLineProductId === p.id && "bg-slate-100 dark:bg-slate-800")} onClick={() => { handleProductSelect(p.id); setIsProductSearchOpen(false); setProductSearch("") }}>
                                    <span className="absolute left-2 top-2.5 flex h-3.5 w-3.5 items-center justify-center">{newLineProductId === p.id && <Check className="h-4 w-4" />}</span>
                                    <span className="font-semibold">{p.name}</span>
                                    <div className="flex gap-2 items-center mt-1">
                                      <span className="text-[10px] text-muted-foreground">{p.skuCode} • {formatRupiah(p.sellingPrice)}</span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="md:col-span-2 space-y-1">
                          <Label className="text-xs font-semibold">Qty{newLineProductId ? <span className="ml-1 text-[10px] font-normal text-slate-400">({products.find(p => p.id === newLineProductId)?.uom || '-'})</span> : null}</Label>
                          <EditNumber decimal inputMode="decimal" placeholder="0" className="bg-white dark:bg-slate-950 h-10" value={newLineQty} onCommit={setNewLineQty} />
                        </div>
                        <div className="md:col-span-4 space-y-1">
                          <Label className="text-xs font-semibold">Pilih Margin / Tier</Label>
                          <Select value={newLineTier} onValueChange={handleTierChange} disabled={!newLineProductId}>
                            <SelectTrigger className="w-full bg-white dark:bg-slate-950 h-10"><SelectValue placeholder="Pilih Margin/Tier" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Standard">Harga Jual Standard</SelectItem>
                              <SelectItem value="Tier 1">Tier 1 (+50% Margin)</SelectItem>
                              <SelectItem value="Tier 2">Tier 2 (+30% Margin)</SelectItem>
                              <SelectItem value="Tier 3">Tier 3 (+20% Margin)</SelectItem>
                              <SelectItem value="Tier 4">Tier 4 (+15% Margin)</SelectItem>
                              <SelectItem value="Tier 5">Tier 5 (+10% Margin)</SelectItem>
                              <SelectItem value="HPP">HPP (+0% Margin)</SelectItem>
                              <SelectItem value="Custom">Harga Kustom (Manual)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                        <div className="md:col-span-4 space-y-1">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs font-semibold">Harga Satuan (Rp)</Label>
                          </div>
                          <Input type="text" inputMode="numeric" className="bg-white dark:bg-slate-950 font-bold h-10" value={formatNumber(newLinePrice)} onChange={(e) => { const val = parseNumber(e.target.value); setNewLinePrice(val); setNewLineTier("Custom"); setNewLineIsCustomPrice(true); setNewLinePriceSource("Custom") }} disabled={!newLineProductId} />
                        </div>
                        <div className="md:col-span-7">
                          {newLineProductId && (() => {
                            const selectedProduct = products.find(p => p.id === newLineProductId)
                            if (!selectedProduct) return null
                            const hpp = newLineHpp || 0
                            const marginAmount = newLinePrice - hpp
                            const marginPercent = hpp > 0 ? (marginAmount / hpp) * 100 : 0
                            const isLoss = marginAmount < 0
                            return (
                              <div className={cn("flex flex-col gap-1.5 p-2 rounded-lg border text-xs font-semibold mt-4 transition-all duration-300", isLoss ? "bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-900/30" : marginAmount === 0 ? "bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-400 border-slate-200" : "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30")}>
                                <div className="flex justify-between items-center gap-2">
                                  <span className="whitespace-nowrap">Estimasi HPP (Beli):</span>
                                  <Input type="text" inputMode="numeric" className="h-7 w-40 text-right font-bold text-slate-900 dark:text-slate-100 bg-white/80 dark:bg-slate-950/80 border-slate-300" value={formatNumber(newLineHpp)} onChange={(e) => { const val = parseNumber(e.target.value); setNewLineHpp(val); if (newLineTier && newLineTier !== 'Custom' && newLineTier !== 'Standard') { const product = products.find(p => p.id === newLineProductId); if (product) setNewLinePrice(getPriceForTier(product, newLineTier, val || undefined)) } }} placeholder="Isi HPP..." />
                                </div>
                                <div className="flex justify-between items-center border-t border-dashed border-current/10 pt-1 mt-0.5">
                                  <span>Estimasi Margin:</span>
                                  <span className={cn("font-bold text-base", isLoss ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>{isLoss ? "" : "+"}{formatRupiah(marginAmount)} ({marginPercent.toFixed(1)}%)</span>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                        <div className="md:col-span-1 flex items-end justify-end h-full">
                          <Button type="button" variant="default" onClick={addLineItem} disabled={!newLineProductId} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 mt-4">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 italic px-1">Pilih barang, sesuaikan Margin/Tier jika diperlukan, lalu klik tombol hijau (+) untuk menambah ke daftar order.</p>
                    </div>
                  )
                })()}

                {lineItems.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Daftar Barang Pesanan:</h4>
                    <div className="rounded-md border bg-white dark:bg-slate-950 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50 dark:bg-slate-900/50">
                            <TableHead className="text-xs">Product</TableHead>
                            <TableHead className="text-right text-xs w-20">Qty</TableHead>
                            <TableHead className="text-center text-xs w-16">Satuan</TableHead>
                            <TableHead className="text-right text-xs">Price</TableHead>
                            <TableHead className="text-right text-xs">Subtotal</TableHead>
                            <TableHead className="w-[40px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lineItems.map(item => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium text-sm py-2">
                                <div className="flex flex-col gap-0.5">
                                  <span>{item.productName}</span>
                                  {item.isCustomPrice && (
                                    <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded w-fit border border-emerald-200 uppercase">
                                      {item.priceSource === 'Custom' ? 'HARGA KUSTOM' : `PRICE LIST: ${item.priceSource}`}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-sm py-2">{item.qty}</TableCell>
                              <TableCell className="text-center text-xs py-2 text-slate-500">{products.find(p => p.id === item.productId)?.uom ?? '-'}</TableCell>
                              <TableCell className="text-right text-sm py-2">{formatRupiah(item.unitPrice)}</TableCell>
                              <TableCell className="text-right font-bold text-sm py-2">{formatRupiah(item.qty * item.unitPrice)}</TableCell>
                              <TableCell className="py-2">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500" onClick={() => removeLineItem(item.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-slate-50 dark:bg-slate-900/50 font-bold">
                            <TableCell colSpan={3} className="text-right text-sm">TOTAL PESANAN:</TableCell>
                            <TableCell className="text-right text-sm text-emerald-600">
                              {formatRupiah(lineItems.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0))}
                            </TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>

            </div>
            <div className="flex justify-end gap-3 mt-4 border-t pt-4">
              <Button variant="outline" onClick={closeSOModal} disabled={isSavingOrder}>Cancel</Button>
              <Button onClick={handleSaveSO} disabled={isSavingOrder}>
                {isSavingOrder ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Menyimpan...</> : (editingSO ? "Save Changes" : "Create Sales Order")}
              </Button>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Date filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-100 bg-white/80 px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tanggal PO</label>
          <div className="relative flex items-center">
            <Input
              type="date"
              value={filterOrderDate}
              onChange={e => setFilterOrderDate(e.target.value)}
              className="h-9 rounded-xl border-slate-200 pr-8 text-sm font-bold text-slate-700"
            />
            {filterOrderDate && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => setFilterOrderDate('')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tanggal Kirim</label>
          <div className="relative flex items-center">
            <Input
              type="date"
              value={filterDeliveryDate}
              onChange={e => setFilterDeliveryDate(e.target.value)}
              className="h-9 rounded-xl border-slate-200 pr-8 text-sm font-bold text-slate-700"
            />
            {filterDeliveryDate && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => setFilterDeliveryDate('')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {(filterOrderDate || filterDeliveryDate) && (
          <button
            className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
            onClick={() => { setFilterOrderDate(''); setFilterDeliveryDate('') }}
          >
            Reset Filter
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 text-[10px] font-bold text-slate-500">
          <span>{activeSos.length + pendingSos.length} PO</span>
          {(filterOrderDate || filterDeliveryDate) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">Filtered</span>}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-white/50 dark:bg-slate-900/50 p-1 rounded-xl glass-card">
          <TabsTrigger value="active" className="rounded-lg px-6">Order Aktif</TabsTrigger>
          <TabsTrigger value="pending" className="rounded-lg px-6 flex items-center gap-2">
            Request Client
            {pendingSos.length > 0 && (
              <Badge className="bg-rose-500 text-white h-5 min-w-[20px] px-1 animate-pulse">
                {pendingSos.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {selectedSoIds.length > 0 && (
            <div className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-widest bg-emerald-100 dark:bg-emerald-900/50 px-3 py-1.5 rounded-full">
                  {selectedSoIds.length} PO Terpilih
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-tight">Bulk Action:</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  className="bg-rose-600 hover:bg-rose-700 text-white font-black text-[10px] uppercase tracking-wider px-4 py-2 flex items-center gap-1"
                  onClick={handleBulkDeleteSOs}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Bulk Hapus
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 text-[10px] font-black uppercase tracking-wider"
                  onClick={() => setSelectedSoIds([])}
                >
                  Batal
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-md border bg-white dark:bg-slate-950">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 h-4 w-4 accent-emerald-600 cursor-pointer"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Target Delivery</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeSos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No active sales orders found.
                    </TableCell>
                  </TableRow>
                ) : (
                  activeSos.map((so) => {
                    const client = clients.find(c => c.id === so.clientId)
                    const items = salesOrderItems.filter(item => item.salesOrderId === so.id)
                    const total = items.reduce((sum, item) => sum + item.subtotal, 0)
                    const isRowSelected = selectedSoIds.includes(so.id)
                    
                    return (
                      <TableRow key={so.id} className={cn(isRowSelected && "bg-emerald-50/10 hover:bg-emerald-50/20")}>
                        <TableCell className="w-12 text-center">
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-300 h-4 w-4 accent-emerald-600 cursor-pointer"
                            checked={isRowSelected}
                            onChange={() => toggleSelectSo(so.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{so.poNumber}</TableCell>
                        <TableCell>{client?.companyName || 'Unknown Client'}</TableCell>
                        <TableCell>{format(new Date(so.orderDate), 'dd MMM yyyy')}</TableCell>
                        <TableCell>{format(new Date(so.targetDeliveryDate), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="font-semibold">{formatRupiah(total)}</TableCell>
                        <TableCell>
                          {(() => {
                            const finStatus = getFinancialStatus(so)
                            return (
                              <div className="flex flex-col items-start gap-1">
                                <Badge variant="outline" className={cn("font-black text-[9px] uppercase tracking-wider", finStatus.color)}>
                                  {finStatus.fullLabel || finStatus.label}
                                </Badge>
                                {so.status !== 'Draft' && so.status !== 'Terkirim' && so.status !== 'Selesai' && (
                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                                    Status: {so.status}
                                  </span>
                                )}
                              </div>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="text-right flex justify-end gap-2">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            title="Lihat Detail Pesanan"
                            onClick={() => {
                              setDetailSOId(so.id)
                              setIsDetailOpen(true)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            title="Edit PO"
                            onClick={() => handleEditSO(so)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            title="Hapus PO"
                            onClick={() => handleDeleteSO(so.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          
                          {so.status !== 'Draft' && (
                            <>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                title="Print Surat Jalan"
                                onClick={async () => {
                                  toast.loading("Menyiapkan Surat Jalan...", { id: "sj_gen" });
                                  // Use small timeout to allow UI to breathe
                                  setTimeout(() => {
                                    try {
                                      // @ts-ignore
                                      const url = generateSuratJalan(so.poNumber, undefined, 'dataurl');
                                      if (url) {
                                        setPdfPreview({ url: url as any, title: `Surat Jalan - ${so.poNumber}` });
                                        toast.success("Siap!", { id: "sj_gen" });
                                      } else {
                                        toast.error("Gagal generate PDF", { id: "sj_gen" });
                                      }
                                    } catch (e) {
                                      console.error(e);
                                      toast.error("Error PDF", { id: "sj_gen" });
                                    }
                                  }, 100);
                                }}
                              >
                                <Printer className="h-4 w-4 mr-1" /> SJ
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                title="Print Berita Acara"
                                onClick={async () => {
                                  toast.loading("Menyiapkan Berita Acara...", { id: "ba_gen" });
                                  setTimeout(() => {
                                    try {
                                      // @ts-ignore
                                      const url = generateBA(so.poNumber, undefined, 'dataurl');
                                      if (url) {
                                        setPdfPreview({ url: url as any, title: `Berita Acara - ${so.poNumber}` });
                                        toast.success("Siap!", { id: "ba_gen" });
                                      } else {
                                        toast.error("Gagal generate PDF", { id: "ba_gen" });
                                      }
                                    } catch (e) {
                                      console.error(e);
                                      toast.error("Error PDF", { id: "ba_gen" });
                                    }
                                  }, 100);
                                }}
                              >
                                <Printer className="h-4 w-4 mr-1" /> BA
                              </Button>
                            </>
                          )}
                          {/* Status Actions */}
                          {(so.status === 'Draft' && !so.shoppingListCompiledAt) && (
                            <Button size="sm" onClick={() => advanceStatus(so.id, so.status)}>
                              Approve (Go to Sourcing)
                            </Button>
                          )}
                          {(so.status === 'Belanja' || (so.status === 'Draft' && so.shoppingListCompiledAt)) && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100 font-bold" 
                              onClick={() => {
                                // If retroactively stuck in Draft but has compiled list, advance twice basically, but we just set it to Packing.
                                advanceStatus(so.id, 'Belanja') 
                              }}
                            >
                              Mulai Packing
                            </Button>
                          )}
                          {(so.status === 'Packing' || so.status === 'Siap Kirim') && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 font-bold"
                              onClick={() => advanceStatus(so.id, so.status)}
                            >
                              Kirim Pesanan
                            </Button>
                          )}
                          {so.status === 'Dikirim' && (
                            <Button 
                              size="sm" 
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold" 
                              onClick={() => advanceStatus(so.id, so.status)}
                            >
                              Tandai Terkirim
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="pending">
          <div className="rounded-md border bg-white dark:bg-slate-950 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900">
                <TableRow>
                  <TableHead>Request ID</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Target Delivery</TableHead>
                  <TableHead>Estimated Value</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingSos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">
                      Belum ada request order baru dari Client.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingSos.map((so) => {
                    const client = clients.find(c => c.id === so.clientId)
                    const items = salesOrderItems.filter(item => item.salesOrderId === so.id)
                    const total = items.reduce((sum, item) => sum + item.subtotal, 0)
                    
                    return (
                      <TableRow key={so.id} className="bg-emerald-50/10 hover:bg-emerald-50/20">
                        <TableCell className="font-bold text-emerald-700">{so.poNumber}</TableCell>
                        <TableCell>
                          <div className="font-semibold">{client?.companyName}</div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase">PIC: {client?.picName}</div>
                        </TableCell>
                        <TableCell>{format(new Date(so.targetDeliveryDate), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="font-black text-emerald-600">{formatRupiah(total)}</TableCell>
                        <TableCell className="text-right flex justify-end gap-2">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-8 w-8 p-0 text-emerald-600"
                            onClick={() => {
                              setDetailSOId(so.id)
                              setIsDetailOpen(true)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            title="Edit PO"
                            onClick={() => handleEditSO(so)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            title="Hapus PO"
                            onClick={() => handleDeleteSO(so.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            onClick={() => {
                              const customPo = window.prompt("Nomor PO (Edit jika perlu):", generateDocumentNumber('PO'));
                              if (customPo === null) return; // Cancel approval

                              updateSalesOrder(so.id, { 
                                status: 'Draft',
                                poNumber: customPo
                              })
                              toast.success("Request Approved! Silakan cek di tab Order Aktif.")
                            }}
                          >
                            Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-rose-500 font-bold"
                            onClick={() => {
                              updateSalesOrder(so.id, { status: 'Batal' })
                              toast.error("Request Rejected")
                            }}
                          >
                            Reject
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
          
          <div className="mt-8 p-8 bg-emerald-50/50 rounded-3xl border border-dashed border-emerald-200 flex flex-col items-center text-center space-y-4">
            <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-emerald-600">
              <Plus className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="font-black text-slate-800">Minta Client Order Mandiri?</h4>
              <p className="text-xs text-slate-500 max-w-xs">Pilih client untuk generate link order khusus yang bisa dikirim ke WhatsApp.</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md">
              <div className="flex-1 w-full relative">
                <Popover open={isShareClientSearchOpen} onOpenChange={setIsShareClientSearchOpen}>
                  <PopoverTrigger render={
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full h-12 justify-between font-normal bg-white rounded-xl border-slate-200"
                    >
                      <span className="truncate">
                        {shareClientId 
                          ? clients.find((c) => c.id === shareClientId)?.companyName 
                          : "Pilih Client..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  } />
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <div className="flex items-center border-b px-3 h-10">
                      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                      <input
                        placeholder="Cari client..."
                        className="flex h-full w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                      />
                    </div>
                      <div className="max-h-[300px] overflow-y-auto p-1">
                        {filteredClients.length === 0 ? (
                          <div className="py-6 text-center text-sm text-slate-500 font-bold uppercase tracking-widest italic">Klien tidak ditemukan.</div>
                        ) : (
                          filteredClients.map((c) => (
                            <button
                              key={c.id}
                              className={cn(
                                "relative flex w-full cursor-default select-none items-start rounded-xl py-3 pl-10 pr-3 text-sm outline-none hover:bg-slate-100 transition-colors",
                                shareClientId === c.id && "bg-slate-100"
                              )}
                              onClick={() => {
                                setShareClientId(c.id)
                                setIsShareClientSearchOpen(false)
                                setClientSearch("")
                              }}
                            >
                              <span className="absolute left-3 top-3.5 flex h-4 w-4 items-center justify-center">
                                {shareClientId === c.id && <Check className="h-4 w-4 text-emerald-600" />}
                              </span>
                              <div className="flex flex-col text-left">
                                <span className="font-bold text-slate-900">{c.companyName}</span>
                                {c.address && (
                                  <span className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{c.address}</span>
                                )}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="flex bg-white rounded-xl border p-1 shrink-0">
                <Input 
                  readOnly 
                  value={shareClientId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/order/${shareClientId}` : "Pilih client..."}
                  className="border-none shadow-none h-10 w-[200px] text-[10px] font-mono bg-transparent"
                />
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-10 text-xs font-bold text-emerald-600 hover:bg-emerald-50"
                  disabled={!shareClientId}
                  onClick={() => {
                    const link = `${window.location.origin}/order/${shareClientId}`
                    navigator.clipboard.writeText(link)
                    toast.success(`Link untuk ${clients.find(c => c.id === shareClientId)?.companyName} dicopy!`)
                  }}
                >
                  Copy Link
                </Button>
              </div>
              <Button 
                variant="link" 
                size="sm" 
                className="text-[10px] text-slate-400 font-bold uppercase"
                onClick={() => setIsClientQuickAddOpen(true)}
              >
                + Client Baru
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Quick Add Client Dialog */}
      <Dialog open={isClientQuickAddOpen} onOpenChange={setIsClientQuickAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Add New Client</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Company Name</Label>
              <Input 
                value={newClientData.companyName} 
                onChange={(e) => setNewClientData({...newClientData, companyName: e.target.value})}
                placeholder="Required"
              />
            </div>
            <div className="grid gap-2">
              <Label>PIC Name</Label>
              <Input 
                value={newClientData.picName} 
                onChange={(e) => setNewClientData({...newClientData, picName: e.target.value})}
                placeholder="Required"
              />
            </div>
            <div className="grid gap-2">
              <Label>Phone</Label>
              <Input 
                value={newClientData.phone} 
                onChange={(e) => setNewClientData({...newClientData, phone: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <Label>Hubungkan ke Brand</Label>
              <Select 
                value={newClientData.parentId || "none"}
                onValueChange={(val) => setNewClientData({ ...newClientData, parentId: (!val || val === "none") ? "" : val })}
              >
                <SelectTrigger className="h-10 rounded-xl bg-white border-slate-200 text-xs font-bold text-slate-700">
                  <SelectValue placeholder="Pilih Brand...">
                    {newClientData.parentId ? (
                      clients.find(c => c.id === newClientData.parentId)?.companyName || "Pilih Brand..."
                    ) : "Independent (Tidak Ada)"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-none shadow-2xl">
                  <SelectItem value="none">Independent (Tidak Ada)</SelectItem>
                  {clients
                    .filter(c => c.isBrand)
                    .map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.companyName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsClientQuickAddOpen(false)}>Cancel</Button>
            <Button onClick={handleQuickAddClient}>Save & Select</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Add Product Dialog */}
      <Dialog open={isProductQuickAddOpen} onOpenChange={setIsProductQuickAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Add New Product SKU</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Product Name</Label>
              <Input 
                value={newProductData.name} 
                onChange={(e) => setNewProductData({...newProductData, name: e.target.value})}
                placeholder="Required"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>SKU Code</Label>
                <Input 
                  value={newProductData.skuCode} 
                  onChange={(e) => setNewProductData({...newProductData, skuCode: e.target.value})}
                  placeholder="Required"
                />
              </div>
              <div className="grid gap-2">
                <Label>UOM</Label>
                <Input 
                  value={newProductData.uom} 
                  onChange={(e) => setNewProductData({...newProductData, uom: e.target.value})}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>Base Price</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-semibold">Rp</span>
                  <Input 
                    type="text"
                    inputMode="numeric"
                    className="pl-8"
                    value={formatNumber(newProductData.basePrice)} 
                    onChange={(e) => setNewProductData({...newProductData, basePrice: parseNumber(e.target.value)})}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Selling Price</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-semibold">Rp</span>
                  <Input 
                    type="text"
                    inputMode="numeric"
                    className="pl-8"
                    value={formatNumber(newProductData.sellingPrice)} 
                    onChange={(e) => setNewProductData({...newProductData, sellingPrice: parseNumber(e.target.value)})}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsProductQuickAddOpen(false)}>Cancel</Button>
            <Button onClick={handleQuickAddProduct}>Save & Select</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sales Order Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden rounded-[2rem]">
          <DialogHeader className="p-6 pb-0">
            <div className="flex justify-between items-start pr-8">
              <div>
                <DialogTitle className="text-xl font-black">{selectedSO?.poNumber}</DialogTitle>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Detail Dokumen Sales Order</p>
              </div>
              <Badge variant="outline" className={cn("rounded-lg font-black", STATUS_COLORS[selectedSO?.status || 'Draft'])}>
                {selectedSO?.status}
              </Badge>
            </div>
          </DialogHeader>

          {selectedSO?.status === 'Pending Approval' && (
            <div className="px-6 py-2 bg-emerald-50 border-y border-emerald-100">
               <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[9px] font-black uppercase text-emerald-600 tracking-widest pl-1">Nomor PO (Edit jika perlu)</Label>
                    <Input 
                      value={poNumberDraft}
                      onChange={(e) => setPoNumberDraft(e.target.value)}
                      className="h-10 font-black text-emerald-700 bg-white border-emerald-200"
                    />
                  </div>
                  <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tight max-w-[150px]">
                    Ubah nomor ini untuk menyesuaikan dengan PO fisik Client.
                  </div>
               </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-6">
            {/* SECTION: CLIENT INFO */}
            <div className="grid grid-cols-2 gap-6 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100">
               <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-slate-400">Customer / Client</p>
                  <p className="font-black text-slate-800">{selectedClient?.companyName}</p>
                  <p className="text-xs text-slate-500 italic leading-tight">{selectedClient?.address}</p>
               </div>
               <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-slate-400">Target Pengiriman</p>
                  <p className="font-black text-slate-800">{selectedSO ? format(new Date(selectedSO.targetDeliveryDate), 'dd MMMM yyyy') : '-'}</p>
                  <p className="text-xs text-emerald-600 font-bold">PIC: {selectedClient?.picName}</p>
               </div>
            </div>

            {/* SECTION: ITEMS TABLE */}
            <div className="space-y-3">
               <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                     <ShoppingCart className="w-4 h-4" /> Rincian Barang Pesanan
                  </h4>
                  {(selectedSO?.status === 'Pending Approval' || selectedSO?.status === 'Draft') && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 text-[10px] font-black uppercase border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                      onClick={saveOrderEdits}
                    >
                      Simpan Perubahan
                    </Button>
                  )}
               </div>
               <div className="rounded-2xl border overflow-hidden bg-white dark:bg-slate-950">
                  <Table>
                     <TableHeader>
                        <TableRow className="bg-slate-50 dark:bg-slate-900/50">
                           <TableHead className="text-[10px] font-black">Item SKU</TableHead>
                           <TableHead className="text-center text-[10px] font-black w-20">Qty</TableHead>
                           <TableHead className="text-right text-[10px] font-black">Harga Jual</TableHead>
                           <TableHead className="text-right text-[10px] font-black">Subtotal</TableHead>
                        </TableRow>
                     </TableHeader>
                     <TableBody>
                        {selectedItems.map((item) => {
                           const product = products.find(p => p.id === item.productId)
                           const isEditable = selectedSO?.status === 'Pending Approval' || selectedSO?.status === 'Draft'
                           const currentEdit = editingItems[item.id] || { qty: item.qty, price: item.unitPrice }
                           
                           return (
                              <TableRow key={item.id} className="hover:bg-slate-50/50">
                                 <TableCell>
                                    <p className="font-bold text-sm tracking-tight">{product?.name}</p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{product?.skuCode}</p>
                                 </TableCell>
                                 <TableCell className="text-center">
                                     {isEditable ? (
                                       <EditNumber
                                         decimal
                                         inputMode="decimal"
                                         placeholder="0"
                                         className="h-8 w-16 mx-auto text-center text-xs font-bold border-emerald-100 bg-emerald-50/10"
                                         value={currentEdit.qty}
                                         onCommit={(n) => handleUpdateItem(item.id, 'qty', n)}
                                       />
                                     ) : (
                                       <div>
                                         {item.qtyFinal !== undefined && item.qtyFinal < item.qty ? (
                                           <div className="space-y-0.5">
                                             <span className="font-bold text-sm text-amber-600">{item.qtyFinal} {product?.uom}</span>
                                             <p className="text-[9px] text-slate-400 line-through">{item.qty} {product?.uom}</p>
                                             <p className="text-[8px] text-amber-500 font-bold">{item.qtyAdjustmentReason || 'QC Adjusted'}</p>
                                           </div>
                                         ) : (
                                           <span className="font-bold text-sm">{item.qty} {product?.uom}</span>
                                         )}
                                       </div>
                                     )}
                                  </TableCell>
                                 <TableCell className="text-right">
                                    {isEditable ? (
                                      <div className="relative inline-block w-28">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">Rp</span>
                                        <EditNumber
                                          format
                                          inputMode="numeric"
                                          className="h-8 pl-7 pr-1 text-right text-xs font-black text-emerald-600 border-emerald-100 bg-emerald-50/10"
                                          value={currentEdit.price}
                                          onCommit={(n) => handleUpdateItem(item.id, 'price', n)}
                                        />
                                      </div>
                                    ) : (
                                      <span className="text-xs font-medium text-slate-600">{formatRupiah(item.unitPrice)}</span>
                                    )}
                                 </TableCell>
                                 <TableCell className="text-right font-black text-sm text-slate-900">
                                    <div className="flex items-center justify-end gap-2">
                                       <span>{formatRupiah(currentEdit.qty * currentEdit.price)}</span>
                                       {isEditable && (
                                         <button
                                           onClick={() => handleRemoveItemFromOrder(item.id)}
                                           title="Hapus item"
                                           className="text-slate-300 hover:text-rose-600 transition-colors shrink-0"
                                         >
                                           <Trash2 className="w-3.5 h-3.5" />
                                         </button>
                                       )}
                                    </div>
                                 </TableCell>
                              </TableRow>
                           )
                        })}
                     </TableBody>
                  </Table>
               </div>

               {(selectedSO?.status === 'Draft' || selectedSO?.status === 'Pending Approval') && (
                 <div className="mt-1 p-3 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/30 space-y-2">
                   <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1.5">
                     <Plus className="w-3.5 h-3.5" /> Tambah Item
                   </p>
                   <div className="flex gap-2 items-stretch">
                     <Popover open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
                       <PopoverTrigger render={
                         <Button
                           variant="outline"
                           role="combobox"
                           className="flex-1 h-9 justify-between font-normal bg-white rounded-xl border-slate-200 text-xs"
                         >
                           <span className="truncate">
                             {addItemProductId
                               ? products.find(p => p.id === addItemProductId)?.name
                               : "Pilih produk..."}
                           </span>
                           <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                         </Button>
                       } />
                       <PopoverContent className="w-[320px] p-0" align="start">
                         <div className="flex items-center border-b px-3 h-10">
                           <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                           <input
                             placeholder="Cari produk / SKU..."
                             className="flex h-full w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                             value={addItemSearch}
                             onChange={(e) => setAddItemSearch(e.target.value)}
                           />
                         </div>
                         <div className="max-h-[260px] overflow-y-auto p-1">
                           {(() => {
                             const q = addItemSearch.toLowerCase()
                             const list = products
                               .filter(p => !q || p.name.toLowerCase().includes(q) || (p.skuCode || '').toLowerCase().includes(q))
                               .slice(0, 50)
                             if (list.length === 0) {
                               return <div className="py-6 text-center text-xs text-slate-400 italic font-bold uppercase tracking-widest">Produk tidak ditemukan</div>
                             }
                             return list.map(p => (
                               <button
                                 key={p.id}
                                 className={cn(
                                   "flex w-full items-center rounded-xl py-2 px-3 text-sm outline-none hover:bg-slate-100 transition-colors",
                                   addItemProductId === p.id && "bg-slate-100"
                                 )}
                                 onClick={() => { setAddItemProductId(p.id); setIsAddItemOpen(false); setAddItemSearch("") }}
                               >
                                 <div className="flex flex-col text-left">
                                   <span className="font-bold text-slate-900 text-xs">{p.name}</span>
                                   <span className="text-[9px] text-slate-400 font-bold uppercase">{p.skuCode} • {p.uom}</span>
                                 </div>
                               </button>
                             ))
                           })()}
                         </div>
                       </PopoverContent>
                     </Popover>
                     <EditNumber
                       decimal
                       inputMode="decimal"
                       placeholder="Qty"
                       className="h-9 w-20 text-center text-xs font-bold bg-white rounded-xl border-slate-200"
                       value={addItemQty}
                       onCommit={setAddItemQty}
                     />
                     <Button
                       onClick={handleAddItemToOrder}
                       disabled={!addItemProductId}
                       className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl px-4"
                     >
                       Tambah
                     </Button>
                   </div>
                   {addItemProductId && selectedSO && (
                     <p className="text-[10px] text-slate-500 font-bold pl-1">
                       Harga otomatis: {formatRupiah(resolveClientPrice(addItemProductId, selectedSO.clientId).price)} <span className="text-slate-400">(dari price list client)</span>
                     </p>
                   )}
                 </div>
               )}
            </div>

            {/* SECTION: ARCHIVED DOCUMENTS (FOR TUKAR FAKTUR) */}
            {(selectedSO?.archivedSuratJalanUrl || selectedSO?.archivedBaUrl) && (
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-black uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                   <FileText className="w-4 h-4" /> Arsip Dokumen Digital (Tukar Faktur)
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  {selectedSO?.archivedSuratJalanUrl && (
                    <div className="p-4 rounded-[2rem] bg-emerald-50/50 border border-emerald-100 flex items-center justify-between group overflow-hidden relative">
                      <div className="absolute -left-2 -bottom-2 w-12 h-12 bg-emerald-100 rounded-full blur-2xl opacity-50 group-hover:scale-150 transition-all duration-500" />
                      <div className="flex items-center gap-3 relative">
                        <div className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center text-emerald-600 border border-emerald-50">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="cursor-pointer" onClick={() => setPdfPreview({ url: selectedSO.archivedSuratJalanUrl!, title: `Surat Jalan - ${selectedSO.poNumber}` })}>
                          <p className="text-[10px] font-black uppercase tracking-tight text-slate-800 hover:text-emerald-600 transition-colors">Surat Jalan</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">PDF • SIGNED (View)</p>
                        </div>
                      </div>
                      <div className="flex gap-2 relative">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-10 w-10 rounded-2xl bg-white shadow-sm border border-emerald-100 text-emerald-600 hover:bg-emerald-50 transition-all duration-300"
                          onClick={() => setPdfPreview({ url: selectedSO.archivedSuratJalanUrl!, title: `Surat Jalan - ${selectedSO.poNumber}` })}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-10 w-10 rounded-2xl bg-white shadow-sm border border-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all duration-300"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = selectedSO.archivedSuratJalanUrl!;
                            link.download = `Surat_Jalan_${selectedSO.poNumber}.pdf`;
                            link.click();
                          }}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  {selectedSO?.archivedBaUrl && (
                    <div className="p-4 rounded-[2rem] bg-indigo-50/50 border border-indigo-100 flex items-center justify-between group overflow-hidden relative">
                       <div className="absolute -left-2 -bottom-2 w-12 h-12 bg-indigo-100 rounded-full blur-2xl opacity-50 group-hover:scale-150 transition-all duration-500" />
                      <div className="flex items-center gap-3 relative">
                        <div className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center text-indigo-600 border border-indigo-50">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="cursor-pointer" onClick={() => setPdfPreview({ url: selectedSO.archivedBaUrl!, title: `Berita Acara - ${selectedSO.poNumber}` })}>
                          <p className="text-[10px] font-black uppercase tracking-tight text-slate-800 hover:text-indigo-600 transition-colors">Berita Acara</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">PDF • SIGNED (View)</p>
                        </div>
                      </div>
                      <div className="flex gap-2 relative">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-10 w-10 rounded-2xl bg-white shadow-sm border border-indigo-100 text-indigo-600 hover:bg-indigo-50 transition-all duration-300"
                          onClick={() => setPdfPreview({ url: selectedSO.archivedBaUrl!, title: `Berita Acara - ${selectedSO.poNumber}` })}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-10 w-10 rounded-2xl bg-white shadow-sm border border-indigo-100 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all duration-300"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = selectedSO.archivedBaUrl!;
                            link.download = `BA_${selectedSO.poNumber}.pdf`;
                            link.click();
                          }}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center italic mt-2">
                  * Dokumen di atas adalah salinan digital resmi yang sudah ditanda tangani oleh Kurir & Klien.
                </p>
              </div>
            )}

            {/* SECTION: SUMMARY & ACTION */}
            <div className="p-6 bg-slate-900 rounded-3xl text-white shadow-xl shadow-slate-200">
               <div className="flex justify-between items-center">
                  <div className="space-y-1">
                     <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Estimasi Total Nilai</p>
                     <h3 className="text-2xl font-black text-emerald-400">
                        {formatRupiah(Object.values(editingItems).reduce((sum, item) => sum + (item.qty * item.price), 0))}
                     </h3>
                  </div>
                  {selectedSO?.status === 'Pending Approval' && (
                    <Button 
                      className="bg-emerald-500 hover:bg-emerald-600 hover:scale-105 transition-all text-white font-black h-12 px-8 rounded-xl shadow-lg shadow-emerald-900/40"
                      onClick={() => {
                        // Batch save and approve
                        Object.entries(editingItems).forEach(([itemId, data]) => {
                          updateSalesOrderItem(itemId, { 
                            qty: data.qty, 
                            unitPrice: data.price,
                            subtotal: data.qty * data.price
                          })
                        })
                        updateSalesOrder(selectedSO.id, { 
                          status: 'Draft',
                          poNumber: poNumberDraft || generateDocumentNumber('PO')
                        })
                        setIsDetailOpen(false)
                        toast.success("Pesanan Disetujui & PO Diterbitkan!")
                      }}
                    >
                      Setuju & Buat PO
                    </Button>
                  )}
               </div>
            </div>

            <div className="flex justify-center pt-2">
               <Button variant="link" onClick={() => setIsDetailOpen(false)} className="text-slate-400 text-[10px] font-black uppercase">
                  Tutup Tanpa Approve
               </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF PREVIEW MODAL */}
      <Dialog open={!!pdfPreview} onOpenChange={(open) => !open && setPdfPreview(null)}>
        <DialogContent className="max-w-[96vw] w-[96vw] h-[96vh] p-0 rounded-[2rem] overflow-hidden border-none bg-slate-900 shadow-2xl flex flex-col">
          <DialogHeader className="p-6 bg-slate-900 text-white flex flex-row items-center justify-between shrink-0">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                   <FileText className="w-5 h-5" />
                </div>
                <div>
                   <DialogTitle className="text-lg font-black tracking-tight">{pdfPreview?.title}</DialogTitle>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Document Preview Mode</p>
                </div>
             </div>
             <Button 
                variant="ghost" 
                className="text-slate-400 hover:text-white hover:bg-white/10 rounded-xl"
                onClick={() => {
                  if (pdfPreview) {
                    const link = document.createElement('a');
                    link.href = pdfPreview.url;
                    link.download = `${pdfPreview.title}.pdf`;
                    link.click();
                  }
                }}
             >
                <Download className="w-4 h-4 mr-2" /> Download PDF
             </Button>
          </DialogHeader>
          <div className="flex-1 bg-slate-800 relative">
             {pdfPreview && (
                <iframe 
                   src={pdfPreview.url} 
                   className="w-full h-full border-none"
                   title="PDF Preview"
                />
             )}
          </div>
          <div className="p-4 bg-slate-900 border-t border-white/5 flex justify-center sticky bottom-0">
             <Button 
                className="rounded-2xl bg-white text-slate-900 font-black px-12 h-12 uppercase text-[10px] tracking-widest"
                onClick={() => setPdfPreview(null)}
             >
                Tutup Preview
             </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

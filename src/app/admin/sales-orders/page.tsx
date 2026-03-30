"use client"

import { useState, useEffect } from "react"
import { useAppStore } from "@/lib/store"
import { cn, formatRupiah, formatNumber, parseNumber } from "@/lib/utils"
import { Plus, Trash2, ShoppingCart, Search, ChevronsUpDown, Check, Eye, FileText, Download } from "lucide-react"
import { v4 as uuidv4 } from "uuid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { STATUS_COLORS } from "@/lib/constants"
import { SalesOrderStatus, SalesOrderItem } from "@/types"
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
import { generateDocumentNumber } from "@/lib/accounting"
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
}

export default function SalesOrdersPage() {
  const salesOrders = useAppStore(state => state.salesOrders)
  const salesOrderItems = useAppStore(state => state.salesOrderItems)
  const clients = useAppStore(state => state.clients)
  const products = useAppStore(state => state.products)
  const addSalesOrder = useAppStore(state => state.addSalesOrder)
  const addSalesOrderItems = useAppStore(state => state.addSalesOrderItems)
  const updateSalesOrder = useAppStore(state => state.updateSalesOrder)
  const updateSalesOrderItem = useAppStore(state => state.updateSalesOrderItem)
  const getHistoricalClientPrice = useAppStore(state => state.getHistoricalClientPrice)
  
  const [isOpen, setIsOpen] = useState(false)
  const [clientId, setClientId] = useState("")
  const [targetDate, setTargetDate] = useState(() => format(new Date(Date.now() + 86400000 * 3), 'yyyy-MM-dd')) // 3 days from now
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  
  // Detail view state
  const [detailSOId, setDetailSOId] = useState<string | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("active")
  const [shareClientId, setShareClientId] = useState<string>("")
  const [isShareClientSearchOpen, setIsShareClientSearchOpen] = useState(false)
  const [isClientQuickAddOpen, setIsClientQuickAddOpen] = useState(false)
  const [isProductQuickAddOpen, setIsProductQuickAddOpen] = useState(false)
  const [newClientData, setNewClientData] = useState({ companyName: "", picName: "", email: "", phone: "", address: "" })
  const [newProductData, setNewProductData] = useState({ skuCode: "", name: "", uom: "kg", basePrice: 0, sellingPrice: 0 })
  const [editingItems, setEditingItems] = useState<{ [id: string]: { qty: number, price: number } }>({})
  
  // New line item draft
  const [newLineProductId, setNewLineProductId] = useState("")
  const [newLineQty, setNewLineQty] = useState(1)
  const [newLinePrice, setNewLinePrice] = useState(0)

  const addClient = useAppStore(state => state.addClient)
  const addProduct = useAppStore(state => state.addProduct)

  // Search and Select states
  const [clientSearch, setClientSearch] = useState("")
  const [pdfPreview, setPdfPreview] = useState<{ url: string, title: string } | null>(null)
  const [productSearch, setProductSearch] = useState("")
  const [isClientSearchOpen, setIsClientSearchOpen] = useState(false)
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false)

  const filteredClients = clients.filter(c => 
    c.companyName.toLowerCase().includes(clientSearch.toLowerCase())
  ).slice(0, 50)

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.skuCode.toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 50)

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
      const items = salesOrderItems.filter(item => item.salesOrderId === detailSOId)
      const editingObj: { [id: string]: { qty: number, price: number } } = {}
      items.forEach(item => {
        editingObj[item.id] = { qty: item.qty, price: item.unitPrice }
      })
      setEditingItems(editingObj)
    }
  }, [detailSOId])

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
      createdAt: new Date().toISOString()
    })
    setClientId(id)
    setShareClientId(id)
    setIsClientQuickAddOpen(false)
    setNewClientData({ companyName: "", picName: "", email: "", phone: "", address: "" })
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

  const handleProductSelect = (pid: string) => {
    setNewLineProductId(pid)
    const product = products.find(p => p.id === pid)
    
    // Check for historical price if client is selected
    if (clientId && pid) {
      const historicalPrice = getHistoricalClientPrice(clientId, pid)
      if (historicalPrice) {
        setNewLinePrice(historicalPrice)
        return
      }
    }

    if (product) {
      setNewLinePrice(product.sellingPrice)
    }
  }

  const addLineItem = () => {
    if (!newLineProductId || newLineQty <= 0 || newLinePrice <= 0) return
    
    const product = products.find(p => p.id === newLineProductId)
    if (!product) return

    setLineItems([...lineItems, {
      id: uuidv4(),
      productId: product.id,
      productName: product.name,
      qty: newLineQty,
      unitPrice: newLinePrice
    }])

    setNewLineProductId("")
    setNewLineQty(1)
    setNewLinePrice(0)
  }

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter(item => item.id !== id))
  }

  const generateBA = (po: string) => {
    // Placeholder
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

    const soId = uuidv4()
    
    // Create SO FIRST (Sequential)
    await addSalesOrder({
      id: soId,
      poNumber: generateDocumentNumber('PO'),
      clientId,
      orderDate: new Date().toISOString(),
      targetDeliveryDate: new Date(targetDate).toISOString(),
      status: 'Draft'
    })

    // Create Line Items in Batch (Sequential after SO)
    const itemsToAdd: SalesOrderItem[] = lineItems.map(item => ({
      id: uuidv4(),
      salesOrderId: soId,
      productId: item.productId,
      qty: item.qty,
      unitPrice: item.unitPrice,
      subtotal: item.qty * item.unitPrice
    }))

    await addSalesOrderItems(itemsToAdd)

    toast.success("Sales Order created successfully")
    setIsOpen(false)
    setClientId("")
    setLineItems([])
  }

  const advanceStatus = (soId: string, currentStatus: string) => {
    const nextStatus = 
      currentStatus === 'Draft' ? 'Belanja' :
      currentStatus === 'Belanja' ? 'Packing' :
      currentStatus === 'Packing' ? 'Dikirim' :
      currentStatus === 'Dikirim' ? 'Terkirim' : currentStatus;
      
    updateSalesOrder(soId, { status: nextStatus as SalesOrderStatus })
    toast.success(`Status updated to ${nextStatus}`)
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
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger render={
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New Sales Order
            </Button>
          } />
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Sales Order</DialogTitle>
            </DialogHeader>
            <div className="grid gap-6 py-4">
              
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
                                "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-800",
                                clientId === c.id && "bg-slate-100 dark:bg-slate-800"
                              )}
                              onClick={() => {
                                setClientId(c.id)
                                setIsClientSearchOpen(false)
                                setClientSearch("")
                              }}
                            >
                              <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                {clientId === c.id && <Check className="h-4 w-4" />}
                              </span>
                              {c.companyName}
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
                
                <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-dashed">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-6 space-y-1">
                      <div className="flex justify-between items-center px-1">
                        <Label className="text-xs font-semibold">Pilih Produk</Label>
                        <button 
                          type="button" 
                          onClick={() => setIsProductQuickAddOpen(true)}
                          className="text-[10px] text-emerald-600 font-bold hover:underline"
                        >
                          + SKU Baru
                        </button>
                      </div>
                      <Popover open={isProductSearchOpen} onOpenChange={setIsProductSearchOpen}>
                        <PopoverTrigger render={
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={isProductSearchOpen}
                            className="w-full justify-between font-normal bg-white dark:bg-slate-950 h-10"
                          >
                            <span className="truncate">
                              {newLineProductId 
                                ? products.find((p) => p.id === newLineProductId)?.name 
                                : "Pilih barang..."}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        } />
                        <PopoverContent className="w-[350px] p-0" align="start">
                          <div className="flex items-center border-b px-3 h-10">
                            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                            <input
                              placeholder="Cari nama atau SKU..."
                              className="flex h-full w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                              value={productSearch}
                              onChange={(e) => setProductSearch(e.target.value)}
                            />
                          </div>
                          <div className="max-h-[300px] overflow-y-auto p-1">
                            {filteredProducts.length === 0 ? (
                              <div className="py-6 text-center text-sm">Barang tidak ditemukan.</div>
                            ) : (
                              filteredProducts.map((p) => (
                                <button
                                  key={p.id}
                                  className={cn(
                                    "relative flex w-full cursor-default select-none flex-col items-start rounded-sm py-2 pl-8 pr-2 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-800",
                                    newLineProductId === p.id && "bg-slate-100 dark:bg-slate-800"
                                  )}
                                  onClick={() => {
                                    handleProductSelect(p.id)
                                    setIsProductSearchOpen(false)
                                    setProductSearch("")
                                  }}
                                >
                                  <span className="absolute left-2 top-2.5 flex h-3.5 w-3.5 items-center justify-center">
                                    {newLineProductId === p.id && <Check className="h-4 w-4" />}
                                  </span>
                                  <span className="font-semibold">{p.name}</span>
                                  <div className="flex gap-2 items-center mt-1">
                                    <span className="text-[10px] text-muted-foreground">{p.skuCode} • {formatRupiah(p.sellingPrice)}</span>
                                    {p.weeklyPriceRange && (
                                      <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" title="Patokan Harga Mingguan (Kamis-Rabu)">
                                        Patokan: {formatRupiah(p.weeklyPriceRange.min)} - {formatRupiah(p.weeklyPriceRange.max)}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    
                    <div className="md:col-span-2 space-y-1">
                      <Label className="text-xs font-semibold">Qty</Label>
                      <Input 
                        type="number" 
                        min="1" 
                        className="bg-white dark:bg-slate-950"
                        value={newLineQty}
                        onChange={(e) => setNewLineQty(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    
                    <div className="md:col-span-3 space-y-1">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs font-semibold">Harga Satuan (Rp)</Label>
                        {clientId && newLineProductId && getHistoricalClientPrice(clientId, newLineProductId) && (
                          <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-1 rounded border border-blue-200 uppercase">
                            Harga History Client
                          </span>
                        )}
                      </div>
                      <Input 
                        type="text"
                        inputMode="numeric"
                        className="bg-white dark:bg-slate-950 font-bold"
                        value={formatNumber(newLinePrice)}
                        onChange={(e) => setNewLinePrice(parseNumber(e.target.value))}
                      />
                    </div>

                    <div className="md:col-span-1">
                      <Button 
                        type="button" 
                        variant="default" 
                        onClick={addLineItem} 
                        disabled={!newLineProductId}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 italic px-1">
                    Pilih barang, isi qty, lalu klik tombol hijau (+) untuk menambah ke daftar order.
                  </p>
                </div>

                {lineItems.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Daftar Barang Pesanan:</h4>
                    <div className="rounded-md border bg-white dark:bg-slate-950 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50 dark:bg-slate-900/50">
                            <TableHead className="text-xs">Product</TableHead>
                            <TableHead className="text-right text-xs w-20">Qty</TableHead>
                            <TableHead className="text-right text-xs">Price</TableHead>
                            <TableHead className="text-right text-xs">Subtotal</TableHead>
                            <TableHead className="w-[40px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lineItems.map(item => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium text-sm py-2">{item.productName}</TableCell>
                              <TableCell className="text-right text-sm py-2">{item.qty}</TableCell>
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
              <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveSO}>Create Sales Order</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-white/50 dark:bg-slate-900/50 p-1 rounded-xl glass-card">
          <TabsTrigger value="active" className="rounded-lg px-6">Order Aktif</TabsTrigger>
          <TabsTrigger value="pending" className="rounded-lg px-6 flex items-center gap-2">
            Request Client
            {salesOrders.filter(so => so.status === 'Pending Approval').length > 0 && (
              <Badge className="bg-rose-500 text-white h-5 min-w-[20px] px-1 animate-pulse">
                {salesOrders.filter(so => so.status === 'Pending Approval').length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <div className="rounded-md border bg-white dark:bg-slate-950">
            <Table>
              <TableHeader>
                <TableRow>
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
                {salesOrders.filter(so => so.status !== 'Pending Approval').length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No active sales orders found.
                    </TableCell>
                  </TableRow>
                ) : (
                  salesOrders.filter(so => so.status !== 'Pending Approval').map((so) => {
                    const client = clients.find(c => c.id === so.clientId)
                    const items = salesOrderItems.filter(item => item.salesOrderId === so.id)
                    const total = items.reduce((sum, item) => sum + item.subtotal, 0)
                    
                    return (
                      <TableRow key={so.id}>
                        <TableCell className="font-medium">{so.poNumber}</TableCell>
                        <TableCell>{client?.companyName || 'Unknown Client'}</TableCell>
                        <TableCell>{format(new Date(so.orderDate), 'dd MMM yyyy')}</TableCell>
                        <TableCell>{format(new Date(so.targetDeliveryDate), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="font-semibold">{formatRupiah(total)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_COLORS[so.status] || ''}>
                            {so.status}
                          </Badge>
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
                          
                          {so.status !== 'Draft' && (
                            <>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                title="Print Surat Jalan"
                                onClick={() => {
                                  generateSuratJalan(so.poNumber)
                                  toast.success("Surat Jalan generated")
                                }}
                              >
                                <Printer className="h-4 w-4 mr-1" /> SJ
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                title="Print Berita Acara"
                                onClick={() => {
                                  generateBA(so.poNumber)
                                  toast.success("Berita Acara generated")
                                }}
                              >
                                <Printer className="h-4 w-4 mr-1" /> BA
                              </Button>
                            </>
                          )}
                          {so.status === 'Draft' && (
                            <Button size="sm" onClick={() => advanceStatus(so.id, so.status)}>
                              Approve (Go to Sourcing)
                            </Button>
                          )}
                          {so.status === 'Belanja' && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">TIM PASAR</Badge>
                          )}
                          {so.status === 'Packing' && (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">DI GUDANG</Badge>
                          )}
                          {so.status === 'Terkirim' && (
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200">SELESAI</Badge>
                          )}
                          {so.status === 'Dikirim' && (
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200">DALAM PERJALANAN</Badge>
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
                {salesOrders.filter(so => so.status === 'Pending Approval').length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">
                      Belum ada request order baru dari Client.
                    </TableCell>
                  </TableRow>
                ) : (
                  salesOrders.filter(so => so.status === 'Pending Approval').map((so) => {
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
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            onClick={() => {
                              updateSalesOrder(so.id, { 
                                status: 'Draft',
                                poNumber: generateDocumentNumber('PO') // Convert REQ to real PO
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
                        <div className="py-6 text-center text-sm text-slate-500">Klien tidak ditemukan.</div>
                      ) : (
                        filteredClients.map((c) => (
                          <button
                            key={c.id}
                            className={cn(
                              "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-slate-100",
                              shareClientId === c.id && "bg-slate-100"
                            )}
                            onClick={() => {
                              setShareClientId(c.id)
                              setIsShareClientSearchOpen(false)
                              setClientSearch("")
                            }}
                          >
                            <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                              {shareClientId === c.id && <Check className="h-4 w-4" />}
                            </span>
                            {c.companyName}
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
        <DialogContent className="sm:max-w-[600px] h-[90vh] flex flex-col p-0 overflow-hidden rounded-[2rem]">
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
                                       <Input 
                                         type="number"
                                         className="h-8 w-16 mx-auto text-center text-xs font-bold border-emerald-100 bg-emerald-50/10"
                                         value={currentEdit.qty}
                                         onChange={(e) => handleUpdateItem(item.id, 'qty', parseFloat(e.target.value) || 0)}
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
                                        <Input 
                                          type="text"
                                          inputMode="numeric"
                                          className="h-8 pl-7 pr-1 text-right text-xs font-black text-emerald-600 border-emerald-100 bg-emerald-50/10"
                                          value={formatNumber(currentEdit.price)}
                                          onChange={(e) => handleUpdateItem(item.id, 'price', parseNumber(e.target.value) || 0)}
                                        />
                                      </div>
                                    ) : (
                                      <span className="text-xs font-medium text-slate-600">{formatRupiah(item.unitPrice)}</span>
                                    )}
                                 </TableCell>
                                 <TableCell className="text-right font-black text-sm text-slate-900">
                                    {formatRupiah(currentEdit.qty * currentEdit.price)}
                                 </TableCell>
                              </TableRow>
                           )
                        })}
                     </TableBody>
                  </Table>
               </div>
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
                          poNumber: generateDocumentNumber('PO')
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
        <DialogContent className="max-w-5xl h-[90vh] p-0 rounded-[2rem] overflow-hidden border-none bg-slate-900 shadow-2xl flex flex-col">
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

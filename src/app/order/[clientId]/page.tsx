"use client"

import { useState, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAppStore } from "@/lib/store"
import { motion, AnimatePresence } from "framer-motion"
import { Product, SalesOrder, SalesOrderItem, ClientPrice } from "@/types"
import { 
  ShoppingCart, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  ChevronLeft,
  Calendar,
  Store,
  ArrowRight,
  Sparkles,
  HelpCircle,
  Search
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { formatRupiah } from "@/lib/utils"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import { format, addDays } from "date-fns"

interface OrderItem {
  product: Product;
  qty: number;
  isPriceRequest: boolean;
  effectivePrice: number;
}

export default function ClientOrderPage() {
  const params = useParams()
  const router = useRouter()
  const clientId = params.clientId as string
  
  const clients = useAppStore(state => state.clients)
  const products = useAppStore(state => state.products)
  const clientPrices = useAppStore(state => state.clientPrices) || []
  const addSalesOrder = useAppStore(state => state.addSalesOrder)
  const addSalesOrderItems = useAppStore(state => state.addSalesOrderItems)
  
  const client = useMemo(() => clients.find(c => c.id === clientId), [clients, clientId])
  
  const [searchTerm, setSearchTerm] = useState("")
  const [catalogSearch, setCatalogSearch] = useState("")
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [deliveryDate, setDeliveryDate] = useState<string>(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  // Calculate dynamic price based on tier preference
  const calculateEffectivePrice = (product: Product, record?: ClientPrice) => {
    if (!record) return { price: 0, isCustom: false } // Price Request
    
    let price = product.sellingPrice
    if (record.tier === 'Custom') {
      price = record.agreedPrice
    } else if (record.tier === 'Tier 1') {
      price = product.tier1Price || Math.round(product.basePrice * 1.5) || product.sellingPrice
    } else if (record.tier === 'Tier 2') {
      price = product.tier2Price || Math.round(product.basePrice * 1.3) || product.sellingPrice
    } else if (record.tier === 'Tier 3') {
      price = product.tier3Price || Math.round(product.basePrice * 1.2) || product.sellingPrice
    } else if (record.tier === 'Tier 4') {
      price = product.tier4Price || Math.round(product.basePrice * 1.15) || product.sellingPrice
    } else if (record.tier === 'Tier 5') {
      price = product.tier5Price || Math.round(product.basePrice * 1.1) || product.sellingPrice
    }
    return { price, isCustom: true }
  }

  // Map of client prices for O(1) lookup
  const clientPriceMap = useMemo(() => {
    const map = new Map<string, ClientPrice>()
    clientPrices.forEach(cp => {
      if (cp.clientId === clientId) map.set(cp.productId, cp)
    })
    return map
  }, [clientPrices, clientId])

  // Products configured in Price List (Katalog Penawaran)
  const configuredProducts = useMemo(() => {
    return products
      .filter(p => clientPriceMap.has(p.id))
      .filter(p => !catalogSearch || p.name.toLowerCase().includes(catalogSearch.toLowerCase()) || p.skuCode.toLowerCase().includes(catalogSearch.toLowerCase()))
      .map(p => {
        const record = clientPriceMap.get(p.id)
        const { price } = calculateEffectivePrice(p, record)
        return { product: p, effectivePrice: price, record }
      })
  }, [products, clientPriceMap, catalogSearch])

  // Products NOT in Price List (Request Harga)
  const availableProducts = useMemo(() => {
    if (!searchTerm) return []
    return products
      .filter(p => !clientPriceMap.has(p.id))
      .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.skuCode.toLowerCase().includes(searchTerm.toLowerCase()))
      .slice(0, 5)
  }, [products, clientPriceMap, searchTerm])

  const addToOrder = (product: Product, isPriceRequest: boolean, effectivePrice: number) => {
    const existing = orderItems.find(item => item.product.id === product.id)
    if (existing) {
      setOrderItems(orderItems.map(item => 
        item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item
      ))
    } else {
      setOrderItems([...orderItems, { product, qty: 1, isPriceRequest, effectivePrice }])
    }
    setSearchTerm("")
    toast.success(`${product.name} ditambahkan ke keranjang`)
  }

  const updateQty = (productId: string, delta: number) => {
    setOrderItems(orderItems.map(item => {
      if (item.product.id === productId) {
        const newQty = Math.max(1, item.qty + delta)
        return { ...item, qty: newQty }
      }
      return item
    }))
  }

  const setQty = (productId: string, value: number) => {
    setOrderItems(orderItems.map(item => {
      if (item.product.id === productId) {
        return { ...item, qty: value }
      }
      return item
    }))
  }

  const removeItem = (productId: string) => {
    setOrderItems(orderItems.filter(item => item.product.id !== productId))
  }

  const totalAmount = orderItems.reduce((sum, item) => sum + (item.effectivePrice * item.qty), 0)
  const pendingPriceCount = orderItems.filter(item => item.isPriceRequest).length

  const handleSubmit = async () => {
    if (orderItems.length === 0) {
      toast.error("Pilih minimal satu produk")
      return
    }
    
    setIsSubmitting(true)
    
    const soId = uuidv4()
    
    // Create SO Request FIRST (Sequential)
    await addSalesOrder({
      id: soId,
      poNumber: `REQ-${uuidv4().slice(0, 8).toUpperCase()}`,
      clientId: clientId,
      orderDate: new Date().toISOString(),
      targetDeliveryDate: new Date(deliveryDate).toISOString(),
      status: 'Pending Approval'
    })
    
    // Create Items in Batch (Sequential after SO)
    const itemsToAdd: SalesOrderItem[] = orderItems.map(item => ({
      id: uuidv4(),
      salesOrderId: soId,
      productId: item.product.id,
      qty: item.qty,
      unitPrice: item.isPriceRequest ? 0 : item.effectivePrice,
      subtotal: item.isPriceRequest ? 0 : (item.qty * item.effectivePrice),
      qtyAdjustmentReason: item.isPriceRequest ? "Request Harga Baru" : undefined
    }))

    await addSalesOrderItems(itemsToAdd)
    
    setIsSubmitting(false)
    setIsSuccess(true)
    toast.success("Pesanan berhasil dikirim ke Admin!")
  }

  if (!client && !isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <Card className="max-w-md w-full text-center p-12 space-y-4">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <Store className="w-8 h-8" />
          </div>
          <CardTitle className="text-2xl">Client Not Found</CardTitle>
          <CardDescription>Link order tidak valid atau client tidak terdaftar.</CardDescription>
          <Button variant="outline" onClick={() => router.push('/')}>Kembali ke Home</Button>
        </Card>
      </div>
    )
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-emerald-50/30">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md w-full"
        >
          <Card className="border-none shadow-2xl glass-card text-center p-8 space-y-6">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">Terima Kasih!</h2>
              <p className="text-slate-500 font-medium">Pesanan Anda telah diterima dan sedang diproses oleh tim Admin kami.</p>
            </div>
            <div className="p-4 bg-white/50 rounded-2xl border border-emerald-100 space-y-1">
              <p className="text-[10px] font-black uppercase text-slate-400">Estimasi Total</p>
              <p className="text-2xl font-black text-emerald-600">{formatRupiah(totalAmount)}</p>
              {pendingPriceCount > 0 && (
                <p className="text-xs font-semibold text-amber-600 mt-2">
                  + {pendingPriceCount} item menunggu konfirmasi harga
                </p>
              )}
            </div>
            <Button className="w-full h-12 bg-slate-900 text-white rounded-xl font-black" onClick={() => {
              setOrderItems([])
              setIsSuccess(false)
            }}>
              Buat Order Baru
            </Button>
          </Card>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-32">
      {/* Mobile-friendly Header */}
      <div className="bg-white dark:bg-slate-900 border-b sticky top-0 z-50 p-4 shadow-sm">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div className="flex flex-col">
            <h1 className="text-lg font-black text-slate-900 dark:text-white capitalize leading-tight">
              {client?.companyName.toLowerCase()}
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Order Form Digital</p>
          </div>
          <div className="relative">
            <div className="h-10 w-10 bg-emerald-50 dark:bg-emerald-900/50 rounded-xl flex items-center justify-center text-emerald-600">
              <ShoppingCart className="w-5 h-5" />
            </div>
            {orderItems.length > 0 && (
              <Badge className="absolute -top-2 -right-2 bg-emerald-500 text-white border-white border-2">
                {orderItems.reduce((sum, item) => sum + item.qty, 0)}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto p-4 space-y-8 mt-4">
        {/* Date Selection */}
        <section className="space-y-3">
          <label className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2 px-1">
            <Calendar className="w-3.5 h-3.5" /> Pilih Tanggal Pengiriman
          </label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Besok', date: addDays(new Date(), 1) },
              { label: 'Lusa', date: addDays(new Date(), 2) }
            ].map((opt) => {
              const dStr = format(opt.date, 'yyyy-MM-dd')
              const isActive = deliveryDate === dStr
              return (
                <button
                  key={dStr}
                  onClick={() => setDeliveryDate(dStr)}
                  className={`p-4 rounded-2xl border transition-all text-left space-y-1 ${
                    isActive 
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-200 ring-2 ring-emerald-600 ring-offset-2' 
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  <p className={`text-xs font-bold ${isActive ? 'text-emerald-100' : 'text-slate-400'}`}>{opt.label}</p>
                  <p className="font-black text-sm">{format(opt.date, 'dd MMM yyyy')}</p>
                </button>
              )
            })}
          </div>
        </section>

        {/* Catalog Penawaran */}
        <section className="space-y-4">
          <div className="px-1 flex flex-col gap-1">
            <label className="text-xs font-black uppercase tracking-widest text-emerald-600 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" /> Katalog Penawaran Anda
            </label>
            <p className="text-xs text-slate-500 font-medium">Produk dengan harga spesial khusus untuk {client?.companyName}</p>
          </div>
          
          <div className="relative">
            <Input 
              placeholder="Cari di katalog penawaran..."
              className="h-12 bg-white border-slate-200 rounded-xl pl-10 shadow-sm focus:ring-emerald-500/20"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {configuredProducts.length === 0 ? (
              <div className="col-span-full p-8 border-2 border-dashed rounded-2xl text-center space-y-2 text-slate-400">
                <Store className="w-8 h-8 mx-auto opacity-20" />
                <p className="text-sm font-medium">Tidak ada produk dalam penawaran.</p>
              </div>
            ) : (
              configuredProducts.map(({ product, effectivePrice, record }) => (
                <div key={product.id} className="bg-white border rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow flex justify-between items-start gap-3">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="space-y-0.5">
                      <p className="font-black text-slate-800 leading-tight truncate">{product.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">{product.skuCode} • {product.uom}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-black text-emerald-600">{formatRupiah(effectivePrice)}</p>
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-600 border-none text-[9px] px-1.5 py-0">
                        {record?.tier === 'Custom' ? 'Custom Price' : 'Harga Spesial'}
                      </Badge>
                    </div>
                  </div>
                  <Button size="icon" className="h-10 w-10 shrink-0 rounded-xl bg-slate-900 text-white hover:bg-slate-800" onClick={() => addToOrder(product, false, effectivePrice)}>
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Product Search (Request Harga) */}
        <section className="space-y-4 pt-4 border-t">
          <div className="px-1 flex flex-col gap-1">
            <label className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <Search className="w-3.5 h-3.5" /> Cari Produk Lainnya
            </label>
            <p className="text-xs text-slate-500 font-medium">Tidak menemukan produk yang dicari? Request barang lain di sini.</p>
          </div>
          
          <div className="relative">
            <Input 
              placeholder="Ketik nama produk yang ingin direquest..."
              className="h-12 bg-white border-slate-200 rounded-xl pl-10 shadow-sm focus:ring-amber-500/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          </div>

          {/* Search Results */}
          {availableProducts.length > 0 && (
            <div className="bg-white border rounded-2xl shadow-xl overflow-hidden divide-y">
              {availableProducts.map(p => (
                <div 
                  key={p.id} 
                  className="p-4 flex justify-between items-center hover:bg-slate-50 cursor-pointer active:bg-slate-100 group"
                  onClick={() => addToOrder(p, true, 0)}
                >
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800">{p.name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">{p.skuCode} • {p.uom}</p>
                      <Badge variant="secondary" className="bg-amber-50 text-amber-600 border-none text-[9px] px-1.5 py-0 flex items-center gap-1">
                        <HelpCircle className="w-2.5 h-2.5" /> Request Harga
                      </Badge>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 w-8 rounded-full bg-amber-50 text-amber-600 group-hover:bg-amber-100">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Selected Items */}
        <section className="space-y-4 pt-4 border-t">
          <label className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2 px-1">
            <ShoppingCart className="w-3.5 h-3.5" /> Daftar Belanja ({orderItems.length})
          </label>
          
          {orderItems.length === 0 ? (
            <div className="p-12 border-2 border-dashed rounded-3xl text-center space-y-2 text-slate-400 bg-white/50">
              <ShoppingCart className="w-10 h-10 mx-auto opacity-20" />
              <p className="text-sm font-medium">Keranjang masih kosong nih.</p>
              <p className="text-[10px]">Pilih produk dari penawaran di atas untuk mulai.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orderItems.map(item => (
                <div key={item.product.id} className="bg-white p-4 rounded-2xl border shadow-sm flex flex-col gap-3">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-800 truncate leading-tight">{item.product.name}</p>
                      {item.isPriceRequest ? (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                          <p className="text-xs font-bold text-amber-600">Menunggu Konfirmasi Harga</p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 mt-1">{formatRupiah(item.effectivePrice)} <span className="text-[10px] uppercase font-bold text-slate-400">/ {item.product.uom}</span></p>
                      )}
                    </div>
                    <button 
                      onClick={() => removeItem(item.product.id)}
                      className="text-slate-400 hover:text-rose-500 p-1 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="flex justify-between items-center border-t pt-3">
                    <div className="font-black text-sm">
                      {item.isPriceRequest ? (
                        <span className="text-amber-600">-</span>
                      ) : (
                        <span className="text-emerald-600">{formatRupiah(item.effectivePrice * item.qty)}</span>
                      )}
                    </div>
                    <div className="flex items-center bg-slate-100 rounded-xl p-1">
                      <button 
                        onClick={() => updateQty(item.product.id, -1)}
                        className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-emerald-600"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <input 
                        type="number"
                        min="1"
                        value={item.qty || ""}
                        onChange={(e) => {
                          const val = e.target.value === "" ? 0 : parseInt(e.target.value)
                          setQty(item.product.id, val)
                        }}
                        onBlur={() => {
                          if (item.qty < 1) setQty(item.product.id, 1)
                        }}
                        className="w-10 text-center font-black text-sm bg-transparent border-none focus:ring-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button 
                        onClick={() => updateQty(item.product.id, 1)}
                        className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-emerald-600"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Floating Checkout Button */}
      {orderItems.length > 0 && !isSuccess && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t z-50">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <p className="text-[10px] font-black uppercase text-slate-400">Estimasi Total</p>
              <p className="text-xl font-black text-emerald-600">{formatRupiah(totalAmount)}</p>
              {pendingPriceCount > 0 && (
                <p className="text-[9px] font-bold text-amber-600 uppercase tracking-tight mt-0.5">
                  + {pendingPriceCount} item request
                </p>
              )}
            </div>
            <Button 
              className="px-8 h-12 bg-slate-900 text-white rounded-xl font-black flex items-center gap-2 shadow-lg active:scale-95 transition-transform"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Mengirim..." : (
                <>
                  Kirim Pesanan <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

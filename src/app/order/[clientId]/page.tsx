"use client"

import { useState, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAppStore } from "@/lib/store"
import { motion, AnimatePresence } from "framer-motion"
import { Product, SalesOrder, SalesOrderItem } from "@/types"
import { 
  ShoppingCart, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  ChevronLeft,
  Calendar,
  Store,
  ArrowRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { formatRupiah } from "@/lib/utils"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import { format, addDays } from "date-fns"

export default function ClientOrderPage() {
  const params = useParams()
  const router = useRouter()
  const clientId = params.clientId as string
  
  const clients = useAppStore(state => state.clients)
  const products = useAppStore(state => state.products)
  const addSalesOrder = useAppStore(state => state.addSalesOrder)
  const addSalesOrderItem = useAppStore(state => state.addSalesOrderItem)
  
  const client = useMemo(() => clients.find(c => c.id === clientId), [clients, clientId])
  
  const [searchTerm, setSearchTerm] = useState("")
  const [orderItems, setOrderItems] = useState<{product: Product, qty: number}[]>([])
  const [deliveryDate, setDeliveryDate] = useState<string>(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return []
    return products.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.skuCode.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 8)
  }, [products, searchTerm])

  const addToOrder = (product: Product) => {
    const existing = orderItems.find(item => item.product.id === product.id)
    if (existing) {
      setOrderItems(orderItems.map(item => 
        item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item
      ))
    } else {
      setOrderItems([...orderItems, { product, qty: 1 }])
    }
    setSearchTerm("")
    toast.success(`${product.name} ditambahkan`)
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

  const totalAmount = orderItems.reduce((sum, item) => sum + (item.product.sellingPrice * item.qty), 0)

  const handleSubmit = async () => {
    if (orderItems.length === 0) {
      toast.error("Pilih minimal satu produk")
      return
    }
    
    setIsSubmitting(true)
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    const soId = uuidv4()
    
    // Create SO Request
    addSalesOrder({
      id: soId,
      poNumber: `REQ-${uuidv4().slice(0, 8).toUpperCase()}`,
      clientId: clientId,
      orderDate: new Date().toISOString(),
      targetDeliveryDate: new Date(deliveryDate).toISOString(),
      status: 'Pending Approval'
    })
    
    // Create Items
    orderItems.forEach(item => {
      addSalesOrderItem({
        id: uuidv4(),
        salesOrderId: soId,
        productId: item.product.id,
        qty: item.qty,
        unitPrice: item.product.sellingPrice,
        subtotal: item.qty * item.product.sellingPrice
      })
    })
    
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
              <p className="text-[10px] font-black uppercase text-slate-400">Total Pesanan</p>
              <p className="text-2xl font-black text-emerald-600">{formatRupiah(totalAmount)}</p>
            </div>
            <Button className="w-full h-12 bg-slate-900 text-white rounded-xl font-black" onClick={() => setIsSuccess(false)}>
              Buat Order Baru
            </Button>
          </Card>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24">
      {/* Mobile-friendly Header */}
      <div className="bg-white dark:bg-slate-900 border-b sticky top-0 z-50 p-4 shadow-sm">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <div className="flex flex-col">
            <h1 className="text-lg font-black text-slate-900 dark:text-white capitalize leading-tight">
              {client?.companyName.toLowerCase()}
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Order Form Digital</p>
          </div>
          <div className="h-10 w-10 bg-emerald-50 dark:bg-emerald-900/50 rounded-xl flex items-center justify-center text-emerald-600">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto p-4 space-y-6 mt-4">
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

        {/* Product Search */}
        <section className="space-y-3">
          <label className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2 px-1">
            <Plus className="w-3.5 h-3.5" /> Cari Produk / SKU
          </label>
          <div className="relative">
            <Input 
              placeholder="Ketik nama sayur, buah, atau daging..."
              className="h-14 bg-white border-slate-200 rounded-2xl pl-12 shadow-sm focus:ring-emerald-500/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Plus className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          </div>

          {/* Search Results */}
          {filteredProducts.length > 0 && (
            <div className="bg-white border rounded-2xl shadow-xl overflow-hidden divide-y">
              {filteredProducts.map(p => (
                <div 
                  key={p.id} 
                  className="p-4 flex justify-between items-center hover:bg-slate-50 cursor-pointer active:bg-slate-100"
                  onClick={() => addToOrder(p)}
                >
                  <div>
                    <p className="font-bold text-slate-800">{p.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{p.skuCode} • {formatRupiah(p.sellingPrice)}/{p.uom}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-600">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Selected Items */}
        <section className="space-y-4">
          <label className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2 px-1">
            <ShoppingCart className="w-3.5 h-3.5" /> Daftar Belanja ({orderItems.length})
          </label>
          
          {orderItems.length === 0 ? (
            <div className="p-12 border-2 border-dashed rounded-3xl text-center space-y-2 text-slate-400 bg-white/50">
              <ShoppingCart className="w-10 h-10 mx-auto opacity-20" />
              <p className="text-sm font-medium">Keranjang masih kosong nih.</p>
              <p className="text-[10px]">Cari produk di atas untuk mulai belanja.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orderItems.map(item => (
                <div key={item.product.id} className="bg-white p-4 rounded-2xl border shadow-sm flex justify-between items-center">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="font-black text-slate-800 truncate">{item.product.name}</p>
                    <p className="text-xs text-slate-500">{formatRupiah(item.product.sellingPrice)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-slate-100 rounded-xl p-1">
                      <button 
                        onClick={() => updateQty(item.product.id, -1)}
                        className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-emerald-600"
                      >
                        <Trash2 className="w-4 h-4" />
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
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <p className="text-[10px] font-black uppercase text-slate-400">Total Pembelian</p>
              <p className="text-xl font-black text-emerald-600">{formatRupiah(totalAmount)}</p>
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

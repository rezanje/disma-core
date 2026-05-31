"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatRupiah, formatNumber, parseNumber } from "@/lib/utils"
import { recordStockMovement, recordStockOpnameAdjustment } from "@/lib/accounting"
import { RefreshCw, Package, ArrowRight, ShieldAlert, CheckCircle2, TrendingUp, TrendingDown, ClipboardList } from "lucide-react"
import { toast } from "sonner"

export default function StockOpnamePage() {
  const products = useAppStore(state => state.products) || []
  const currentUser = useAppStore(state => state.currentUser)

  // State Form
  const [selectedProductId, setSelectedProductId] = useState<string>("")
  const [warehouseId, setWarehouseId] = useState<string>("main")
  const [physicalCountRaw, setPhysicalCountRaw] = useState<string>("")
  const [unitCostRaw, setUnitCostRaw] = useState<string>("")
  const [reason, setReason] = useState<string>("")

  // Search filter for products
  const [productSearch, setProductSearch] = useState<string>("")

  const activeProduct = products.find(p => p.id === selectedProductId)
  const systemStock = activeProduct 
    ? (warehouseId === 'b2c' ? (activeProduct.b2cStock || 0) : activeProduct.currentStock)
    : 0

  const physicalCount = physicalCountRaw !== "" ? parseInt(physicalCountRaw) || 0 : 0
  const delta = physicalCount - systemStock
  const unitCost = unitCostRaw !== "" ? parseNumber(unitCostRaw) : (activeProduct?.basePrice || 0)
  const valuationDelta = Math.abs(delta) * unitCost

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
    p.skuCode.toLowerCase().includes(productSearch.toLowerCase())
  )

  const handleSelectProduct = (productId: string) => {
    setSelectedProductId(productId)
    const p = products.find(prod => prod.id === productId)
    if (p) {
      setUnitCostRaw(formatNumber(p.basePrice))
      setPhysicalCountRaw("")
      setReason("")
    }
  }

  const handlePostOpname = async () => {
    if (!activeProduct) {
      toast.error("Pilih produk terlebih dahulu!")
      return
    }

    if (physicalCountRaw === "") {
      toast.error("Masukkan jumlah perhitungan fisik!")
      return
    }

    if (!reason.trim()) {
      toast.error("Alasan penyesuaian wajib diisi!")
      return
    }

    if (delta === 0) {
      toast.info("Jumlah fisik sama dengan data sistem. Tidak ada jurnal penyesuaian yang dibuat.")
      return
    }

    toast.loading("Memproses posting stock opname...", { id: "post-opname" })

    // 1. Posting Accounting Entry
    const accountingSuccess = await recordStockOpnameAdjustment(
      activeProduct.id,
      delta,
      unitCost,
      warehouseId,
      `Stock Opname: ${reason}`
    )

    if (!accountingSuccess) {
      toast.error("Gagal mencatat jurnal akuntansi penyesuaian.", { id: "post-opname" })
      return
    }

    // 2. Posting Stock Movement
    const movementSuccess = await recordStockMovement({
      productId: activeProduct.id,
      quantity: Math.abs(delta),
      stockDelta: delta,
      direction: delta > 0 ? 'In' : 'Out',
      kind: 'ADJUSTMENT',
      source: 'Stock Opname',
      destination: warehouseId === 'b2c' ? 'B2C Warehouse' : 'Inventory',
      note: `Stock Opname: ${reason} (Fisik: ${physicalCount}, Sistem: ${systemStock})`,
      createdByUserId: currentUser?.id || 'system',
      warehouseId: warehouseId,
      unitCost: unitCost
    })

    if (movementSuccess) {
      toast.success("Stock Opname berhasil diposting dan jurnal akuntansi telah dicatat!", { id: "post-opname" })
      
      // Reset Form
      setSelectedProductId("")
      setPhysicalCountRaw("")
      setUnitCostRaw("")
      setReason("")
    } else {
      toast.error("Gagal mencatat pergerakan stok fisik.", { id: "post-opname" })
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-20">
      
      {/* HEADER */}
      <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-100/40 dark:shadow-none">
        <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white uppercase flex items-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin-slow" />
          Stock <span className="text-emerald-600">Opname</span>
        </h2>
        <p className="text-slate-400 font-bold mt-1 uppercase text-[10px] tracking-widest">
          Penyesuaian Fisik Persediaan & Rekonsiliasi Otomatis Ke Jurnal Akuntansi
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT PANEL: SELECT PRODUCT */}
        <div className="space-y-6">
          <Card className="rounded-[2.5rem] border-none shadow-xl bg-white dark:bg-slate-900 overflow-hidden">
            <CardHeader className="bg-slate-50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800/50 p-6">
              <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">Pilih Produk</CardTitle>
              <CardDescription className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">Cari produk yang ingin dicocokkan</CardDescription>
              <div className="mt-4">
                <Input 
                  placeholder="Cari nama barang atau SKU..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
            </CardHeader>
            <CardContent className="p-2 max-h-[450px] overflow-y-auto">
              <div className="grid gap-1">
                {filteredProducts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProduct(p.id)}
                    className={cn(
                      "w-full px-4 py-3 rounded-xl text-left flex justify-between items-center transition-all",
                      selectedProductId === p.id 
                        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/30 text-slate-700 dark:text-slate-200"
                    )}
                  >
                    <div>
                      <h4 className="font-extrabold text-xs uppercase tracking-tight truncate max-w-[180px]">{p.name}</h4>
                      <p className={cn("text-[9px] font-bold uppercase mt-0.5", selectedProductId === p.id ? "text-emerald-200" : "text-slate-400")}>
                        SKU: {p.skuCode}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-[9px] font-black uppercase px-2 py-0.5",
                      selectedProductId === p.id ? "bg-white/20 text-white border-white/20" : "bg-slate-100 dark:bg-slate-800 border-slate-200"
                    )}>
                      Stok: {p.currentStock} {p.uom}
                    </Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT PANEL: RECONCILIATION FORM */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-[2.5rem] border-none shadow-xl bg-white dark:bg-slate-900 overflow-hidden">
            <CardHeader className="bg-slate-50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800/50 p-8">
              <CardTitle className="text-lg font-black text-slate-800 dark:text-white uppercase flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-emerald-500" /> Reinkarnasi Stok & Penyesuaian
              </CardTitle>
              <CardDescription className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">Lakukan verifikasi fisik di lapangan</CardDescription>
            </CardHeader>
            
            <CardContent className="p-8 space-y-6">
              {activeProduct ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  
                  {/* Selected Product Card */}
                  <div className="p-6 bg-slate-55 bg-slate-50 dark:bg-slate-800/40 rounded-[2rem] border border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <div>
                      <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">{activeProduct.category || "Produk"}</span>
                      <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mt-0.5">{activeProduct.name}</h3>
                      <p className="text-[10px] text-slate-400 font-mono mt-1">ID: {activeProduct.id}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black text-slate-400 uppercase">Harga Pokok (Cost)</p>
                      <h4 className="text-md font-black text-slate-800 dark:text-slate-200">{formatRupiah(activeProduct.basePrice)} / {activeProduct.uom}</h4>
                    </div>
                  </div>

                  {/* Warehouse Selection & Core Inputs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Warehouse Penyesuaian</Label>
                      <Select value={warehouseId} onValueChange={setWarehouseId}>
                        <SelectTrigger className="h-12 rounded-xl">
                          <SelectValue placeholder="Pilih Warehouse" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="main" className="font-bold">Gudang Utama (Main)</SelectItem>
                          <SelectItem value="b2c" className="font-bold">Gudang B2C (Peralihan)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Harga Satuan Valuasi (Rp)</Label>
                      <Input 
                        value={unitCostRaw}
                        onChange={(e) => setUnitCostRaw(formatNumber(e.target.value))}
                        placeholder="Default harga modal master"
                        className="h-12 rounded-xl text-md font-bold"
                      />
                    </div>
                  </div>

                  {/* Stock Comparison Block */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-6 bg-slate-900 text-white rounded-3xl text-center">
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Stok Sistem</p>
                      <h3 className="text-4xl font-black mt-2">{systemStock}</h3>
                      <span className="text-[9px] font-bold uppercase opacity-55 mt-1 block">{activeProduct.uom}</span>
                    </div>

                    <div className="p-1 rounded-3xl bg-slate-100 dark:bg-slate-800/60 flex flex-col justify-center items-center">
                      <ArrowRight className="w-8 h-8 text-slate-400 rotate-90 md:rotate-0" />
                    </div>

                    <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-3xl text-center space-y-2">
                      <Label className="text-[9px] font-black uppercase tracking-wider text-indigo-700">Hitung Fisik Aktual</Label>
                      <Input 
                        type="number"
                        placeholder="0"
                        value={physicalCountRaw}
                        onChange={(e) => setPhysicalCountRaw(e.target.value)}
                        className="h-12 rounded-xl text-2xl font-black text-center text-indigo-900 border-none bg-white shadow-sm"
                      />
                    </div>
                  </div>

                  {/* Delta & Audit Jurnal Explanation */}
                  {physicalCountRaw !== "" && (
                    <div className={cn(
                      "p-6 rounded-[2rem] border animate-in zoom-in-95 space-y-4",
                      delta > 0 ? "bg-emerald-50 border-emerald-200" :
                      delta < 0 ? "bg-rose-50 border-rose-200" : "bg-slate-50 border-slate-200"
                    )}>
                      
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          {delta > 0 ? <TrendingUp className="w-5 h-5 text-emerald-600" /> : <TrendingDown className="w-5 h-5 text-rose-600" />}
                          <span className={cn("text-xs font-black uppercase tracking-wider", delta > 0 ? "text-emerald-700" : "text-rose-700")}>
                            Selisih: {delta > 0 ? `Lebih (+${delta})` : `Kurang (${delta})`} {activeProduct.uom}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black text-slate-400 uppercase">Valuasi Selisih</p>
                          <h4 className={cn("text-lg font-black", delta > 0 ? "text-emerald-800" : "text-rose-800")}>
                            {formatRupiah(valuationDelta)}
                          </h4>
                        </div>
                      </div>

                      <div className="p-4 bg-white/60 rounded-xl space-y-2 border border-black/5">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                          <ShieldAlert className="w-3.5 h-3.5 text-slate-600" /> Estimasi Jurnal Akuntansi:
                        </p>
                        
                        {delta > 0 ? (
                          <div className="text-xs space-y-1 font-mono text-slate-700">
                            <p className="font-bold">&bull; Debit: {warehouseId === 'b2c' ? '1-3100' : '1-3000'} Persediaan ({formatRupiah(valuationDelta)})</p>
                            <p className="font-bold pl-4">&bull; Kredit: 4-2000 Pendapatan Lain-lain ({formatRupiah(valuationDelta)})</p>
                          </div>
                        ) : (
                          <div className="text-xs space-y-1 font-mono text-slate-700">
                            <p className="font-bold">&bull; Debit: 5-2000 Beban Kerusakan ({formatRupiah(valuationDelta)})</p>
                            <p className="font-bold pl-4">&bull; Kredit: {warehouseId === 'b2c' ? '1-3100' : '1-3000'} Persediaan ({formatRupiah(valuationDelta)})</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Reason Input */}
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Alasan Penyesuaian Stock Opname (Wajib)</Label>
                    <Input 
                      placeholder="Contoh: Barang busuk saat QC, barang susut timbangan, atau salah input kuantiti awal"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="h-12 rounded-xl"
                    />
                  </div>

                  <Button 
                    onClick={handlePostOpname}
                    className="w-full h-16 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[2rem] font-black uppercase tracking-widest text-sm shadow-xl shadow-emerald-600/10 transition-all active:scale-95"
                  >
                    Posting Stock Opname
                  </Button>

                </div>
              ) : (
                <div className="h-80 flex flex-col items-center justify-center text-center text-slate-400 font-black uppercase text-[10px] tracking-widest gap-2">
                  <Package className="w-10 h-10 opacity-20" />
                  Pilih salah satu produk di panel kiri untuk memulai rekonsiliasi
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}

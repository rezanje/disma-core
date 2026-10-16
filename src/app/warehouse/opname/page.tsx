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
import { executeGoodsCommand, type PaperEvidence } from "@/lib/goods-command"
import { PaperEvidenceFields } from "@/components/paper-evidence-fields"
import AuthGuard from "@/components/auth/auth-guard"
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
  const [paperEvidence,setPaperEvidence]=useState<PaperEvidence>({})
  const [posting,setPosting]=useState(false)
  const [reason, setReason] = useState<string>("")

  // Search filter for products
  const [productSearch, setProductSearch] = useState<string>("")

  const activeProduct = products.find(p => p.id === selectedProductId)
  const systemStock = activeProduct 
    ? (warehouseId === 'b2c' ? (activeProduct.b2cStock || 0) : activeProduct.currentStock)
    : 0

  const physicalCount = physicalCountRaw !== "" ? Number(physicalCountRaw) : 0
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

    if(posting)return
    setPosting(true)
    try {
      await executeGoodsCommand(useAppStore.getState,{eventId:`opname:${activeProduct.id}:${warehouseId}:${paperEvidence.paperNumber||'initial'}`,stage:'opname',sourceId:activeProduct.id,payload:{physicalQty:Number(physicalCountRaw),expectedStock:systemStock,unitCost,warehouseId,reason,...paperEvidence}})
      toast.success('Opname dan jurnal tersimpan.',{id:'post-opname'})
      setSelectedProductId('');setPhysicalCountRaw('');setUnitCostRaw('');setReason('');setPaperEvidence({})
    } catch(error) {toast.error(error instanceof Error?error.message:'Opname gagal.',{id:'post-opname'})} finally {setPosting(false)}
  }

  return (
    <AuthGuard allowedRoles={['super_admin']}><div className="space-y-6 max-w-6xl mx-auto pb-20">
      
      <div className="rounded-lg border border-border bg-card px-6 py-4">
        <h2 className="text-[19px] leading-tight font-semibold text-slate-900">Opname stok</h2>
        <p className="mt-[3px] text-[12.5px] text-slate-400">
          Cocokkan hitungan fisik dengan catatan sistem. Selisihnya masuk biaya susut hari ini dan muncul di daftar periksa Tutup Hari.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT PANEL: SELECT PRODUCT */}
        <div className="space-y-6">
          <Card className="rounded-2xl border-none shadow-sm bg-white dark:bg-slate-900 overflow-hidden">
            <CardHeader className="bg-slate-50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800/50 p-6">
              <CardTitle className="text-sm font-bold  text-slate-500">Pilih Produk</CardTitle>
              <CardDescription className="text-slate-400 font-bold uppercase text-[11px] tracking-wider">Cari produk yang ingin dicocokkan</CardDescription>
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
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/30 text-slate-700 dark:text-slate-200"
                    )}
                  >
                    <div>
                      <h4 className="font-semibold text-xs  truncate max-w-[180px]">{p.name}</h4>
                      <p className={cn("text-[11px] font-bold uppercase mt-0.5", selectedProductId === p.id ? "text-emerald-200" : "text-slate-400")}>
                        SKU: {p.skuCode}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-[11px] font-bold uppercase px-2 py-0.5",
                      selectedProductId === p.id ? "bg-slate-800 text-white border-slate-700" : "bg-slate-100 dark:bg-slate-800 border-slate-200"
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
          <Card className="rounded-2xl border-none shadow-sm bg-white dark:bg-slate-900 overflow-hidden">
            <CardHeader className="bg-slate-50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800/50 p-8">
              <CardTitle className="text-lg font-bold text-slate-800 dark:text-white uppercase flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-emerald-500" /> Reinkarnasi Stok & Penyesuaian
              </CardTitle>
              <CardDescription className="text-slate-400 font-bold uppercase text-[11px] tracking-wider">Lakukan verifikasi fisik di lapangan</CardDescription>
            </CardHeader>
            
            <CardContent className="p-8 space-y-6">
              {activeProduct ? (
                <div className="space-y-6 duration-300">
                  
                  {/* Selected Product Card */}
                  <div className="p-6 bg-slate-55 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <div>
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 ">{activeProduct.category || "Produk"}</span>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white  mt-0.5">{activeProduct.name}</h3>
                      <p className="text-[11px] text-slate-400 font-mono mt-1">ID: {activeProduct.id}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-bold text-slate-400 uppercase">Harga Pokok (Cost)</p>
                      <h4 className="text-md font-bold text-slate-800 dark:text-slate-200">{formatRupiah(activeProduct.basePrice)} / {activeProduct.uom}</h4>
                    </div>
                  </div>

                  {/* Warehouse Selection & Core Inputs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[11px] font-bold  text-slate-400">Warehouse Penyesuaian</Label>
                      <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
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
                      <Label className="text-[11px] font-bold  text-slate-400">Harga Satuan Valuasi (Rp)</Label>
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
                    <div className="p-6 bg-slate-900 text-white rounded-lg text-center">
                      <p className="text-[11px] font-bold  text-slate-400">Stok Sistem</p>
                      <h3 className="text-4xl font-bold mt-2">{systemStock}</h3>
                      <span className="text-[11px] font-bold uppercase opacity-55 mt-1 block">{activeProduct.uom}</span>
                    </div>

                    <div className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800/60 flex flex-col justify-center items-center">
                      <ArrowRight className="w-8 h-8 text-slate-400 rotate-90 md:rotate-0" />
                    </div>

                    <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-lg text-center space-y-2">
                      <Label className="text-[11px] font-bold  text-indigo-700">Hitung Fisik Aktual</Label>
                      <Input 
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0"
                        value={physicalCountRaw}
                        onChange={(e) => setPhysicalCountRaw(e.target.value)}
                        className="h-12 rounded-xl text-2xl font-bold text-center text-indigo-900 border-none bg-white shadow-sm"
                      />
                    </div>
                  </div>

                  {/* Delta & Audit Jurnal Explanation */}
                  {physicalCountRaw !== "" && (
                    <div className={cn(
                      "p-6 rounded-xl border space-y-4",
                      delta > 0 ? "bg-emerald-50 border-emerald-200" :
                      delta < 0 ? "bg-rose-50 border-rose-200" : "bg-slate-50 border-slate-200"
                    )}>
                      
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          {delta > 0 ? <TrendingUp className="w-5 h-5 text-emerald-600" /> : <TrendingDown className="w-5 h-5 text-rose-600" />}
                          <span className={cn("text-xs font-bold ", delta > 0 ? "text-emerald-700" : "text-rose-700")}>
                            Selisih: {delta > 0 ? `Lebih (+${delta})` : `Kurang (${delta})`} {activeProduct.uom}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-bold text-slate-400 uppercase">Valuasi Selisih</p>
                          <h4 className={cn("text-lg font-bold", delta > 0 ? "text-emerald-800" : "text-rose-800")}>
                            {formatRupiah(valuationDelta)}
                          </h4>
                        </div>
                      </div>

                      <div className="p-4 bg-card rounded-xl space-y-2 border border-black/5">
                        <p className="text-[11px] font-bold text-slate-500  flex items-center gap-1.5">
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
                    <Label className="text-[11px] font-bold  text-slate-400">Alasan Penyesuaian Stock Opname (Wajib)</Label>
                    <Input 
                      placeholder="Contoh: Barang busuk saat QC, barang susut timbangan, atau salah input kuantiti awal"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="h-12 rounded-xl"
                    />
                  </div>

                  <PaperEvidenceFields value={paperEvidence} onChange={setPaperEvidence}/>
                  <Button 
                    disabled={posting} onClick={handlePostOpname}
                    className="w-full h-16 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold  text-sm shadow-sm transition-all active:scale-95"
                  >
                    Posting Stock Opname
                  </Button>

                </div>
              ) : (
                <div className="h-80 flex flex-col items-center justify-center text-center text-slate-400 font-bold uppercase text-[11px] tracking-widest gap-2">
                  <Package className="w-10 h-10 opacity-20" />
                  Pilih salah satu produk di panel kiri untuk memulai rekonsiliasi
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div></AuthGuard>
  )
}

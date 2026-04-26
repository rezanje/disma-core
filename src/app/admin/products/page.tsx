"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah, formatNumber, parseNumber } from "@/lib/utils"
import { Plus, Pencil, Package, Hash, Trash2, Download, Upload, RotateCcw, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown, History, Sparkles } from "lucide-react"
import { v4 as uuidv4 } from "uuid"
import { Product, ClientPriceTier } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { format } from "date-fns"

export default function ProductsPage() {
  const products = useAppStore(state => state.products)
  const addProduct = useAppStore(state => state.addProduct)
  const addProducts = useAppStore(state => state.addProducts)
  const updateProduct = useAppStore(state => state.updateProduct)
  const resetDb = useAppStore(state => state.resetDb)
  
  const [isOpen, setIsOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null)

  const [formData, setFormData] = useState({
    skuCode: "",
    name: "",
    category: "",
    uom: "kg",
    basePrice: 0,
    sellingPrice: 0,
    tier1Price: 0,
    tier2Price: 0,
    tier3Price: 0,
    tier4Price: 0,
    tier5Price: 0,
    currentStock: 0
  })

  // Search, Filter, and Sort State
  const [searchQuery, setSearchQuery] = useState("")
  const [uomFilter, setUomFilter] = useState("all")
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Product | null;
    direction: 'asc' | 'desc';
  }>({ key: null, direction: 'asc' })

  // Get unique UOMs for filter
  const uoms = Array.from(new Set(products.map(p => p.uom || "kg"))).sort()

  // Filter and Sort Logic
  const filteredAndSortedProducts = products
    .filter(product => {
      const name = product.name || ""
      const sku = product.skuCode || ""
      const matchesSearch = 
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sku.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesUom = uomFilter === "all" || product.uom === uomFilter
      
      return matchesSearch && matchesUom
    })
    .sort((a, b) => {
      if (!sortConfig.key) return 0
      
      const aValue = a[sortConfig.key] ?? ""
      const bValue = b[sortConfig.key] ?? ""
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' 
          ? aValue - bValue
          : bValue - aValue
      }
      
      return 0
    })

  const requestSort = (key: keyof Product) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const getSortIcon = (key: keyof Product) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="ml-2 h-4 w-4" />
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="ml-2 h-4 w-4" /> 
      : <ArrowDown className="ml-2 h-4 w-4" />
  }

  const resetForm = () => {
    setFormData({ skuCode: "", name: "", category: "", uom: "kg", basePrice: 0, sellingPrice: 0, tier1Price: 0, tier2Price: 0, tier3Price: 0, tier4Price: 0, tier5Price: 0, currentStock: 0 })
    setEditingProduct(null)
  }

  const CATEGORY_KEYWORDS: Record<string, string[]> = {
    "Sayur": ["sayur", "bayam", "kangkung", "wortel", "tomat", "cabe", "cabai", "bawang", "kentang", "kol", "jagung", "timun", "sawi", "labu", "daun", "seledri", "brokoli", "jamur"],
    "Daging & Protein": ["ayam", "sapi", "ikan", "daging", "telur", "bebek", "udang", "cumi", "kepiting", "fillet", "karkas", "baso", "bakso", "sosis", "kornet"],
    "Buah": ["buah", "apel", "jeruk", "pisang", "mangga", "anggur", "melon", "semangka", "nanas", "pepaya", "alpukat", "lemon", "jeruk nipis"],
    "Sembako & Bumbu": ["beras", "minyak", "gula", "garam", "terigu", "kecap", "saos", "saus", "merica", "lada", "mie", "susu", "teh", "kopi", "mentega", "keju", "santan", "penyedap", "masako", "royco"],
    "ATK": ["kertas", "pen", "pulpen", "buku", "pensil", "penghapus", "penggaris", "spidol", "tinta", "kertas", "map", "amplop", "lakban", "solasi", "gunting", "stapler"],
    "Kebersihan": ["sabun", "shampoo", "odol", "detergen", "rinso", "pewangi", "pel", "sapu", "tisu", "tissue", "masker", "handsanity", "sunlight", "clink"]
  }

  const inferCategory = (name: string): string => {
    const lowName = name.toLowerCase()
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some(k => lowName.includes(k))) return cat
    }
    return "Lain-lain"
  }

  const handleAutoCategorize = async () => {
    const uncategorizedItems = products.filter(p => !p.category || p.category === "Lain-lain" || p.category === "")
    if (uncategorizedItems.length === 0) {
      toast.info("Semua barang sudah memiliki kategori.")
      return
    }

    if (!window.confirm(`Otomatis deteksi kategori untuk ${uncategorizedItems.length} produk berdasarkan nama barang?`)) return

    toast.loading(`Menganalisis dan mengategorikan ${uncategorizedItems.length} produk...`, { id: "auto_cat" })
    
    try {
      const updates: { id: string, data: Partial<Product> }[] = []
      
      uncategorizedItems.forEach(p => {
        const suggested = inferCategory(p.name)
        if (suggested !== "Lain-lain") {
          updates.push({ id: p.id, data: { category: suggested } })
        }
      })

      if (updates.length > 0) {
        // Use bulk update to avoid thrashing the UI/Server
        const { updateMultipleProducts } = useAppStore.getState()
        await updateMultipleProducts(updates)
        toast.success(`Selesai! Berhasil mengklasifikasikan ${updates.length} produk ke kategori baru.`, { id: "auto_cat" })
      } else {
        toast.info("Tidak ada kategori baru yang cocok ditemukan.", { id: "auto_cat" })
      }
    } catch (err) {
      console.error(err)
      toast.error("Gagal melakukan kategorisasi otomatis", { id: "auto_cat" })
    }
  }

  const handleEdit = (product: Product) => {
    setEditingProduct(product)
    setFormData({
      skuCode: product.skuCode || "",
      name: product.name || "",
      category: product.category || "",
      uom: product.uom || "kg",
      basePrice: product.basePrice || 0,
      sellingPrice: product.sellingPrice || 0,
      tier1Price: product.tier1Price || 0,
      tier2Price: product.tier2Price || 0,
      tier3Price: product.tier3Price || 0,
      tier4Price: product.tier4Price || 0,
      tier5Price: product.tier5Price || 0,
      currentStock: product.currentStock || 0
    })
    setIsOpen(true)
  }

  const handleSave = () => {
    if (!formData.name || !formData.skuCode) {
      toast.error("Product name and SKU are required")
      return
    }

    if (editingProduct) {
      updateProduct(editingProduct.id, formData)
      toast.success("Product updated successfully")
    } else {
      addProduct({
        id: uuidv4(),
        ...formData
      })
      toast.success("Product added successfully")
    }
    
    setIsOpen(false)
    resetForm()
  }

  return (
    <>
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Product Master (SKU)</h2>
          <p className="text-muted-foreground">Manage your inventory items, units of measure, and pricing.</p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="h-9 border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 font-bold"
            onClick={handleAutoCategorize}
          >
            <Sparkles className="mr-2 h-4 w-4" /> Auto-Categorize
          </Button>

          <Button variant="outline" size="sm" className="h-9 font-bold border-slate-200" onClick={() => {
            const headers = "skuCode,name,uom,basePrice,sellingPrice,currentStock\n"
            const example = "SAY-WRT-001,Wortel Lokal Super,kg,8000,12000,0\n"
            const blob = new Blob([headers + example], { type: 'text/csv' })
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.setAttribute('hidden', '')
            a.setAttribute('href', url)
            a.setAttribute('download', 'sku_template.csv')
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
          }}>
            <Download className="mr-2 h-4 w-4" /> Template
          </Button>

          <Button 
            variant="ghost" 
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={async () => {
              if (confirm("Bersihkan SEMUA data? Ini akan menghapus Produk, Nota Pesanan, dan Transaksi agar import 1400 barang lo lancar. Lanjut?")) {
                toast.loading("Membersihkan seluruh database...", { id: "master_wipe" });
                try {
                  const res = await fetch('/api/db/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'master' })
                  });
                  if (!res.ok) throw new Error("Gagal membersihkan database");
                  toast.success("Database bersih total! Me-reload...", { id: "master_wipe" });
                  setTimeout(() => window.location.reload(), 800);
                } catch (err: any) {
                  toast.error("Gagal: " + err.message, { id: "master_wipe" });
                }
              }
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Bersihkan Produk
          </Button>
          
          <Button variant="outline" onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = '.csv'
            input.onchange = (e: any) => {
              const file = e.target.files[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = async (event: any) => {
                const csv = (event.target.result as string || "").trim()
                if (!csv) {
                  toast.error("File kosong atau tidak terbaca.")
                  return
                }
                
                const allLines = csv.split('\n')
                let headerRowIndex = -1
                let delimiter = ','
                
                // Find true header row
                for (let i = 0; i < allLines.length; i++) {
                  const line = allLines[i].trim()
                  if (!line) continue
                  // Check if this line looks like a header (contains common product fields)
                  if (line.toUpperCase().includes('KODE BRG') || line.toUpperCase().includes('SKU')) {
                    headerRowIndex = i
                    delimiter = line.includes(';') ? ';' : ','
                    break
                  }
                }

                if (headerRowIndex === -1) {
                  toast.error("Format kolom tidak dikenali. Pastikan ada kolom 'KODE BRG' atau 'SKU'.")
                  return
                }

                const rawHeaders = allLines[headerRowIndex].split(delimiter).map(h => h.trim().toUpperCase())
                // Use a Map to automatically de-duplicate by SKU
                const itemMap = new Map<string, any>()
                
                toast.loading("Sedang memproses data...", { id: "csv_import" });

                for (let i = headerRowIndex + 1; i < allLines.length; i++) {
                  const line = allLines[i].trim()
                  if (!line) continue
                  
                  const values = line.split(delimiter).map(v => v.trim())
                  if (values.length < 1) continue
                  
                  const product: any = {}
                  
                  rawHeaders.forEach((h, index) => {
                    const val = values[index]
                    if (val === undefined) return

                    const cleanVal = val.trim()
                    if (h === 'KODE BRG' || h === 'SKUCODE' || h === 'SKU') {
                      product.skuCode = cleanVal
                      const existing = products.find(p => p.skuCode === cleanVal)
                      product.id = existing ? existing.id : uuidv4() // ensure UUID format
                    } else if (h === 'NAMA BARANG' || h === 'NAME' || h === 'PRODUCT NAME') {
                      product.name = cleanVal
                    } else if (h === 'SATUAN' || h === 'UOM') {
                      product.uom = cleanVal
                    } else if (h === 'BASEPRICE' || h === 'HARGA BELI' || h === 'BASE (COST)') {
                      product.basePrice = Number(cleanVal.replace(/[^0-9.-]+/g,"")) || 0
                    } else if (h === 'SELLINGPRICE' || h === 'HARGA JUAL') {
                      product.sellingPrice = Number(cleanVal.replace(/[^0-9.-]+/g,"")) || 0
                    } else if (h === 'CURRENTSTOCK' || h === 'STOK' || h === 'STOCK') {
                      product.currentStock = Number(cleanVal.replace(/[^0-9.-]+/g,"")) || 0
                    } else if (h === 'CATEGORY' || h === 'KATEGORI') {
                      product.category = cleanVal || inferCategory(product.name || "")
                    }
                  })

                  // Only add if it has a valid SKU and Name
                  if (product.id && product.skuCode && product.name) {
                    itemMap.set(product.skuCode, product)
                  }
                }

                const items = Array.from(itemMap.values())

                if (items.length > 0) {
                  toast.loading(`Berhasil membaca ${items.length} produk unik. Sedang mengirim ke database...`, { id: "csv_import" });
                  try {
                    await addProducts(items);
                    toast.success(`Berhasil mengimpor ${items.length} produk!`, { id: "csv_import" });
                  } catch (err: any) {
                    toast.error("Koneksi gagal: " + err.message, { id: "csv_import" });
                  }
                } else {
                  toast.error("Tidak ada data produk unik yang ditemukan.", { id: "csv_import" });
                }
              }
              reader.readAsText(file)
            }
            input.click()
          }}>
            <Upload className="mr-2 h-4 w-4" /> Import CSV
          </Button>

          <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open)
            if (!open) resetForm()
          }}>
            <DialogTrigger render={
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Add Product SKU
              </Button>
            } />
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{editingProduct ? "Edit Product" : "Add New Product SKU"}</DialogTitle>
              </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="skuCode">SKU Code</Label>
                  <Input 
                    id="skuCode" 
                    value={formData.skuCode}
                    onChange={(e) => setFormData({...formData, skuCode: e.target.value})}
                    placeholder="SAY-WRT-001" 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="uom">Unit (UOM)</Label>
                  <Input 
                    id="uom" 
                    value={formData.uom}
                    onChange={(e) => setFormData({...formData, uom: e.target.value})}
                    placeholder="kg, pcs, ikat" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Product Name</Label>
                  <Input 
                    id="name" 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="Wortel Lokal Super" 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Input 
                    id="category" 
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    placeholder="Sayur, Daging, ATK..." 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="basePrice">Base Price (Cost)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-semibold">Rp</span>
                    <Input 
                      id="basePrice" 
                      type="text"
                      inputMode="numeric"
                      className="pl-8"
                      value={formatNumber(formData.basePrice)}
                      onChange={(e) => setFormData({...formData, basePrice: parseNumber(e.target.value)})}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sellingPrice">Selling Price</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-semibold">Rp</span>
                    <Input 
                      id="sellingPrice" 
                      type="text"
                      inputMode="numeric"
                      className="pl-8"
                      value={formatNumber(formData.sellingPrice)}
                      onChange={(e) => setFormData({...formData, sellingPrice: parseNumber(e.target.value)})}
                    />
                  </div>
                </div>
              </div>
              <div className="grid gap-4 mt-2 border-t pt-4">
                <div className="flex justify-between items-center mb-2">
                  <Label className="text-emerald-700 font-bold">Harga Bertingkat (Tiers)</Label>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    type="button"
                    className="h-7 text-[10px] uppercase tracking-widest"
                    onClick={() => {
                       const base = formData.basePrice;
                       // Automatic margin examples
                        setFormData({
                          ...formData,
                          tier1Price: Math.round(base * 1.50), // B2C (+50%)
                          tier2Price: Math.round(base * 1.30), // General (+30%)
                          tier3Price: Math.round(base * 1.20), // Cash (+20%)
                          tier4Price: Math.round(base * 1.15), // Bottom (+15%)
                          tier5Price: Math.round(base * 1.10)  // Special Request (+10%)
                        });
                        toast.info("Tiers dihitung ulang (50%, 30%, 20%, 15%, 10%)");
                    }}
                  >
                    Auto-Calc Margins
                  </Button>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map(t => (
                    <div key={`tier${t}`} className="grid gap-1">
                      <Label className="text-[10px] text-slate-500">Tier {t}</Label>
                      <Input 
                        type="text"
                        inputMode="numeric"
                        className="h-8 text-xs px-2"
                        value={formatNumber((formData as any)[`tier${t}Price`])}
                        onChange={(e) => setFormData({...formData, [`tier${t}Price`]: parseNumber(e.target.value)})}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>Save Product</Button>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-end md:items-center justify-between">
        <div className="flex flex-1 flex-col md:flex-row gap-4 w-full md:w-auto">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search SKU or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={uomFilter} onValueChange={(val) => setUomFilter(val || "all")}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by UOM" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All UOMs</SelectItem>
                {uoms.map(uom => (
                  <SelectItem key={uom} value={uom}>{uom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="text-sm text-muted-foreground">
          Showing {filteredAndSortedProducts.length} of {products.length} products
        </div>
      </div>

      <div className="rounded-md border bg-white dark:bg-slate-950">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead 
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                onClick={() => requestSort('skuCode')}
              >
                <div className="flex items-center uppercase text-[10px] font-bold tracking-wider">
                  SKU {getSortIcon('skuCode')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                onClick={() => requestSort('name')}
              >
                <div className="flex items-center uppercase text-[10px] font-bold tracking-wider">
                  Product Name {getSortIcon('name')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                onClick={() => requestSort('uom')}
              >
                <div className="flex items-center uppercase text-[10px] font-bold tracking-wider">
                  UOM {getSortIcon('uom')}
                </div>
              </TableHead>
              <TableHead 
                className="text-right cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                onClick={() => requestSort('basePrice')}
              >
                <div className="flex items-center justify-end uppercase text-[10px] font-bold tracking-wider">
                  Base (Cost) {getSortIcon('basePrice')}
                </div>
              </TableHead>
              <TableHead 
                className="text-right cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                onClick={() => requestSort('sellingPrice')}
              >
                <div className="flex items-center justify-end uppercase text-[10px] font-bold tracking-wider">
                  Selling {getSortIcon('sellingPrice')}
                </div>
              </TableHead>
              <TableHead 
                className="text-right cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                onClick={() => requestSort('currentStock')}
              >
                <div className="flex items-center justify-end uppercase text-[10px] font-bold tracking-wider">
                  Stock {getSortIcon('currentStock')}
                </div>
              </TableHead>
              <TableHead className="text-right uppercase text-[10px] font-bold tracking-wider">
                Weekly Range (Mon-Sun)
              </TableHead>
              <TableHead className="w-[80px] uppercase text-[10px] font-bold tracking-wider">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No products found.
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedProducts.map((p) => (
                <TableRow key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                  <TableCell className="font-mono text-xs font-semibold text-slate-500">{p.skuCode}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                      {p.uom}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatRupiah(p.basePrice)}</TableCell>
                  <TableCell className="text-right text-emerald-600 font-bold font-mono text-xs">{formatRupiah(p.sellingPrice)}</TableCell>
                  <TableCell className="text-right">
                    <span className={`font-semibold ${p.currentStock > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                      {p.currentStock}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {p.weeklyPriceRange ? (
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1.5 font-mono text-[10px] font-black text-slate-700 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                          {formatRupiah(p.weeklyPriceRange.min || 0)} - {formatRupiah(p.weeklyPriceRange.max || 0)}
                        </div>
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mt-1">
                          Updated: {p.weeklyPriceRange.lastUpdated ? format(new Date(p.weeklyPriceRange.lastUpdated), "dd/MM HH:mm") : "-"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-300 italic">No history</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setHistoryProduct(p)} className="hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950" title="Lihat Riwayat Harga">
                        <History className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(p)} className="hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>

    {/* Price History Modal */}

    {historyProduct && (
      <Dialog open={!!historyProduct} onOpenChange={(open) => !open && setHistoryProduct(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex flex-col gap-1">
              <span>Riwayat Harga Pasar</span>
              <span className="text-sm font-normal text-slate-500">{historyProduct.name} · {historyProduct.skuCode}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Weekly Range Summary */}
            {historyProduct.weeklyPriceRange && (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-4 flex justify-between items-center border border-emerald-100 dark:border-emerald-900">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Range Harga Minggu Ini</p>
                  <p className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1">
                    {formatRupiah(historyProduct.weeklyPriceRange.min)} – {formatRupiah(historyProduct.weeklyPriceRange.max)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">per {historyProduct.uom}</p>
                  <p className="text-[9px] text-slate-400 mt-1">
                    Updated: {historyProduct.weeklyPriceRange.lastUpdated ? format(new Date(historyProduct.weeklyPriceRange.lastUpdated), "dd/MM HH:mm") : "-"}
                  </p>
                </div>
              </div>
            )}

            {/* History Entries - last 7 days */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Histori 7 Hari Terakhir</p>
              {(() => {
                const sevenDaysAgo = new Date()
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
                const entries = (historyProduct.priceHistory || [])
                  .filter(h => new Date(h.date) >= sevenDaysAgo)
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

                if (entries.length === 0) {
                  return (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      Belum ada data harga dalam 7 hari terakhir.
                    </div>
                  )
                }

                return (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {entries.map((h, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                            h.source === 'Pasar'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {h.source}
                          </span>
                          <span className="text-xs text-slate-400">{format(new Date(h.date), "dd MMM HH:mm")}</span>
                        </div>
                        <span className="font-black text-sm text-slate-700 dark:text-slate-200">{formatRupiah(h.price)}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )}
    </>
  )
}

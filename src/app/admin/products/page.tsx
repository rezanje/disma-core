"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah, formatNumber, parseNumber } from "@/lib/utils"
import { Plus, Pencil, Package, Hash, Download, Upload, RotateCcw, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { v4 as uuidv4 } from "uuid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { toast } from "sonner"
import { Product } from "@/types"
import { format } from "date-fns"

export default function ProductsPage() {
  const products = useAppStore(state => state.products)
  const addProduct = useAppStore(state => state.addProduct)
  const updateProduct = useAppStore(state => state.updateProduct)
  const resetDb = useAppStore(state => state.resetDb)
  
  const [isOpen, setIsOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  
  const [formData, setFormData] = useState({
    skuCode: "",
    name: "",
    uom: "kg",
    basePrice: 0,
    sellingPrice: 0,
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
  const uoms = Array.from(new Set(products.map(p => p.uom))).sort()

  // Filter and Sort Logic
  const filteredAndSortedProducts = products
    .filter(product => {
      const matchesSearch = 
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.skuCode.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesUom = uomFilter === "all" || product.uom === uomFilter
      
      return matchesSearch && matchesUom
    })
    .sort((a, b) => {
      if (!sortConfig.key) return 0
      
      const aValue = a[sortConfig.key]
      const bValue = b[sortConfig.key]
      
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
    setFormData({ skuCode: "", name: "", uom: "kg", basePrice: 0, sellingPrice: 0, currentStock: 0 })
    setEditingProduct(null)
  }

  const handleEdit = (product: Product) => {
    setEditingProduct(product)
    setFormData({
      skuCode: product.skuCode,
      name: product.name,
      uom: product.uom,
      basePrice: product.basePrice,
      sellingPrice: product.sellingPrice,
      currentStock: product.currentStock
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Product Master (SKU)</h2>
          <p className="text-muted-foreground">Manage your inventory items, units of measure, and pricing.</p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
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

          <Button variant="outline" onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = '.csv'
            input.onchange = (e: any) => {
              const file = e.target.files[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = (event: any) => {
                const csv = event.target.result
                const lines = csv.split('\n')
                const headers = lines[0].split(',')
                let count = 0
                for (let i = 1; i < lines.length; i++) {
                  if (!lines[i]) continue
                  const values = lines[i].split(',')
                  const product: any = { id: uuidv4() }
                  headers.forEach((h: string, index: number) => {
                    const cleanH = h.trim()
                    const val = values[index]?.trim()
                    if (cleanH === 'basePrice' || cleanH === 'sellingPrice' || cleanH === 'currentStock') {
                      product[cleanH] = Number(val) || 0
                    } else {
                      product[cleanH] = val
                    }
                  })
                  if (product.skuCode && product.name) {
                    addProduct(product)
                    count++
                  }
                }
                toast.success(`Imported ${count} products successfully`)
              }
              reader.readAsText(file)
            }
            input.click()
          }}>
            <Upload className="mr-2 h-4 w-4" /> Import CSV
          </Button>

          <Button variant="outline" onClick={() => {
            if (confirm("Reset inventory to system defaults? This will load the 1460 products I barusan import.")) {
              resetDb()
              toast.success("Inventory re-synced successfully")
            }
          }}>
            <RotateCcw className="mr-2 h-4 w-4" /> Sync Data
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
              <div className="grid gap-2">
                <Label htmlFor="name">Product Name</Label>
                <Input 
                  id="name" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Wortel Lokal Super" 
                />
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
                          {formatRupiah(p.weeklyPriceRange.min)} - {formatRupiah(p.weeklyPriceRange.max)}
                        </div>
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mt-1">
                          Updated: {format(new Date(p.weeklyPriceRange.lastUpdated), "dd/MM HH:mm")}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-300 italic">No history</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(p)} className="hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

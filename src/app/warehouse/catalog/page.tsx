"use client"

import { useState, useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, Filter, ArrowUpDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

type SortField = "name" | "skuCode" | "currentStock"

export default function WarehouseCatalogPage() {
  const products = useAppStore(state => state.products)
  const stockMovements = useAppStore(state => state.stockMovements)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortBy, setSortBy] = useState<SortField>("name")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")

  const processedProducts = useMemo(() => {
    let result = [...products]

    // 1. Filtering by Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.skuCode.toLowerCase().includes(q)
      )
    }

    // 2. Filtering by Status
    if (statusFilter === "ready") {
      result = result.filter(p => p.currentStock > 0)
    } else if (statusFilter === "empty") {
      result = result.filter(p => p.currentStock === 0)
    }

    // 3. Sorting
    result.sort((a, b) => {
      const getSortValue = (product: typeof a) => {
        switch (sortBy) {
          case "skuCode":
            return product.skuCode
          case "currentStock":
            return product.currentStock
          case "name":
          default:
            return product.name
        }
      }

      let valA: string | number = getSortValue(a)
      let valB: string | number = getSortValue(b)

      if (typeof valA === "string") {
        valA = valA.toLowerCase()
        valB = typeof valB === "string" ? valB.toLowerCase() : String(valB).toLowerCase()
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1
      if (valA > valB) return sortOrder === "asc" ? 1 : -1
      return 0
    })

    return result
  }, [products, searchQuery, statusFilter, sortBy, sortOrder])

  const recentMovements = useMemo(() => {
    return [...stockMovements]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 15)
  }, [stockMovements])

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortBy(field)
      setSortOrder("asc")
    }
  }

  return (
    <div className="space-y-6 px-2">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 uppercase">
             Katalog <span className="text-emerald-600">Barang & Stok</span>
          </h1>
          <p className="text-slate-400 font-bold mt-1 uppercase text-[10px] tracking-widest">Master SKU & Real-time Inventory Status</p>
        </div>
        <div className="flex items-center gap-3">
           <Card className="bg-white/80 backdrop-blur-md px-6 py-4 rounded-[2rem] border-white shadow-xl shadow-slate-200/50">
              <div className="flex flex-row items-center gap-6 whitespace-nowrap">
                <div className="flex items-center gap-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total SKU:</p>
                  <p className="text-xl font-black text-slate-900 leading-none">{products.length}</p>
                </div>
                <div className="w-px h-6 bg-slate-200" />
                <div className="flex items-center gap-3">
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Total Stok:</p>
                  <p className="text-xl font-black text-emerald-600 leading-none">
                     {products.reduce((acc, p) => acc + p.currentStock, 0).toLocaleString()}
                  </p>
                </div>
              </div>
           </Card>
        </div>
      </div>

      <Card className="bg-white/50 backdrop-blur-xl shadow-2xl shadow-slate-200/50 border-white rounded-[2.5rem] overflow-hidden">
        <CardHeader className="p-8 pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Cari nama barang atau SKU..." 
                className="pl-11 h-12 bg-white border-none rounded-2xl shadow-inner focus-visible:ring-emerald-500 font-bold"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-white p-1 rounded-2xl shadow-sm border border-slate-50">
                <span className="text-[10px] font-black text-slate-400 uppercase pl-3 flex items-center gap-1.5 border-r pr-3 mr-1">
                  <Filter className="w-3 h-3" /> Status
                </span>
                <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val || "all")}>
                  <SelectTrigger className="w-[120px] h-9 border-none bg-transparent focus:ring-0 font-bold text-xs ring-0 focus-visible:ring-0">
                    <SelectValue placeholder="Semua Status" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-none shadow-2xl">
                    <SelectItem value="all" className="rounded-xl font-bold">Semua</SelectItem>
                    <SelectItem value="ready" className="rounded-xl font-bold text-emerald-600">Ready Stock</SelectItem>
                    <SelectItem value="empty" className="rounded-xl font-bold text-rose-500">Stok Kosong</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 bg-white p-1 rounded-2xl shadow-sm border border-slate-50">
                <span className="text-[10px] font-black text-slate-400 uppercase pl-3 flex items-center gap-1.5 border-r pr-3 mr-1">
                  <ArrowUpDown className="w-3 h-3" /> Urutan
                </span>
                <Select value={sortBy} onValueChange={(val) => setSortBy((val as SortField) || "name")}>
                  <SelectTrigger className="w-[140px] h-9 border-none bg-transparent focus:ring-0 font-bold text-xs ring-0 focus-visible:ring-0">
                    <SelectValue placeholder="Urutkan By" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-none shadow-2xl">
                    <SelectItem value="name" className="rounded-xl font-bold">Nama Barang</SelectItem>
                    <SelectItem value="skuCode" className="rounded-xl font-bold">Kode SKU</SelectItem>
                    <SelectItem value="currentStock" className="rounded-xl font-bold">Jumlah Stok</SelectItem>
                  </SelectContent>
                </Select>
                <button 
                  onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                  className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400"
                >
                   <ArrowUpDown className={cn("w-4 h-4 transition-transform", sortOrder === 'desc' && "rotate-180")} />
                </button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="border-none">
                  <TableHead className="px-8 py-5 h-auto text-[10px] font-black uppercase text-slate-400 tracking-widest cursor-pointer hover:text-slate-900 transition-colors" onClick={() => toggleSort('skuCode')}>
                    SKU Code {sortBy === 'skuCode' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="px-8 py-5 h-auto text-[10px] font-black uppercase text-slate-400 tracking-widest cursor-pointer hover:text-slate-900 transition-colors" onClick={() => toggleSort('name')}>
                    Nama Barang {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="px-8 py-5 h-auto text-[10px] font-black uppercase text-slate-400 tracking-widest">Satuan (UOM)</TableHead>
                  <TableHead className="px-8 py-5 h-auto text-[10px] font-black uppercase text-slate-400 tracking-widest text-right cursor-pointer hover:text-slate-900 transition-colors" onClick={() => toggleSort('currentStock')}>
                    Stok Saat Ini {sortBy === 'currentStock' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="px-8 py-5 h-auto text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processedProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-64 text-center">
                       <div className="flex flex-col items-center gap-3 opacity-20">
                          <Search className="w-12 h-12" />
                          <p className="text-sm font-black uppercase tracking-widest">Data tidak ditemukan</p>
                       </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  processedProducts.slice(0, 100).map((p) => (
                    <TableRow key={p.id} className="border-b border-slate-50 hover:bg-white transition-all group">
                      <TableCell className="px-8 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-all font-mono text-[10px] font-bold">
                            #
                          </div>
                          <span className="font-mono text-xs font-black text-slate-400 group-hover:text-slate-900 transition-colors">{p.skuCode}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-8 py-4">
                        <p className="font-black text-slate-800 text-sm tracking-tight">{p.name}</p>
                      </TableCell>
                      <TableCell className="px-8 py-4">
                        <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-none font-bold text-[10px] uppercase px-3 py-1 rounded-full">
                          {p.uom}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-8 py-4 text-right">
                        <span className={cn(
                          "text-xl font-black",
                          p.currentStock > 0 ? "text-slate-900" : "text-slate-200"
                        )}>
                          {p.currentStock.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="px-8 py-4">
                        <div className="flex justify-center">
                          {p.currentStock > 0 ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100/50 shadow-sm shadow-emerald-500/10 scale-90">
                              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="text-[10px] font-black uppercase">Ready</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 text-slate-400 border border-slate-100 scale-90">
                              <div className="h-2 w-2 rounded-full bg-slate-300" />
                              <span className="text-[10px] font-black uppercase">Out</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {processedProducts.length > 100 && (
            <div className="p-8 text-center bg-slate-50/50 border-t border-slate-100">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Showing top 100 results • Use search for more</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white/50 backdrop-blur-xl shadow-2xl shadow-slate-200/50 border-white rounded-[2.5rem] overflow-hidden">
        <CardHeader className="p-8 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Mutasi Stok</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Jejak pergerakan barang dari QC, inventory, dan outbound</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Movement</p>
              <p className="text-2xl font-black text-emerald-600">{stockMovements.length}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentMovements.length === 0 ? (
            <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
              Belum ada mutasi stok yang terekam.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentMovements.map((m) => {
                const product = products.find(p => p.id === m.productId)
                return (
                  <div key={m.id} className="px-8 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-800 uppercase text-sm">{product?.name || m.productName || 'Unknown Product'}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {new Date(m.date).toLocaleString()} • {m.source}{m.destination ? ` → ${m.destination}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Delta</p>
                        <p className={cn("text-sm font-black", m.stockDelta > 0 ? "text-emerald-600" : m.stockDelta < 0 ? "text-rose-600" : "text-slate-500")}>
                          {m.stockDelta > 0 ? "+" : ""}{m.stockDelta}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hasil</p>
                        <p className="text-sm font-black text-slate-900">{m.resultingStock}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Jenis</p>
                        <p className="text-[10px] font-black text-emerald-600 uppercase">{m.kind.replace(/_/g, " ")}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import { useState, useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Filter, ArrowUpDown, Layers, Database, History, Calendar, DollarSign, Package } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn, formatRupiah } from "@/lib/utils"

type SortField = "name" | "skuCode" | "currentStock" | "b2cStock"

export default function WarehouseCatalogPage() {
  const products = useAppStore(state => state.products) || []
  const stockMovements = useAppStore(state => state.stockMovements) || []
  const users = useAppStore(state => state.users) || []
  
  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortBy, setSortBy] = useState<SortField>("name")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")

  // Ledger Search and Filter States
  const [ledgerSearch, setLedgerSearch] = useState("")
  const [ledgerWarehouseFilter, setLedgerWarehouseFilter] = useState("all")

  // Helper to resolve user name
  const getUserName = (userId: string | null | undefined) => {
    if (!userId) return "System"
    const user = users.find(u => u.id === userId)
    return user ? user.name : userId.slice(0, 8)
  }

  // Memoized process for MAIN warehouse products
  const processedMainProducts = useMemo(() => {
    let result = [...products]

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.skuCode.toLowerCase().includes(q)
      )
    }

    if (statusFilter === "ready") {
      result = result.filter(p => p.currentStock > 0)
    } else if (statusFilter === "empty") {
      result = result.filter(p => p.currentStock === 0)
    }

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

  // Memoized process for B2C warehouse products
  const processedB2CProducts = useMemo(() => {
    let result = products.filter(p => (p.b2cStock || 0) > 0)

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.skuCode.toLowerCase().includes(q)
      )
    }

    result.sort((a, b) => {
      let valA = a.b2cStock || 0
      let valB = b.b2cStock || 0

      if (sortBy === "name") {
        return sortOrder === "asc" 
          ? a.name.localeCompare(b.name) 
          : b.name.localeCompare(a.name)
      } else if (sortBy === "skuCode") {
        return sortOrder === "asc"
          ? a.skuCode.localeCompare(b.skuCode)
          : b.skuCode.localeCompare(a.skuCode)
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1
      if (valA > valB) return sortOrder === "asc" ? 1 : -1
      return 0
    })

    return result
  }, [products, searchQuery, sortBy, sortOrder])

  // Memoized stock movements list (Full Ledger)
  const processedMovements = useMemo(() => {
    let result = [...stockMovements]

    if (ledgerWarehouseFilter !== "all") {
      result = result.filter(m => (m.warehouseId || 'main') === ledgerWarehouseFilter)
    }

    if (ledgerSearch) {
      const q = ledgerSearch.toLowerCase()
      result = result.filter(m => 
        (m.productName || "").toLowerCase().includes(q) ||
        (m.skuCode || "").toLowerCase().includes(q) ||
        (m.note || "").toLowerCase().includes(q) ||
        (m.batchNumber || "").toLowerCase().includes(q)
      )
    }

    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [stockMovements, ledgerWarehouseFilter, ledgerSearch])

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
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 uppercase">
             Katalog <span className="text-emerald-600">Barang & Stok</span>
          </h1>
          <p className="text-slate-400 font-bold mt-1 uppercase text-[10px] tracking-widest">
            Inventory Management & Multi-Warehouse Stock Ledger
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Card className="bg-white/80 dark:bg-slate-900 backdrop-blur-md px-6 py-4 rounded-[2rem] border-white dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none">
            <div className="flex flex-row items-center gap-6 whitespace-nowrap">
              <div className="flex items-center gap-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total SKU:</p>
                <p className="text-xl font-black text-slate-900 dark:text-white leading-none">{products.length}</p>
              </div>
              <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
              <div className="flex items-center gap-3">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Stok Utama:</p>
                <p className="text-xl font-black text-emerald-600 leading-none">
                  {products.reduce((acc, p) => acc + p.currentStock, 0).toLocaleString()}
                </p>
              </div>
              <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
              <div className="flex items-center gap-3">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Stok B2C:</p>
                <p className="text-xl font-black text-blue-600 leading-none">
                  {products.reduce((acc, p) => acc + (p.b2cStock || 0), 0).toLocaleString()}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Tabs defaultValue="main" className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-2xl mb-6">
          <TabsTrigger value="main" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
            <Database className="w-4 h-4" /> Gudang Utama (Main WH)
          </TabsTrigger>
          <TabsTrigger value="b2c" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-500" /> Gudang B2C (Peralihan WH)
          </TabsTrigger>
          <TabsTrigger value="ledger" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-500" /> Ledger Mutasi Stok
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: MAIN WAREHOUSE */}
        <TabsContent value="main">
          <Card className="bg-white dark:bg-slate-900 shadow-2xl shadow-slate-200/50 dark:shadow-none border-none rounded-[2.5rem] overflow-hidden">
            <CardHeader className="p-8 pb-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder="Cari nama barang atau SKU..." 
                    className="pl-11 h-12 bg-slate-50 border-none rounded-2xl shadow-inner font-bold"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-100/55">
                    <span className="text-[10px] font-black text-slate-400 uppercase pl-3 flex items-center gap-1.5 border-r pr-3 mr-1">
                      <Filter className="w-3 h-3" /> Status
                    </span>
                    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? '')}>
                      <SelectTrigger className="w-[120px] h-9 border-none bg-transparent focus:ring-0 font-bold text-xs ring-0">
                        <SelectValue placeholder="Semua Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="font-bold">Semua</SelectItem>
                        <SelectItem value="ready" className="font-bold text-emerald-600">Ready Stock</SelectItem>
                        <SelectItem value="empty" className="font-bold text-rose-500">Stok Kosong</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-100/55">
                    <span className="text-[10px] font-black text-slate-400 uppercase pl-3 flex items-center gap-1.5 border-r pr-3 mr-1">
                      <ArrowUpDown className="w-3 h-3" /> Urutan
                    </span>
                    <Select value={sortBy} onValueChange={(val) => setSortBy(val as SortField)}>
                      <SelectTrigger className="w-[140px] h-9 border-none bg-transparent focus:ring-0 font-bold text-xs ring-0">
                        <SelectValue placeholder="Urutkan By" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name" className="font-bold">Nama Barang</SelectItem>
                        <SelectItem value="skuCode" className="font-bold">Kode SKU</SelectItem>
                        <SelectItem value="currentStock" className="font-bold">Jumlah Stok</SelectItem>
                      </SelectContent>
                    </Select>
                    <button 
                      onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                      className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"
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
                  <TableHeader className="bg-slate-50/50 dark:bg-slate-800/30">
                    <TableRow className="border-none">
                      <TableHead className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest cursor-pointer hover:text-slate-900" onClick={() => toggleSort('skuCode')}>
                        SKU Code {sortBy === 'skuCode' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </TableHead>
                      <TableHead className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest cursor-pointer hover:text-slate-900" onClick={() => toggleSort('name')}>
                        Nama Barang {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </TableHead>
                      <TableHead className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Satuan (UOM)</TableHead>
                      <TableHead className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right cursor-pointer hover:text-slate-900" onClick={() => toggleSort('currentStock')}>
                        Stok Utama {sortBy === 'currentStock' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </TableHead>
                      <TableHead className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processedMainProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-64 text-center">
                          <div className="flex flex-col items-center gap-3 opacity-20">
                            <Search className="w-12 h-12" />
                            <p className="text-sm font-black uppercase tracking-widest">Barang tidak ditemukan</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      processedMainProducts.map((p) => (
                        <TableRow key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 dark:hover:bg-slate-800/10 group">
                          <TableCell className="px-8 py-4">
                            <span className="font-mono text-xs font-black text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">{p.skuCode}</span>
                          </TableCell>
                          <TableCell className="px-8 py-4 font-black text-slate-800 dark:text-slate-200 text-sm">{p.name}</TableCell>
                          <TableCell className="px-8 py-4">
                            <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-800 text-slate-500 border-none font-bold text-[10px] uppercase px-3 py-1 rounded-full">
                              {p.uom}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-8 py-4 text-right text-xl font-black text-slate-900 dark:text-white">
                            {p.currentStock.toLocaleString()}
                          </TableCell>
                          <TableCell className="px-8 py-4">
                            <div className="flex justify-center">
                              {p.currentStock > 0 ? (
                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  <span className="text-[9px] font-black uppercase">Ready</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 text-slate-400 border border-slate-100">
                                  <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                  <span className="text-[9px] font-black uppercase">Kosong</span>
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: B2C WAREHOUSE */}
        <TabsContent value="b2c">
          <Card className="bg-white dark:bg-slate-900 shadow-2xl shadow-slate-200/50 dark:shadow-none border-none rounded-[2.5rem] overflow-hidden">
            <CardHeader className="p-8 pb-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder="Cari nama barang atau SKU..." 
                    className="pl-11 h-12 bg-slate-50 border-none rounded-2xl shadow-inner font-bold"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-100/55">
                    <span className="text-[10px] font-black text-slate-400 uppercase pl-3 flex items-center gap-1.5 border-r pr-3 mr-1">
                      <ArrowUpDown className="w-3 h-3" /> Urutan
                    </span>
                    <Select value={sortBy} onValueChange={(val) => setSortBy(val as SortField)}>
                      <SelectTrigger className="w-[140px] h-9 border-none bg-transparent focus:ring-0 font-bold text-xs ring-0">
                        <SelectValue placeholder="Urutkan By" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name" className="font-bold">Nama Barang</SelectItem>
                        <SelectItem value="skuCode" className="font-bold">Kode SKU</SelectItem>
                        <SelectItem value="currentStock" className="font-bold">Jumlah Stok</SelectItem>
                      </SelectContent>
                    </Select>
                    <button 
                      onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                      className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"
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
                  <TableHeader className="bg-slate-50/50 dark:bg-slate-800/30">
                    <TableRow className="border-none">
                      <TableHead className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest cursor-pointer hover:text-slate-900" onClick={() => toggleSort('skuCode')}>
                        SKU Code {sortBy === 'skuCode' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </TableHead>
                      <TableHead className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest cursor-pointer hover:text-slate-900" onClick={() => toggleSort('name')}>
                        Nama Barang {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </TableHead>
                      <TableHead className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Satuan (UOM)</TableHead>
                      <TableHead className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">
                        Stok B2C (Peralihan)
                      </TableHead>
                      <TableHead className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processedB2CProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-64 text-center">
                          <div className="flex flex-col items-center gap-3 opacity-20">
                            <Search className="w-12 h-12" />
                            <p className="text-sm font-black uppercase tracking-widest">Tidak ada barang di Gudang B2C</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      processedB2CProducts.map((p) => (
                        <TableRow key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 dark:hover:bg-slate-800/10 group">
                          <TableCell className="px-8 py-4">
                            <span className="font-mono text-xs font-black text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">{p.skuCode}</span>
                          </TableCell>
                          <TableCell className="px-8 py-4 font-black text-slate-800 dark:text-slate-200 text-sm">{p.name}</TableCell>
                          <TableCell className="px-8 py-4">
                            <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-800 text-slate-500 border-none font-bold text-[10px] uppercase px-3 py-1 rounded-full">
                              {p.uom}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-8 py-4 text-right text-xl font-black text-blue-600 dark:text-blue-400">
                            {(p.b2cStock || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="px-8 py-4">
                            <div className="flex justify-center">
                              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                                <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                <span className="text-[9px] font-black uppercase">Peralihan</span>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: LEDGER MUTASI STOK */}
        <TabsContent value="ledger">
          <Card className="bg-white dark:bg-slate-900 shadow-2xl shadow-slate-200/50 dark:shadow-none border-none rounded-[2.5rem] overflow-hidden">
            <CardHeader className="p-8 pb-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                  <CardTitle className="text-lg font-black text-slate-900 dark:text-white uppercase">Buku Besar Mutasi Stok</CardTitle>
                  <CardDescription className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">Jurnal pergerakan barang, batch, cost, dan kedaluarsa</CardDescription>
                </div>
                
                {/* Search & Warehouse Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-48">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                    <Input 
                      placeholder="Cari SKU, batch, nama..." 
                      className="pl-8 h-9 text-xs rounded-xl"
                      value={ledgerSearch}
                      onChange={(e) => setLedgerSearch(e.target.value)}
                    />
                  </div>
                  <Select value={ledgerWarehouseFilter} onValueChange={(v) => setLedgerWarehouseFilter(v ?? '')}>
                    <SelectTrigger className="h-9 text-xs rounded-xl w-36 bg-slate-50 border-none font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <SelectValue placeholder="Semua Gudang" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs font-bold">Semua Gudang</SelectItem>
                      <SelectItem value="main" className="text-xs font-bold text-emerald-600">Gudang Utama</SelectItem>
                      <SelectItem value="b2c" className="text-xs font-bold text-blue-600">Gudang B2C</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/50 dark:bg-slate-800/30">
                    <TableRow className="border-none">
                      <TableHead className="px-6 py-4 text-[9px] font-black uppercase text-slate-400 tracking-wider">Tanggal & Jam</TableHead>
                      <TableHead className="px-6 py-4 text-[9px] font-black uppercase text-slate-400 tracking-wider">Nama Barang / SKU</TableHead>
                      <TableHead className="px-6 py-4 text-[9px] font-black uppercase text-slate-400 tracking-wider">Gudang</TableHead>
                      <TableHead className="px-6 py-4 text-[9px] font-black uppercase text-slate-400 tracking-wider">Aktivitas</TableHead>
                      <TableHead className="px-6 py-4 text-[9px] font-black uppercase text-slate-400 tracking-wider">Batch No</TableHead>
                      <TableHead className="px-6 py-4 text-[9px] font-black uppercase text-slate-400 tracking-wider">Expired Date</TableHead>
                      <TableHead className="px-6 py-4 text-[9px] font-black uppercase text-slate-400 tracking-wider text-right">Cost</TableHead>
                      <TableHead className="px-6 py-4 text-[9px] font-black uppercase text-slate-400 tracking-wider text-right">Delta</TableHead>
                      <TableHead className="px-6 py-4 text-[9px] font-black uppercase text-slate-400 tracking-wider text-right">Saldo Akhir</TableHead>
                      <TableHead className="px-6 py-4 text-[9px] font-black uppercase text-slate-400 tracking-wider text-center">User</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processedMovements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="h-64 text-center">
                          <div className="flex flex-col items-center gap-3 opacity-20">
                            <History className="w-12 h-12" />
                            <p className="text-sm font-black uppercase tracking-widest">Belum ada riwayat mutasi stok</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      processedMovements.map((m) => (
                        <TableRow key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                          <TableCell className="px-6 py-3 font-mono text-[10px] text-slate-400 whitespace-nowrap">
                            {new Date(m.date).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                          </TableCell>
                          <TableCell className="px-6 py-3">
                            <p className="font-extrabold text-xs text-slate-800 dark:text-slate-200">{m.productName || "Unknown Product"}</p>
                            <p className="font-mono text-[9px] text-slate-400 uppercase mt-0.5">{m.skuCode || "-"}</p>
                          </TableCell>
                          <TableCell className="px-6 py-3">
                            {m.warehouseId === 'b2c' ? (
                              <Badge className="bg-blue-50 text-blue-700 border-blue-100 text-[8px] font-black uppercase">B2C</Badge>
                            ) : (
                              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[8px] font-black uppercase">Utama</Badge>
                            )}
                          </TableCell>
                          <TableCell className="px-6 py-3">
                            <p className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">{m.kind.replace(/_/g, " ")}</p>
                            {m.note && <p className="text-[9px] text-slate-400 italic max-w-[200px] truncate mt-0.5">{m.note}</p>}
                          </TableCell>
                          <TableCell className="px-6 py-3 font-mono text-xs text-slate-500">{m.batchNumber || "-"}</TableCell>
                          <TableCell className="px-6 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                            {m.expiryDate ? (
                              <span className="flex items-center gap-1 text-amber-600 font-bold">
                                <Calendar className="w-3.5 h-3.5" />
                                {new Date(m.expiryDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="px-6 py-3 text-right font-bold text-xs text-slate-600 dark:text-slate-400">
                            {m.unitCost ? formatRupiah(m.unitCost) : "-"}
                          </TableCell>
                          <TableCell className="px-6 py-3 text-right">
                            <span className={cn(
                              "font-black text-xs",
                              m.stockDelta > 0 ? "text-emerald-600" : m.stockDelta < 0 ? "text-rose-600" : "text-slate-500"
                            )}>
                              {m.stockDelta > 0 ? "+" : ""}{m.stockDelta}
                            </span>
                          </TableCell>
                          <TableCell className="px-6 py-3 text-right font-black text-xs text-slate-900 dark:text-white">
                            {m.resultingStock}
                          </TableCell>
                          <TableCell className="px-6 py-3 text-center whitespace-nowrap">
                            <span className="text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded uppercase">
                              {getUserName(m.createdByUserId)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

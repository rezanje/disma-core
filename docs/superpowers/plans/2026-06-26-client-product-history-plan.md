# Histori Pemesanan & Komposisi Produk Klien Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan tab "Histori Produk" di detail klien yang menyajikan filter tanggal/cabang, grafik bar horizontal Top 5 produk terlaris, dan tabel detail kuantitas, harga rata-rata, nominal belanja, dan tanggal order terakhir.

**Architecture:** Menambahkan state `outletFilter`, `productSearch`, `productSort`, dan visualisasi Recharts di `src/app/admin/clients/page.tsx`, melakukan agregasi client-side menggunakan `useMemo` dari state `salesOrders` dan `salesOrderItems` di Zustand store.

**Tech Stack:** React, Next.js, Zustand, Lucide-React, Recharts, TailwindCSS.

---

### Task 1: Definisikan Helper & Agregasi Data
Menghitung agregasi riwayat produk klien per jangka waktu dan outlet cabang.

**Files:**
- Modify: [src/app/admin/clients/page.tsx](file:///Users/rezanje/Gen_Dev_Studio/disma-core/src/app/admin/clients/page.tsx)

- [ ] **Step 1: Tambahkan state filter baru dan data memoization**
Sisipkan state berikut di dekat penulisan state detail client:
```typescript
  const [productSearch, setProductSearch] = useState("")
  const [outletFilter, setOutletFilter] = useState("all")
  const [productSort, setProductSort] = useState<"qty" | "revenue" | "name">("qty")
  const [historyTimeFilter, setHistoryTimeFilter] = useState<'all' | '7days' | '30days' | 'thismonth' | 'custom'>('all')
  const [historyStartDate, setHistoryStartDate] = useState("")
  const [historyEndDate, setHistoryEndDate] = useState("")
```

- [ ] **Step 2: Buat memoized data helper `isHistoryDateInSelectedRange`**
Buat fungsi filter rentang tanggal di dalam komponen `ClientsPage`:
```typescript
  const isHistoryDateInSelectedRange = (dateStr: string) => {
    if (!dateStr) return false
    try {
      const date = parseISO(dateStr)
      const today = new Date()
      if (historyTimeFilter === '7days') {
        const diff = differenceInDays(today, date)
        return diff >= 0 && diff <= 7
      }
      if (historyTimeFilter === '30days') {
        const diff = differenceInDays(today, date)
        return diff >= 0 && diff <= 30
      }
      if (historyTimeFilter === 'thismonth') {
        return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear()
      }
      if (historyTimeFilter === 'custom') {
        if (historyStartDate) {
          const start = new Date(historyStartDate)
          start.setHours(0, 0, 0, 0)
          if (date < start) return false
        }
        if (historyEndDate) {
          const end = new Date(historyEndDate)
          end.setHours(23, 59, 59, 999)
          if (date > end) return false
        }
        return true
      }
      return true
    } catch {
      return false
    }
  }
```

- [ ] **Step 3: Buat memoized product history aggregator**
Definisikan memoized array `clientProductHistory` di dalam komponen:
```typescript
  const clientProductHistory = useMemo(() => {
    if (!selectedClient) return []

    const targetClientIds = new Set<string>()
    if (selectedClient.isBrand && outletFilter === 'all') {
      targetClientIds.add(selectedClient.id)
      clients.filter(c => c.parentId === selectedClient.id).forEach(c => targetClientIds.add(c.id))
    } else if (selectedClient.isBrand && outletFilter !== 'all' && outletFilter !== 'parent_only') {
      targetClientIds.add(outletFilter)
    } else {
      targetClientIds.add(selectedClient.id)
    }

    const filteredOrders = salesOrders.filter(so => {
      if (!targetClientIds.has(so.clientId)) return false
      if (so.status === 'Batal') return false
      return isHistoryDateInSelectedRange(so.orderDate)
    })

    const orderIds = new Set(filteredOrders.map(so => so.id))

    const aggregation: {
      [productId: string]: {
        productId: string
        totalQtyFinal: number
        totalQtyOriginal: number
        totalValue: number
        lastOrderDate: string
      }
    } = {}

    salesOrderItems.forEach(item => {
      if (!orderIds.has(item.salesOrderId)) return

      const qtyFinal = item.qtyFinal !== undefined && item.qtyFinal !== null ? item.qtyFinal : item.qty
      const value = item.subtotalFinal !== undefined && item.subtotalFinal !== null ? item.subtotalFinal : item.subtotal
      const order = filteredOrders.find(so => so.id === item.salesOrderId)
      const orderDate = order ? order.orderDate : ''

      if (!aggregation[item.productId]) {
        aggregation[item.productId] = {
          productId: item.productId,
          totalQtyFinal: qtyFinal,
          totalQtyOriginal: item.qty,
          totalValue: value,
          lastOrderDate: orderDate
        }
      } else {
        const agg = aggregation[item.productId]
        agg.totalQtyFinal += qtyFinal
        agg.totalQtyOriginal += item.qty
        agg.totalValue += value
        if (orderDate && (!agg.lastOrderDate || new Date(orderDate) > new Date(agg.lastOrderDate))) {
          agg.lastOrderDate = orderDate
        }
      }
    })

    let result = Object.values(aggregation)
      .map(agg => {
        const product = products.find(p => p.id === agg.productId)
        return {
          ...agg,
          productName: product?.name || 'Produk Tidak Dikenal',
          skuCode: product?.skuCode || '-',
          category: product?.category || '-',
          uom: product?.uom || 'pcs',
          avgPrice: agg.totalQtyFinal > 0 ? agg.totalValue / agg.totalQtyFinal : 0
        }
      })
      .filter(item => {
        if (!productSearch) return true
        const term = productSearch.toLowerCase()
        return item.productName.toLowerCase().includes(term) || item.skuCode.toLowerCase().includes(term)
      })

    if (productSort === 'qty') {
      result.sort((a, b) => b.totalQtyFinal - a.totalQtyFinal)
    } else if (productSort === 'revenue') {
      result.sort((a, b) => b.totalValue - a.totalValue)
    } else if (productSort === 'name') {
      result.sort((a, b) => a.productName.localeCompare(b.productName))
    }

    return result
  }, [selectedClient, outletFilter, historyTimeFilter, historyStartDate, historyEndDate, salesOrders, salesOrderItems, products, clients, productSearch, productSort])
```

- [ ] **Step 4: Commit**
```bash
git add src/app/admin/clients/page.tsx
git commit -m "feat(clients): add state and calculation hooks for product history"
```

---

### Task 2: Tambahkan UI Tab dan Filter Histori Produk
Memperbarui daftar tab detail klien dan menambahkan UI pengendali filter/pencarian.

**Files:**
- Modify: [src/app/admin/clients/page.tsx](file:///Users/rezanje/Gen_Dev_Studio/disma-core/src/app/admin/clients/page.tsx)

- [ ] **Step 1: Daftarkan tab baru ke dalam array `tabsList`**
Cari deklarasi `tabsList` di dalam layout detail client:
```typescript
    const tabsList = ['Profile']
    if (selectedClient.isBrand) {
      tabsList.push('Cabang / Outlets')
    }
    tabsList.push('Purchase Orders', 'Invoices', 'Payment History', 'Notes')
```
Ubah menjadi:
```typescript
    const tabsList = ['Profile']
    if (selectedClient.isBrand) {
      tabsList.push('Cabang / Outlets')
    }
    tabsList.push('Purchase Orders', 'Invoices', 'Histori Produk', 'Payment History', 'Notes')
```

- [ ] **Step 2: Render TabsContent untuk `histori-produk`**
Sisipkan komponen layout filter ini setelah `TabsContent` milik `invoices` selesai dirender:
```typescript
            <TabsContent value="histori-produk" className="p-8 space-y-6 flex-1 bg-white">
              {/* Filter controls row */}
              <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
                  {/* Search Bar */}
                  <div className="relative w-full sm:w-60">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Cari Produk / SKU..."
                      className="pl-9 h-10 bg-white border-slate-200 focus-visible:ring-emerald-500 rounded-xl"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                  </div>

                  {/* Date Filter Dropdown */}
                  <Select value={historyTimeFilter} onValueChange={(val: any) => setHistoryTimeFilter(val)}>
                    <SelectTrigger className="w-full sm:w-44 h-10 bg-white border-slate-200 rounded-xl text-xs font-black uppercase tracking-wide">
                      <SelectValue placeholder="Jangka Waktu" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Waktu</SelectItem>
                      <SelectItem value="7days">7 Hari Terakhir</SelectItem>
                      <SelectItem value="30days">30 Hari Terakhir</SelectItem>
                      <SelectItem value="thismonth">Bulan Ini</SelectItem>
                      <SelectItem value="custom">Rentang Kustom</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Brand Outlet Filter (Only show if client is Brand) */}
                  {selectedClient.isBrand && (
                    <Select value={outletFilter} onValueChange={setOutletFilter}>
                      <SelectTrigger className="w-full sm:w-56 h-10 bg-white border-slate-200 rounded-xl text-xs font-black uppercase tracking-wide">
                        <SelectValue placeholder="Semua Outlet" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Outlet (Gabungan)</SelectItem>
                        <SelectItem value="parent_only">Brand Induk Saja</SelectItem>
                        {clients.filter(c => c.parentId === selectedClient.id).map(branch => (
                          <SelectItem key={branch.id} value={branch.id}>{branch.companyName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Sort Order Dropdown */}
                  <Select value={productSort} onValueChange={(val: any) => setProductSort(val)}>
                    <SelectTrigger className="w-full sm:w-48 h-10 bg-white border-slate-200 rounded-xl text-xs font-black uppercase tracking-wide">
                      <SelectValue placeholder="Urutkan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="qty">Kuantitas Terbanyak</SelectItem>
                      <SelectItem value="revenue">Belanja Terbesar</SelectItem>
                      <SelectItem value="name">Nama Produk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Custom Date Inputs if 'custom' date selected */}
              {historyTimeFilter === 'custom' && (
                <div className="flex flex-wrap gap-4 items-center bg-slate-50 p-4 rounded-xl border border-slate-100/50 mt-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-black uppercase text-slate-400 pl-1">Tanggal Mulai</label>
                    <Input
                      type="date"
                      className="h-10 bg-white border-slate-200 rounded-xl w-44"
                      value={historyStartDate}
                      onChange={(e) => setHistoryStartDate(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-black uppercase text-slate-400 pl-1">Tanggal Selesai</label>
                    <Input
                      type="date"
                      className="h-10 bg-white border-slate-200 rounded-xl w-44"
                      value={historyEndDate}
                      onChange={(e) => setHistoryEndDate(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </TabsContent>
```

- [ ] **Step 3: Commit**
```bash
git add src/app/admin/clients/page.tsx
git commit -m "feat(clients): integrate layout filters for client product history tab"
```

---

### Task 3: Implementasi Visualisasi Top Products & Table
Menggambar grafik Recharts horizontal Bar Chart untuk Top 5 produk, serta tabel detail histori produk.

**Files:**
- Modify: [src/app/admin/clients/page.tsx](file:///Users/rezanje/Gen_Dev_Studio/disma-core/src/app/admin/clients/page.tsx)

- [ ] **Step 1: Buat dan sisipkan horizontal Bar Chart untuk Top 5 produk**
Ambil data `top5Products = clientProductHistory.slice(0, 5)`. Tambahkan layout chart ini di dalam `TabsContent value="histori-produk"` setelah filter:
```typescript
              {/* Visual Composition Section */}
              {clientProductHistory.length > 0 && (
                <div className="grid grid-cols-1 gap-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                  <div>
                    <h4 className="text-sm font-black text-slate-900">Top 5 Produk Terlaris</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Berdasarkan Volume Kuantitas Terkirim (qtyFinal)</p>
                  </div>
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={clientProductHistory.slice(0, 5)}
                        margin={{ top: 10, right: 30, left: 40, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: '#64748B' }} />
                        <YAxis 
                          type="category" 
                          dataKey="productName" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 900, fill: '#1e293b' }}
                          width={120}
                        />
                        <ChartTooltip 
                          formatter={(value: any) => [`${value} unit`, 'Kuantitas']}
                          contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}
                        />
                        <Bar dataKey="totalQtyFinal" fill="#10B981" radius={[0, 4, 4, 0]} barSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
```

- [ ] **Step 2: Tambahkan tabel detail produk histori**
Sisipkan tabel setelah chart (atau di dalam kontainer yang sama):
```typescript
              {/* Product Ledger Table */}
              <div className="border border-slate-100 rounded-2xl overflow-hidden mt-6">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-black text-[10px] uppercase pl-8 py-4">Nama Produk &amp; SKU</TableHead>
                      <TableHead className="font-black text-[10px] uppercase">Kategori</TableHead>
                      <TableHead className="font-black text-[10px] uppercase text-right">Kuantitas Terkirim</TableHead>
                      <TableHead className="font-black text-[10px] uppercase text-right">Harga Rata-rata</TableHead>
                      <TableHead className="font-black text-[10px] uppercase text-right">Total Transaksi</TableHead>
                      <TableHead className="font-black text-[10px] uppercase text-center">Terakhir Dipesan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientProductHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-slate-400 italic">
                          Tidak ada histori pemesanan produk untuk filter yang dipilih.
                        </TableCell>
                      </TableRow>
                    ) : (
                      clientProductHistory.map(item => {
                        const hasDiff = item.totalQtyOriginal !== item.totalQtyFinal
                        return (
                          <TableRow key={item.productId} className="hover:bg-slate-50 transition-colors">
                            <TableCell className="pl-8 py-5 text-xs">
                              <div className="flex flex-col">
                                <span className="font-black text-slate-800">{item.productName}</span>
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">SKU: {item.skuCode}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs font-bold text-slate-600">{item.category}</TableCell>
                            <TableCell className="text-right text-xs">
                              <div className="flex flex-col items-end">
                                <span className="font-black text-slate-900">{item.totalQtyFinal} {item.uom}</span>
                                {hasDiff && (
                                  <span className="text-[9px] font-bold text-amber-600 uppercase mt-0.5">
                                    Order: {item.totalQtyOriginal}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-xs font-black text-slate-800">
                              {formatRupiah(item.avgPrice)}
                            </TableCell>
                            <TableCell className="text-right text-xs font-black text-emerald-600">
                              {formatRupiah(item.totalValue)}
                            </TableCell>
                            <TableCell className="text-center text-xs font-bold text-slate-600">
                              {item.lastOrderDate ? format(parseISO(item.lastOrderDate), 'dd MMM yyyy') : '-'}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
```

- [ ] **Step 3: Commit**
```bash
git add src/app/admin/clients/page.tsx
git commit -m "feat(clients): add horizontal chart and list table in client product history"
```

---

### Task 4: Verifikasi & Kompilasi Project
Memverifikasi build agar tidak ada compilation errors.

**Files:**
- Test: Local compiler build

- [ ] **Step 1: Jalankan kompilasi produksi**
Run: `npm run build`
Expected: Berhasil tanpa error TypeScript atau warning pre-render.

- [ ] **Step 2: Commit & Push**
```bash
git push origin main
```

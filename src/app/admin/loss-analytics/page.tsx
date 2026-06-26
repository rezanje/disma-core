"use client"

import { useState, useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ChartTooltip, 
  ResponsiveContainer,
  Legend
} from "recharts"
import { 
  TrendingDown, 
  ShieldAlert, 
  History, 
  Package, 
  Calendar, 
  Search, 
  ArrowRightLeft, 
  AlertTriangle,
  Coins,
  Store,
  User,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Download,
  Filter,
  ArrowRight,
  Activity
} from "lucide-react"
import { format, parseISO, differenceInDays } from "date-fns"
import { id as localeId } from "date-fns/locale"
import { cn } from "@/lib/utils"
import Link from "next/link"
import React from "react"

type TimeFilterType = '7days' | '30days' | 'thismonth' | 'all' | 'custom'

export default function LossAnalyticsPage() {
  const products = useAppStore(state => state.products) || []
  const stockMovements = useAppStore(state => state.stockMovements) || []
  const rejectedItems = useAppStore(state => state.rejectedItems) || []
  const purchaseItems = useAppStore(state => state.purchaseItems) || []
  const purchases = useAppStore(state => state.purchases) || []
  const users = useAppStore(state => state.users) || []
  const vendors = useAppStore(state => state.vendors) || []

  // Filter States
  const [timeFilter, setTimeFilter] = useState<TimeFilterType>('30days')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [lossCategoryFilter, setLossCategoryFilter] = useState('all')
  const [productSearch, setProductSearch] = useState('')
  const [ledgerProductSearch, setLedgerProductSearch] = useState('')

  // Date range checker helper
  const isDateInSelectedRange = (dateStr: string) => {
    if (!dateStr) return false
    try {
      const date = parseISO(dateStr)
      const today = new Date()
      
      if (timeFilter === '7days') {
        const diff = differenceInDays(today, date)
        return diff >= 0 && diff <= 7
      }
      if (timeFilter === '30days') {
        const diff = differenceInDays(today, date)
        return diff >= 0 && diff <= 30
      }
      if (timeFilter === 'thismonth') {
        return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear()
      }
      if (timeFilter === 'custom') {
        if (startDate) {
          const start = new Date(startDate)
          start.setHours(0, 0, 0, 0)
          if (date < start) return false
        }
        if (endDate) {
          const end = new Date(endDate)
          end.setHours(23, 59, 59, 999)
          if (date > end) return false
        }
        return true
      }
      return true // 'all'
    } catch {
      return false
    }
  }

  // 1. COMPILING UNIFIED LOSS EVENTS
  const lossEvents = useMemo(() => {
    const list: any[] = []

    // A. QC & Return Rejects from rejectedItems log
    rejectedItems.forEach(item => {
      const isReturn = item.source === 'Return'
      const isDisposal = item.reason.toLowerCase().includes('disposal') || (!isReturn && !item.reason.toLowerCase().includes('supplier') && !item.reason.toLowerCase().includes('b2c'))
      const isSupplierReturn = item.reason.toLowerCase().includes('supplier') || item.reason.toLowerCase().includes('retur supplier')
      const isB2C = item.reason.toLowerCase().includes('b2c') || item.reason.toLowerCase().includes('peralihan b2c')
      
      // Transfers to B2C are not counted as losses
      if (isB2C) return

      const product = products.find(p => p.id === item.productId)
      const pi = purchaseItems.find(p => p.id === item.referenceId)
      
      // Resolve accurate unit cost at time of event
      const unitCost = pi?.actualUnitPrice || pi?.estimatedUnitPrice || product?.basePrice || 0
      const lossAmount = item.qty * unitCost

      list.push({
        id: item.id,
        date: item.date,
        category: isSupplierReturn ? 'Supplier Return' : isReturn ? 'Return Reject' : 'QC Damage',
        categoryLabel: isSupplierReturn ? 'Retur Supplier (Kompensasi)' : isReturn ? 'Retur Client Rusak (Write-off)' : 'QC Reject (Disposal)',
        isFinancialLoss: !isSupplierReturn, // Supplier returns are not net financial loss
        productId: item.productId,
        productName: product?.name || 'Unknown Product',
        skuCode: product?.skuCode || '-',
        uom: product?.uom || 'pcs',
        qty: item.qty,
        unitPrice: unitCost,
        lossAmount,
        reason: item.reason,
        referenceId: item.referenceId,
        reportedBy: users.find(u => u.id === item.reportedBy)?.name || 'System'
      })
    })

    // B. Stock Opname Deficits (Lost / Shrinkage)
    stockMovements.forEach(m => {
      if (m.kind === 'ADJUSTMENT' && m.stockDelta < 0 && m.source === 'Stock Opname') {
        const product = products.find(p => p.id === m.productId)
        const unitCost = m.unitCost || product?.basePrice || 0
        const qty = Math.abs(m.stockDelta)
        const lossAmount = qty * unitCost

        list.push({
          id: m.id,
          date: m.date,
          category: 'Opname Deficit',
          categoryLabel: 'Selisih Opname (Hilang/Susut)',
          isFinancialLoss: true,
          productId: m.productId,
          productName: m.productName || product?.name || 'Unknown Product',
          skuCode: m.skuCode || product?.skuCode || '-',
          uom: product?.uom || 'pcs',
          qty,
          unitPrice: unitCost,
          lossAmount,
          reason: m.note || 'Selisih kurang stock opname',
          referenceId: m.referenceId || m.id,
          reportedBy: users.find(u => u.id === m.createdByUserId)?.name || 'System'
        })
      }
    })

    // C. Sourcing Overprice (Kemahalan)
    purchaseItems.forEach(item => {
      if (item.isChecked && item.actualUnitPrice > item.estimatedUnitPrice && item.qtyPurchased > 0) {
        const product = products.find(p => p.id === item.productId)
        const parentP = purchases.find(p => p.id === item.purchaseId)
        
        const qty = item.qtyPurchased
        const overpricePerUnit = item.actualUnitPrice - item.estimatedUnitPrice
        const lossAmount = qty * overpricePerUnit

        const buyer = parentP ? users.find(u => u.id === parentP.purchaserId) : null

        list.push({
          id: item.id,
          date: item.inboundVerifiedAt || parentP?.date || new Date().toISOString(),
          category: 'Overprice',
          categoryLabel: 'Sourcing Kemahalan (Overprice)',
          isFinancialLoss: true,
          productId: item.productId,
          productName: product?.name || 'Unknown Product',
          skuCode: product?.skuCode || '-',
          uom: product?.uom || 'pcs',
          qty,
          unitPrice: overpricePerUnit,
          lossAmount,
          reason: `Harga beli ${formatRupiah(item.actualUnitPrice)} vs budget HPP ${formatRupiah(item.estimatedUnitPrice)}`,
          referenceId: item.purchaseId,
          reportedBy: buyer?.name || 'Tim Sourcing'
        })
      }
    })

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [rejectedItems, stockMovements, purchaseItems, products, purchases, users])

  // Filtered Loss Events based on UI controls
  const filteredLossEvents = useMemo(() => {
    return lossEvents.filter(event => {
      if (!isDateInSelectedRange(event.date)) return false
      
      if (lossCategoryFilter !== 'all') {
        if (lossCategoryFilter === 'damaged' && !['QC Damage', 'Return Reject'].includes(event.category)) return false
        if (lossCategoryFilter === 'lost' && event.category !== 'Opname Deficit') return false
        if (lossCategoryFilter === 'overprice' && event.category !== 'Overprice') return false
        if (lossCategoryFilter === 'vendor_return' && event.category !== 'Supplier Return') return false
      }

      if (productSearch) {
        const q = productSearch.toLowerCase()
        return (
          event.productName.toLowerCase().includes(q) ||
          event.skuCode.toLowerCase().includes(q) ||
          event.reason.toLowerCase().includes(q)
        )
      }

      return true
    })
  }, [lossEvents, timeFilter, startDate, endDate, lossCategoryFilter, productSearch])

  // Aggregate Metrics for Cards
  const summaryMetrics = useMemo(() => {
    const activeEvents = lossEvents.filter(e => isDateInSelectedRange(e.date))
    
    const financialLoss = activeEvents.filter(e => e.isFinancialLoss).reduce((sum, e) => sum + e.lossAmount, 0)
    const qcDamage = activeEvents.filter(e => e.category === 'QC Damage').reduce((sum, e) => sum + e.lossAmount, 0)
    const clientReturnReject = activeEvents.filter(e => e.category === 'Return Reject').reduce((sum, e) => sum + e.lossAmount, 0)
    const opnameDeficit = activeEvents.filter(e => e.category === 'Opname Deficit').reduce((sum, e) => sum + e.lossAmount, 0)
    const overprice = activeEvents.filter(e => e.category === 'Overprice').reduce((sum, e) => sum + e.lossAmount, 0)
    const supplierReturn = activeEvents.filter(e => e.category === 'Supplier Return').reduce((sum, e) => sum + e.lossAmount, 0)

    return {
      financialLoss,
      damagedLoss: qcDamage + clientReturnReject,
      opnameDeficit,
      overprice,
      supplierReturn
    }
  }, [lossEvents, timeFilter, startDate, endDate])

  // 2. DAILY LOSS CHART DATA
  const dailyLossChartData = useMemo(() => {
    const activeEvents = lossEvents.filter(e => isDateInSelectedRange(e.date) && e.isFinancialLoss)
    const dailyMap: Record<string, { date: string, formattedDate: string, QC_Reject: number, Opname_Defisit: number, Overpriced: number, Total: number }> = {}

    // Initialize date map to ensure dates are sorted and filled properly
    const dateRangeList: string[] = []
    
    // Sort events to find min/max dates
    if (activeEvents.length > 0) {
      const sortedEvents = [...activeEvents].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      const firstDate = new Date(sortedEvents[0].date)
      const lastDate = new Date()
      
      const daySpan = differenceInDays(lastDate, firstDate)
      const limit = timeFilter === '7days' ? 6 : timeFilter === '30days' ? 29 : daySpan
      
      for (let i = limit; i >= 0; i--) {
        const d = new Date()
        d.setDate(lastDate.getDate() - i)
        const dStr = d.toISOString().slice(0, 10)
        dateRangeList.push(dStr)
      }
    } else {
      // Fallback range: last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        dateRangeList.push(d.toISOString().slice(0, 10))
      }
    }

    dateRangeList.forEach(dStr => {
      const parsed = parseISO(dStr)
      dailyMap[dStr] = {
        date: dStr,
        formattedDate: format(parsed, 'dd MMM', { locale: localeId }),
        QC_Reject: 0,
        Opname_Defisit: 0,
        Overpriced: 0,
        Total: 0
      }
    })

    // Populate data
    activeEvents.forEach(e => {
      const dStr = e.date.slice(0, 10)
      if (dailyMap[dStr]) {
        const amt = e.lossAmount
        if (e.category === 'QC Damage' || e.category === 'Return Reject') {
          dailyMap[dStr].QC_Reject += amt
        } else if (e.category === 'Opname Deficit') {
          dailyMap[dStr].Opname_Defisit += amt
        } else if (e.category === 'Overprice') {
          dailyMap[dStr].Overpriced += amt
        }
        dailyMap[dStr].Total += amt
      }
    })

    return Object.values(dailyMap).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [lossEvents, timeFilter, startDate, endDate])

  // 3. DAILY PRODUCT STOCK LEDGER
  const dailyProductMovements = useMemo(() => {
    const map: Record<string, { key: string, date: string, productId: string, productName: string, skuCode: string, uom: string, qtyIn: number, qtyOut: number, netMovement: number }> = {}

    stockMovements.forEach(m => {
      const dateStr = m.date.slice(0, 10)
      if (!isDateInSelectedRange(m.date)) return

      const key = `${dateStr}_${m.productId}`

      if (!map[key]) {
        const product = products.find(p => p.id === m.productId)
        map[key] = {
          key,
          date: dateStr,
          productId: m.productId,
          productName: m.productName || product?.name || 'Unknown Product',
          skuCode: m.skuCode || product?.skuCode || '-',
          uom: product?.uom || 'pcs',
          qtyIn: 0,
          qtyOut: 0,
          netMovement: 0
        }
      }

      const qty = Number(m.quantity || Math.abs(m.stockDelta || 0))

      if (m.direction === 'In') {
        map[key].qtyIn += qty
      } else if (m.direction === 'Out') {
        map[key].qtyOut += qty
      }
    })

    return Object.values(map)
      .map(item => ({
        ...item,
        netMovement: item.qtyIn - item.qtyOut
      }))
      .filter(item => {
        if (ledgerProductSearch) {
          const q = ledgerProductSearch.toLowerCase()
          return (
            item.productName.toLowerCase().includes(q) ||
            item.skuCode.toLowerCase().includes(q)
          )
        }
        return true
      })
      .sort((a, b) => {
        const dateCompare = new Date(b.date).getTime() - new Date(a.date).getTime()
        if (dateCompare !== 0) return dateCompare
        return a.productName.localeCompare(b.productName)
      })
  }, [stockMovements, products, timeFilter, startDate, endDate, ledgerProductSearch])

  // 4. TOP PRODUCTS BY LOSS
  const topProductsLoss = useMemo(() => {
    const activeEvents = lossEvents.filter(e => isDateInSelectedRange(e.date) && e.isFinancialLoss)
    const productMap: Record<string, { name: string, sku: string, lossAmount: number, eventsCount: number }> = {}

    activeEvents.forEach(e => {
      if (!productMap[e.productId]) {
        productMap[e.productId] = {
          name: e.productName,
          sku: e.skuCode,
          lossAmount: 0,
          eventsCount: 0
        }
      }
      productMap[e.productId].lossAmount += e.lossAmount
      productMap[e.productId].eventsCount += 1
    })

    return Object.values(productMap)
      .sort((a, b) => b.lossAmount - a.lossAmount)
      .slice(0, 10)
  }, [lossEvents, timeFilter, startDate, endDate])

  // 5. OVERPRICED PURCHASES BY VENDOR/PRODUCT
  const overpricedReport = useMemo(() => {
    const activeEvents = lossEvents.filter(e => isDateInSelectedRange(e.date) && e.category === 'Overprice')
    const vendorMap: Record<string, { vendorName: string, lossAmount: number, itemsCount: number }> = {}

    activeEvents.forEach(e => {
      const pi = purchaseItems.find(item => item.purchaseId === e.referenceId && item.productId === e.productId)
      const vId = pi?.vendorId
      const vendorName = vId ? (vendors.find(v => v.id === vId)?.companyName || 'Unknown Vendor') : 'Sourcing Vendor'
      
      if (!vendorMap[vendorName]) {
        vendorMap[vendorName] = {
          vendorName,
          lossAmount: 0,
          itemsCount: 0
        }
      }
      vendorMap[vendorName].lossAmount += e.lossAmount
      vendorMap[vendorName].itemsCount += 1
    })

    return Object.values(vendorMap)
      .sort((a, b) => b.lossAmount - a.lossAmount)
      .slice(0, 5)
  }, [lossEvents, purchaseItems, vendors, timeFilter, startDate, endDate])

  return (
    <div className="space-y-8 px-2 max-w-7xl mx-auto pb-20">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 uppercase">
            Analisa <span className="text-rose-600">Kerugian & Stok</span>
          </h1>
          <p className="text-slate-400 font-bold mt-1 uppercase text-[10px] tracking-widest">
            Dashboard Kerugian Material (Rusak, Hilang, Kemahalan) & Ledger Mutasi Harian
          </p>
        </div>

        {/* Global Date Filters */}
        <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900 p-2 rounded-3xl border border-slate-100 shadow-xl shadow-slate-100/40 dark:shadow-none">
          <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200/30">
            {[
              { key: '7days', label: '7 Hari' },
              { key: '30days', label: '30 Hari' },
              { key: 'thismonth', label: 'Bulan Ini' },
              { key: 'all', label: 'Semua' },
              { key: 'custom', label: 'Kustom' }
            ].map(btn => (
              <button
                key={btn.key}
                onClick={() => setTimeFilter(btn.key as TimeFilterType)}
                className={cn(
                  "px-4 py-1.5 text-[10px] font-black rounded-full transition-all tracking-tight uppercase",
                  timeFilter === btn.key 
                    ? "bg-white text-slate-900 shadow-sm" 
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {timeFilter === 'custom' && (
            <div className="flex items-center gap-2 px-2 animate-in slide-in-from-right-4 duration-300">
              <Input
                type="date"
                className="h-8 text-xs font-bold w-32 border-none bg-slate-50"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <span className="text-[10px] font-bold text-slate-400">s/d</span>
              <Input
                type="date"
                className="h-8 text-xs font-bold w-32 border-none bg-slate-50"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {/* EXECUTIVE SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
        {[
          { label: "Net Kerugian Finansial", val: summaryMetrics.financialLoss, sub: "Total Beban Kerugian", icon: <TrendingDown className="w-5 h-5 text-white" />, color: "bg-rose-600", isHero: true },
          { label: "Barang Reject / Rusak", val: summaryMetrics.damagedLoss, sub: "QC & Retur Client", icon: <ShieldAlert className="w-5 h-5 text-rose-500" />, color: "bg-rose-50 border-rose-100" },
          { label: "Selisih Opname (Hilang)", val: summaryMetrics.opnameDeficit, sub: "Write-off Gudang", icon: <AlertTriangle className="w-5 h-5 text-orange-500" />, color: "bg-orange-50 border-orange-100" },
          { label: "Sourcing Kemahalan", val: summaryMetrics.overprice, sub: "Selisih Harga vs Budget", icon: <Coins className="w-5 h-5 text-amber-500" />, color: "bg-amber-50 border-amber-100" },
          { label: "Kompensasi Retur Supplier", val: summaryMetrics.supplierReturn, sub: "Diganti Vendor (Bukan Rugi)", icon: <Store className="w-5 h-5 text-blue-500" />, color: "bg-blue-50 border-blue-100" },
        ].map((card, idx) => (
          <Card key={idx} className={cn(
            "liquid-card border-none shadow-lg shadow-slate-100/50 dark:shadow-none overflow-hidden relative group",
            card.isHero ? "bg-slate-900 text-white scale-[1.02] shadow-xl shadow-rose-950/10" : "bg-white dark:bg-slate-900 border border-slate-100"
          )}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shadow-md", 
                  card.isHero ? "bg-rose-600 text-white" : card.color
                )}>
                  {card.icon}
                </div>
              </div>
              <p className={cn("text-[9px] font-black uppercase tracking-widest mb-1", card.isHero ? "text-rose-400" : "text-slate-400")}>{card.label}</p>
              <h3 className="text-xl font-black tracking-tight">{formatRupiah(card.val)}</h3>
              <p className={cn("text-[9px] font-bold mt-3 uppercase", card.isHero ? "text-slate-400" : "text-slate-500")}>{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ANALYTICS CHARTS LAYER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Trend Chart (Left 2 cols) */}
        <Card className="lg:col-span-2 liquid-card border-none bg-white dark:bg-slate-900 shadow-xl shadow-slate-100/30">
          <CardHeader className="flex flex-row items-center justify-between px-8 pt-8 pb-4">
            <div>
              <CardTitle className="text-lg font-black uppercase text-slate-800 dark:text-white flex items-center gap-2">
                Trend Kerugian Harian <TrendingDown className="w-5 h-5 text-rose-500" />
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Distribusi Kerugian Finansial per Kategori</CardDescription>
            </div>
            
            <div className="flex gap-4">
               <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-slate-500">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Reject / Rusak
               </div>
               <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-slate-500">
                  <div className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Hilang (Opname)
               </div>
               <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-slate-500">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Kemahalan
               </div>
            </div>
          </CardHeader>
          <CardContent className="h-[300px] px-8 pb-8 pt-4">
            {dailyLossChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-300 text-xs font-black uppercase tracking-widest">Tidak ada data untuk grafik</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyLossChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="formattedDate" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 900, fill: '#94A3B8' }} 
                  />
                  <YAxis hide />
                  <ChartTooltip 
                    cursor={{ fill: 'rgba(241,245,249,0.5)' }}
                    formatter={(value: any) => formatRupiah(Number(value))}
                    contentStyle={{ borderRadius: '1.5rem', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.06)' }}
                  />
                  <Bar dataKey="QC_Reject" name="QC Reject/Rusak" stackId="loss" fill="#EF4444" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Opname_Defisit" name="Hilang/Opname" stackId="loss" fill="#F97316" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Overpriced" name="Sourcing Overprice" stackId="loss" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Products Loss (Right 1 col) */}
        <Card className="liquid-card border-none bg-white dark:bg-slate-900 shadow-xl shadow-slate-100/30 flex flex-col">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="text-lg font-black uppercase text-slate-800 dark:text-white">
              Bahan Paling Rugi
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase tracking-wider text-slate-400">10 Bahan Baku Penyumbang Rugi Terbanyak</CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-2 flex-1 overflow-y-auto max-h-[300px] scrollbar-thin">
            <div className="space-y-4">
              {topProductsLoss.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100/80 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[9px] font-black">{idx + 1}</span>
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-800 dark:text-slate-200 max-w-[120px] truncate">{item.name}</span>
                      <span className="text-[8px] text-slate-400 font-mono">{item.sku}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-rose-600">{formatRupiah(item.lossAmount)}</span>
                    <p className="text-[8px] text-slate-400 font-bold uppercase">{item.eventsCount} kejadian</p>
                  </div>
                </div>
              ))}
              {topProductsLoss.length === 0 && (
                <p className="text-xs text-slate-400 italic text-center py-10">Belum ada data kerugian barang</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CORE ANALYSIS TABS */}
      <Tabs defaultValue="losses" className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-2xl mb-6">
          <TabsTrigger value="losses" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-500" /> Detail Kejadian Rugi
          </TabsTrigger>
          <TabsTrigger value="ledger" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-emerald-500" /> Ledger In/Out Harian
          </TabsTrigger>
          <TabsTrigger value="overpricing" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber-500" /> Analisa Vendor Overprice
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: DETAILED LOSS EVENTS LOG */}
        <TabsContent value="losses">
          <Card className="bg-white dark:bg-slate-900 border-none shadow-xl rounded-[2.5rem] overflow-hidden">
            <CardHeader className="p-8 pb-4 border-b border-slate-50">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-black uppercase text-slate-900 dark:text-white">Buku Jurnal Rincian Kerugian</CardTitle>
                  <CardDescription className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Rincian kejadian barang rusak, hilang, dan kemahalan</CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Category Filter */}
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="text-[9px] font-black text-slate-400 uppercase pl-3 pr-2 border-r flex items-center gap-1">
                      <Filter className="w-3 h-3" /> Jenis
                    </span>
                    <Select value={lossCategoryFilter} onValueChange={setLossCategoryFilter}>
                      <SelectTrigger className="w-[140px] h-8 border-none bg-transparent focus:ring-0 font-bold text-xs ring-0">
                        <SelectValue placeholder="Semua Kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="font-bold text-xs">Semua Jenis</SelectItem>
                        <SelectItem value="damaged" className="font-bold text-xs text-rose-600">QC / Client Rusak</SelectItem>
                        <SelectItem value="lost" className="font-bold text-xs text-orange-600">Selisih Opname</SelectItem>
                        <SelectItem value="overprice" className="font-bold text-xs text-amber-600">Sourcing Kemahalan</SelectItem>
                        <SelectItem value="vendor_return" className="font-bold text-xs text-blue-600">Kompensasi Retur</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Search bar */}
                  <div className="relative w-64">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input 
                      placeholder="Cari SKU atau nama barang..."
                      className="pl-10 h-10 rounded-2xl bg-slate-50 border-none font-bold text-xs"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow className="border-none">
                      <TableHead className="px-8 py-5 text-[9px] font-black uppercase text-slate-400 tracking-widest">Tanggal</TableHead>
                      <TableHead className="px-8 py-5 text-[9px] font-black uppercase text-slate-400 tracking-widest">Bahan Baku / SKU</TableHead>
                      <TableHead className="px-8 py-5 text-[9px] font-black uppercase text-slate-400 tracking-widest">Kategori Jurnal</TableHead>
                      <TableHead className="px-8 py-5 text-[9px] font-black uppercase text-slate-400 tracking-widest text-right">Qty</TableHead>
                      <TableHead className="px-8 py-5 text-[9px] font-black uppercase text-slate-400 tracking-widest text-right">Unit Price</TableHead>
                      <TableHead className="px-8 py-5 text-[9px] font-black uppercase text-slate-400 tracking-widest text-right">Rugi (Rp)</TableHead>
                      <TableHead className="px-8 py-5 text-[9px] font-black uppercase text-slate-400 tracking-widest">Alasan / Note</TableHead>
                      <TableHead className="px-8 py-5 text-[9px] font-black uppercase text-slate-400 tracking-widest text-center">PIC</TableHead>
                      <TableHead className="px-8 py-5 text-[9px] font-black uppercase text-slate-400 tracking-widest text-center">Ref</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLossEvents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-64 text-center">
                          <div className="flex flex-col items-center gap-3 opacity-20">
                            <ShieldAlert className="w-12 h-12" />
                            <p className="text-sm font-black uppercase tracking-widest">Tidak ada data rincian kerugian</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLossEvents.map((item) => (
                        <TableRow key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <TableCell className="px-8 py-4 font-mono text-[10px] text-slate-400 whitespace-nowrap">
                            {format(parseISO(item.date), 'dd/MM/yy HH:mm')}
                          </TableCell>
                          <TableCell className="px-8 py-4">
                            <p className="font-extrabold text-xs text-slate-900">{item.productName}</p>
                            <p className="font-mono text-[9px] text-slate-400 mt-0.5">{item.skuCode}</p>
                          </TableCell>
                          <TableCell className="px-8 py-4">
                            <Badge className={cn(
                              "text-[8px] font-black uppercase tracking-wider border-none rounded-full px-2.5 py-0.5",
                              item.category === 'QC Damage' ? "bg-rose-50 text-rose-700" :
                              item.category === 'Return Reject' ? "bg-rose-100 text-rose-800" :
                              item.category === 'Opname Deficit' ? "bg-orange-50 text-orange-700" :
                              item.category === 'Overprice' ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
                            )}>
                              {item.categoryLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-8 py-4 text-right font-bold text-xs text-slate-800 whitespace-nowrap">
                            {item.qty} {item.uom}
                          </TableCell>
                          <TableCell className="px-8 py-4 text-right font-bold text-xs text-slate-500 whitespace-nowrap">
                            {formatRupiah(item.unitPrice)}
                          </TableCell>
                          <TableCell className="px-8 py-4 text-right font-black text-xs text-slate-900 whitespace-nowrap">
                            <span className={item.isFinancialLoss ? "text-rose-600" : "text-blue-600"}>
                              {item.isFinancialLoss ? "-" : ""}{formatRupiah(item.lossAmount)}
                            </span>
                          </TableCell>
                          <TableCell className="px-8 py-4 text-xs font-semibold text-slate-500 max-w-[200px] truncate" title={item.reason}>
                            {item.reason.replace(/^(Disposal|Retur Supplier|Peralihan B2C): /, '')}
                          </TableCell>
                          <TableCell className="px-8 py-4 text-center whitespace-nowrap">
                            <span className="text-[9px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                              {item.reportedBy}
                            </span>
                          </TableCell>
                          <TableCell className="px-8 py-4 text-center">
                            {item.referenceId ? (
                              <span className="font-mono text-[9px] text-slate-400">
                                #{item.referenceId.slice(0, 6).toUpperCase()}
                              </span>
                            ) : "-"}
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

        {/* TAB 2: DAILY STOCK IN/OUT LEDGER PER PRODUCT */}
        <TabsContent value="ledger">
          <Card className="bg-white dark:bg-slate-900 border-none shadow-xl rounded-[2.5rem] overflow-hidden">
            <CardHeader className="p-8 pb-4 border-b border-slate-50">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-black uppercase text-slate-900 dark:text-white">Buku Ledger Mutasi Harian</CardTitle>
                  <CardDescription className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Summary total jumlah barang Masuk vs Keluar per hari per produk</CardDescription>
                </div>
                
                <div className="relative w-64">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input 
                    placeholder="Cari nama produk atau SKU..."
                    className="pl-10 h-10 rounded-2xl bg-slate-50 border-none font-bold text-xs"
                    value={ledgerProductSearch}
                    onChange={(e) => setLedgerProductSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow className="border-none">
                      <TableHead className="px-8 py-5 text-[9px] font-black uppercase text-slate-400 tracking-widest">Tanggal</TableHead>
                      <TableHead className="px-8 py-5 text-[9px] font-black uppercase text-slate-400 tracking-widest">Nama Barang / SKU</TableHead>
                      <TableHead className="px-8 py-5 text-[9px] font-black uppercase text-slate-400 tracking-widest text-right">Inbound (+)</TableHead>
                      <TableHead className="px-8 py-5 text-[9px] font-black uppercase text-slate-400 tracking-widest text-right">Outbound (-)</TableHead>
                      <TableHead className="px-8 py-5 text-[9px] font-black uppercase text-slate-400 tracking-widest text-right">Net Movement</TableHead>
                      <TableHead className="px-8 py-5 text-[9px] font-black uppercase text-slate-400 tracking-widest text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyProductMovements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-64 text-center">
                          <div className="flex flex-col items-center gap-3 opacity-20">
                            <ArrowRightLeft className="w-12 h-12" />
                            <p className="text-sm font-black uppercase tracking-widest">Tidak ada riwayat mutasi stok harian</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      dailyProductMovements.map((item) => (
                        <TableRow key={item.key} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <TableCell className="px-8 py-4 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                            {format(parseISO(item.date), 'dd MMMM yyyy', { locale: localeId })}
                          </TableCell>
                          <TableCell className="px-8 py-4">
                            <p className="font-extrabold text-xs text-slate-800">{item.productName}</p>
                            <p className="font-mono text-[9px] text-slate-400 mt-0.5">{item.skuCode}</p>
                          </TableCell>
                          <TableCell className="px-8 py-4 text-right font-black text-xs text-emerald-600 whitespace-nowrap">
                            {item.qtyIn > 0 ? `+${item.qtyIn}` : "0"} {item.uom}
                          </TableCell>
                          <TableCell className="px-8 py-4 text-right font-black text-xs text-rose-600 whitespace-nowrap">
                            {item.qtyOut > 0 ? `-${item.qtyOut}` : "0"} {item.uom}
                          </TableCell>
                          <TableCell className="px-8 py-4 text-right font-black text-xs text-slate-800 whitespace-nowrap">
                            <span className={cn(
                              item.netMovement > 0 ? "text-emerald-600" : item.netMovement < 0 ? "text-rose-600" : "text-slate-500"
                            )}>
                              {item.netMovement > 0 ? "+" : ""}{item.netMovement} {item.uom}
                            </span>
                          </TableCell>
                          <TableCell className="px-8 py-4">
                            <div className="flex justify-center">
                              {item.netMovement > 0 ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[8px] font-black uppercase rounded-full">Surplus</Badge>
                              ) : item.netMovement < 0 ? (
                                <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[8px] font-black uppercase rounded-full">Defisit</Badge>
                              ) : (
                                <Badge variant="outline" className="bg-slate-50 text-slate-400 border-slate-200 text-[8px] font-black uppercase rounded-full">Seimbang</Badge>
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

        {/* TAB 3: OVERPRICING VENDOR ANALYSIS */}
        <TabsContent value="overpricing">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Vendor Overprice Breakdown */}
            <Card className="bg-white dark:bg-slate-900 border-none shadow-xl rounded-[2.5rem]">
              <CardHeader className="p-8">
                <CardTitle className="text-lg font-black uppercase text-slate-800 dark:text-white">Vendor Paling Overprice</CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total kerugian karena harga beli melebihi budget per vendor</CardDescription>
              </CardHeader>
              <CardContent className="p-8 pt-0">
                <div className="space-y-4">
                  {overpricedReport.map((vendor, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center text-xs font-black">{idx + 1}</span>
                        <div>
                          <p className="font-extrabold text-sm text-slate-800">{vendor.vendorName}</p>
                          <p className="text-[8px] text-slate-400 font-bold uppercase">{vendor.itemsCount} produk overprice</p>
                        </div>
                      </div>
                      <span className="text-sm font-black text-rose-600">{formatRupiah(vendor.lossAmount)}</span>
                    </div>
                  ))}
                  {overpricedReport.length === 0 && (
                    <p className="text-xs text-slate-400 italic text-center py-10">Tidak ada data overprice vendor</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Overpricing explanation and best practices */}
            <Card className="bg-gradient-to-br from-slate-900 to-slate-950 text-white border-none shadow-xl rounded-[2.5rem] relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-rose-500/20 transition-all duration-700" />
              <CardHeader className="p-8">
                <CardTitle className="text-lg font-black uppercase text-amber-400">Rekomendasi Kontrol Sourcing</CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Strategi meminimalisir kerugian kemahalan</CardDescription>
              </CardHeader>
              <CardContent className="p-8 pt-0 space-y-6 text-sm text-slate-300 leading-relaxed font-semibold">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-lg shrink-0">🎯</div>
                  <p>Adopsi **Batas Toleransi Deviasi Harga** di shopping list. Beri flag otomatis jika penawaran sourcing &gt; 10% dari harga acuan sebelum CFO/Finance melakukan approval transfer budget.</p>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-lg shrink-0">🤝</div>
                  <p>Prioritaskan pembelian dengan kontrak harga periodik (Vendor Price List) dibanding spot-market/pembelian dadakan di pasar untuk produk komoditas volatile.</p>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-lg shrink-0">🛡️</div>
                  <p>Lakukan **Audit Harian oleh Finance** terhadap settlement sourcing untuk mencocokkan nota pasar fisik dengan budget awal.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

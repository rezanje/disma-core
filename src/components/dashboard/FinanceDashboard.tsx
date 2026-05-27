"use client"

import React, { useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah, getWeekRange } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { 
  Wallet, CreditCard, Clock, FileText, ArrowUpRight, 
  ArrowDownLeft, ArrowRight, Plus, Receipt, Banknote, 
  TrendingUp, TrendingDown, Target, History, Users,
  CheckCircle2, AlertTriangle, Award, Calendar, Coins
} from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell 
} from 'recharts'
import { cn } from "@/lib/utils"
import { differenceInDays, parseISO, format } from "date-fns"
import { id as localeId } from "date-fns/locale"

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.717-1.458L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.725 1.451 5.437.002 9.861-4.417 9.864-9.858.002-2.637-1.019-5.114-2.877-6.974-1.858-1.86-4.339-2.883-6.98-2.885-5.441 0-9.866 4.418-9.869 9.86-.001 1.77.46 3.497 1.334 5.013l-1.007 3.676 3.774-.988zm11.23-5.32c-.3-.15-1.771-.875-2.04-.972-.269-.099-.465-.148-.659.15-.195.297-.752.972-.924 1.17-.172.197-.344.223-.644.073-.3-.15-1.27-.469-2.42-1.493-.897-.8-1.502-1.79-1.678-2.09-.176-.3-.019-.462.13-.61.135-.133.3-.349.45-.523.15-.174.2-.298.3-.497.1-.198.05-.374-.025-.524-.075-.15-.659-1.587-.902-2.172-.237-.574-.479-.496-.659-.506-.17-.008-.364-.01-.559-.01-.195 0-.514.073-.78.368-.266.297-1.016.993-1.016 2.422s1.03 2.808 1.174 3.006c.145.198 2.028 3.097 4.912 4.34.686.295 1.222.472 1.64.606.69.22 1.318.19 1.815.115.553-.083 1.771-.724 2.022-1.422.25-.697.25-1.294.175-1.42-.075-.127-.27-.2-.57-.35z"/>
  </svg>
);

const formatInvoiceId = (id: string) => {
  if (!id) return ""
  if (id.startsWith("inv-import-")) {
    return `INV-#IMP-${id.replace("inv-import-", "").toUpperCase()}`
  }
  if (id.startsWith("inv-")) {
    return `INV-#${id.replace("inv-", "").substring(0, 6).toUpperCase()}`
  }
  return `INV-#${id.substring(0, 6).toUpperCase()}`
}

export default function FinanceDashboard() {
  const { invoices = [], salesOrders = [], salesOrderItems = [], journalLines = [], journalEntries = [], coas = [], clients = [], vendorBills = [] } = useAppStore()
  
  // 1. FINANCIAL CALCULATIONS
  const getBalance = (prefix: string) => {
    const accIds = coas.filter(a => a.accountCode.startsWith(prefix)).map(a => a.id)
    return journalLines
      .filter(jl => accIds.includes(jl.accountId))
      .reduce((sum, jl) => {
        if (prefix.startsWith('1') || prefix.startsWith('5') || prefix.startsWith('6')) return sum + (jl.debitAmount - jl.creditAmount)
        return sum + (jl.creditAmount - jl.debitAmount)
      }, 0)
  }

  const totalAP = getBalance('2-1000') || 0
  const totalAR = getBalance('1-2000') || 0
  
  const revenueThisMonth = getBalance('4')
  const expensesThisMonth = getBalance('5') + getBalance('6')
  const netProfit = revenueThisMonth - expensesThisMonth

  // 2. CHART DATA (REVENUE VS PROFIT TREND) — real aggregation per month for 2026
  // Jan-Apr revenue from imported invoices (no GL). May revenue & profit from journal lines.
  const trendData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei']
    const agg: Record<string, { revenue: number; profit: number }> = Object.fromEntries(
      months.map(m => [m, { revenue: 0, profit: 0 }])
    )

    // Skip superseded & consolidated children
    const consolidatedSOIds = new Set(
      invoices
        .filter((inv: any) => inv.isConsolidated && inv.salesOrderIds?.length > 0)
        .flatMap((inv: any) => inv.salesOrderIds)
    )

    // Jan-Apr revenue from invoices (issueDate-based, exclude May to avoid double with GL)
    invoices.forEach((inv: any) => {
      if (!inv.issueDate) return
      if (inv.supersededByInvoiceId) return
      if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !inv.isConsolidated) return
      const d = parseISO(inv.issueDate)
      if (d.getFullYear() !== 2026) return
      const mKey = format(d, 'MMM', { locale: localeId })
      if (mKey === 'Mei') return
      if (agg[mKey] !== undefined) {
        agg[mKey].revenue += inv.totalAmount || 0
      }
    })

    // May from journal lines (real GL)
    journalLines.forEach(jl => {
      const entry = journalEntries.find(je => je.id === jl.journalEntryId)
      if (!entry) return
      const dateStr = entry.transactionDate
      if (!dateStr) return
      const d = parseISO(dateStr)
      if (d.getFullYear() !== 2026) return
      const mKey = format(d, 'MMM', { locale: localeId })
      if (agg[mKey] === undefined) return
      const coa = coas.find(c => c.id === jl.accountId)
      if (!coa) return
      if (coa.accountCode.startsWith('4')) {
        const revVal = jl.creditAmount - jl.debitAmount
        agg[mKey].revenue += revVal
        agg[mKey].profit += revVal
      } else if (coa.accountCode.startsWith('5') || coa.accountCode.startsWith('6')) {
        const expVal = jl.debitAmount - jl.creditAmount
        agg[mKey].profit -= expVal
      }
    })

    // Estimate Jan-Apr profit using May margin (only when May has real data)
    const mayMargin = agg['Mei'].revenue > 0 ? agg['Mei'].profit / agg['Mei'].revenue : 0
    months.forEach(m => {
      if (m !== 'Mei' && agg[m].profit === 0 && agg[m].revenue > 0) {
        agg[m].profit = agg[m].revenue * mayMargin
      }
    })

    return months.map(name => ({ name, revenue: agg[name].revenue, profit: agg[name].profit }))
  }, [invoices, journalLines, journalEntries, coas])

  // 3. COLLECTION HEALTH SUMMARY
  const collectionStats = useMemo(() => {
    const now = new Date()
    const health = { good: 0, late: 0, overdue: 0 }
    
    clients.forEach(client => {
      const clientInvoices = invoices.filter(inv => inv.clientId === client.id && inv.status !== 'Paid')
      if (clientInvoices.length === 0) {
        health.good++
        return
      }
      
      const isOverdue = clientInvoices.some(inv => new Date(inv.dueDate) < now)
      const isLate = clientInvoices.some(inv => {
        const days = (now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)
        return days > 0 && days <= 30
      })

      if (isOverdue) health.overdue++
      else if (isLate) health.late++
      else health.good++
    })
    
    return health
  }, [invoices, clients])

  // 1. TOP CLIENTS BY REVENUE (Jan-May Historical + Active Invoices)
  const topClientsRevenue = useMemo(() => {
    return clients.map(client => {
      const totalJanMay = client.totalOrderJanMay || 0
      const clientInvoices = invoices.filter(inv => inv.clientId === client.id)
      const consolidatedSOIds = new Set(
        clientInvoices
          .filter((inv: any) => inv.isConsolidated && inv.salesOrderIds?.length > 0)
          .flatMap((inv: any) => inv.salesOrderIds)
      )
      const activeInvoices = clientInvoices.filter((inv: any) => {
        if (inv.supersededByInvoiceId) return false
        if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !inv.isConsolidated) return false
        return true
      })
      const activeNonImported = totalJanMay > 0
        ? activeInvoices.filter(inv => !inv.id.startsWith('inv-import-'))
        : activeInvoices
      const revenue = totalJanMay + activeNonImported.reduce((sum, inv) => sum + inv.totalAmount, 0)
      return {
        ...client,
        revenue,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
  }, [clients, invoices])

  // 2. TOP CLIENTS BY OUTSTANDING AR (Active Unpaid Receivables)
  const topClientsAR = useMemo(() => {
    const today = new Date()
    return clients.map(client => {
      const clientInvoices = invoices.filter(inv => inv.clientId === client.id)
      const consolidatedSOIds = new Set(
        clientInvoices
          .filter((inv: any) => inv.isConsolidated && inv.salesOrderIds?.length > 0)
          .flatMap((inv: any) => inv.salesOrderIds)
      )
      const activeInvoices = clientInvoices.filter((inv: any) => {
        if (inv.supersededByInvoiceId) return false
        if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !inv.isConsolidated) return false
        return true
      })
      const unpaidInvoices = activeInvoices.filter(inv => inv.status !== 'Paid')
      const outstanding = unpaidInvoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0)
      
      const hasOverdue = unpaidInvoices.some(inv => new Date(inv.dueDate) < today)
      const hasLate = unpaidInvoices.some(inv => {
        const days = (today.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)
        return days > 0 && days <= 30
      })
      
      let status = 'Good'
      if (hasOverdue) status = 'Overdue'
      else if (hasLate) status = 'Late'

      return {
        ...client,
        outstanding,
        unpaidCount: unpaidInvoices.length,
        status
      }
    })
    .filter(c => c.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 5)
  }, [clients, invoices])

  // 3. PRIORITAS PENAGIHAN KLIEN (Unpaid Invoices sorted by maturity)
  const collectionPriorities = useMemo(() => {
    const today = new Date()
    const list = invoices
      .filter(inv => inv.status !== 'Paid' && !(inv as any).supersededByInvoiceId)
      .map(inv => {
        const client = clients.find(c => c.id === inv.clientId)
        const clientInvoices = invoices.filter(i => i.clientId === inv.clientId)
        const consolidatedSOIds = new Set(
          clientInvoices
             .filter((i: any) => i.isConsolidated && i.salesOrderIds?.length > 0)
             .flatMap((i: any) => i.salesOrderIds)
        )
        if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !(inv as any).isConsolidated) return null

        const outstanding = inv.totalAmount - inv.amountPaid
        if (outstanding <= 0) return null

        const daysOverdue = differenceInDays(today, parseISO(inv.dueDate))
        return {
          invoice: inv,
          clientName: client?.companyName || 'Unknown Client',
          outstanding,
          daysOverdue,
        }
      })
      .filter(Boolean) as { invoice: any; clientName: string; outstanding: number; daysOverdue: number }[]

    return list.sort((a, b) => b.daysOverdue - a.daysOverdue)
  }, [invoices, clients])

  // 4. JATUH TEMPO PEMBAYARAN VENDOR (Active AP vendor bills by due date)
  const vendorPaymentsPriorities = useMemo(() => {
    const today = new Date()
    return vendorBills
      .filter(b => b.status !== 'Paid')
      .map(b => {
        const outstanding = b.totalAmount - (b.amountPaid || 0)
        const daysOverdue = differenceInDays(today, parseISO(b.dueDate))
        return {
          bill: b,
          outstanding,
          daysOverdue,
        }
      })
      .filter(b => b.outstanding > 0)
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
  }, [vendorBills])

  return (
    <div className="space-y-8 pb-12">
      {/* PRIMARY ACTIONS - HIGH VISIBILITY */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Link href="/finance/collections" className="md:col-span-1">
          <Card className="bg-indigo-600 text-white border-none shadow-2xl shadow-indigo-200 hover:-translate-y-1 transition-all cursor-pointer h-full group overflow-hidden relative">
            <div className="absolute -right-4 -top-4 opacity-10 group-hover:scale-125 transition-transform duration-500">
               <History className="w-32 h-32" />
            </div>
            <CardContent className="p-6">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-4">
                <Target className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight">Daily Chase</h3>
              <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-widest mt-1">Tagih Piutang Klien</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/finance/invoices" className="md:col-span-1">
          <Card className="bg-emerald-600 text-white border-none shadow-2xl shadow-emerald-200 hover:-translate-y-1 transition-all cursor-pointer h-full group overflow-hidden relative">
            <CardContent className="p-6">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-4">
                <Plus className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight">Dana Masuk</h3>
              <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mt-1">Pelunasan & Faktur Baru</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/finance/cash-bank" className="md:col-span-1">
          <Card className="bg-rose-600 text-white border-none shadow-2xl shadow-rose-200 hover:-translate-y-1 transition-all cursor-pointer h-full group overflow-hidden relative">
            <CardContent className="p-6">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-4">
                <Receipt className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight">Catat Biaya</h3>
              <p className="text-[10px] font-bold text-rose-100 uppercase tracking-widest mt-1">OpEx & Belanja Tim</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/finance/reports" className="md:col-span-1">
          <Card className="bg-slate-900 text-white border-none shadow-2xl shadow-slate-200 hover:-translate-y-1 transition-all cursor-pointer h-full group overflow-hidden relative">
            <CardContent className="p-6">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-4">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight">Audit Laporan</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Cek Laba Rugi Realtime</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* MAIN CHART SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 liquid-card border-none shadow-xl bg-white">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-black text-slate-800 uppercase tracking-tight">Performance Trend</CardTitle>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Revenue vs Net Profit (Last 5 Months)</p>
            </div>
            <div className="flex items-center gap-3">
               <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[8px] font-black uppercase text-slate-500">Revenue</span>
               </div>
               <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span className="text-[8px] font-black uppercase text-slate-500">Net Profit</span>
               </div>
            </div>
          </CardHeader>
          <CardContent className="h-[300px] pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} dy={10} />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontWeight: 900}}
                  formatter={(value: any) => formatRupiah(value)}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                <Area type="monotone" dataKey="profit" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorProf)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="liquid-card border-none shadow-xl">
           <CardHeader>
              <CardTitle className="text-lg font-black text-slate-800 uppercase tracking-tight">Collection Health</CardTitle>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kondisi Piutang Client</p>
           </CardHeader>
           <CardContent className="space-y-6 pt-4">
              <div className="flex flex-col gap-4">
                 <div className="flex items-center justify-between p-4 rounded-2xl bg-emerald-50 border border-emerald-100 group hover:scale-[1.02] transition-all">
                    <div className="flex items-center gap-3">
                       <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                       <span className="text-xs font-black text-slate-700 uppercase">Lancar (Good)</span>
                    </div>
                    <span className="text-xl font-black text-emerald-600">{collectionStats.good}</span>
                 </div>
                 <div className="flex items-center justify-between p-4 rounded-2xl bg-amber-50 border border-amber-100 group hover:scale-[1.02] transition-all">
                    <div className="flex items-center gap-3">
                       <Clock className="w-5 h-5 text-amber-500" />
                       <span className="text-xs font-black text-slate-700 uppercase">Terlambat (Late)</span>
                    </div>
                    <span className="text-xl font-black text-amber-600">{collectionStats.late}</span>
                 </div>
                 <div className="flex items-center justify-between p-4 rounded-2xl bg-rose-50 border border-rose-100 group hover:scale-[1.02] transition-all">
                    <div className="flex items-center gap-3">
                       <AlertTriangle className="w-5 h-5 text-rose-500" />
                       <span className="text-xs font-black text-slate-700 uppercase">Macet (Overdue)</span>
                    </div>
                    <span className="text-xl font-black text-rose-600">{collectionStats.overdue}</span>
                 </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Total outstanding AR</p>
                 <div className="flex items-end gap-2">
                    <h3 className="text-2xl font-black text-rose-600">{formatRupiah(totalAR)}</h3>
                    <TrendingDown className="w-5 h-5 text-rose-400 mb-1" />
                 </div>
              </div>
           </CardContent>
        </Card>
      </div>

      {/* SECONDARY METRICS */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="liquid-card border-none bg-indigo-50/50">
          <CardContent className="p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2">Net Profit (Mei)</p>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-indigo-700">{formatRupiah(netProfit)}</h3>
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                 <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="liquid-card border-none bg-rose-50/50">
          <CardContent className="p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-400 mb-2">Accounts Payable</p>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-rose-700">{formatRupiah(totalAP)}</h3>
              <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-600">
                 <Banknote className="w-4 h-4" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="liquid-card border-none bg-emerald-50/50">
          <CardContent className="p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-2">Total Assets</p>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-emerald-700">{formatRupiah(getBalance('1'))}</h3>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                 <Wallet className="w-4 h-4" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="liquid-card border-none bg-slate-900 shadow-2xl">
          <CardContent className="p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Weekly PO Volume</p>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-white">{salesOrders.length} Order</h3>
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
                 <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Client Performance & Receivables Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Clients by Revenue */}
        <Card className="liquid-card border-none shadow-xl bg-white">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
              TOP Clients by Revenue <Award className="w-5 h-5 text-amber-500" />
            </CardTitle>
            <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
              Top 5 Kontribusi Revenue Terbesar (Jan-Mei)
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin">
              {topClientsRevenue.map((c, idx) => (
                <div key={c.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs",
                      idx === 0 ? "bg-amber-500 text-slate-950" :
                      idx === 1 ? "bg-slate-300 text-slate-800" :
                      idx === 2 ? "bg-amber-600 text-white" : "bg-slate-200 text-slate-600"
                    )}>
                      {idx + 1}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-slate-800">{c.companyName}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">PIC: {c.picName}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-emerald-600">{formatRupiah(c.revenue)}</p>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">LIFETIME REVENUE</span>
                  </div>
                </div>
              ))}
              {topClientsRevenue.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-8">Belum ada data klien.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Clients by Outstanding AR */}
        <Card className="liquid-card border-none shadow-xl bg-white">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
              TOP Outstanding Klien <Coins className="w-5 h-5 text-rose-500" />
            </CardTitle>
            <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
              Top 5 Piutang Klien Terbanyak
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin">
              {topClientsAR.map((c, idx) => (
                <div key={c.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center font-black text-xs">
                      {idx + 1}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-slate-800">{c.companyName}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">{c.unpaidCount} invoice unpaid</span>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="text-sm font-black text-rose-600">{formatRupiah(c.outstanding)}</p>
                    <Badge variant="outline" className={cn(
                      "text-[9px] font-black uppercase rounded-full px-2 py-0.5 border",
                      c.status === 'Overdue' ? "bg-rose-50 text-rose-700 border-rose-200" :
                      c.status === 'Late' ? "bg-amber-50 text-amber-700 border-amber-200" :
                      "bg-emerald-50 text-emerald-700 border-emerald-200"
                    )}>
                      {c.status}
                    </Badge>
                  </div>
                </div>
              ))}
              {topClientsAR.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-8">Tidak ada piutang klien aktif 🎉</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Immediate Collections & Payments Action Center */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Client Invoice Collection Priority */}
        <Card className="liquid-card border-none shadow-xl bg-white">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
              Prioritas Penagihan Hari Ini <AlertTriangle className="w-5 h-5 text-rose-500" />
            </CardTitle>
            <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
              Outstanding Piutang Terurut dari Terlama
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin">
              {collectionPriorities.map((item) => (
                <div key={item.invoice.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-black text-slate-800 truncate block max-w-[150px]">{item.clientName}</span>
                      <Badge variant="outline" className="font-mono text-[9px] text-slate-400">
                        {formatInvoiceId(item.invoice.id)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] text-slate-400 font-bold">
                        Jatuh Tempo: {format(parseISO(item.invoice.dueDate), 'd MMM yy', { locale: localeId })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right flex flex-col items-end gap-1">
                      <p className="text-sm font-black text-slate-900">{formatRupiah(item.outstanding)}</p>
                      {item.daysOverdue > 0 ? (
                        <Badge className="bg-rose-500 text-white font-black text-[9px] rounded-full border-none">
                          Lewat {item.daysOverdue} Hari (Segera Tagih)
                        </Badge>
                      ) : item.daysOverdue === 0 ? (
                        <Badge className="bg-amber-500 text-slate-950 font-black text-[9px] rounded-full border-none">
                          Jatuh Tempo Hari Ini
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500 text-slate-950 font-black text-[9px] rounded-full border-none">
                          H-{Math.abs(item.daysOverdue)} Hari
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 w-9 rounded-xl p-0 text-emerald-600 hover:text-white hover:bg-emerald-500 border border-emerald-100 hover:border-emerald-500 flex items-center justify-center transition-all shadow-sm"
                      title="Kirim Tagihan via WhatsApp"
                      onClick={(e) => {
                        e.stopPropagation();
                        const client = clients.find(c => c.id === item.invoice.clientId);
                        let phone = client?.phone || '';
                        if (!phone) {
                          const inputPhone = window.prompt(`Nomor WhatsApp untuk ${item.clientName} tidak ditemukan. Silakan masukkan nomor HP/WA (contoh: 08123456789):`);
                          if (!inputPhone) return;
                          phone = inputPhone;
                        }
                        const so = salesOrders.find(s => s.id === item.invoice.salesOrderId);
                        const docInfo = so?.poNumber ? `Invoice ${formatInvoiceId(item.invoice.id)} (PO: ${so.poNumber})` : `Invoice ${formatInvoiceId(item.invoice.id)}`;
                        const formattedOutstanding = formatRupiah(item.outstanding);
                        const dueDateFormatted = format(parseISO(item.invoice.dueDate), 'd MMMM yyyy', { locale: localeId });
                        const message = `Halo Kak/Bapak/Ibu di *${item.clientName}*,\n\nKami dari *Disma Fresh* ingin menginformasikan tagihan untuk *${docInfo}* sebesar *${formattedOutstanding}* yang jatuh tempo pada *${dueDateFormatted}*.\n\nMohon kesediaannya untuk melakukan pembayaran. Jika pembayaran telah dilakukan, mohon kirimkan bukti transfernya ya Kak. Terima kasih banyak! 🙏😊`;
                        
                        let formattedPhone = phone.replace(/[^0-9]/g, '');
                        if (formattedPhone.startsWith('0')) {
                          formattedPhone = '62' + formattedPhone.slice(1);
                        }
                        window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');
                      }}
                    >
                      <WhatsAppIcon className="w-4 h-4 fill-current" />
                    </Button>
                  </div>
                </div>
              ))}
              {collectionPriorities.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-8">Tidak ada piutang jatuh tempo 🎉</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Vendor Payments Priority */}
        <Card className="liquid-card border-none shadow-xl bg-white">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
              Jatuh Tempo Pembayaran Vendor <Clock className="w-5 h-5 text-indigo-500" />
            </CardTitle>
            <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
              Hutang Vendor Terurut dari Terlama
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin">
              {vendorPaymentsPriorities.map((item) => (
                <div key={item.bill.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-black text-slate-800 truncate block max-w-[150px]">{item.bill.vendorName}</span>
                      <Badge variant="outline" className="font-mono text-[9px] text-slate-400">
                        {item.bill.billNumber}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] text-slate-400 font-bold">
                        Jatuh Tempo: {format(parseISO(item.bill.dueDate), 'd MMM yy', { locale: localeId })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="text-sm font-black text-slate-900">{formatRupiah(item.outstanding)}</p>
                    {item.daysOverdue > 0 ? (
                      <Badge className="bg-rose-500 text-white font-black text-[9px] rounded-full border-none">
                        Lewat {item.daysOverdue} Hari (Bayar Segera)
                      </Badge>
                    ) : item.daysOverdue === 0 ? (
                      <Badge className="bg-amber-500 text-slate-950 font-black text-[9px] rounded-full border-none">
                        Bayar Hari Ini
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-500 text-slate-950 font-black text-[9px] rounded-full border-none">
                        H-{Math.abs(item.daysOverdue)} Hari
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
              {vendorPaymentsPriorities.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-8">Tidak ada hutang vendor aktif 🎉</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* RECENT INVOICES MINI LIST */}
         <Card className="liquid-card border-none shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between">
               <CardTitle className="text-sm font-black uppercase text-slate-800 tracking-tight">Recent Invoices</CardTitle>
               <Link href="/finance/invoices">
                  <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase text-indigo-600 hover:bg-indigo-50">View All</Button>
               </Link>
            </CardHeader>
            <CardContent>
               <div className="space-y-1">
                  {invoices.slice(0, 5).map(inv => {
                    const client = clients.find(c => c.id === inv.clientId)
                    return (
                      <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors">
                         <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              inv.status === 'Paid' ? "bg-emerald-500" : "bg-rose-500"
                            )} />
                            <div className="flex flex-col">
                               <span className="text-[10px] font-black text-slate-800">{client?.companyName || 'Unknown'}</span>
                               <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{formatInvoiceId(inv.id)}</span>
                            </div>
                         </div>
                         <div className="text-right">
                            <p className="text-[11px] font-black text-slate-900">{formatRupiah(inv.totalAmount)}</p>
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{inv.status}</span>
                         </div>
                      </div>
                    )
                  })}
               </div>
            </CardContent>
         </Card>

         {/* OPEX BREAKDOWN MINI LIST */}
         <Card className="liquid-card border-none shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between">
               <CardTitle className="text-sm font-black uppercase text-slate-800 tracking-tight">OpEx Breakdown</CardTitle>
               <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100">Warning Limits</span>
            </CardHeader>
            <CardContent>
               <div className="space-y-3">
                  {coas.filter(c => c.accountCode.startsWith('6-')).slice(0, 4).map(c => {
                    const balance = getBalance(c.accountCode)
                    const percent = Math.min(100, (balance / 10000000) * 100) // Mock limit of 10M
                    return (
                      <div key={c.id} className="space-y-1.5">
                         <div className="flex justify-between items-center text-[10px]">
                            <span className="font-black text-slate-600 uppercase">{c.accountName}</span>
                            <span className="font-black text-slate-900">{formatRupiah(balance)}</span>
                         </div>
                         <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div 
                               className={cn(
                                 "h-full rounded-full transition-all duration-1000",
                                 percent > 80 ? "bg-rose-500" : percent > 50 ? "bg-amber-500" : "bg-emerald-500"
                               )} 
                               style={{ width: `${percent}%` }} 
                            />
                         </div>
                      </div>
                    )
                  })}
               </div>
            </CardContent>
         </Card>
      </div>
    </div>
  )
}

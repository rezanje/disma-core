"use client"

import React, { useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah, getWeekRange } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  Wallet, CreditCard, Clock, FileText, ArrowUpRight, 
  ArrowDownLeft, ArrowRight, Plus, Receipt, Banknote, 
  TrendingUp, TrendingDown, Target, History, Users,
  CheckCircle2, AlertTriangle
} from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell 
} from 'recharts'
import { cn } from "@/lib/utils"

export default function FinanceDashboard() {
  const { invoices, salesOrders, salesOrderItems, journalLines, coas, clients } = useAppStore()
  
  // 1. FINANCIAL CALCULATIONS
  const getBalance = (prefix: string) => {
    const accIds = coas.filter(a => a.accountCode.startsWith(prefix)).map(a => a.id)
    return journalLines
      .filter(jl => accIds.includes(jl.accountId))
      .reduce((sum, jl) => {
        if (prefix === '1' || prefix === '5' || prefix === '6') return sum + (jl.debitAmount - jl.creditAmount)
        return sum + (jl.creditAmount - jl.debitAmount)
      }, 0)
  }

  const totalAP = getBalance('2-1000') || 0
  const totalAR = getBalance('1-2000') || 0
  
  const revenueThisMonth = getBalance('4')
  const expensesThisMonth = getBalance('5') + getBalance('6')
  const netProfit = revenueThisMonth - expensesThisMonth

  // 2. CHART DATA (REVENUE VS PROFIT TREND)
  // Mocking trend data based on current balances for visualization
  const trendData = [
    { name: 'Jan', revenue: revenueThisMonth * 0.8, profit: netProfit * 0.8 },
    { name: 'Feb', revenue: revenueThisMonth * 0.9, profit: netProfit * 0.85 },
    { name: 'Mar', revenue: revenueThisMonth * 0.85, profit: netProfit * 0.75 },
    { name: 'Apr', revenue: revenueThisMonth * 1.1, profit: netProfit * 1.05 },
    { name: 'Mei', revenue: revenueThisMonth, profit: netProfit },
  ]

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
                               <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">INV-#{inv.id.substring(0,6)}</span>
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

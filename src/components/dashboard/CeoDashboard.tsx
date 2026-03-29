"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { 
  TrendingUp, 
  Users, 
  Target,
  Wallet,
  Building,
  DollarSign,
  Scale,
  Megaphone,
  Shield,
  ArrowRight,
  Package,
  ShoppingCart,
  Activity,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

export default function CeoDashboard() {
  const salesOrders = useAppStore(state => state.salesOrders)
  const clients = useAppStore(state => state.clients)
  const journalLines = useAppStore(state => state.journalLines)
  const coas = useAppStore(state => state.coas)
  const expenses = useAppStore(state => state.expenses)
  const purchases = useAppStore(state => state.purchases)
  const leads = useAppStore(state => state.leads) || []

  const getBalance = (prefix: string) => {
    const accIds = coas.filter(a => a.accountCode.startsWith(prefix)).map(a => a.id)
    return journalLines
      .filter(jl => accIds.includes(jl.accountId))
      .reduce((sum, jl) => {
        // Assets(1) & Expenses(5,6) normally have debit balances
        if (prefix === '1' || prefix === '5' || prefix === '6') return sum + (jl.debitAmount - jl.creditAmount)
        // Liabilities(2), Equity(3) & Revenue(4) normally have credit balances
        return sum + (jl.creditAmount - jl.debitAmount)
      }, 0)
  }

  // Macro Metrics
  const totalAssets = getBalance('1')
  const totalLiabilities = getBalance('2')
  const totalEquity = getBalance('3')
  const revenue = getBalance('4')
  const totalExpenses = getBalance('5') + getBalance('6')
  const netProfit = revenue - totalExpenses
  const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0

  // Operational Health Radar
  const incomingCount = salesOrders.filter(so => ['Baru', 'Pending'].includes(so.status)).length
  const procurementCount = purchases.filter(p => ['Draft', 'Pending Approval', 'Ordered'].includes(p.status)).length
  const warehouseCount = salesOrders.filter(so => ['Dalam Produksi', 'Siap Dikirim', 'Packing'].includes(so.status)).length
  const completedCount = salesOrders.filter(so => so.status === 'Terkirim').length

  // Announcement System
  const updateAnnouncement = useAppStore(state => state.updateAnnouncement)
  const currentAnnouncement = useAppStore(state => state.announcement)
  const [announcementMsg, setAnnouncementMsg] = useState(currentAnnouncement?.message || "")

  const handleBroadcast = () => {
    if (!announcementMsg.trim()) {
      updateAnnouncement(null)
      toast.success("Broadcast stopped.")
      return
    }
    updateAnnouncement({ 
      message: announcementMsg, 
      active: true, 
      timestamp: new Date().toISOString() 
    })
    toast.success("Message broadcasted to all employees!")
  }

  // Visualization Data
  const cockpitData = [
    { name: 'W1', revenue: revenue * 0.15, profit: netProfit * 0.12 },
    { name: 'W2', revenue: revenue * 0.28, profit: netProfit * 0.22 },
    { name: 'W3', revenue: revenue * 0.22, profit: netProfit * 0.18 },
    { name: 'W4', revenue: revenue * 0.35, profit: netProfit * 0.28 },
  ]

  const opexCategories = [
    { name: 'Salaries', value: getBalance('6-1000'), color: '#10B981' },
    { name: 'Rent', value: getBalance('6-1100'), color: '#3B82F6' },
    { name: 'Logistics', value: getBalance('6-1400'), color: '#F59E0B' },
    { name: 'Others', value: totalExpenses - (getBalance('6-1000') + getBalance('6-1100') + getBalance('6-1400')), color: '#6366F1' },
  ]

  return (
    <div className="space-y-10 pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            Executive Cockpit Review <span className="emoji-3d">🚀</span>
          </h1>
          <p className="text-sm font-bold text-slate-400 mt-2">One screen, total control. Real-time business health summary.</p>
        </div>
        <div className="flex items-center gap-3 bg-emerald-50 px-5 py-2.5 rounded-full border border-emerald-100/50">
          <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
          <span className="text-xs font-black text-emerald-700 uppercase tracking-widest">System Online</span>
          <span className="text-xs font-bold text-emerald-400 opacity-50">•</span>
          <span className="text-xs font-black text-emerald-700 uppercase tracking-widest">{new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>

      {/* Financial Position (Macro View) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Total Assets", val: totalAssets, sub: "Harta", icon: <Building className="w-5 h-5" />, color: "bg-blue-600", trend: "up" },
          { label: "Total Liabilities", val: totalLiabilities, sub: "Hutang", icon: <Scale className="w-5 h-5" />, color: "bg-rose-500", badge: "MANAGED" },
          { label: "Total Equity", val: totalEquity, sub: "Modal", icon: <Shield className="w-5 h-5" />, color: "bg-indigo-600", trend: "stable" },
          { label: "Monthly Net Profit", val: netProfit, sub: `${profitMargin.toFixed(1)}% Margin`, icon: <DollarSign className="w-5 h-5" />, color: "bg-emerald-500", isHero: true },
        ].map((m, i) => (
          <Card key={i} className={cn(
            "liquid-card border-none overflow-hidden group relative",
            m.isHero && "bg-slate-900 scale-105 shadow-2xl shadow-emerald-500/10 z-10"
          )}>
            <CardContent className="p-8">
              <div className="flex justify-between items-start mb-6">
                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg", m.color)}>
                  {m.icon}
                </div>
                {m.badge && (
                  <Badge variant="outline" className="text-[10px] font-black border-slate-200 text-slate-400 rounded-full px-3">{m.badge}</Badge>
                )}
                {m.isHero && (
                  <Badge className="bg-emerald-500 text-slate-950 text-[10px] font-black rounded-full border-none px-3 uppercase tracking-tighter">Bottom Line</Badge>
                )}
              </div>
              <p className={cn("text-[10px] font-black uppercase tracking-[0.2em] mb-1", m.isHero ? "text-emerald-400" : "text-slate-400")}>{m.label}</p>
              <h4 className={cn("text-2xl font-black tracking-tight", m.isHero ? "text-white" : "text-slate-900")}>
                {formatRupiah(m.val)}
              </h4>
              <div className="flex items-center gap-2 mt-4">
                {m.trend === "up" && <ArrowUpRight className="w-4 h-4 text-emerald-500" />}
                <p className={cn("text-[10px] font-bold uppercase", m.isHero ? "text-slate-400" : "text-slate-500")}>{m.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Analytics Layer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 liquid-card border-none">
          <CardHeader className="flex flex-row items-center justify-between px-8 pt-8">
            <div>
              <CardTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
                Growth Momentum <span className="emoji-3d">📈</span>
              </CardTitle>
              <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Revenue vs Profit Trend</CardDescription>
            </div>
            <div className="flex gap-6">
               <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500">
                  <div className="w-3 h-3 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(0,82,255,0.3)]" /> Revenue
               </div>
               <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" /> Profit
               </div>
            </div>
          </CardHeader>
          <CardContent className="h-[400px] p-8 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cockpitData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0052FF" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#0052FF" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fontWeight: 900, fill: '#64748B' }} 
                  dy={10}
                />
                <YAxis hide />
                <Tooltip 
                  cursor={{ stroke: '#e2e8f0', strokeWidth: 2 }}
                  contentStyle={{ 
                    borderRadius: '2rem', 
                    border: 'none', 
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)', 
                    padding: '24px',
                    background: 'rgba(255,255,255,0.95)',
                    backdropFilter: 'blur(10px)'
                  }}
                  itemStyle={{ fontWeight: 900, fontSize: '13px' }}
                  labelStyle={{ fontWeight: 900, marginBottom: '12px', color: '#1E293B', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#0052FF" strokeWidth={5} fillOpacity={1} fill="url(#colorRev)" />
                <Area type="monotone" dataKey="profit" stroke="#10B981" strokeWidth={5} fillOpacity={1} fill="url(#colorProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* OpEx Breakdown */}
        <Card className="liquid-card border-none">
          <CardHeader className="p-8">
            <CardTitle className="text-xl font-black text-slate-900">OpEx Breakdown</CardTitle>
            <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Operational Expenses</CardDescription>
          </CardHeader>
          <CardContent className="p-0 flex flex-col items-center">
            <div className="h-[250px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={opexCategories}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={90}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {opexCategories.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '1.5rem', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-4 w-full px-8 pb-10 mt-6">
               {opexCategories.map((cat, i) => (
                 <div key={i} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                       <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{cat.name}</span>
                    </div>
                    <span className="text-sm font-black text-slate-800">{formatRupiah(cat.value)}</span>
                 </div>
               ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Operational Health Radar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-4 mb-2">
          <h3 className="text-xl font-black text-slate-900 flex items-center gap-3">
             Operational Health Radar <Activity className="w-5 h-5 text-emerald-500" />
          </h3>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">End-to-End Business Flow Monitoring</p>
        </div>
        {[
          { label: "Incoming", value: incomingCount, icon: <ArrowUpRight className="text-blue-600" />, desc: "Client Requests", color: "bg-blue-50" },
          { label: "Procurement", value: procurementCount, icon: <ShoppingCart className="text-orange-500" />, desc: "Active Sourcing", color: "bg-orange-50" },
          { label: "Warehouse", value: warehouseCount, icon: <Package className="text-indigo-500" />, desc: "Packing & QC", color: "bg-indigo-50" },
          { label: "Completed", value: completedCount, icon: <Target className="text-emerald-600" />, desc: "Delivered Orders", color: "bg-emerald-50" },
        ].map((item, i) => (
          <div key={i} className="flex flex-col p-8 rounded-[3rem] bg-white shadow-sm border border-slate-100 hover:border-emerald-200 transition-all duration-300 group hover:-translate-y-1">
             <div className={cn("w-14 h-14 rounded-3xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110", item.color)}>
                {item.icon}
             </div>
             <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{item.label}</p>
             <h3 className="text-3xl font-black text-slate-900 mb-2">{item.value} <span className="text-sm font-bold text-slate-300">Total</span></h3>
             <p className="text-xs font-bold text-slate-500">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Executive Priority Watchlist */}
        <Card className="liquid-card border-none lg:col-span-1">
           <CardHeader className="p-8 pb-4">
              <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                Executive Priority Watchlist <span className="emoji-3d">🚩</span>
              </CardTitle>
              <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed mt-1">Crucial financial accounts requiring attention.</CardDescription>
           </CardHeader>
           <CardContent className="p-0">
              <div className="divide-y divide-slate-100 px-8 pb-8">
                {[
                  { name: "Piutang Usaha (AR)", val: getBalance('1-2000'), icon: "💰", alert: getBalance('1-2000') > 50000000 },
                  { name: "Hutang Usaha (AP)", val: getBalance('2-1000'), icon: "🧾" },
                  { name: "Inventory Value", val: getBalance('1-3000'), icon: "📦" },
                  { name: "Internal Cash & Bank", val: getBalance('1-1000') + getBalance('1-1200') + getBalance('1-1300'), icon: "🏦", alert: (getBalance('1-1000') + getBalance('1-1200') + getBalance('1-1300')) < 10000000 },
                ].map((acc, i) => (
                  <div key={i} className="py-5 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl emoji-3d">{acc.icon}</span>
                      <div className="flex flex-col">
                        <p className="text-xs font-black text-slate-800 tracking-tight">{acc.name}</p>
                        {acc.alert && (
                          <span className="text-[8px] font-black uppercase tracking-widest text-rose-500 mt-1 flex items-center gap-1">
                            <Activity className="w-2.5 h-2.5" /> High Attention Required
                          </span>
                        )}
                      </div>
                    </div>
                    <p className={cn("text-sm font-black", acc.alert ? "text-rose-600" : "text-slate-900")}>
                      {formatRupiah(Number(acc.val))}
                    </p>
                  </div>
                ))}
              </div>
           </CardContent>
        </Card>

        {/* Strategic Pipeline & Broadcast */}
        <div className="lg:col-span-2 space-y-8">
           {/* Global Pipeline / Leads */}
           <Card className="liquid-card border-none bg-indigo-600 text-white overflow-hidden relative group">
              <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none group-hover:bg-white/20 transition-all duration-700" />
              <CardContent className="p-10 flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                <div className="flex items-center gap-8">
                  <div className="w-20 h-20 bg-white/10 rounded-[2.5rem] flex items-center justify-center border border-white/20 backdrop-blur-md shadow-2xl group-hover:rotate-6 transition-transform">
                    <Target className="w-10 h-10 text-indigo-300" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-black tracking-tight">Market Coverage Pipeline</h3>
                    <p className="text-indigo-100/60 text-sm font-bold mt-2 uppercase tracking-[0.2em] leading-relaxed">
                      {leads.length} Active B2B Leads in Negotiation
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={() => window.location.href = '/admin/crm'}
                  className="bg-white hover:bg-slate-100 text-indigo-600 font-black px-12 h-16 rounded-[2rem] shadow-2xl shadow-indigo-950/20 transition-all flex items-center gap-3 active:scale-95 group/btn"
                >
                  Jump to CRM Portal <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
                </Button>
              </CardContent>
           </Card>

           {/* CEO Broadcast Hub */}
           <Card className="liquid-card border-none bg-white shadow-xl">
             <CardContent className="p-10 flex flex-col md:flex-row items-start gap-10">
               <div className="shrink-0 flex items-center justify-center w-20 h-20 bg-emerald-500 rounded-[2.5rem] shadow-2xl shadow-emerald-500/20 group animate-in zoom-in duration-500">
                 <Megaphone className="w-10 h-10 text-slate-950 rotate-[-15deg] group-hover:rotate-0 transition-transform" />
               </div>
               <div className="flex-1 space-y-6">
                  <div>
                     <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-2xl font-black text-slate-900">Broadcast Hub</h3>
                        <Badge className="bg-emerald-100 text-emerald-700 font-black text-[10px] rounded-full px-2 border-none">LEADERSHIP CONTROL</Badge>
                     </div>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Push real-time banners to every active employee</p>
                  </div>
                  <Textarea 
                    value={announcementMsg}
                    onChange={(e) => setAnnouncementMsg(e.target.value)}
                    placeholder="Type your strategic message here..."
                    className="min-h-[120px] bg-slate-50 border-none rounded-[2rem] p-8 text-lg font-bold shadow-inner focus-visible:ring-emerald-500/20 ring-0 focus-visible:bg-white transition-all"
                  />
                  <div className="flex items-center justify-between">
                     <p className="text-[10px] font-bold text-slate-400 max-w-[200px] leading-normal uppercase">Your message will appear at the top of all user dashboards instantly.</p>
                     <div className="flex gap-4">
                        <Button 
                          variant="ghost" 
                          className="text-slate-400 font-black px-8 h-14 rounded-full hover:bg-slate-50" 
                          onClick={() => { setAnnouncementMsg(""); handleBroadcast(); }}
                        >
                          Clear Board
                        </Button>
                        <Button 
                          onClick={handleBroadcast} 
                          className="bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-black px-12 h-14 rounded-[1.5rem] shadow-xl shadow-emerald-500/20 transition-all"
                        >
                          Push to Team Now
                        </Button>
                     </div>
                  </div>
               </div>
             </CardContent>
           </Card>
        </div>
      </div>
    </div>
  )
}

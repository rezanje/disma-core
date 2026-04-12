"use client"

import { useAppStore } from "@/lib/store"
import { formatRupiah } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Wallet, CreditCard, Clock, FileText, ArrowUpRight, ArrowDownLeft, ArrowRight } from "lucide-react"

export default function FinanceDashboard() {
  const invoices = useAppStore(state => state.invoices)
  const salesOrders = useAppStore(state => state.salesOrders)
  const salesOrderItems = useAppStore(state => state.salesOrderItems)
  const journalLines = useAppStore(state => state.journalLines)
  const coas = useAppStore(state => state.coas)
  const expenses = useAppStore(state => state.expenses)
  
  // Helper to get balance from COA prefix
  const getBalance = (prefix: string) => {
    const accIds = coas.filter(a => a.accountCode.startsWith(prefix)).map(a => a.id)
    return journalLines
      .filter(jl => accIds.includes(jl.accountId))
      .reduce((sum, jl) => {
        if (prefix === '1' || prefix === '5' || prefix === '6') return sum + (jl.debitAmount - jl.creditAmount)
        return sum + (jl.creditAmount - jl.debitAmount)
      }, 0)
  }

  // AP (Liabilities) - Default ke Utang Usaha 2-1000
  const totalAP = getBalance('2-1000') || 0
  
  // AR (Asset) - Default ke Piutang Usaha 1-2000
  // Ambil dari sisa tagihan invoice jika ledger Piutang kosong
  const ledgerAR = getBalance('1-2000')
  const invoiceAR = invoices.reduce((sum, inv) => {
    if (inv.status !== 'Paid') return sum + (inv.totalAmount - (inv.amountPaid || 0))
    return sum
  }, 0)
  const totalAR = ledgerAR || invoiceAR
  
  const pendingInvoices = invoices.filter(inv => inv.status !== 'Paid')
  const collectionThisMonth = invoices
    .filter(inv => inv.status === 'Paid')
    .reduce((sum, inv) => sum + (inv.amountPaid || 0), 0)

  // Projected Revenue = Sales Orders yang 'Sudah Dibayar' atau 'Diproses' tapi belum selesai
  const projectedRevenue = salesOrders
    .filter(so => so.status !== 'Batal' && so.status !== 'Selesai')
    .reduce((sum, so) => {
      const items = salesOrderItems.filter(item => item.salesOrderId === so.id)
      return sum + items.reduce((iSum, item) => iSum + item.subtotal, 0)
    }, 0)

  // DSO calculation
  let dso = 0
  if (invoices.length > 0) {
    const paidInvoices = invoices.filter(inv => inv.status === 'Paid' && inv.paidDate)
    if (paidInvoices.length > 0) {
      const totalDays = paidInvoices.reduce((sum, inv) => {
        const start = new Date(inv.issueDate).getTime()
        const end = new Date(inv.paidDate!).getTime()
        return sum + (end - start) / (1000 * 60 * 60 * 24)
      }, 0)
      dso = totalDays / paidInvoices.length
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Accounts Receivable</CardTitle>
            <Wallet className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{formatRupiah(totalAR)}</div>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Awaiting collection</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending Invoices</CardTitle>
            <FileText className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{pendingInvoices.length}</div>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Needs Follow-up</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Collections (MoM)</CardTitle>
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{formatRupiah(collectionThisMonth)}</div>
            <p className="text-[9px] font-bold text-emerald-600 mt-1 uppercase tracking-tighter">Cash Inflow</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Days Sales Outstand.</CardTitle>
            <Clock className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{dso.toFixed(1)}</div>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Avg settlement time</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 liquid-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
               <CardTitle className="text-xl font-black uppercase text-slate-800 tracking-tight">Financial Summary</CardTitle>
               <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">AR/AP and Cash Positioning</p>
            </div>
            <span className="text-4xl emoji-3d">💰</span>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="p-6 rounded-[2.5rem] bg-emerald-50 border border-emerald-100 flex items-center justify-between group hover:bg-white hover:shadow-xl transition-all duration-500">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm">
                    <ArrowDownLeft className="text-rose-500 w-6 h-6" />
                  </div>
                  <div>
                    <h5 className="font-black text-slate-800 uppercase text-xs">Total Liabilities (AP)</h5>
                    <p className="text-xs font-bold text-slate-400">Monthly Expenses & COGS</p>
                  </div>
                </div>
                <p className="text-lg font-black text-slate-900">{formatRupiah(totalAP)}</p>
              </div>

              <div className="p-6 rounded-[2.5rem] bg-emerald-50 border border-emerald-100 flex items-center justify-between group hover:bg-white hover:shadow-xl transition-all duration-500">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm">
                    <ArrowUpRight className="text-emerald-500 w-6 h-6" />
                  </div>
                  <div>
                    <h5 className="font-black text-slate-800 uppercase text-xs">Projected Revenue</h5>
                    <p className="text-xs font-bold text-slate-400">Confirmed Sales Orders</p>
                  </div>
                </div>
                <p className="text-lg font-black text-slate-900">{formatRupiah(projectedRevenue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="col-span-3 space-y-6">
          <Card className="liquid-card">
            <CardHeader className="pb-0">
               <CardTitle className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                  <span className="text-xl emoji-3d">📑</span> Recent Invoices
               </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
               {invoices.length === 0 ? (
                 <p className="text-xs text-slate-400 italic py-4">No active invoices found.</p>
               ) : (
                 [...invoices]
                   .sort((a,b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime())
                   .slice(0, 5)
                   .map(inv => (
                   <div key={inv.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 px-2 rounded-lg transition-colors">
                      <div>
                        <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight">INV-{inv.id.slice(0,8).toUpperCase()}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(inv.issueDate).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-[10px] font-black ${inv.status === 'Paid' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatRupiah(inv.totalAmount)}
                        </p>
                        <p className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">{inv.status}</p>
                      </div>
                   </div>
                 ))
               )}
            </CardContent>
          </Card>
          
          <Card className="liquid-card bg-slate-900 text-white border-none shadow-xl">
            <CardContent className="p-6 flex flex-col justify-between h-full">
              <div>
                <CardTitle className="text-xs font-black uppercase text-slate-400 mb-4 tracking-widest">Finance Quick Action</CardTitle>
                <div className="space-y-2">
                   <button className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 transition-all text-left px-4 flex items-center justify-between group">
                      <span className="text-[10px] font-black uppercase">Reconcile Daily Accounts</span>
                      <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-white group-hover:translate-x-1 transition-all" />
                   </button>
                   <button className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 transition-all text-left px-4 flex items-center justify-between group">
                      <span className="text-[10px] font-black uppercase">Verify Pending Payments</span>
                      <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-white group-hover:translate-x-1 transition-all" />
                   </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

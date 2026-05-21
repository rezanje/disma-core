"use client"

import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckSquare, Clock, FileEdit, ClipboardList, ArrowRight, UserPlus, PlusCircle, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function AdminPoDashboard() {
  const router = useRouter()
  const salesOrders = useAppStore(state => state.salesOrders)
  const clients = useAppStore(state => state.clients)
  
  const pendingApproval = salesOrders.filter(so => so.status === 'Pending Approval')
  const draftOrders = salesOrders.filter(so => so.status === 'Draft')
  const activeProcessing = salesOrders.filter(so => ['Belanja', 'Packing'].includes(so.status))

  return (
    <div className="space-y-8">
      {/* PHASE 1 PRIMARY ACTIONS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/admin/sales-orders">
          <Card className="bg-slate-900 text-white border-none shadow-xl hover:scale-[1.02] transition-all cursor-pointer overflow-hidden relative group">
            <div className="absolute right-0 top-0 p-8 opacity-10 group-hover:rotate-12 transition-transform">
               <PlusCircle className="w-24 h-24" />
            </div>
            <CardContent className="p-6 relative z-10">
              <PlusCircle className="w-10 h-10 mb-4 bg-white/20 rounded-xl p-2" />
              <h3 className="text-xl font-black uppercase tracking-tight">Catat PO Masuk</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Input Pesanan Baru</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/shopping-list">
          <Card className="bg-emerald-600 text-white border-none shadow-xl hover:scale-[1.02] transition-all cursor-pointer overflow-hidden relative group">
            <div className="absolute right-0 top-0 p-8 opacity-10 group-hover:rotate-12 transition-transform">
               <ClipboardList className="w-24 h-24" />
            </div>
            <CardContent className="p-6 relative z-10">
              <ClipboardList className="w-10 h-10 mb-4 bg-white/20 rounded-xl p-2" />
              <h3 className="text-xl font-black uppercase tracking-tight">List Belanja (Print)</h3>
              <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mt-1">Generate Daftar Belanja Pasar</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/finance/invoices">
          <Card className="bg-indigo-600 text-white border-none shadow-xl hover:scale-[1.02] transition-all cursor-pointer overflow-hidden relative group">
            <div className="absolute right-0 top-0 p-8 opacity-10 group-hover:rotate-12 transition-transform">
               <FileEdit className="w-24 h-24" />
            </div>
            <CardContent className="p-6 relative z-10">
              <FileEdit className="w-10 h-10 mb-4 bg-white/20 rounded-xl p-2" />
              <h3 className="text-xl font-black uppercase tracking-tight">Tukar Faktur</h3>
              <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-widest mt-1">Compile PO Jadi Tagihan Mingguan</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Awaiting Approval</CardTitle>
            <CheckSquare className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{pendingApproval.length}</div>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Orders to Verify</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Draft POs</CardTitle>
            <FileEdit className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{draftOrders.length}</div>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Needs Completion</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">In Processing</CardTitle>
            <Clock className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{activeProcessing.length}</div>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Ongoing fulfillment</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Clients</CardTitle>
            <UserPlus className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{clients.length}</div>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Active Partners</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 liquid-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
               <CardTitle className="text-xl font-black uppercase text-slate-800 tracking-tight">Pending Approval Queue</CardTitle>
               <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Review before processing</p>
            </div>
            <span className="text-4xl emoji-3d">📑</span>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
               {pendingApproval.slice(0, 5).map(order => (
                  <div key={order.id} className="p-5 rounded-[2.5rem] bg-slate-50 border border-slate-100 flex items-center justify-between group hover:bg-white hover:shadow-xl transition-all duration-500">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm text-emerald-600">
                        <CheckSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{order.poNumber || 'UNNAMED PO'}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                           {clients.find(c => c.id === order.clientId)?.companyName || 'Unknown Client'}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => router.push('/admin/sales-orders')}
                      className="text-[9px] font-black uppercase text-slate-600 px-4 py-2 bg-white rounded-full border border-slate-100 group-hover:bg-slate-900 group-hover:text-white transition-all shadow-sm"
                    >
                      Review <ArrowRight className="inline-block ml-1 w-2.5 h-2.5" />
                    </button>
                  </div>
               ))}
               
               {pendingApproval.length === 0 && (
                 <div className="py-8 text-center bg-slate-50 rounded-[2.5rem] border border-dashed border-slate-200">
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">No pending client requests</p>
                 </div>
               )}
            </div>
          </CardContent>
        </Card>

        <div className="col-span-3 space-y-6">
            <Card className="liquid-card border-none shadow-xl bg-gradient-to-br from-slate-800 to-slate-950 text-white">
              <CardContent className="p-8">
                 <div className="flex justify-between items-start mb-6">
                    <div>
                      <CardTitle className="text-xs font-black uppercase text-slate-400 tracking-widest mb-1">Onboarding</CardTitle>
                      <h4 className="text-2xl font-black">Quick Client Setup</h4>
                    </div>
                    <span className="text-4xl emoji-3d">🤝</span>
                 </div>
                 <p className="text-xs text-slate-400 leading-snug mb-6">Register new outlet accounts to start accepting POs immediately.</p>
                 <button 
                    onClick={() => router.push('/admin/clients')}
                    className="w-full py-3 rounded-2xl bg-emerald-500 text-slate-900 font-black uppercase text-[10px] flex items-center justify-center gap-2 hover:bg-emerald-400 transition-all shadow-lg active:scale-95"
                 >
                    <UserPlus className="w-3.5 h-3.5" /> New Registration
                 </button>
              </CardContent>
            </Card>
        </div>
      </div>
    </div>
  )
}

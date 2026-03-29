"use client"

import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckSquare, Clock, FileEdit, ClipboardList, ArrowRight, UserPlus } from "lucide-react"
import { useRouter } from "next/navigation"

export default function AdminPoDashboard() {
  const router = useRouter()
  const salesOrders = useAppStore(state => state.salesOrders)
  
  const pendingApproval = salesOrders.filter(so => so.status === 'Pending Approval')
  const draftOrders = salesOrders.filter(so => so.status === 'Draft')
  const activeProcessing = salesOrders.filter(so => ['Belanja', 'Packing'].includes(so.status))

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending Approval</CardTitle>
            <CheckSquare className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{pendingApproval.length}</div>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">New client requests</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Draft POs</CardTitle>
            <FileEdit className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{draftOrders.length}</div>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Needs PO Generation</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">In Processing</CardTitle>
            <Clock className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{activeProcessing.length}</div>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Belanja / Packing</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Deliveries</CardTitle>
            <ClipboardList className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{salesOrders.length}</div>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Total POs this week</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 liquid-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
               <CardTitle className="text-xl font-black uppercase text-slate-800 tracking-tight">Order Pipeline</CardTitle>
               <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">From Request to Delivery</p>
            </div>
            <span className="text-4xl emoji-3d">📑</span>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
               {pendingApproval.slice(0, 3).map(order => (
                  <div key={order.id} className="p-5 rounded-[2.5rem] bg-emerald-50 border border-emerald-100 flex items-center justify-between group hover:bg-white hover:shadow-xl transition-all duration-500">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm text-emerald-600">
                        <CheckSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight">Request: {order.poNumber}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Awaiting Approval</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => router.push('/admin/sales-orders')}
                      className="text-[9px] font-black uppercase text-emerald-600 px-4 py-2 bg-white rounded-full border border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-sm"
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
            <Card className="liquid-card bg-emerald-600 text-white border-none shadow-xl">
              <CardContent className="p-8">
                 <div className="flex justify-between items-start mb-6">
                    <div>
                      <CardTitle className="text-xs font-black uppercase text-emerald-200 tracking-widest mb-1">CRM Quick Action</CardTitle>
                      <h4 className="text-2xl font-black">Register New Client</h4>
                    </div>
                    <span className="text-4xl emoji-3d">🤝</span>
                 </div>
                 <p className="text-xs text-emerald-100 leading-snug mb-6">Onboard new outlets or distributors to the DISMA digital ecosystem.</p>
                 <button 
                    onClick={() => router.push('/admin/clients')}
                    className="w-full py-3 rounded-2xl bg-white text-emerald-600 font-black uppercase text-[10px] flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-lg active:scale-95"
                 >
                    <UserPlus className="w-3.5 h-3.5" /> Start Registration
                 </button>
              </CardContent>
            </Card>

           <Card className="liquid-card">
              <CardHeader className="pb-0">
                 <CardTitle className="text-xs font-black uppercase text-slate-400 tracking-widest">PO Tasks</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                 <div className="space-y-3">
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center">
                          <CheckSquare className="w-4 h-4" />
                       </div>
                       <p className="text-[10px] font-black text-slate-700 uppercase tracking-tight">Sync Order Links with Sales Team</p>
                    </div>
                    <div className="flex items-center gap-3 opacity-50">
                       <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center line-through">
                          <CheckSquare className="w-4 h-4" />
                       </div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-tight line-through">Update SKU Catalog Prices</p>
                    </div>
                 </div>
              </CardContent>
           </Card>
        </div>
      </div>
    </div>
  )
}

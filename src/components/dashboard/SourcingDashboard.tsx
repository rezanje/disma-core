"use client"

import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShoppingBasket, Search, History, Target, ArrowRight, Truck } from "lucide-react"
import { useRouter } from "next/navigation"

export default function SourcingDashboard() {
  const router = useRouter()
  const salesOrders = useAppStore(state => state.salesOrders)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  
  const shoppingNeeds = salesOrders.filter(so => so.status === 'Belanja')
  const totalItemsToBuy = purchaseItems.filter(p => !p.isChecked && p.purchaseMethod === 'Pasar').length
  const itemsCompletedToday = purchaseItems.filter(p => p.isChecked && p.purchaseMethod === 'Pasar').length
  const progress = totalItemsToBuy + itemsCompletedToday > 0 
    ? (itemsCompletedToday / (totalItemsToBuy + itemsCompletedToday)) * 100 
    : 0

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[11px] font-bold text-slate-400 ">Active Shopping List</CardTitle>
            <ShoppingBasket className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-800">{shoppingNeeds.length}</div>
            <p className="text-[11px] font-bold text-slate-400 mt-1 ">Orders currently being sourced</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[11px] font-bold text-slate-400 ">Items Remaining</CardTitle>
            <Search className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-800">{totalItemsToBuy}</div>
            <p className="text-[11px] font-bold text-slate-400 mt-1 ">Awaiting market purchase</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[11px] font-bold text-slate-400 ">Purchases Completed</CardTitle>
            <History className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-800">{itemsCompletedToday}</div>
            <p className="text-[11px] font-bold text-emerald-600 mt-1 ">Verified today</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[11px] font-bold text-slate-400 ">Team Target</CardTitle>
            <Target className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-800">{Math.round(progress)}%</div>
            <p className="text-[11px] font-bold text-slate-400 mt-1 ">Daily sourcing progress</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3 liquid-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
               <CardTitle className="text-xl font-bold uppercase text-slate-800 tracking-tight">Purchase Targets</CardTitle>
               <p className="text-xs text-slate-400 font-bold  mt-1">Priority items for Tim Pasar</p>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center min-h-[240px] bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-8 text-center space-y-3">
               <ShoppingBasket className="w-12 h-12 text-slate-300 mx-auto" />
               <h5 className="font-bold text-slate-800 uppercase text-xs">Dynamic Shopping List</h5>
               <p className="text-xs text-slate-400 max-w-[60%] leading-relaxed">Open the Shopping List menu to start verifying items found in the market.</p>
               <button 
                  onClick={() => router.push('/sourcing/list')}
                  className="h-10 px-6 bg-slate-900 text-white rounded-full text-[11px] font-bold  flex items-center gap-2 hover:bg-emerald-600 transition-colors shadow-sm"
               >
                  Segera Belanja ke Pasar <ArrowRight className="w-3 h-3" />
               </button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 liquid-card bg-emerald-600 text-white shadow-sm">
           <CardContent className="p-8 h-full flex flex-col justify-center">
              <div className="flex justify-between items-start mb-8">
                 <div>
                   <CardTitle className="text-xs font-bold uppercase text-emerald-200 tracking-widest mb-1">Logistics Status</CardTitle>
                   <h4 className="text-2xl font-bold">Incoming Sourcing</h4>
                 </div>
                 <Truck className="w-8 h-8 text-white/50" />
              </div>
              <div className="space-y-4">
                 <div className="flex items-center justify-between p-5 bg-card rounded-2xl">
                    <span className="text-[11px] font-bold uppercase">Vendor ABUBA Delivery</span>
                    <span className="text-[11px] font-bold px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full shadow-sm">On Wait</span>
                 </div>
                 <div className="flex items-center justify-between p-5 bg-card rounded-2xl">
                    <span className="text-[11px] font-bold uppercase">Local Market Items</span>
                    <span className="text-[11px] font-bold px-3 py-1 bg-card rounded-full">In Sourcing</span>
                 </div>
              </div>
           </CardContent>
        </Card>
      </div>
    </div>
  )
}

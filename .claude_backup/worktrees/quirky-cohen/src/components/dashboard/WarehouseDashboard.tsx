"use client"

import { useAppStore } from "@/lib/store"
import { formatRupiah } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Package, ShieldCheck, Box, Boxes, ArrowRight, Tag } from "lucide-react"

export default function WarehouseDashboard() {
  const products = useAppStore(state => state.products)
  const salesOrders = useAppStore(state => state.salesOrders)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  
  const pendingQC = purchaseItems.filter(item => item.qtyPurchased > 0 && !item.isQCed)
  const packingNeeds = salesOrders.filter(so => so.status === 'Packing')
  const lowStock = products.filter(p => p.currentStock < 10)
  const totalStockValue = products.reduce((sum, p) => sum + (p.currentStock * p.basePrice), 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Incoming for QC</CardTitle>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{pendingQC.length}</div>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Items awaiting check</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Packing Queue</CardTitle>
            <Package className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{packingNeeds.length}</div>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Orders to process</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Low Stock Alerts</CardTitle>
            <Tag className="w-4 h-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{lowStock.length}</div>
            <p className="text-[9px] font-bold text-rose-600 mt-1 uppercase tracking-tighter">Needs urgent restock</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inventory Value</CardTitle>
            <Boxes className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{formatRupiah(totalStockValue)}</div>
            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Total asset worth</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 liquid-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
               <CardTitle className="text-xl font-black uppercase text-slate-800 tracking-tight">Warehouse Operations</CardTitle>
               <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Real-time inventory flow</p>
            </div>
            <span className="text-4xl emoji-3d">📦</span>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 rounded-[2.5rem] bg-slate-50 border border-slate-100 flex flex-col items-center justify-center space-y-2 hover:bg-white hover:shadow-xl transition-all duration-500 group">
                <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm text-amber-500">
                  <Package className="w-6 h-6" />
                </div>
                <h5 className="font-black text-slate-800 uppercase text-[10px] tracking-widest">Ready to Pack</h5>
                <p className="text-2xl font-black text-slate-900">{packingNeeds.length}</p>
                <button className="text-[9px] font-black uppercase text-slate-400 flex items-center gap-1 group-hover:text-amber-600 transition-colors">
                  Open Queue <ArrowRight className="w-2.5 h-2.5" />
                </button>
              </div>

              <div className="p-6 rounded-[2.5rem] bg-emerald-50 border border-emerald-100 flex flex-col items-center justify-center space-y-2 hover:bg-white hover:shadow-xl transition-all duration-500 group">
                <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm text-emerald-500">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h5 className="font-black text-slate-800 uppercase text-[10px] tracking-widest">Awaiting QC</h5>
                <p className="text-2xl font-black text-slate-900">{pendingQC.length}</p>
                <button className="text-[9px] font-black uppercase text-slate-400 flex items-center gap-1 group-hover:text-emerald-600 transition-colors">
                  Open QC Form <ArrowRight className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3 liquid-card">
          <CardHeader className="pb-0">
             <CardTitle className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                <span className="text-xl emoji-3d">🚨</span> Stock Alerts
             </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
             <div className="space-y-4">
               {lowStock.length === 0 ? (
                 <div className="py-10 text-center">
                    <p className="text-xs text-slate-400 italic">All stock levels are optimal.</p>
                 </div>
               ) : (
                 lowStock.slice(0, 5).map(product => (
                   <div key={product.id} className="flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center">
                          <Box className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{product.name}</p>
                          <p className="text-[9px] font-bold text-slate-400">{product.currentStock} {product.uom} left</p>
                        </div>
                      </div>
                      <div className="h-1 bg-rose-100 w-12 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-500 w-[30%]" />
                      </div>
                   </div>
                 ))
               )}
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

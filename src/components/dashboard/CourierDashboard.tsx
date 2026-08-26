"use client"

import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Truck, MapPin, CheckCircle2, Navigation, ArrowRight, Camera, Package, ClipboardCheck, Circle, CheckCircle } from "lucide-react"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export default function CourierDashboard() {
  const deliveries = useAppStore(state => state.deliveries)
  const salesOrders = useAppStore(state => state.salesOrders)
  const salesOrderItems = useAppStore(state => state.salesOrderItems)
  const products = useAppStore(state => state.products)
  const currentUser = useAppStore(state => state.currentUser)
  const updateSalesOrder = useAppStore(state => state.updateSalesOrder)
  const updateSalesOrderItem = useAppStore(state => state.updateSalesOrderItem)
  const updateDelivery = useAppStore(state => state.updateDelivery)

  const [activeHandoverId, setActiveHandoverId] = useState<string | null>(null)
  
  const activeDeliveries = deliveries.filter(d => d.status === 'Dikirim')
  const completedToday = deliveries.filter(d => d.status === 'Terkirim')
  const pendingPickup = salesOrders.filter(so => so.status === 'Siap Kirim')

  const handleHandoverSubmit = (soId: string) => {
    // 1. Update SO Status
    updateSalesOrder(soId, { 
      status: 'Dikirim',
      receivedBy: currentUser?.id || 'system'
    })

    // 2. Update Delivery
    const delivery = deliveries.find(d => d.salesOrderId === soId)
    if (delivery) {
      updateDelivery(delivery.id, { 
        status: 'Dikirim',
        courierId: currentUser?.id || 'system'
      })
    }

    toast.success("Serah terima berhasil! Silakan mulai perjalanan.")
    setActiveHandoverId(null)
  }

  const toggleHandoverCheck = (itemId: string, current: boolean) => {
    updateSalesOrderItem(itemId, { isHandoverChecked: !current })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[11px] font-bold text-slate-400 ">In Transit</CardTitle>
            <Navigation className="w-4 h-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-800">{activeDeliveries.length}</div>
            <p className="text-[11px] font-bold text-slate-400 mt-1 ">Currently on route</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[11px] font-bold text-slate-400 ">Delivered Today</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-800">{completedToday.length}</div>
            <p className="text-[11px] font-bold text-emerald-600 mt-1 ">Successful drops</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[11px] font-bold text-slate-400 ">Ready for Pickup</CardTitle>
            <Truck className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-800">{pendingPickup.length}</div>
            <p className="text-[11px] font-bold text-slate-400 mt-1 ">Awaiting courier</p>
          </CardContent>
        </Card>

        <Card className="liquid-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[11px] font-bold text-slate-400 ">Total Routes</CardTitle>
            <MapPin className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-800">{deliveries.length}</div>
            <p className="text-[11px] font-bold text-slate-400 mt-1 ">Assigned to you</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 liquid-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
               <CardTitle className="text-xl font-bold uppercase text-slate-800 tracking-tight">My Active Route</CardTitle>
               <p className="text-xs text-slate-400 font-bold  mt-1">Today's Delivery Sequence</p>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
                {/* Shipments Section */}

                <p className="text-[11px] font-bold text-blue-600  px-2">Active Shipments</p>
                {activeDeliveries.length === 0 ? (
                  <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center gap-3">
                     <Truck className="w-10 h-10 text-slate-300" />
                     <p className="text-xs text-slate-400 font-bold ">No active routes at the moment</p>
                  </div>
               ) : (
                  activeDeliveries.map(d => (
                     <div key={d.id} className="p-6 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-between hover:bg-white hover:shadow-sm transition-all duration-300">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm">
                            <MapPin className="text-blue-500 w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800 ">Delivery #{d.id.slice(0,5)}</p>
                            <p className="text-[11px] font-bold text-blue-600 ">In Progress</p>
                          </div>
                        </div>
                        <ArrowRight className="w-5 h-5" />
                      </div>
                  ))
               )}
            </div>
          </CardContent>
        </Card>

        <div className="col-span-3 space-y-6">
           <Card className="liquid-card bg-slate-900 text-white shadow-sm">
              <CardContent className="p-8">
                 <div className="flex justify-between items-start mb-6">
                    <div>
                      <CardTitle className="text-xs font-bold uppercase text-slate-400 tracking-widest mb-1">Proof of Delivery</CardTitle>
                      <h4 className="text-2xl font-bold">Upload BA</h4>
                    </div>
                    <Camera className="w-8 h-8 text-white/50" />
                 </div>
                 <p className="text-xs text-slate-400 leading-snug mb-6">Capture the signed Berita Acara for the completed delivery.</p>
                 <button className="w-full py-4 rounded-lg bg-blue-600 text-white font-bold uppercase text-[11px] flex items-center justify-center gap-2 hover:bg-blue-500 transition-all shadow-sm">
                    <Camera className="w-4 h-4" /> Open Camera
                 </button>
              </CardContent>
           </Card>
           
           <Card className="liquid-card p-6">
              <CardTitle className="text-xs font-bold uppercase text-slate-400 tracking-widest mb-4">Expense Reminder</CardTitle>
              <div className="p-4 bg-slate-50 rounded-2xl flex items-center justify-between text-[11px] font-bold uppercase text-slate-600">
                 <span>Recent Fuel Report</span>
                 <span className="text-blue-600">Completed</span>
              </div>
           </Card>
        </div>
      </div>
    </div>
  )
}

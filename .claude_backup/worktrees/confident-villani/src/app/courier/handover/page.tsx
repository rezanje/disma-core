"use client"

import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Package, ClipboardCheck, Circle, CheckCircle, Truck } from "lucide-react"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export default function HandoverPage() {
  const deliveries = useAppStore(state => state.deliveries)
  const salesOrders = useAppStore(state => state.salesOrders)
  const salesOrderItems = useAppStore(state => state.salesOrderItems)
  const products = useAppStore(state => state.products)
  const currentUser = useAppStore(state => state.currentUser)
  const updateSalesOrder = useAppStore(state => state.updateSalesOrder)
  const updateSalesOrderItem = useAppStore(state => state.updateSalesOrderItem)
  const updateDelivery = useAppStore(state => state.updateDelivery)

  const [activeHandoverId, setActiveHandoverId] = useState<string | null>(null)
  
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
      <div className="mb-6">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Serah Terima Barang</h2>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
          Handover Checklist • {new Date().toLocaleDateString()}
        </p>
      </div>

      {pendingPickup.length === 0 ? (
        <Card className="liquid-card py-20 text-center border-dashed border-slate-200">
           <CardContent className="flex flex-col items-center gap-4">
              <Package className="w-16 h-16 text-slate-200" />
              <div>
                <h3 className="text-lg font-black text-slate-400 uppercase">Belum ada barang siap pickup</h3>
                <p className="text-xs font-bold text-slate-300 mt-1 uppercase tracking-tighter">Silakan cek dashboard nanti.</p>
              </div>
           </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pendingPickup.map(so => (
            <Dialog key={so.id} open={activeHandoverId === so.id} onOpenChange={(open) => setActiveHandoverId(open ? so.id : null)}>
              <DialogTrigger nativeButton={false} render={
                <div className="p-6 rounded-[2.5rem] bg-white border border-slate-100 flex items-center justify-between hover:border-emerald-200 hover:shadow-xl transition-all cursor-pointer group">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center shadow-sm group-hover:bg-emerald-50 transition-colors">
                      <Package className="text-slate-400 w-6 h-6 group-hover:text-emerald-500 transition-colors" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{so.poNumber}</p>
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-0.5 px-2 py-0.5 bg-emerald-50 rounded-full inline-block">Siap Serah Terima</p>
                    </div>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all">
                     <ClipboardCheck className="w-5 h-5" />
                  </div>
                </div>
              } />
              <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
                <div className="bg-emerald-600 p-8 text-white">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-black text-white">Checklist Serah Terima</DialogTitle>
                      <p className="text-xs text-emerald-100 font-bold uppercase tracking-widest italic mt-1">
                        Selesaikan pengecekan fisik barang bersama Gudang.
                      </p>
                    </DialogHeader>
                </div>
                
                <div className="p-8 space-y-3">
                  {salesOrderItems.filter(i => i.salesOrderId === so.id).map(item => {
                    const product = products.find(p => p.id === item.productId)
                    const isChecked = !!item.isHandoverChecked
                    return (
                      <div key={item.id} className={`flex items-center justify-between p-5 rounded-[2rem] border transition-all ${isChecked ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                         <div className="flex items-center gap-4">
                            <button onClick={() => toggleHandoverCheck(item.id, isChecked)} className="focus:outline-none">
                              {isChecked ? <CheckCircle className="w-7 h-7 text-emerald-500 fill-emerald-50" /> : <Circle className="w-7 h-7 text-slate-300" />}
                            </button>
                            <div>
                              <p className={`text-sm font-black ${isChecked ? 'line-through text-slate-400' : 'text-slate-800'}`}>{product?.name}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">
                                {item.qtyFinal !== undefined && item.qtyFinal < item.qty ? (
                                  <><span className="line-through mr-1">{item.qty}</span><span className="text-amber-600">{item.qtyFinal} {product?.uom} (adjusted)</span></>
                                ) : (
                                  <>{item.qtyFinal ?? item.qty} {product?.uom}</>
                                )}
                              </p>
                            </div>
                         </div>
                      </div>
                    )
                  })}

                  <div className="pt-6">
                    <Button 
                      className="w-full h-16 rounded-[2rem] bg-emerald-600 hover:bg-emerald-700 font-black uppercase text-sm tracking-widest shadow-xl shadow-emerald-200"
                      disabled={salesOrderItems.filter(i => i.salesOrderId === so.id).some(i => !i.isHandoverChecked)}
                      onClick={() => handleHandoverSubmit(so.id)}
                    >
                       Konfirmasi & Mulai Pengantaran <Truck className="w-5 h-5 ml-2" />
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ))}
        </div>
      )}
    </div>
  )
}

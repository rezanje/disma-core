"use client"

import { useAppStore } from "@/lib/store"
import { Card, CardContent } from "@/components/ui/card"
import { MapPin, CheckCircle2 } from "lucide-react"

export default function DeliveryHistoryPage() {
  const deliveries = useAppStore(state => state.deliveries)
  const salesOrders = useAppStore(state => state.salesOrders)
  const clients = useAppStore(state => state.clients)

  const completedDeliveries = deliveries.filter(d => d.status === 'Terkirim')
  // Sort by latest completed
  completedDeliveries.sort((a, b) => new Date(b.deliveryDate || 0).getTime() - new Date(a.deliveryDate || 0).getTime())

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 -mx-4 -mt-4 p-4 border-b shadow-sm mb-6">
        <h2 className="text-lg font-bold">Riwayat Pengiriman</h2>
        <p className="text-sm text-slate-500">Misi yang sudah berhasil diselesaikan</p>
      </div>

      {completedDeliveries.length === 0 ? (
        <div className="text-center py-10 text-slate-500">
          Belum ada riwayat pengiriman.
        </div>
      ) : (
        <div className="space-y-3">
          {completedDeliveries.map(delivery => {
            const so = salesOrders.find(s => s.id === delivery.salesOrderId)
            const client = clients.find(c => c.id === so?.clientId)
            
            if (!so || !client) return null

            return (
              <Card key={delivery.id} className="overflow-hidden bg-slate-50 dark:bg-slate-900/50">
                <CardContent className="p-4 flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold truncate text-sm">{client.companyName}</h3>
                      <span className="text-xs font-semibold text-slate-500">
                        {delivery.deliveryDate ? new Date(delivery.deliveryDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" /> {client.address}
                    </p>
                    <div className="mt-2 text-xs font-medium text-emerald-600 border border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/20 px-2 py-1 rounded inline-block">
                      BA Terkirim & Invoice Dibuat
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

"use client"

import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowUpFromLine, Package, Truck, CheckCircle2, Circle, ShieldCheck, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { WorksheetPrintButton } from "@/components/worksheet-print-button"
import { qty as qtyTeks } from "@/lib/worksheet-rows"

export default function OutboundPage() {
  const salesOrders = useAppStore(state => state.salesOrders)
  const salesOrderItems = useAppStore(state => state.salesOrderItems)
  const products = useAppStore(state => state.products)
  const clients = useAppStore(state => state.clients)

  // Orders that are ready for packing
  const packingOrders = salesOrders.filter(so => so.status === 'Packing')
  const handoverOrders = salesOrders.filter(so => so.status === 'Siap Kirim')

  const handleRelease = async (_soId: string) => { window.location.href='/admin/hari-ini' }
  const toggleItemPacked = (_itemId: string, _currentVal: boolean) => { window.location.href='/admin/hari-ini' }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 uppercase">Outbound <span className="text-blue-600">/ Pengeluaran</span></h2>
          <p className="text-slate-500 font-bold">Persiapkan barang untuk dikirim ke klien (Packing & Handover).</p>
        </div>
        <WorksheetPrintButton
          kind="outbound"
          title="LEMBAR BARANG KELUAR"
          label="Print Lembar Keluar"
          rows={salesOrders.filter(so=>!['Batal','Selesai'].includes(so.status)).flatMap(so => {
            const client = clients.find(c => c.id === so.clientId)
            return salesOrderItems
              .filter(i => i.salesOrderId === so.id)
              .map(i => {
                const product = products.find(p => p.id === i.productId)
                return {
                  group: `${so.poNumber} — ${client?.companyName || 'Klien'}`,
                  cells: [
                    so.poNumber,
                    client?.companyName || '—',
                    product?.name || i.productId,
                    qtyTeks(Math.max(0,i.qty-(i.qtyDelivered||0)), product?.uom),
                  ],
                }
              })
          })}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="liquid-card border-blue-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[11px] font-bold uppercase text-slate-400">Antrean Packing</CardTitle>
            <Package className="h-5 w-5" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-800">{packingOrders.length}</div>
            <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase">PO menunggu dipacking</p>
          </CardContent>
        </Card>

        <Card className="liquid-card border-emerald-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[11px] font-bold uppercase text-slate-400">Siap Serah Terima</CardTitle>
            <Truck className="h-5 w-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-800">{handoverOrders.length}</div>
            <p className="text-[11px] font-bold text-emerald-600 mt-1 uppercase">Awaiting Logistics Pickup</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 grid-cols-1 lg:grid-cols-2">
        {/* LEFT COLUMN: PACKING QUEUE */}
        <div className="space-y-4">
           <h3 className="text-sm font-bold uppercase text-slate-400 px-1 flex items-center gap-2">
              <Package className="w-4 h-4" /> Antrean Packing (In-Process)
           </h3>
           {packingOrders.length === 0 ? (
             <Card className="border-dashed h-40 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                <Package className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-xs font-bold uppercase italic">Belum ada PO untuk dipacking</p>
             </Card>
           ) : (
             packingOrders.map(so => {
               const client = clients.find(c => c.id === so.clientId)
               const items = salesOrderItems.filter(i => i.salesOrderId === so.id)
               return (
                 <Card key={so.id} className="overflow-hidden border-blue-100 dark:border-blue-900/50 shadow-sm liquid-card">
                   <div className="p-4 bg-blue-50/50 border-b flex justify-between items-center">
                      <div>
                         <p className="text-[11px] font-bold text-blue-600 ">Packing Phase</p>
                         <h4 className="font-bold text-slate-800">{so.poNumber}</h4>
                      </div>
                      <Badge className="bg-blue-600 text-white border-none text-[11px] font-bold ">{client?.companyName.substring(0, 15)}...</Badge>
                   </div>
                   <CardContent className="p-4 space-y-4">
                      <ul className="space-y-2">
                         {items.map(item => {
                             const product = products.find(p => p.id === item.productId)
                             const isPacked = !!item.isPacked
                             const hasAdjustment = item.qtyFinal != null && item.qtyFinal < item.qty
                             const displayQty = item.qtyFinal ?? item.qty
                             return (
                                <li key={item.id} className={cn(
                                  "p-3 bg-white border rounded-2xl",
                                  hasAdjustment ? 'border-amber-200 bg-amber-50/50' : 'border-slate-100'
                                )}>
                                   <div className="flex items-center justify-between">
                                     <div className="flex items-center gap-3">
                                        <button onClick={() => toggleItemPacked(item.id, isPacked)}>
                                           {isPacked ? <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-50" /> : <Circle className="w-5 h-5 text-slate-200" />}
                                        </button>
                                        <span className={`text-sm font-bold ${isPacked ? 'line-through text-slate-300' : 'text-slate-800'}`}>{product?.name}</span>
                                     </div>
                                     <div className="text-right">
                                       {hasAdjustment ? (
                                         <div className="flex items-center gap-2">
                                           <span className="text-xs font-bold text-slate-300 line-through">{item.qty}</span>
                                           <span className="text-xs font-bold text-amber-600">{displayQty} {product?.uom}</span>
                                         </div>
                                       ) : (
                                         <span className="text-xs font-bold text-slate-400">{displayQty} {product?.uom}</span>
                                       )}
                                     </div>
                                   </div>
                                   {hasAdjustment && (
                                     <div className="mt-2 ml-8 flex items-start gap-1.5 text-[11px] font-bold text-amber-600 bg-amber-100/60 px-3 py-1.5 rounded-xl">
                                       <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                       <span>{item.qtyAdjustmentReason || 'Qty disesuaikan setelah QC'}</span>
                                     </div>
                                   )}
                                </li>
                             )
                          })}
                       </ul>
                      <Button
                         onClick={() => handleRelease(so.id)}
                         className="w-full bg-blue-600 hover:bg-blue-700 h-12 font-bold rounded-2xl shadow-sm"

                      >
                         Salin packing & barang keluar <ArrowUpFromLine className="w-4 h-4 ml-2" />
                      </Button>
                   </CardContent>
                 </Card>
               )
             })
           )}
        </div>

        {/* RIGHT COLUMN: HANDOVER PENDING */}
        <div className="space-y-4">
           <h3 className="text-sm font-bold uppercase text-slate-400 px-1 flex items-center gap-2">
              <Truck className="w-4 h-4 text-emerald-500" /> Menunggu Pickup Kurir (Siap Kirim)
           </h3>
           {handoverOrders.length === 0 ? (
             <Card className="border-dashed h-40 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                <Truck className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-xs font-bold uppercase italic">Belum ada PO yang siap serah terima</p>
             </Card>
           ) : (
            handoverOrders.map(so => {
               return (
                 <Card key={so.id} className="overflow-hidden border-emerald-100 dark:border-emerald-900/50 shadow-sm liquid-card opacity-80 hover:opacity-100 transition-opacity">
                   <div className="p-4 bg-emerald-50/50 border-b flex justify-between items-center">
                      <div>
                         <p className="text-[11px] font-bold text-emerald-600 ">Ready for Handover</p>
                         <h4 className="font-bold text-slate-800">{so.poNumber}</h4>
                      </div>
                      <Badge className="bg-emerald-600 text-white border-none text-[11px] font-bold ">Handover Pending</Badge>
                   </div>
                   <CardContent className="p-4 space-y-3">
                      {/* Isinya ditampilkan, bukan cuma nomor PO-nya. Kartu yang cuma
                          bilang "menunggu" tanpa menyebut barangnya terbaca seperti
                          antrean kosong — dan gudang tidak tahu apa yang sedang menunggu. */}
                      <div className="rounded-2xl border border-emerald-50 bg-white divide-y">
                        {salesOrderItems.filter(i => i.salesOrderId === so.id).map(i => {
                          const product = products.find(p => p.id === i.productId)
                          return (
                            <div key={i.id} className="flex items-center justify-between px-3 py-2">
                              <span className="text-xs font-bold text-slate-700">{product?.name || i.productId}</span>
                              <span className="text-xs font-black text-slate-500">
                                {i.qtyFinal ?? i.qty} {product?.uom}
                              </span>
                            </div>
                          )
                        })}
                      </div>

                      <div className="bg-white rounded-2xl p-4 border border-emerald-50 text-xs font-bold text-slate-500 flex items-start gap-2">
                         <ShieldCheck className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                         {/* Kurir tidak memakai aplikasi — mereka cuma menerima kertasnya.
                             Kalimat lama menyuruh menunggu sesuatu yang tidak akan pernah
                             terjadi, dan PO-nya diam di sini sampai ada yang curiga. */}
                         <span>Serahkan barangnya ke kurir, lalu catat di layar <b>Serah Terima</b>.</span>
                      </div>

                      <Link href="/courier/handover">
                        <Button className="h-10 w-full rounded-xl bg-emerald-600 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700">
                          <Truck className="mr-2 h-4 w-4" /> Buka Serah Terima
                        </Button>
                      </Link>
                   </CardContent>
                 </Card>
               )
             })
           )}
        </div>
      </div>
    </div>
  )
}

"use client"

import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Package, ClipboardCheck, Circle, CheckCircle, Truck } from "lucide-react"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { WorksheetPrintButton } from "@/components/worksheet-print-button"
import { qty as qtyTeks } from "@/lib/worksheet-rows"

export default function HandoverPage() {
  const deliveries = useAppStore(state => state.deliveries)
  const salesOrders = useAppStore(state => state.salesOrders)
  const salesOrderItems = useAppStore(state => state.salesOrderItems)
  const products = useAppStore(state => state.products)
  const currentUser = useAppStore(state => state.currentUser)
  const updateSalesOrder = useAppStore(state => state.updateSalesOrder)
  const updateSalesOrderItem = useAppStore(state => state.updateSalesOrderItem)
  const updateDelivery = useAppStore(state => state.updateDelivery)
  const users = useAppStore(state => state.users)

  /**
   * Kurir yang membawa PO ini — diambil dari penugasan di Persiapan Pengiriman.
   *
   * Kurir tidak memakai aplikasi; yang menekan tombol serah terima selalu orang
   * kantor. Membaca "siapa yang login" berarti setiap surat jalan tercatat atas nama
   * orang kantor, dan riwayat pengiriman tiap kurir jadi kosong selamanya.
   */
  const kurirPO = (so?: { assignedCourierId?: string }) => so?.assignedCourierId || null
  const namaKurir = (id?: string | null) => users.find(u => u.id === id)?.name || null

  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())
  const [activeHandoverId, setActiveHandoverId] = useState<string | null>(null)
  const pendingPickup = salesOrders.filter(so => so.status === 'Siap Kirim')

  const handleHandoverSubmit = (soId: string) => {
    // Cari misi pengirimannya DULU. Tanpa ini kurir tidak punya rute sama sekali,
    // dan kalau status SO tetap dimajukan, PO nyangkut di 'Dikirim' selamanya —
    // tidak pernah sampai 'Terkirim', tidak pernah jadi tagihan. Sebelumnya blok
    // ini diam saja saat misinya tidak ada, lalu tetap melaporkan "berhasil".
    // Pilih misi yang masih berjalan, bukan yang sudah 'Terkirim' dari ronde
    // backorder sebelumnya — kalau tidak, handover membalik pengiriman yang sudah
    // selesai dan menelantarkan ronde baru di 'Menunggu'.
    const delivery = deliveries.find(d => d.salesOrderId === soId && d.status !== 'Terkirim')
    if (!delivery) {
      toast.error("Belum ada misi pengiriman untuk PO ini. Rilis dulu barangnya di Gudang › Goods Outbound.")
      return
    }

    const so = salesOrders.find(s => s.id === soId)
    const kurirId = kurirPO(so)
    // Serah terima tetap boleh jalan tanpa kurir yang ditunjuk — barangnya sudah di
    // depan mata — tapi jangan diam-diam, karena tanpa itu pengirimannya tidak punya
    // pemilik dan tidak muncul di riwayat siapa pun.
    if (!kurirId) {
      toast.warning("PO ini belum ditentukan kurirnya. Pilih dulu di Persiapan Pengiriman kalau mau tercatat.")
    }

    // Sync all checks to store before finalizing
    const items = salesOrderItems.filter(i => i.salesOrderId === soId)
    items.forEach(item => {
      if (checkedItems.has(item.id)) {
        updateSalesOrderItem(item.id, { isHandoverChecked: true })
      }
    })

    // 1. Update SO Status
    updateSalesOrder(soId, { 
      status: 'Dikirim',
      receivedBy: kurirId || currentUser?.id || 'system'
    })

    // 2. Update Delivery (sudah dipastikan ada di awal fungsi)
    updateDelivery(delivery.id, {
      status: 'Dikirim',
      courierId: kurirId || currentUser?.id || 'system'
    })

    toast.success("Serah terima berhasil! Silakan mulai perjalanan.")
    setActiveHandoverId(null)
  }

  const toggleHandoverCheck = (itemId: string) => {
    const next = new Set(checkedItems)
    if (next.has(itemId)) next.delete(itemId)
    else next.add(itemId)
    setCheckedItems(next)
  }

  return (
    <div className="space-y-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Serah Terima Barang</h2>
          <p className="text-xs font-bold text-slate-400  mt-1">
            Handover Checklist • {new Date().toLocaleDateString('id-ID')}
          </p>
        </div>
        <WorksheetPrintButton
          kind="serah-terima"
          title="LEMBAR SERAH TERIMA KURIR"
          label="Print Lembar Serah Terima"
          rows={pendingPickup.flatMap(so =>
            salesOrderItems
              .filter(i => i.salesOrderId === so.id)
              .map(i => {
                const product = products.find(p => p.id === i.productId)
                return {
                  group: `${so.poNumber} — ${namaKurir(so.assignedCourierId) || 'Kurir belum dipilih'}`,
                  cells: [
                    so.poNumber,
                    product?.name || i.productId,
                    qtyTeks(i.qtyFinal ?? i.qty, product?.uom),
                  ],
                }
              }),
          )}
        />
      </div>

      {pendingPickup.length === 0 ? (
        <Card className="liquid-card py-20 text-center border-dashed border-slate-200">
           <CardContent className="flex flex-col items-center gap-4">
              <Package className="w-16 h-16 text-slate-200" />
              <div>
                <h3 className="text-lg font-bold text-slate-400 uppercase">Belum ada barang siap pickup</h3>
                <p className="text-xs font-bold text-slate-300 mt-1 ">Silakan cek dashboard nanti.</p>
              </div>
           </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pendingPickup.map(so => (
            <Dialog key={so.id} open={activeHandoverId === so.id} onOpenChange={(open) => setActiveHandoverId(open ? so.id : null)}>
              <DialogTrigger nativeButton={false} render={
                <div className="p-6 rounded-2xl bg-white border border-slate-100 flex items-center justify-between hover:border-emerald-200 hover:shadow-sm transition-all cursor-pointer group">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center shadow-sm group-hover:bg-emerald-50 transition-colors">
                      <Package className="text-slate-400 w-6 h-6 group-hover:text-emerald-500 transition-colors" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 ">{so.poNumber}</p>
                      <p className="text-[11px] font-bold text-emerald-600  mt-0.5 px-2 py-0.5 bg-emerald-50 rounded-full inline-block">Siap Serah Terima</p>
                      <p className={`mt-1 text-[11px] font-bold  ${so.assignedCourierId ? 'text-slate-500' : 'text-amber-600'}`}>
                        {namaKurir(so.assignedCourierId) || 'Kurir belum dipilih'}
                      </p>
                    </div>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all">
                     <ClipboardCheck className="w-5 h-5" />
                  </div>
                </div>
              } />
              <DialogContent className="sm:max-w-md rounded-2xl border-none shadow-sm p-0 overflow-hidden">
                <div className="bg-emerald-600 p-8 text-white">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-bold text-white">Checklist Serah Terima</DialogTitle>
                      <p className="text-xs text-emerald-100 font-bold  italic mt-1">
                        Selesaikan pengecekan fisik barang bersama Gudang.
                      </p>
                    </DialogHeader>
                </div>
                
                <div className="p-8 space-y-3">
                  {salesOrderItems.filter(i => i.salesOrderId === so.id).map(item => {
                    const product = products.find(p => p.id === item.productId)
                    const isChecked = checkedItems.has(item.id)
                    return (
                      <div key={item.id} className={`flex items-center justify-between p-5 rounded-xl border transition-all ${isChecked ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                         <div className="flex items-center gap-4">
                            <button onClick={() => toggleHandoverCheck(item.id)} className="focus:outline-none">
                              {isChecked ? <CheckCircle className="w-7 h-7 text-emerald-500 fill-emerald-50" /> : <Circle className="w-7 h-7 text-slate-300" />}
                            </button>
                            <div>
                              <p className={`text-sm font-bold ${isChecked ? 'line-through text-slate-400' : 'text-slate-800'}`}>{product?.name}</p>
                              <p className="text-[11px] font-bold text-slate-400 uppercase">
                                {item.qtyFinal != null && item.qtyFinal < item.qty ? (
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
                      className="w-full h-16 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold uppercase text-sm tracking-widest shadow-sm"
                      disabled={salesOrderItems.filter(i => i.salesOrderId === so.id).some(i => !checkedItems.has(i.id))}
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

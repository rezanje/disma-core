"use client"

import { useMemo, useState } from "react"
import { useAppStore } from "@/lib/store"
import { applyClientReceipt, finalizeDeliveryAndInvoice } from "@/lib/dispatch"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MapPin, Navigation, PackageCheck, Truck, Camera, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import DocumentPreview from "@/components/delivery/DocumentPreview"
import { hasLocation, googleMapsUrl, sortStops } from "@/lib/delivery-route"
import { cn } from "@/lib/utils"

export default function CourierDashboard() {
  const currentUser = useAppStore(state => state.currentUser)
  const deliveries = useAppStore(state => state.deliveries)
  const salesOrders = useAppStore(state => state.salesOrders)
  const clients = useAppStore(state => state.clients)
  
  const updateDelivery = useAppStore(state => state.updateDelivery)
  const updateSalesOrder = useAppStore(state => state.updateSalesOrder)
  const setClientLocation = useAppStore(state => state.setClientLocation)

  const [activeDeliveryId, setActiveDeliveryId] = useState<string | null>(null)
  
  // Preview Modal State
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewType, setPreviewType] = useState<'SuratJalan' | 'BA'>('SuratJalan')
  const [selectedPo, setSelectedPo] = useState<string | null>(null)
  const [selectedSoId, setSelectedSoId] = useState<string | null>(null)
  const [finalizingDeliveryId, setFinalizingDeliveryId] = useState<string | null>(null)

  // Jatah kurir ini saja, dalam urutan yang disusun Admin PO.
  const pendingDeliveries = useMemo(() => {
    const active = deliveries.filter(d => ['Menunggu', 'Dikirim', 'Tunggu Konfirmasi'].includes(d.status))
    // Pengiriman yang belum direncanakan tetap terlihat semua kurir — kalau
    // tidak, pengiriman tanpa rencana jadi tidak terlihat siapa pun.
    const mine = active.filter(d => {
      const so = salesOrders.find(s => s.id === d.salesOrderId)
      const planned = so?.assignedCourierId
      return !planned || planned === currentUser?.id
    })
    return sortStops(mine.map(d => ({
      ...d,
      routeOrder: salesOrders.find(s => s.id === d.salesOrderId)?.routeOrder,
    })))
  }, [deliveries, salesOrders, currentUser?.id])

  const [deliveryNotes, setDeliveryNotes] = useState<Record<string, string>>({})
  const [savingLocationFor, setSavingLocationFor] = useState<string | null>(null)

  const handleSaveLocation = (clientId: string) => {
    if (!navigator.geolocation) {
      toast.error("HP ini tidak mendukung penyimpanan lokasi.")
      return
    }
    setSavingLocationFor(clientId)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await setClientLocation(clientId, pos.coords.latitude, pos.coords.longitude)
          toast.success("Titik lokasi klien tersimpan.")
        } catch {
          toast.error("Gagal menyimpan titik lokasi.")
        } finally {
          setSavingLocationFor(null)
        }
      },
      (err) => {
        setSavingLocationFor(null)
        // Diam saat izin ditolak membuat tombolnya terasa rusak — sebutkan sebabnya.
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Izin lokasi ditolak. Aktifkan dulu di pengaturan browser."
            : "Tidak bisa membaca lokasi. Pastikan GPS menyala."
        )
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  const handleStartDelivery = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    updateDelivery(id, { status: 'Dikirim', courierId: currentUser?.id || 'system' })
    toast.success("Rute pengiriman dimulai!")
  }

  const handleOpenPreview = (type: 'SuratJalan' | 'BA', po: string, soId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setPreviewType(type)
    setSelectedPo(po)
    setSelectedSoId(soId)
    setPreviewOpen(true)
  }

  const handleCompleteWithSignature = async (signatures: { courier: string, client: string }, adjustments?: Record<string, number>, archivedDocs?: { sj?: string, ba?: string }) => {
    if (activeDeliveryId && selectedSoId) {
       // Penyesuaian qty yang diterima klien: isinya pindah ke src/lib/dispatch.ts
       // supaya layar harian gabungan memakai alur yang sama.
      if (adjustments) {
        await applyClientReceipt(useAppStore.getState, selectedSoId,
          Object.entries(adjustments).map(([salesOrderItemId, qtyReceived]) => ({ salesOrderItemId, qtyReceived })))
      }

      // Update SO with raw signatures
      updateSalesOrder(selectedSoId, { 
        courierSignature: signatures.courier,
        clientSignature: signatures.client,
        archivedBaUrl: archivedDocs?.ba,
        archivedSuratJalanUrl: archivedDocs?.sj
      })

      // Move delivery to 'Tunggu Konfirmasi'
      updateDelivery(activeDeliveryId, { 
        status: 'Tunggu Konfirmasi',
        baUrl: signatures.client 
      })

      setPreviewOpen(false)
      toast.info("Tanda tangan tersimpan. Silakan konfirmasi status akhir.")
    }
  }

  const handleFinalizeDelivery = async (deliveryId: string, soId: string) => {
    const notes = deliveryNotes[deliveryId] || ""
    setFinalizingDeliveryId(deliveryId)

    try {
      await updateDelivery(deliveryId, { notes })
      await handleCompleteDelivery(deliveryId, soId)
    } catch (error) {
      console.error("Finalize delivery failed:", error)
      toast.error("Gagal konfirmasi terkirim. Coba lagi setelah refresh.")
    } finally {
      setFinalizingDeliveryId(null)
    }
  }

  const handleCompleteDelivery = async (deliveryId: string, soId: string) => {
    const so = salesOrders.find(s => s.id === soId)
    const client = clients.find(c => c.id === so?.clientId)
    if (!so || !client) return

    // Tutup pengiriman + terbitkan tagihan: satu alur di src/lib/dispatch.ts.
    const res = await finalizeDeliveryAndInvoice(useAppStore.getState, deliveryId, soId)
    if (!res.ok) {
      toast.error(res.error)
      return
    }

    setActiveDeliveryId(null)

    const phoneDigits = String(client.phone || '').replace(/[^0-9]/g, '')
    if (phoneDigits) {
      const waMessage = encodeURIComponent(`Halo ${client.companyName}, Berikut adalah konfirmasi digital untuk pengiriman PO ${so.poNumber}. Barang telah kami serah-terimakan dengan baik. Terima kasih! - DISMA Logistik`)
      const waUrl = `https://wa.me/${phoneDigits}?text=${waMessage}`

      toast.success("Pengiriman berhasil selesai!", {
        description: "Klik untuk kirim konfirmasi WA",
        action: {
          label: "WhatsApp",
          onClick: () => window.open(waUrl, '_blank')
        }
      })
      return
    }

    toast.success("Pengiriman berhasil selesai!")
  }

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-500 pb-20">
      <div className="bg-white dark:bg-slate-900 -mx-4 -mt-4 p-4 border-b shadow-sm mb-6 flex justify-between items-center px-6">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Rute Hari Ini</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{pendingDeliveries.length} Titik Pengiriman</p>
        </div>
      </div>

      {pendingDeliveries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mb-6 shadow-sm">
            <Truck className="w-10 h-10 text-emerald-500" />
          </div>
          <h3 className="font-black text-xl text-slate-800 uppercase tracking-tight">Tidak ada pengiriman</h3>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Semua order sudah aman terantar.</p>
        </div>
      ) : (
        <div className="space-y-6 px-2">
          {pendingDeliveries.map(delivery => {
            const so = salesOrders.find(s => s.id === delivery.salesOrderId)
            const client = clients.find(c => c.id === so?.clientId)
            const isExpanded = activeDeliveryId === delivery.id
            const isOngoing = delivery.status === 'Dikirim' || delivery.status === 'Tunggu Konfirmasi'
            const isWaitingFinal = delivery.status === 'Tunggu Konfirmasi'
            const isSubmittingFinal = finalizingDeliveryId === delivery.id

            if (!so || !client) return null

            return (
              <Card 
                key={delivery.id} 
                className={cn(
                  "overflow-hidden transition-all duration-500 rounded-[2.5rem] border-none",
                  isExpanded ? "shadow-2xl shadow-emerald-200/50 scale-[1.02]" : "shadow-xl shadow-slate-100/50"
                )}
                onClick={() => setActiveDeliveryId(isExpanded ? null : delivery.id)}
              >
                <div className={cn(
                  "p-6 border-b flex gap-4 items-center cursor-pointer",
                  isOngoing ? "bg-emerald-50/30" : "bg-white"
                )}>
                  <div className={cn(
                    "w-14 h-14 rounded-3xl flex items-center justify-center shrink-0 shadow-sm",
                    isOngoing ? "bg-emerald-100 text-emerald-600" : "bg-slate-50 text-slate-400"
                  )}>
                    {isOngoing ? <Navigation className="w-6 h-6 fill-current" /> : <MapPin className="w-6 h-6" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-lg text-slate-800 tracking-tight leading-tight mb-1">{client.companyName}</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest truncate">{client.address}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={cn(
                        "text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter",
                        isWaitingFinal ? "bg-amber-100 text-amber-600 animate-pulse" : "bg-emerald-100 text-emerald-600"
                      )}>
                        {isWaitingFinal ? "Menunggu Konfirmasi Kurir" : `PO: ${so.poNumber}`}
                      </span>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-6 bg-slate-50/50 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                        <span className="text-slate-400 font-black uppercase text-[9px] tracking-widest block mb-1">PIC Kontak</span>
                        <span className="font-black text-slate-800 text-sm">{client.picName}</span>
                      </div>
                      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                        <span className="text-slate-400 font-black uppercase text-[9px] tracking-widest block mb-1">No. Telepon</span>
                        <a href={`tel:${client.phone}`} onClick={e => e.stopPropagation()} className="font-black text-emerald-600 text-sm flex items-center gap-1">
                          {client.phone} <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    {/* Navigasi & perekaman titik. Link Maps biasa — tanpa layanan berbayar. */}
                    <div className="grid grid-cols-2 gap-4">
                      {hasLocation(client) ? (
                        <a
                          href={googleMapsUrl(client.latitude!, client.longitude!)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center gap-2 font-black text-sky-600 text-xs uppercase tracking-widest"
                        >
                          <Navigation className="w-4 h-4" /> Buka di Maps
                        </a>
                      ) : (
                        <div className="bg-white p-4 rounded-3xl shadow-sm border border-dashed border-slate-200 flex items-center justify-center text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">
                          Lokasi belum tersimpan
                        </div>
                      )}
                      <Button
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); handleSaveLocation(client.id) }}
                        disabled={savingLocationFor === client.id}
                        className="h-auto p-4 rounded-3xl border border-slate-100 bg-white font-black text-[10px] uppercase tracking-widest text-emerald-600"
                      >
                        <MapPin className="w-4 h-4 mr-2" />
                        {savingLocationFor === client.id ? 'Menyimpan...' : 'Simpan Titik Ini'}
                      </Button>
                    </div>

                    {client.locationNote && (
                      <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl">
                        <span className="text-amber-600 font-black uppercase text-[9px] tracking-widest block mb-0.5">Patokan</span>
                        <span className="font-bold text-slate-700 text-xs">{client.locationNote}</span>
                      </div>
                    )}

                    {!isOngoing ? (
                      <Button 
                        className="w-full h-16 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-[0.2em] rounded-3xl shadow-2xl shadow-emerald-500/30 transition-all active:scale-95"
                        onClick={(e) => handleStartDelivery(delivery.id, e)}
                      >
                        <Truck className="w-6 h-6 mr-3" /> Mulai Perjalanan
                      </Button>
                    ) : (
                      <div className="space-y-4 pt-4 border-t border-slate-200">
                        <h4 className="font-black text-xs uppercase tracking-[0.2em] text-emerald-600 flex items-center gap-2">
                          <PackageCheck className="w-4 h-4" /> Progress Pengantaran
                        </h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                           <Button 
                             disabled={isWaitingFinal}
                             variant="outline" 
                             className="h-20 border-2 border-dashed border-slate-200 bg-white rounded-[2rem] flex flex-col items-center justify-center group hover:border-emerald-400 hover:bg-emerald-50 transition-all"
                             onClick={(e) => {
                               e.stopPropagation()
                               handleOpenPreview('BA', so.poNumber, so.id, e)
                             }}
                           >
                             <Camera className={cn("w-6 h-6 text-slate-400", !isWaitingFinal && "group-hover:text-emerald-500 group-hover:scale-110")} />
                             <span className="font-black uppercase text-[8px] tracking-widest text-slate-400 mt-1">E-Sign BA</span>
                           </Button>
                           <Button 
                             variant="outline" 
                             className="h-20 border-2 border-dashed border-slate-200 bg-white rounded-[2rem] flex flex-col items-center justify-center"
                             onClick={(e) => {
                               e.stopPropagation()
                               handleOpenPreview('SuratJalan', so.poNumber, so.id, e)
                             }}
                           >
                             <ExternalLink className="w-6 h-6 text-slate-400" />
                             <span className="font-black uppercase text-[8px] tracking-widest text-slate-400 mt-1">Surat Jalan</span>
                           </Button>
                        </div>

                        <div className="space-y-2">
                           <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-4">Catatan Pengiriman (Opsional)</span>
                           <textarea 
                             placeholder="Misal: Barang dititip di security, dsb..."
                             className="w-full rounded-[2rem] border-none bg-white p-6 text-sm font-bold shadow-inner focus:ring-4 focus:ring-emerald-500/10 min-h-[100px] transition-all"
                             value={deliveryNotes[delivery.id] || ""}
                             onChange={(e) => setDeliveryNotes({ ...deliveryNotes, [delivery.id]: e.target.value })}
                             onClick={(e) => e.stopPropagation()}
                           />
                        </div>

                        <Button 
                          className={cn(
                            "w-full h-20 text-white font-black uppercase tracking-[0.2em] rounded-[2.5rem] shadow-2xl transition-all active:scale-95 text-lg",
                            isWaitingFinal ? "bg-amber-500 hover:bg-amber-600 animate-pulse" : "bg-slate-900 hover:bg-black"
                          )}
                          disabled={isSubmittingFinal}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (isWaitingFinal) {
                              await handleFinalizeDelivery(delivery.id, so.id);
                            } else {
                              toast.warning("Harap selesaikan tanda tangan digital (BA) terlebih dahulu.");
                            }
                          }}
                        >
                          {isSubmittingFinal ? "Memproses..." : isWaitingFinal ? "Konfirmasi Terkirim ✓" : "Selesai & Kirim Laporan"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Document Preview & Signing Modal */}
      {selectedPo && selectedSoId && (
        <DocumentPreview 
          isOpen={previewOpen}
          onClose={() => setPreviewOpen(false)}
          type={previewType}
          poNumber={selectedPo}
          soId={selectedSoId}
          onComplete={handleCompleteWithSignature}
        />
      )}
    </div>
  )
}

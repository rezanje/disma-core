"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { recordDeliveryAndInvoice } from "@/lib/accounting"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MapPin, Navigation, PackageCheck, Truck, Camera, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import { generateSuratJalan, generateBA } from "@/lib/pdf"
import DocumentPreview from "@/components/delivery/DocumentPreview"
import { cn } from "@/lib/utils"

export default function CourierDashboard() {
  const currentUser = useAppStore(state => state.currentUser)
  const deliveries = useAppStore(state => state.deliveries)
  const salesOrders = useAppStore(state => state.salesOrders)
  const salesOrderItems = useAppStore(state => state.salesOrderItems)
  const clients = useAppStore(state => state.clients)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  
  const updateDelivery = useAppStore(state => state.updateDelivery)
  const updateSalesOrder = useAppStore(state => state.updateSalesOrder)
  const addInvoice = useAppStore(state => state.addInvoice)
  const addPendingReturn = useAppStore(state => state.addPendingReturn)

  const [activeDeliveryId, setActiveDeliveryId] = useState<string | null>(null)
  
  // Preview Modal State
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewType, setPreviewType] = useState<'SuratJalan' | 'BA'>('SuratJalan')
  const [selectedPo, setSelectedPo] = useState<string | null>(null)
  const [selectedSoId, setSelectedSoId] = useState<string | null>(null)

  // Get all active deliveries (Menunggu & Dikirim & Tunggu Konfirmasi)
  const pendingDeliveries = deliveries.filter(d => ['Menunggu', 'Dikirim', 'Tunggu Konfirmasi'].includes(d.status))

  const [deliveryNotes, setDeliveryNotes] = useState<Record<string, string>>({})

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

  const handleCompleteWithSignature = (signatures: { courier: string, client: string }, adjustments?: Record<string, number>, archivedDocs?: { sj?: string, ba?: string }) => {
    if (activeDeliveryId && selectedSoId) {
       // Apply adjustments...
       if (adjustments) {
        Object.entries(adjustments).forEach(([itemId, finalQty]) => {
          const item = salesOrderItems.find(i => i.id === itemId)
          if (item && item.qty !== finalQty) {
            useAppStore.getState().updateSalesOrderItem(itemId, { 
              qtyFinal: finalQty,
              subtotalFinal: finalQty * item.unitPrice,
              qtyAdjustmentReason: (item.qtyAdjustmentReason ? item.qtyAdjustmentReason + " + " : "") + "Reject di Lokasi"
            })
          }
        })
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

  const handleFinalizeDelivery = (deliveryId: string, soId: string) => {
    const notes = deliveryNotes[deliveryId] || ""
    updateDelivery(deliveryId, { notes })
    handleCompleteDelivery(deliveryId, soId)
  }

  const handleCompleteDelivery = (deliveryId: string, soId: string) => {
    const so = salesOrders.find(s => s.id === soId)
    const client = clients.find(c => c.id === so?.clientId)
    if (!so || !client) return

    const soItems = salesOrderItems.filter(i => i.salesOrderId === soId)
    const totalRevenue = soItems.reduce((sum, item) => {
      const finalQty = item.qtyFinal ?? item.qty
      return sum + (finalQty * item.unitPrice)
    }, 0)

    // 1. Update Delivery
    updateDelivery(deliveryId, { 
      status: 'Awaiting Audit', 
      deliveryDate: new Date().toISOString()
    })

    // 2. Update SO
    updateSalesOrder(soId, { status: 'Awaiting Audit' })

    // 3. Generate Invoice (Draft)
    const invoiceId = uuidv4()
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + (client.paymentTermDays || 30))

    addInvoice({
      id: invoiceId,
      salesOrderId: soId,
      clientId: client.id,
      issueDate: new Date().toISOString(),
      dueDate: dueDate.toISOString(),
      totalAmount: totalRevenue,
      amountPaid: 0,
      status: 'Unpaid'
    })

    // 4. Update delivery with invoice link
    updateDelivery(deliveryId, { invoiceId })

    // 5. Handling Returns & Rejections
    soItems.forEach(item => {
      const finalQty = item.qtyFinal ?? item.qty
      const rejectedQty = item.qty - finalQty

      if (rejectedQty > 0) {
        addPendingReturn({
          id: uuidv4(),
          productId: item.productId,
          originalSoId: soId,
          qty: rejectedQty,
          reason: item.qtyAdjustmentReason || "Reject di Customer",
          date: new Date().toISOString(),
          status: 'Pending QC'
        })
      }
    })

    setActiveDeliveryId(null)
    
    const waMessage = encodeURIComponent(`Halo ${client.companyName}, Berikut adalah konfirmasi digital untuk pengiriman PO ${so.poNumber}. Barang telah kami serah-terimakan dengan baik. Terima kasih! - DISMA Logistik`)
    const waUrl = `https://wa.me/${client.phone.replace(/[^0-9]/g, '')}?text=${waMessage}`
    
    toast.success("Pengiriman Berhasil Selesai!", {
      description: "Klik untuk kirim konfirmasi WA",
      action: {
        label: "WhatsApp",
        onClick: () => window.open(waUrl, '_blank')
      }
    })
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
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isWaitingFinal) {
                              handleFinalizeDelivery(delivery.id, so.id);
                            } else {
                              toast.warning("Harap selesaikan tanda tangan digital (BA) terlebih dahulu.");
                            }
                          }}
                        >
                          {isWaitingFinal ? "Konfirmasi Terkirim ✓" : "Selesai & Kirim Laporan"}
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

"use client"

import { useState, useRef, useEffect } from "react"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { X, Eraser, Check, Loader2, Download, User, Truck, Share2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { generateSuratJalan, generateBA } from "@/lib/pdf"
import { cn } from "@/lib/utils"

interface DocumentPreviewProps {
  isOpen: boolean
  onClose: () => void
  type: 'SuratJalan' | 'BA'
  poNumber: string
  soId?: string
  onComplete?: (signatures: { courier: string, client: string }, adjustments?: Record<string, number>, archivedDocs?: { sj?: string, ba?: string }) => void
}

export default function DocumentPreview({ isOpen, onClose, type, poNumber, soId, onComplete }: DocumentPreviewProps) {
  const [activeSigner, setActiveSigner] = useState<'courier' | 'client'>('courier')
  const courierCanvasRef = useRef<HTMLCanvasElement>(null)
  const clientCanvasRef = useRef<HTMLCanvasElement>(null)
  
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignedCourier, setHasSignedCourier] = useState(false)
  const [hasSignedClient, setHasSignedClient] = useState(false)
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  // Signatures Data
  const [courierSig, setCourierSig] = useState<string | null>(null)
  const [clientSig, setClientSig] = useState<string | null>(null)
  
  // Real-time adjustments
  const allSoItems = useAppStore(state => state.salesOrderItems)
  const products = useAppStore(state => state.products)
  const [itemAdjustments, setItemAdjustments] = useState<Record<string, number>>({})

  useEffect(() => {
    if (isOpen && soId) {
      const soItems = allSoItems.filter(i => i.salesOrderId === soId)
      const initialAdjustments: Record<string, number> = {}
      soItems.forEach(item => {
        initialAdjustments[item.id] = item.qtyFinal ?? item.qty
      })
      setItemAdjustments(initialAdjustments)
    }
  }, [isOpen, soId])

  useEffect(() => {
    if (isOpen) {
      refreshPreview(courierSig, clientSig, itemAdjustments)
    }
  }, [isOpen, type, poNumber, itemAdjustments])

  const refreshPreview = (cS?: string | null, cls?: string | null, adjustments?: Record<string, number>) => {
    setIsGenerating(true)
    setTimeout(() => {
      const sigs = { 
        courier: cS || undefined, 
        client: cls || undefined 
      }
      
      // We pass the adjustments to the generator (or it reads from store - but since store isn't updated yet, we might need to handle this in pdf.ts or here)
      const dataUrl = type === 'SuratJalan' 
        ? generateSuratJalan(poNumber, sigs, 'dataurl', adjustments)
        : generateBA(poNumber, sigs, 'dataurl', adjustments)
      
      setPdfDataUrl(dataUrl as string)
      setIsGenerating(false)
    }, 100)
  }

  const getCanvas = () => activeSigner === 'courier' ? courierCanvasRef.current : clientCanvasRef.current

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = getCanvas()
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top

    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    setIsDrawing(true)
  }

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false)
      const canvas = getCanvas()
      if (!canvas) return
      const sigData = canvas.toDataURL('image/png')
      
      if (activeSigner === 'courier') {
        setHasSignedCourier(true)
        setCourierSig(sigData || null)
        refreshPreview(sigData, clientSig)
      } else {
        setHasSignedClient(true)
        setClientSig(sigData || null)
        refreshPreview(courierSig, sigData)
      }
    }
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    const canvas = getCanvas()
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const x = ('touches' in e) ? (e as React.TouchEvent).touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left
    const y = ('touches' in e) ? (e as React.TouchEvent).touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top

    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const clearCanvas = () => {
    const canvas = getCanvas()
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    if (activeSigner === 'courier') {
      setHasSignedCourier(false)
      setCourierSig(null)
      refreshPreview(null, clientSig)
    } else {
      setHasSignedClient(false)
      setClientSig(null)
      refreshPreview(courierSig, null)
    }
  }

  const handleSave = () => {
    if (courierSig && clientSig && onComplete) {
      // For Tukar Faktur, we need to save BOTH documents into the archive
      const sigs = { courier: courierSig, client: clientSig }
      
      // We generate both here
      // SJ might have adjustments already applied to the items in store by the caller before this or from itemAdjustments
      const sjDataUrl = generateSuratJalan(poNumber, sigs, 'dataurl', itemAdjustments) as string
      const baDataUrl = generateBA(poNumber, sigs, 'dataurl', itemAdjustments) as string

      onComplete(
        sigs, 
        itemAdjustments, 
        { sj: sjDataUrl, ba: baDataUrl }
      )
    }
  }

  const handleAdjustQty = (itemId: string, val: string) => {
    const num = parseFloat(val) || 0
    setItemAdjustments(prev => ({ ...prev, [itemId]: num }))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-[98vw] h-[95vh] flex flex-col p-0 overflow-hidden border-none bg-slate-100">
        <DialogHeader className="p-4 bg-white border-b flex flex-row items-center justify-between space-y-0 shadow-sm z-20">
          <div className="flex items-center gap-4">
            <DialogTitle className="text-xl font-black uppercase text-slate-800 tracking-tight">
              E-Serah Terima: {type === 'BA' ? 'Berita Acara' : 'Surat Jalan'}
            </DialogTitle>
            <div className="h-6 w-px bg-slate-200" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{poNumber}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5 text-slate-400" />
          </Button>
        </DialogHeader>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* PDF Preview Area */}
          <div className="flex-1 bg-slate-300 relative overflow-hidden flex items-center justify-center p-4">
            <div className="w-full max-w-[800px] h-full bg-white shadow-2xl rounded-sm overflow-hidden relative">
              {isGenerating && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm z-10 transition-all">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rendering Digital Signature...</p>
                  </div>
                </div>
              )}
              {pdfDataUrl && (
                <iframe 
                  src={`${pdfDataUrl}#toolbar=0&navpanes=0&scrollbar=0`} 
                  className="w-full h-full border-none"
                  title="PDF Preview"
                />
              )}
            </div>
          </div>

          {/* Signature Panel */}
          <div className="w-full lg:w-[400px] bg-white border-l flex flex-col shadow-2xl z-10">
            <div className="p-6 border-b bg-slate-50/50">
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] mb-4">Pilih Penandatangan</h4>
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl">
                <button 
                  onClick={() => setActiveSigner('courier')}
                  className={cn(
                    "flex flex-col items-center gap-2 py-3 rounded-xl transition-all font-black uppercase text-[9px] tracking-widest",
                    activeSigner === 'courier' ? "bg-white text-emerald-600 shadow-sm ring-1 ring-slate-200" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <Truck className={cn("w-5 h-5", activeSigner === 'courier' ? "text-emerald-500" : "text-slate-300")} />
                  1. TTD Kurir
                  {hasSignedCourier && <Check className="w-3 h-3 text-emerald-500" />}
                </button>
                <button 
                  onClick={() => setActiveSigner('client')}
                  className={cn(
                    "flex flex-col items-center gap-2 py-3 rounded-xl transition-all font-black uppercase text-[9px] tracking-widest",
                    activeSigner === 'client' ? "bg-white text-emerald-600 shadow-sm ring-1 ring-slate-200" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <User className={cn("w-5 h-5", activeSigner === 'client' ? "text-emerald-500" : "text-slate-300")} />
                  2. TTD Klien
                  {hasSignedClient && <Check className="w-3 h-3 text-emerald-500" />}
                </button>
              </div>
            </div>

            {/* Checklist Adjustment Area (Only for BA) */}
            {type === 'BA' && (
              <div className="p-6 border-b bg-amber-50/30">
                <h4 className="text-xs font-black uppercase text-amber-600 tracking-[0.2em] mb-3 flex items-center gap-2">
                   <Check className="w-4 h-4" /> Checklist Barang (Revisi Qty)
                </h4>
                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2">
                  {allSoItems.filter(i => i.salesOrderId === soId).map(item => {
                    const product = products.find(p => p.id === item.productId)
                    const currentVal = itemAdjustments[item.id] ?? item.qty
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-100">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black truncate">{product?.name}</p>
                          <p className="text-[8px] text-slate-400 font-bold uppercase">PO: {item.qty} {product?.uom}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number"
                            className="w-16 h-8 bg-slate-50 border border-slate-200 rounded-lg text-center text-xs font-black focus:ring-2 focus:ring-amber-500 outline-none"
                            value={currentVal}
                            onChange={(e) => handleAdjustQty(item.id, e.target.value)}
                          />
                          <span className="text-[9px] font-black text-slate-400 uppercase">{product?.uom}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="mt-2 text-[8px] font-black text-amber-500 uppercase tracking-widest italic leading-tight">
                  * Isi kolom di atas jika ada barang yang direject/dikembalikan klien saat serah terima.
                </p>
              </div>
            )}

            <div className="flex-1 p-8 flex flex-col items-center justify-center gap-6">
              <div className="w-full text-center space-y-2">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                  {activeSigner === 'courier' ? 'Tanda Tangan Pengirim' : 'Tanda Tangan Penerima'}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  {activeSigner === 'courier' ? '(Tim Kurir DISMA)' : '(Nama terang sesuai identitas)'}
                </p>
              </div>

              <div className="relative w-full aspect-[4/3] max-w-[320px] bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] overflow-hidden group touch-none cursor-crosshair">
                <canvas
                  ref={courierCanvasRef}
                  width={320}
                  height={240}
                  className={cn("absolute inset-0 w-full h-full transition-opacity duration-300", activeSigner === 'courier' ? 'opacity-100 z-10' : 'opacity-0 z-0')}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                <canvas
                  ref={clientCanvasRef}
                  width={320}
                  height={240}
                  className={cn("absolute inset-0 w-full h-full transition-opacity duration-300", activeSigner === 'client' ? 'opacity-100 z-10' : 'opacity-0 z-0')}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                
                {((activeSigner === 'courier' && !hasSignedCourier) || (activeSigner === 'client' && !hasSignedClient)) && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                     <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400 rotate-[-15deg]">Sign Here</p>
                  </div>
                )}
              </div>

              <Button 
                variant="ghost" 
                onClick={clearCanvas}
                className="text-[10px] font-black uppercase text-slate-400 hover:text-rose-500 tracking-widest"
              >
                <Eraser className="w-4 h-4 mr-2" /> Reset Tanda Tangan
              </Button>
            </div>

            <div className="p-8 border-t bg-slate-50/80">
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <Button 
                    className={cn(
                      "flex-1 h-14 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl transition-all flex items-center justify-center gap-2",
                      hasSignedCourier && hasSignedClient 
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/30" 
                        : "bg-slate-200 text-slate-400 cursor-not-allowed"
                    )}
                    disabled={!hasSignedCourier || !hasSignedClient}
                    onClick={handleSave}
                  >
                    <Check className="w-6 h-6" /> Simpan & Download
                  </Button>
                  {hasSignedCourier && hasSignedClient && (
                    <Button
                      variant="outline"
                      className="h-14 w-14 rounded-2xl border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                      onClick={() => {
                        handleSave();
                        const store = useAppStore.getState();
                        const so = store.salesOrders.find(s => s.poNumber === poNumber);
                        const client = store.clients.find(c => c.id === so?.clientId);
                        if (client) {
                           const msg = encodeURIComponent(`Halo ${client.companyName}, Berikut konfirmasi serah terima digital untuk PO ${poNumber}. Terima kasih!`);
                           window.open(`https://wa.me/${client.phone.replace(/[^0-9]/g, '')}?text=${msg}`, '_blank');
                        }
                      }}
                    >
                      <Share2 className="w-6 h-6" />
                    </Button>
                  )}
                </div>
                <p className="text-center text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  Akan otomatis mengunduh salinan arsip dokumen
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

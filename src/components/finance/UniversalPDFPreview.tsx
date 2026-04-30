"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { X, Download, Share2, Mail, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { generateInvoicePDF, generateTukarFakturBundle } from "@/lib/pdf"
import { useAppStore } from "@/lib/store"
import { formatRupiah } from "@/lib/utils"

interface UniversalPDFPreviewProps {
  isOpen: boolean
  onClose: () => void
  invoiceId: string
  isConsolidated?: boolean
}

export default function UniversalPDFPreview({ isOpen, onClose, invoiceId, isConsolidated }: UniversalPDFPreviewProps) {
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const invoices = useAppStore(state => state.invoices)
  const clients = useAppStore(state => state.clients)

  const inv = invoices.find(i => i.id === invoiceId)
  const client = clients.find(c => c.id === inv?.clientId)

  useEffect(() => {
    if (isOpen && invoiceId) {
      setIsGenerating(true)
      setTimeout(() => {
        const dataUrl = isConsolidated 
          ? generateTukarFakturBundle(invoiceId, 'dataurl')
          : generateInvoicePDF(invoiceId, 'dataurl')
        
        setPdfDataUrl(dataUrl as string)
        setIsGenerating(false)
      }, 300)
    } else {
      setPdfDataUrl(null)
    }
  }, [isOpen, invoiceId, isConsolidated])

  const handleDownload = () => {
    if (isConsolidated) generateTukarFakturBundle(invoiceId, 'save')
    else generateInvoicePDF(invoiceId, 'save')
  }

  const handleWA = () => {
    if (!client || !inv) return
    const message = encodeURIComponent(`Halo ${client.companyName}, Berikut adalah tagihan ${isConsolidated ? 'Tukar Faktur' : 'Invoice'} Anda sebesar ${formatRupiah(inv.totalAmount)}. No: ${inv.id.substring(0,8)}. Terima kasih!`)
    window.open(`https://wa.me/${client.phone.replace(/[^0-9]/g, '')}?text=${message}`, '_blank')
  }

  const handleEmail = () => {
    if (!client || !inv) return
    const subject = encodeURIComponent(`[INVOICE] Tagihan ${isConsolidated ? 'Tukar Faktur' : 'Invoice'} - ${client.companyName}`)
    const body = encodeURIComponent(`Yth. Finance ${client.companyName},\n\nTerlampir rincian tagihan untuk periode transaksi Anda.\nTotal Tagihan: ${formatRupiah(inv.totalAmount)}\nNo Invoice: ${inv.id}\n\nTerima kasih.`)
    window.location.href = `mailto:${client.email || ''}?subject=${subject}&body=${body}`
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden border-none bg-slate-900 shadow-2xl rounded-[2.5rem]">
        <DialogHeader className="p-6 bg-white shrink-0 border-b flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black uppercase text-slate-800 tracking-tight">
                Preview Dokumen Penagihan
              </DialogTitle>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {isConsolidated ? 'Consolidated Bundle (Tukar Faktur)' : 'Standard Invoice'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-slate-100">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden relative bg-slate-800 flex items-center justify-center p-4">
           {isGenerating && (
             <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm">
                <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
                <p className="text-white font-black uppercase text-xs tracking-widest">Generating PDF Bundle...</p>
             </div>
           )}
           {pdfDataUrl && (
             <div className="w-full max-w-[850px] h-full bg-white shadow-2xl rounded-sm overflow-hidden border border-slate-700">
               <iframe 
                 src={`${pdfDataUrl}#toolbar=0&navpanes=0&scrollbar=0`} 
                 className="w-full h-full border-none"
                 title="PDF Preview"
               />
             </div>
           )}
        </div>

        <div className="p-8 bg-white border-t flex flex-col sm:flex-row gap-4 justify-between items-center shrink-0">
          <div className="space-y-1 text-center sm:text-left">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tujuan Penagihan</p>
            <p className="text-sm font-black text-slate-800 uppercase">{client?.companyName}</p>
          </div>
          
          <div className="flex gap-3">
             <Button 
                onClick={handleDownload}
                className="bg-slate-900 hover:bg-black text-white px-8 h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center gap-3 transition-all active:scale-95"
             >
                <Download className="w-4 h-4" /> Download PDF
             </Button>
             
             <div className="flex gap-2">
                <Button 
                   onClick={handleWA}
                   className="bg-emerald-500 hover:bg-emerald-600 text-white w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center transition-all active:scale-95"
                >
                   <Share2 className="w-5 h-5" />
                </Button>
                <Button 
                   onClick={handleEmail}
                   className="bg-blue-500 hover:bg-blue-600 text-white w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center transition-all active:scale-95"
                >
                   <Mail className="w-5 h-5" />
                </Button>
             </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

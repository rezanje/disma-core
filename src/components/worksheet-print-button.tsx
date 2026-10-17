"use client"

// Tombol cetak lembar kerja lapangan.
//
// Sourcing bekerja 23:00-09:00, kurir dari 06:00, yang mengetik ke aplikasi baru masuk
// jam 10. Terima barang, QC, barang keluar, dan serah terima semuanya terjadi saat tidak
// ada satu pun orang kantor di tempat — jadi yang dipakai di lapangan adalah kertas, dan
// aplikasinya menyusul menyalin. Komponen ini yang mencetak kertasnya, satu bentuk untuk
// semua tahap supaya orang yang sama tidak perlu menghafal empat gaya lembar.

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PdfCanvasPreview } from "@/components/pdf-canvas-preview"
import { generateWorksheetPDFDataUrl, type WorksheetRow } from "@/lib/pdf"
import type { WorksheetKind } from "@/lib/worksheet-columns"
import { Printer, Download, X, FileText } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function WorksheetPrintButton({
  kind,
  title,
  rows,
  label = "Print Lembar Kerja",
  catatanOperasional,
  className,
  paperNumber: controlledPaperNumber,
  showPaperNumberInput = true,
}: {
  kind: WorksheetKind
  title: string
  rows: WorksheetRow[]
  label?: string
  catatanOperasional?: boolean
  className?: string
  paperNumber?: string
  showPaperNumberInput?: boolean
}) {
  const [localPaperNumber,setPaperNumber]=useState('')
  const paperNumber=controlledPaperNumber??localPaperNumber
  const [pdf, setPdf] = useState<string | null>(null)

  const buka = () => {
    if (rows.length === 0) {
      toast.error("Belum ada barang untuk dicetak.")
      return
    }
    const number=paperNumber.trim()||`${kind.toUpperCase()}-${new Date().toISOString().slice(0,10)}-${crypto.randomUUID().slice(0,8)}`
    setPaperNumber(number)
    setPdf(generateWorksheetPDFDataUrl(kind, `${title} · ${number}`, rows, { catatanOperasional }))
  }

  return (
    <>
      {showPaperNumberInput&&<Input aria-label="Nomor berkas / revisi cetak" placeholder="Nomor berkas / revisi (otomatis jika kosong)" value={paperNumber} onChange={e=>setPaperNumber(e.target.value)} className="max-w-xs"/>}
      <Button
        variant="outline"
        onClick={buka}
        className={cn("h-10 rounded-xl text-[10px] font-black uppercase tracking-widest", className)}
      >
        <Printer className="mr-2 h-4 w-4" />
        {label}
      </Button>

      <Dialog open={!!pdf} onOpenChange={open => !open && setPdf(null)}>
        <DialogContent className="max-w-[96vw] sm:max-w-[96vw] w-[96vw] h-[96vh] p-0 rounded-[2rem] overflow-hidden border-none bg-slate-900 shadow-2xl flex flex-col">
          <DialogHeader className="shrink-0 flex-row items-center justify-between space-y-0 bg-slate-900 p-6 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black tracking-tight">{title}</DialogTitle>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Kolom bergaris diisi tulis tangan di lapangan
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
              onClick={() => setPdf(null)}
            >
              <X className="h-5 w-5" />
            </Button>
          </DialogHeader>

          <div className="flex-1 overflow-hidden bg-slate-800 p-4">
            {pdf && <PdfCanvasPreview url={pdf} />}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/10 bg-slate-900 p-5">
            <Button
              variant="outline"
              className="h-11 rounded-xl border-white/10 bg-white/10 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white hover:text-slate-900"
              onClick={() => {
                if (!pdf) return
                const w = window.open(pdf, '_blank')
                w?.addEventListener('load', () => w.print())
              }}
            >
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            <Button
              className="h-11 rounded-xl bg-white text-[10px] font-black uppercase tracking-widest text-slate-900 hover:bg-slate-100"
              onClick={() => {
                if (!pdf) return
                const link = document.createElement('a')
                link.href = pdf
                link.download = `${title.replace(/\s+/g, '_')}.pdf`
                link.click()
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Download PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

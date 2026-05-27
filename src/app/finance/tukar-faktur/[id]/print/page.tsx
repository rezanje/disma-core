"use client"

import { use, useEffect, useMemo } from "react"
import Link from "next/link"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Printer, ArrowLeft } from "lucide-react"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0)
}
function formatDate(iso?: string) {
  if (!iso) return "-"
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })
}

export default function TukarFakturPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const tf = useAppStore(s => s.tukarFakturs.find(t => t.id === id))
  const clients = useAppStore(s => s.clients)
  const invoices = useAppStore(s => s.invoices)

  const linkedInvoices = useMemo(() =>
    invoices.filter(inv => inv.tukarFakturId === id).sort((a, b) => a.issueDate.localeCompare(b.issueDate)),
    [invoices, id]
  )

  useEffect(() => {
    if (tf && linkedInvoices.length > 0) {
      const t = setTimeout(() => window.print(), 600)
      return () => clearTimeout(t)
    }
  }, [tf, linkedInvoices.length])

  if (!tf) {
    return <div className="p-10 text-slate-500">TF tidak ditemukan. <Link href="/finance/tukar-faktur" className="underline">Kembali</Link></div>
  }

  const client = clients.find(c => c.id === tf.clientId)
  const earliestDue = linkedInvoices.reduce<string | null>((min, inv) => {
    if (!inv.dueDate) return min
    if (!min) return inv.dueDate
    return inv.dueDate < min ? inv.dueDate : min
  }, null)

  return (
    <div className="bg-slate-100 min-h-screen">
      <style jsx global>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
          aside, nav, header.app-header { display: none !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      <div className="no-print sticky top-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between z-50">
        <Link href={`/finance/tukar-faktur/${id}`} className="text-sm text-slate-500 hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Kembali ke detail
        </Link>
        <Button onClick={() => window.print()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Printer className="w-4 h-4 mr-2" /> Print / Save PDF
        </Button>
      </div>

      <div className="p-8">
        <div className="print-page bg-white mx-auto max-w-[820px] p-12 shadow-2xl text-[#1e293b]">
          {/* KOP */}
          <div className="border-b-4 border-[#0f172a] pb-6 mb-8 flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-black text-[#0f172a] uppercase leading-none">DISMA FRESH</h1>
              <p className="text-[10px] font-bold text-[#94a3b8] uppercase mt-1 tracking-widest">
                Premium Production & Logistics · Warehouse · B2B
              </p>
            </div>
            <div className="text-right">
              <h2 className="text-2xl font-black uppercase leading-none text-[#0f172a]">TUKAR FAKTUR</h2>
              <p className="text-xs font-bold text-[#64748b] mt-2">No: <span className="text-[#0f172a]">{tf.tfNumber}</span></p>
              <p className="text-xs font-bold text-[#64748b]">Tanggal: <span className="text-[#0f172a]">{formatDate(tf.issueDate)}</span></p>
            </div>
          </div>

          {/* CLIENT INFO */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Kepada</p>
              <p className="font-black text-lg">{client?.companyName || tf.clientId}</p>
              {client?.address && <p className="text-xs text-slate-600 mt-1 leading-relaxed">{client.address}</p>}
              {client?.picName && <p className="text-xs text-slate-500 mt-1">PIC: {client.picName}</p>}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Periode</p>
              <p className="font-bold text-sm">{formatDate(tf.periodStart)} – {formatDate(tf.periodEnd)}</p>
              {earliestDue && (
                <>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-3 mb-1">Jatuh Tempo Tercepat</p>
                  <p className="font-bold text-sm text-rose-600">{formatDate(earliestDue)}</p>
                </>
              )}
            </div>
          </div>

          {/* INVOICE TABLE */}
          <div className="mb-8">
            <div className="bg-[#0f172a] text-white px-3 py-1.5 inline-block mb-3">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em]">Daftar Faktur</h3>
            </div>
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-300">
                <tr>
                  <th className="text-left py-2 w-8">#</th>
                  <th className="text-left py-2">No. Invoice</th>
                  <th className="text-left py-2">Tgl Issue</th>
                  <th className="text-left py-2">Jatuh Tempo</th>
                  <th className="text-right py-2">Nominal</th>
                </tr>
              </thead>
              <tbody>
                {linkedInvoices.map((inv, idx) => (
                  <tr key={inv.id} className="border-b border-slate-100">
                    <td className="py-2 text-slate-400">{idx + 1}</td>
                    <td className="py-2 font-mono">{inv.id.slice(0, 8).toUpperCase()}</td>
                    <td className="py-2 text-slate-600">{formatDate(inv.issueDate)}</td>
                    <td className="py-2 text-slate-600">{formatDate(inv.dueDate)}</td>
                    <td className="py-2 text-right font-bold">{formatRupiah(inv.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#0f172a]">
                  <td colSpan={4} className="py-3 font-black uppercase tracking-widest text-[11px]">Total Tagihan</td>
                  <td className="py-3 text-right font-black text-base">{formatRupiah(tf.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* SIGNATURE BLOCKS */}
          <div className="grid grid-cols-2 gap-12 mt-16 text-center text-xs">
            <div>
              <p className="text-slate-500 mb-20">Hormat kami,</p>
              <div className="border-t border-slate-400 pt-2">
                <p className="font-bold">DISMA FRESH</p>
                <p className="text-slate-500 text-[10px]">Finance</p>
              </div>
            </div>
            <div>
              <p className="text-slate-500 mb-20">Diterima oleh,</p>
              <div className="border-t border-slate-400 pt-2">
                <p className="font-bold">{client?.companyName || "(Klien)"}</p>
                <p className="text-slate-500 text-[10px]">Nama & Tanda Tangan</p>
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="mt-12 pt-4 border-t border-slate-200 text-[9px] text-slate-400 text-center">
            Dokumen ini dicetak otomatis dari sistem DISMA CORE · {new Date().toLocaleString("id-ID")}
          </div>
        </div>
      </div>
    </div>
  )
}

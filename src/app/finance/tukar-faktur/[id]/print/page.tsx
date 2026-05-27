"use client"

import { use, useEffect, useMemo } from "react"
import Link from "next/link"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Printer, ArrowLeft } from "lucide-react"
import type { SalesOrder, SalesOrderItem, Product } from "@/types"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0)
}
function formatDate(iso?: string) {
  if (!iso) return "-"
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })
}
function formatDayName(iso?: string) {
  if (!iso) return "-"
  return new Date(iso).toLocaleDateString("id-ID", { weekday: "long" })
}

interface InvoiceWithOrders {
  invoice: ReturnType<typeof useAppStore.getState>["invoices"][number]
  orders: SalesOrder[]
  items: Array<SalesOrderItem & { product?: Product }>
}

export default function TukarFakturPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const tf = useAppStore(s => s.tukarFakturs.find(t => t.id === id))
  const clients = useAppStore(s => s.clients)
  const invoices = useAppStore(s => s.invoices)
  const salesOrders = useAppStore(s => s.salesOrders)
  const salesOrderItems = useAppStore(s => s.salesOrderItems)
  const products = useAppStore(s => s.products)

  const enriched: InvoiceWithOrders[] = useMemo(() => {
    const linked = invoices
      .filter(inv => inv.tukarFakturId === id)
      .sort((a, b) => a.issueDate.localeCompare(b.issueDate))
    return linked.map(inv => {
      const orderIds = inv.salesOrderIds && inv.salesOrderIds.length > 0
        ? inv.salesOrderIds
        : (inv.salesOrderId ? [inv.salesOrderId] : [])
      const orders = orderIds
        .map(oid => salesOrders.find(o => o.id === oid))
        .filter((o): o is SalesOrder => !!o)
      const orderIdSet = new Set(orders.map(o => o.id))
      const items = salesOrderItems
        .filter(it => orderIdSet.has(it.salesOrderId))
        .map(it => ({ ...it, product: products.find(p => p.id === it.productId) }))
      return { invoice: inv, orders, items }
    })
  }, [invoices, id, salesOrders, salesOrderItems, products])

  useEffect(() => {
    if (tf && enriched.length > 0) {
      const t = setTimeout(() => window.print(), 700)
      return () => clearTimeout(t)
    }
  }, [tf, enriched.length])

  if (!tf) {
    return <div className="p-10 text-slate-500">TF tidak ditemukan. <Link href="/finance/tukar-faktur" className="underline">Kembali</Link></div>
  }

  const client = clients.find(c => c.id === tf.clientId)
  const earliestDue = enriched.reduce<string | null>((min, e) => {
    if (!e.invoice.dueDate) return min
    if (!min) return e.invoice.dueDate
    return e.invoice.dueDate < min ? e.invoice.dueDate : min
  }, null)

  return (
    <div className="bg-slate-100 min-h-screen tf-print-root">
      <style jsx global>{`
        @media print {
          body { background: white !important; margin: 0 !important; }
          body * { visibility: hidden !important; }
          .tf-print-root, .tf-print-root * { visibility: visible !important; }
          .tf-print-root { position: absolute !important; left: 0; top: 0; width: 100% !important; background: white !important; padding: 0 !important; min-height: 0 !important; }
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; margin: 0 auto !important; max-width: 100% !important; padding: 12mm !important; page-break-after: always; }
          .print-page:last-child { page-break-after: auto; }
          @page { size: A4; margin: 0; }
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

      <div className="p-8 space-y-8">

        {/* PAGE 1: TF SUMMARY */}
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
            <table className="w-full text-[11px]">
              <thead className="text-[9px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-300">
                <tr>
                  <th className="text-left py-2 w-6">#</th>
                  <th className="text-left py-2">No. PO</th>
                  <th className="text-left py-2">Hari</th>
                  <th className="text-left py-2">Tgl PO</th>
                  <th className="text-left py-2">No. Invoice</th>
                  <th className="text-left py-2">Jatuh Tempo</th>
                  <th className="text-right py-2">Nominal</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((e, idx) => {
                  const poNumbers = e.orders.map(o => o.poNumber).join(", ") || "-"
                  const orderDate = e.orders[0]?.orderDate
                  return (
                    <tr key={e.invoice.id} className="border-b border-slate-100">
                      <td className="py-2 text-slate-400">{idx + 1}</td>
                      <td className="py-2 font-bold">{poNumbers}</td>
                      <td className="py-2 text-slate-600">{formatDayName(orderDate)}</td>
                      <td className="py-2 text-slate-600">{formatDate(orderDate)}</td>
                      <td className="py-2 font-mono text-[10px]">{e.invoice.id.slice(0, 8).toUpperCase()}</td>
                      <td className="py-2 text-slate-600">{formatDate(e.invoice.dueDate)}</td>
                      <td className="py-2 text-right font-bold">{formatRupiah(e.invoice.totalAmount)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#0f172a]">
                  <td colSpan={6} className="py-3 font-black uppercase tracking-widest text-[11px]">Total Tagihan</td>
                  <td className="py-3 text-right font-black text-base">{formatRupiah(tf.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* PAYMENT NOTE */}
          <div className="mb-8 p-4 border-2 border-[#0f172a] rounded-lg bg-amber-50">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#0f172a] mb-1">Catatan</p>
            <p className="text-xs text-slate-700 leading-relaxed">
              Tagihan harap ditransfer melalui rekening <span className="font-black">BRI 0206.01.010051.56.8</span> a/n <span className="font-black">PT DISMA PERMATA SEJAHTERA</span>
            </p>
          </div>

          {/* SIGNATURE BLOCKS */}
          <div className="grid grid-cols-2 gap-12 mt-12 text-center text-xs">
            <div>
              <p className="text-slate-500 mb-16">Hormat kami,</p>
              <div className="border-t border-slate-400 pt-2">
                <p className="font-bold">DISMA FRESH</p>
                <p className="text-slate-500 text-[10px]">Finance</p>
              </div>
            </div>
            <div>
              <p className="text-slate-500 mb-16">Diterima oleh,</p>
              <div className="border-t border-slate-400 pt-2">
                <p className="font-bold">{client?.companyName || "(Klien)"}</p>
                <p className="text-slate-500 text-[10px]">Nama & Tanda Tangan</p>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-3 border-t border-slate-200 text-[8px] text-slate-400 text-center">
            Dokumen ini dicetak otomatis dari sistem DISMA CORE · {new Date().toLocaleString("id-ID")}
          </div>
        </div>

        {/* PAGES 2..N: PER-INVOICE DETAIL */}
        {enriched.map((e, idx) => {
          const lineTotal = e.items.reduce((s, it) => s + (it.subtotalFinal ?? it.subtotal ?? 0), 0)
          return (
            <div key={e.invoice.id} className="print-page bg-white mx-auto max-w-[820px] p-12 shadow-2xl text-[#1e293b]">
              {/* KOP */}
              <div className="border-b-4 border-[#0f172a] pb-6 mb-6 flex justify-between items-start">
                <div>
                  <h1 className="text-2xl font-black text-[#0f172a] uppercase leading-none">DISMA FRESH</h1>
                  <p className="text-[10px] font-bold text-[#94a3b8] uppercase mt-1 tracking-widest">
                    Premium Production & Logistics · Warehouse · B2B
                  </p>
                </div>
                <div className="text-right">
                  <h2 className="text-xl font-black uppercase leading-none text-[#0f172a]">FAKTUR</h2>
                  <p className="text-[10px] font-bold text-[#64748b] mt-1">Lampiran #{idx + 1} dari TF {tf.tfNumber}</p>
                </div>
              </div>

              {/* INVOICE META */}
              <div className="grid grid-cols-3 gap-4 mb-6 text-xs">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">No. Invoice</p>
                  <p className="font-mono font-bold mt-1">{e.invoice.id.slice(0, 8).toUpperCase()}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">No. PO</p>
                  <p className="font-bold mt-1">{e.orders.map(o => o.poNumber).join(", ") || "-"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Tgl PO</p>
                  <p className="font-bold mt-1">{formatDayName(e.orders[0]?.orderDate)}, {formatDate(e.orders[0]?.orderDate)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Tgl Invoice</p>
                  <p className="font-bold mt-1">{formatDate(e.invoice.issueDate)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Jatuh Tempo</p>
                  <p className="font-bold mt-1 text-rose-600">{formatDate(e.invoice.dueDate)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Klien</p>
                  <p className="font-bold mt-1">{client?.companyName || tf.clientId}</p>
                </div>
              </div>

              {/* LINE ITEMS */}
              <div className="mb-6">
                <div className="bg-[#0f172a] text-white px-3 py-1.5 inline-block mb-3">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em]">Rincian Barang</h3>
                </div>
                {e.items.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Tidak ada rincian barang.</p>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="text-[9px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-300">
                      <tr>
                        <th className="text-left py-2 w-6">#</th>
                        <th className="text-left py-2">Produk</th>
                        <th className="text-right py-2 w-16">Qty</th>
                        <th className="text-right py-2 w-24">Harga</th>
                        <th className="text-right py-2 w-28">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.items.map((it, i) => {
                        const qty = it.qtyFinal ?? it.qty
                        const sub = it.subtotalFinal ?? it.subtotal ?? (qty * (it.unitPrice || 0))
                        return (
                          <tr key={it.id} className="border-b border-slate-100">
                            <td className="py-2 text-slate-400">{i + 1}</td>
                            <td className="py-2">{it.product?.name || it.productId}</td>
                            <td className="py-2 text-right">{qty}</td>
                            <td className="py-2 text-right">{formatRupiah(it.unitPrice || 0)}</td>
                            <td className="py-2 text-right font-bold">{formatRupiah(sub)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[#0f172a]">
                        <td colSpan={4} className="py-3 font-black uppercase tracking-widest text-[10px] text-right pr-2">Subtotal Faktur</td>
                        <td className="py-3 text-right font-black text-sm">{formatRupiah(lineTotal || e.invoice.totalAmount)}</td>
                      </tr>
                      {Math.abs(lineTotal - e.invoice.totalAmount) > 1 && lineTotal > 0 && (
                        <tr>
                          <td colSpan={4} className="py-1 text-right pr-2 text-[9px] text-slate-500">Total Invoice (final)</td>
                          <td className="py-1 text-right font-black text-sm">{formatRupiah(e.invoice.totalAmount)}</td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                )}
              </div>

              {/* PAYMENT NOTE (repeat) */}
              <div className="mt-8 p-3 border border-[#0f172a] rounded bg-amber-50">
                <p className="text-[10px] text-slate-700 leading-relaxed">
                  <span className="font-black uppercase">Catatan:</span> Tagihan harap ditransfer melalui rekening <span className="font-black">BRI 0206.01.010051.56.8</span> a/n <span className="font-black">PT DISMA PERMATA SEJAHTERA</span>
                </p>
              </div>

              <div className="mt-6 pt-3 border-t border-slate-200 text-[8px] text-slate-400 text-center">
                Lampiran TF {tf.tfNumber} · Faktur {idx + 1} dari {enriched.length} · {new Date().toLocaleString("id-ID")}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

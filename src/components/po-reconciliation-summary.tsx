"use client"
import { useMemo, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { reconcilePurchaseOrders } from '@/lib/po-reconciliation'
import { postedDay } from '@/lib/daily-close'
import { formatRupiah } from '@/lib/utils'

export default function PoReconciliationSummary() {
  const salesOrders=useAppStore(state=>state.salesOrders)
  const salesOrderItems=useAppStore(state=>state.salesOrderItems)
  const purchaseItems=useAppStore(state=>state.purchaseItems)
  const deliveries=useAppStore(state=>state.deliveries)
  const invoices=useAppStore(state=>state.invoices)
  const pendingReturns=useAppStore(state=>state.pendingReturns)
  const creditNotes=useAppStore(state=>state.creditNotes)
  const stockMovements=useAppStore(state=>state.stockMovements)
  const [selected,setSelected]=useState('')
  const today=postedDay(new Date())
  const recap=useMemo(()=>reconcilePurchaseOrders({salesOrders,salesOrderItems,purchaseItems,deliveries,invoices,stockMovements,pendingReturns,creditNotes,today}),[salesOrders,salesOrderItems,purchaseItems,deliveries,invoices,stockMovements,pendingReturns,creditNotes,today])
  const order=recap.orders.find(order=>order.id===selected) || recap.orders[0]
  const qty=(value:number|null)=>value===null ? 'Perlu bukti' : value.toLocaleString('id-ID',{maximumFractionDigits:3})
  return <section className="rounded-lg border border-border bg-card p-4 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="font-semibold">Rekonsiliasi PO per barang</h2><p className="mt-1 text-xs text-slate-500">{recap.exceptions.pendingPaperCount} hasil kirim menunggu salinan · {recap.exceptions.missingInvoiceCount} kiriman belum tertaut invoice · {recap.exceptions.overdueCount} PO lewat target aktual</p></div>
      <label className="text-sm">Pilih PO <select className="ml-2 rounded border border-input p-2" value={order?.id || ''} onChange={event=>setSelected(event.target.value)}>{recap.orders.map(item=><option key={item.id} value={item.id}>{item.poNumber}</option>)}</select></label>
    </div>
    {!order ? <p className="text-sm text-slate-500">Belum ada PO aktif untuk direkonsiliasi.</p> : <>
      <div className="flex flex-wrap gap-5 text-sm"><span>Ditagih <strong>{formatRupiah(order.totals.invoicedAmount)}</strong></span><span>Diterima <strong>{formatRupiah(order.totals.paidAmount)}</strong></span><span>Sisa piutang <strong>{formatRupiah(order.totals.outstandingAmount)}</strong></span><span>Kewajiban refund <strong>{formatRupiah(order.totals.refundLiabilityAmount)}</strong></span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-xs"><caption className="mb-2 text-left text-slate-500">Qty mengikuti satuan tiap barang. Pembayaran per barang dibagi proporsional nilai rincian invoice; bukan bukti pembayaran per SKU.</caption><thead><tr>{['Barang / satuan','Pesan','Beli','QC lolos / alokasi','Cadangan','Dikirim','Diterima neto','Retur setelah terima','Batal','Masih wajib','Qty invoice bruto','Nilai invoice neto','Penerimaan dialokasikan'].map(label=><th key={label} className="border-b px-2 py-2 text-right first:text-left">{label}</th>)}</tr></thead><tbody>{order.lines.map(line=><tr key={line.productId}><td className="border-b px-2 py-2">{line.name} {line.uom && `(${line.uom})`}</td>{[line.orderedQty,line.boughtQty,line.qcPassedQty,line.reservedQty,line.dispatchedQty,line.acceptedQty,line.returnedQty,line.cancelledQty,line.owedQty,line.invoicedQty].map((value,index)=><td key={index} className="border-b px-2 py-2 text-right">{qty(value)}</td>)}<td className="border-b px-2 py-2 text-right">{formatRupiah(line.invoicedAmount)}</td><td className="border-b px-2 py-2 text-right">{formatRupiah(line.paidAllocatedAmount)}</td></tr>)}</tbody></table></div>
      {order.totals.unattributedInvoicedAmount>0 && <p className="text-xs text-amber-700">Nilai header invoice {formatRupiah(order.totals.unattributedInvoicedAmount)} belum dapat dibagi per barang karena rincian historis belum tersedia.</p>}
      {order.warnings.length>0 && <ul className="list-disc pl-5 text-xs text-amber-800 space-y-1">{order.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul>}
    </>}
  </section>
}

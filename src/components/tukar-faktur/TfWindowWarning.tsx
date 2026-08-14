"use client"

import { useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { Card } from "@/components/ui/card"
import { AlertTriangle, Clock } from "lucide-react"
import { TF_WINDOW_DAYS, daysLeftInTfWindow, tfWindowBucket, isInvoiceIssued } from "@/lib/tf-window"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0)
}

/**
 * Invoices are only offered by the TF picker for TF_WINDOW_DAYS after issue.
 * Past that they vanish from it silently: goods delivered, invoice raised, no
 * way to bill it from that screen. This panel puts both edges of that in front
 * of Admin PO — what is about to slip, and what already has.
 */
export function TfWindowWarning() {
  const invoices = useAppStore(s => s.invoices) || []
  const salesOrders = useAppStore(s => s.salesOrders) || []
  const clients = useAppStore(s => s.clients) || []

  const { urgent, expired } = useMemo(() => {
    const today = new Date()
    const loose = invoices.filter(inv => !inv.tukarFakturId && isInvoiceIssued(inv, salesOrders))
    return {
      urgent: loose
        .filter(inv => tfWindowBucket(inv.issueDate, today) === 'urgent')
        .sort((a, b) => daysLeftInTfWindow(a.issueDate, today) - daysLeftInTfWindow(b.issueDate, today)),
      expired: loose.filter(inv => tfWindowBucket(inv.issueDate, today) === 'expired'),
    }
  }, [invoices, salesOrders])

  if (urgent.length === 0 && expired.length === 0) return null

  const nameOf = (clientId: string) =>
    clients.find(c => c.id === clientId)?.companyName || 'Klien'

  const groupByClient = (list: typeof invoices) => {
    const m = new Map<string, { name: string; count: number; total: number; soonest: number }>()
    const today = new Date()
    list.forEach(inv => {
      const key = inv.clientId
      const prev = m.get(key)
      const left = daysLeftInTfWindow(inv.issueDate, today)
      if (prev) {
        prev.count += 1
        prev.total += inv.totalAmount
        prev.soonest = Math.min(prev.soonest, left)
      } else {
        m.set(key, { name: nameOf(key), count: 1, total: inv.totalAmount, soonest: left })
      }
    })
    return Array.from(m.values()).sort((a, b) => a.soonest - b.soonest)
  }

  return (
    <div className="space-y-4">
      {urgent.length > 0 && (
        <Card className="p-5 rounded-2xl border-amber-200 bg-amber-50/70">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                Segera dibuatkan TF ({urgent.length} invoice)
              </p>
              <p className="text-xs font-bold text-slate-600 mt-0.5">
                Lewat {TF_WINDOW_DAYS} hari sejak terbit, invoice hilang dari daftar pilihan Generate TF.
              </p>
              <div className="mt-3 space-y-1">
                {groupByClient(urgent).map(g => (
                  <div key={g.name} className="flex items-center justify-between gap-2 text-xs font-bold">
                    <span className="truncate text-slate-700">
                      {g.name} <span className="text-slate-400">({g.count} invoice)</span>
                    </span>
                    <span className="shrink-0 flex items-center gap-3">
                      <span className="text-slate-500">{formatRupiah(g.total)}</span>
                      <span className="text-amber-700 font-black">
                        {g.soonest === 0 ? 'hari ini' : `${g.soonest} hari lagi`}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {expired.length > 0 && (
        <Card className="p-5 rounded-2xl border-rose-200 bg-rose-50/70">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">
                Sudah lewat batas ({expired.length} invoice)
              </p>
              <p className="text-xs font-bold text-slate-600 mt-0.5">
                Barangnya sudah terkirim tapi belum masuk TF mana pun, dan sudah tidak muncul di Generate TF. Perlu ditagih di luar sistem.
              </p>
              <div className="mt-3 space-y-1">
                {groupByClient(expired).map(g => (
                  <div key={g.name} className="flex items-center justify-between gap-2 text-xs font-bold">
                    <span className="truncate text-slate-700">
                      {g.name} <span className="text-slate-400">({g.count} invoice)</span>
                    </span>
                    <span className="shrink-0 text-rose-700 font-black">{formatRupiah(g.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

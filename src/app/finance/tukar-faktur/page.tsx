"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useAppStore } from "@/lib/store"
import type { TukarFakturStatus } from "@/types"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, FileSpreadsheet, Eye } from "lucide-react"
import { GenerateTfModal } from "@/components/tukar-faktur/GenerateTfModal"
import { TfWindowWarning } from "@/components/tukar-faktur/TfWindowWarning"

const STATUS_TONE: Record<TukarFakturStatus, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Issued: "bg-amber-100 text-amber-700",
  Received: "bg-blue-100 text-blue-700",
  Paid: "bg-emerald-100 text-emerald-700",
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0)
}

function formatDate(iso: string) {
  if (!iso) return "-"
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

export default function TukarFakturListPage() {
  const tukarFakturs = useAppStore(s => s.tukarFakturs)
  const clients = useAppStore(s => s.clients)
  const invoices = useAppStore(s => s.invoices)

  const [openGenerate, setOpenGenerate] = useState(false)
  const [filterClient, setFilterClient] = useState<string>("")
  const [filterStatus, setFilterStatus] = useState<string>("")
  const [search, setSearch] = useState("")

  const rows = useMemo(() => {
    return tukarFakturs
      .filter(t => !filterClient || t.clientId === filterClient)
      .filter(t => !filterStatus || t.status === filterStatus)
      .filter(t => !search || t.tfNumber.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
  }, [tukarFakturs, filterClient, filterStatus, search])

  const invoiceCountByTf = useMemo(() => {
    const m = new Map<string, number>()
    invoices.forEach(inv => {
      if (!inv.tukarFakturId) return
      m.set(inv.tukarFakturId, (m.get(inv.tukarFakturId) || 0) + 1)
    })
    return m
  }, [invoices])

  const kpi = useMemo(() => {
    const draft = tukarFakturs.filter(t => t.status === "Draft").length
    const issuedUnpaid = tukarFakturs.filter(t => t.status === "Issued" || t.status === "Received").length
    const outstanding = tukarFakturs
      .filter(t => t.status === "Issued" || t.status === "Received")
      .reduce((sum, t) => sum + t.totalAmount, 0)
    return { draft, issuedUnpaid, outstanding }
  }, [tukarFakturs])

  return (
    <div className="p-6 md:p-10 space-y-8">
      <header className="flex flex-col md:flex-row justify-between gap-4 md:items-end">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">Tukar Faktur (Finance - View Only)</h1>
          <p className="text-sm text-slate-500 mt-1">Batch invoice mingguan per klien — Dibuat & di-manage oleh Admin PO.</p>
        </div>
      </header>

      <TfWindowWarning />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 rounded-2xl border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Draft</p>
          <p className="text-3xl font-black text-slate-900 mt-2">{kpi.draft}</p>
        </Card>
        <Card className="p-5 rounded-2xl border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Issued / Received</p>
          <p className="text-3xl font-black text-slate-900 mt-2">{kpi.issuedUnpaid}</p>
        </Card>
        <Card className="p-5 rounded-2xl border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Outstanding</p>
          <p className="text-2xl font-black text-emerald-700 mt-2">{formatRupiah(kpi.outstanding)}</p>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <select className="h-11 px-4 rounded-xl border border-slate-200 text-sm bg-white"
                value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="">Semua Klien</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
        </select>
        <select className="h-11 px-4 rounded-xl border border-slate-200 text-sm bg-white"
                value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Semua Status</option>
          <option value="Draft">Draft</option>
          <option value="Issued">Issued</option>
          <option value="Received">Received</option>
          <option value="Paid">Paid</option>
        </select>
        <Input className="h-11 rounded-xl flex-1" placeholder="Cari TF Number…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card className="rounded-2xl overflow-hidden border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">TF Number</th>
              <th className="text-left px-4 py-3">Klien</th>
              <th className="text-left px-4 py-3">Periode</th>
              <th className="text-left px-4 py-3">Issue Date</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-center px-4 py-3">Invoice</th>
              <th className="text-center px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-16 text-slate-400">
                <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 opacity-40" />
                Belum ada TF. Klik <span className="font-bold">Generate TF</span> untuk mulai.
              </td></tr>
            ) : rows.map(t => {
              const client = clients.find(c => c.id === t.clientId)
              return (
                <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold">{t.tfNumber}</td>
                  <td className="px-4 py-3">{client?.companyName || t.clientId}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(t.periodStart)} – {formatDate(t.periodEnd)}</td>
                  <td className="px-4 py-3">{formatDate(t.issueDate)}</td>
                  <td className="px-4 py-3 text-right font-bold">{formatRupiah(t.totalAmount)}</td>
                  <td className="px-4 py-3 text-center">{invoiceCountByTf.get(t.id) || 0}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge className={`${STATUS_TONE[t.status]} border-none font-bold`}>{t.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/finance/tukar-faktur/${t.id}`}>
                      <Button size="sm" variant="ghost" className="rounded-xl"><Eye className="w-4 h-4" /></Button>
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <GenerateTfModal open={openGenerate} onOpenChange={setOpenGenerate} />
    </div>
  )
}

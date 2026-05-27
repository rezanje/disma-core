"use client"

import { useEffect, useMemo, useState } from "react"
import { useAppStore } from "@/lib/store"
import type { Invoice, TukarFaktur } from "@/types"
import { tfPeriodFor, generateTfNumber, periodKey, type TfPeriod } from "@/lib/tukar-faktur"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0)
}
function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

interface PeriodGroup {
  key: string
  period: TfPeriod
  invoices: Invoice[]
  total: number
}

interface Props { open: boolean; onOpenChange: (v: boolean) => void }

export function GenerateTfModal({ open, onOpenChange }: Props) {
  const clients = useAppStore(s => s.clients)
  const invoices = useAppStore(s => s.invoices)
  const tukarFakturs = useAppStore(s => s.tukarFakturs)
  const currentUser = useAppStore(s => s.currentUser)
  const addTukarFaktur = useAppStore(s => s.addTukarFaktur)
  const issueTukarFaktur = useAppStore(s => s.issueTukarFaktur)

  const [clientId, setClientId] = useState("")
  const [selectedInvIds, setSelectedInvIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) { setClientId(""); setSelectedInvIds(new Set()) }
  }, [open])

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [open])

  const candidateGroups = useMemo<PeriodGroup[]>(() => {
    if (!clientId) return []
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 14)
    const eligible = invoices.filter(inv =>
      inv.clientId === clientId &&
      !inv.tukarFakturId &&
      new Date(inv.issueDate) >= cutoff
    )
    const byKey = new Map<string, PeriodGroup>()
    eligible.forEach(inv => {
      const period = tfPeriodFor(new Date(inv.issueDate))
      const k = periodKey(period)
      if (!byKey.has(k)) byKey.set(k, { key: k, period, invoices: [], total: 0 })
      const g = byKey.get(k)!
      g.invoices.push(inv)
      g.total += inv.totalAmount
    })
    return Array.from(byKey.values()).sort((a, b) => a.period.periodStart.getTime() - b.period.periodStart.getTime())
  }, [clientId, invoices, today])

  useEffect(() => {
    const next = new Set<string>()
    candidateGroups.forEach(g => {
      if (g.period.periodEnd < today) g.invoices.forEach(i => next.add(i.id))
    })
    setSelectedInvIds(next)
  }, [candidateGroups, today])

  function toggleInvoice(id: string) {
    setSelectedInvIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  function groupSelected(): PeriodGroup[] {
    return candidateGroups
      .map(g => ({ ...g, invoices: g.invoices.filter(i => selectedInvIds.has(i.id)) }))
      .filter(g => g.invoices.length > 0)
      .map(g => ({ ...g, total: g.invoices.reduce((s, i) => s + i.totalAmount, 0) }))
  }

  async function runGenerate(mode: "Draft" | "Issue") {
    const groups = groupSelected()
    if (groups.length === 0) { toast.error("Pilih minimal 1 invoice."); return }
    setBusy(true)
    try {
      for (const g of groups) {
        const existingCount = tukarFakturs.filter(t => {
          return t.clientId === clientId && t.periodStart === isoDate(g.period.periodStart)
        }).length
        const tf: TukarFaktur = {
          id: crypto.randomUUID(),
          tfNumber: generateTfNumber(clientId, g.period, existingCount),
          clientId,
          periodStart: isoDate(g.period.periodStart),
          periodEnd: isoDate(g.period.periodEnd),
          issueDate: isoDate(mode === "Issue" ? today : g.period.issueDate),
          status: "Draft",
          totalAmount: g.total,
          createdAt: new Date().toISOString(),
          issuedBy: mode === "Issue" ? (currentUser?.id || "system") : undefined,
        }
        await addTukarFaktur(tf)
        if (mode === "Issue") {
          await issueTukarFaktur(
            tf.id,
            g.invoices.map(i => i.id),
            tf.issueDate,
            currentUser?.id || "system"
          )
        }
      }
      toast.success(`${groups.length} TF berhasil ${mode === "Issue" ? "diterbitkan" : "disimpan sebagai Draft"}.`)
      onOpenChange(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`Generate gagal: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-[2rem] bg-white p-8">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">Generate Tukar Faktur</DialogTitle>
          <DialogDescription className="text-slate-500">
            Pilih klien, periode terdeteksi otomatis (Sen-Min atau dipotong di akhir bulan). Centang invoice yang mau dimasukkan.
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Klien</label>
            <select
              className="mt-2 w-full h-11 rounded-xl border border-slate-200 px-4 text-sm bg-white"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
            >
              <option value="">— Pilih klien —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </select>
          </div>

          {clientId && candidateGroups.length === 0 && (
            <p className="text-sm text-slate-500 italic">Tidak ada invoice klien ini dalam 14 hari terakhir yang belum di-TF.</p>
          )}

          {candidateGroups.map(g => (
            <div key={g.key} className="border border-slate-100 rounded-2xl p-4 bg-slate-50">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <p className="font-bold text-sm">
                    Periode {g.period.periodStart.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })} – {g.period.periodEnd.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
                  </p>
                  <p className="text-xs text-slate-500">
                    Issue default: {g.period.issueDate.toLocaleDateString("id-ID")} · {g.invoices.length} invoice · {formatRupiah(g.total)}
                  </p>
                </div>
                {g.period.periodEnd >= today && (
                  <span className="text-[10px] font-bold uppercase text-amber-600 bg-amber-100 px-2 py-1 rounded-full">Period belum selesai</span>
                )}
              </div>
              <div className="space-y-2">
                {g.invoices.map(inv => (
                  <label key={inv.id} className="flex items-center gap-3 text-sm cursor-pointer">
                    <Checkbox checked={selectedInvIds.has(inv.id)} onCheckedChange={() => toggleInvoice(inv.id)} />
                    <span className="font-medium">{inv.id.slice(0, 8)}</span>
                    <span className="text-slate-500">{formatRupiah(inv.totalAmount)}</span>
                    <span className="text-xs text-slate-400 ml-auto">issued {inv.issueDate.slice(0,10)}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Batal</Button>
          <Button variant="outline" onClick={() => runGenerate("Draft")} disabled={busy || !clientId}>Save as Draft</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => runGenerate("Issue")} disabled={busy || !clientId}>Issue Sekarang</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

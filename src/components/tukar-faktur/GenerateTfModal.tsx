"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAppStore } from "@/lib/store"
import type { Invoice, TukarFaktur } from "@/types"
import { tfPeriodFor, generateTfNumber, periodKey, isoLocalDate, type TfPeriod } from "@/lib/tukar-faktur"
import { isInvoiceEligibleForTf } from "@/lib/tf-window"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0)
}
// Periode TF dibangun dari tanggal lokal (mondayOf/sundayOf memakai setHours(0,0,0,0)).
// toISOString() menggesernya ke UTC, jadi di WIB (+7) tengah malam lokal jatuh ke tanggal
// sebelumnya — periode dan tanggal terbit tersimpan mundur satu hari.
const isoDate = isoLocalDate

interface PeriodGroup {
  key: string
  period: TfPeriod
  invoices: Invoice[]
  total: number
}

interface Props { open: boolean; onOpenChange: (v: boolean) => void }

export function GenerateTfModal({ open, onOpenChange }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const clients = useAppStore(s => s.clients)
  const invoices = useAppStore(s => s.invoices)
  const salesOrders = useAppStore(s => s.salesOrders)
  const tukarFakturs = useAppStore(s => s.tukarFakturs)
  const currentUser = useAppStore(s => s.currentUser)
  const addTukarFaktur = useAppStore(s => s.addTukarFaktur)
  const issueTukarFaktur = useAppStore(s => s.issueTukarFaktur)
  const linkInvoicesToTukarFaktur = useAppStore(s => s.linkInvoicesToTukarFaktur)
  const deleteTukarFaktur = useAppStore(s => s.deleteTukarFaktur)

  const [clientId, setClientId] = useState("")
  const [selectedInvIds, setSelectedInvIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  // Baris yang barusan diklik saat berpindah klien, supaya tidak tertimpa pilihan
  // otomatis yang jalan begitu kliennya berubah.
  const [pilihanBaru, setPilihanBaru] = useState<string | null>(null)

  useEffect(() => {
    if (!open) { setClientId(""); setSelectedInvIds(new Set()); setPilihanBaru(null) }
  }, [open])

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [open])

  // Faktur baru resmi terbit setelah audit finance meloloskan SO dari 'Awaiting Audit'.
  // Aturannya dipakai bersama panel peringatan di halaman daftar — kalau dua-duanya
  // punya salinan sendiri, panel bisa menjanjikan invoice yang di sini ditolak.
  const isInvoiceIssued = useCallback(
    (inv: Invoice) => isInvoiceEligibleForTf(inv, salesOrders, invoices),
    [salesOrders, invoices]
  )

  const eligibleClients = useMemo(() => {
    const idsWithEligibleInv = new Set(
      invoices
        .filter(inv => isInvoiceIssued(inv))
        .map(inv => inv.clientId)
    )
    return clients
      .filter(c => idsWithEligibleInv.has(c.id))
      .sort((a, b) => a.companyName.localeCompare(b.companyName))
  }, [clients, invoices, today, isInvoiceIssued])

  const candidateGroups = useMemo<PeriodGroup[]>(() => {
    if (!clientId) return []
    const eligible = invoices.filter(inv =>
      inv.clientId === clientId &&
      isInvoiceIssued(inv)
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
  }, [clientId, invoices, today, isInvoiceIssued])

  useEffect(() => {
    const next = new Set<string>()
    candidateGroups.forEach(g => {
      if (g.period.periodEnd < today) g.invoices.forEach(i => next.add(i.id))
    })
    if (pilihanBaru) next.add(pilihanBaru)
    setSelectedInvIds(next)
  }, [candidateGroups, today, pilihanBaru])

  /**
   * Semua pesanan yang siap ditukar-fakturkan, dikelompokkan per klien.
   *
   * Dulu kliennya harus dipilih dulu di dropdown baru daftarnya muncul — artinya harus
   * tahu duluan klien mana yang punya tagihan menunggu, padahal itu justru yang mau
   * dilihat. Sekarang semuanya tampil sejak awal: nomor PO, nama klien, tanggal kirim.
   */
  const perKlien = useMemo(() => {
    const layak = invoices.filter(inv =>
      isInvoiceIssued(inv)
    )
    const map = new Map<string, { nama: string; baris: Array<{ inv: Invoice; po: string; kirim: string }>; total: number }>()
    for (const inv of layak) {
      const so = salesOrders.find(s2 => s2.id === inv.salesOrderId)
      const nama = clients.find(c => c.id === inv.clientId)?.companyName || 'Klien'
      if (!map.has(inv.clientId)) map.set(inv.clientId, { nama, baris: [], total: 0 })
      const g = map.get(inv.clientId)!
      g.baris.push({
        inv,
        po: so?.poNumber || inv.id.slice(0, 8),
        kirim: so?.targetDeliveryDate ? new Date(so.targetDeliveryDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '—',
      })
      g.total += inv.totalAmount
    }
    return [...map.entries()]
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => a.nama.localeCompare(b.nama))
  }, [invoices, salesOrders, clients, today, isInvoiceIssued])

  /** Satu tukar faktur untuk satu klien — memilih pesanan klien lain berarti pindah. */
  const pilihBaris = (invClientId: string, invId: string, checked: boolean) => {
    if (invClientId !== clientId) {
      setClientId(invClientId)
      setPilihanBaru(invId)
      return
    }
    setPilihanBaru(null)
    toggleInvoice(invId, checked)
  }

  function toggleInvoice(id: string, checked: boolean) {
    setSelectedInvIds(prev => {
      const n = new Set(prev)
      if (checked) n.add(id); else n.delete(id)
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
    if (busy) return
    const groups = groupSelected()
    if (groups.length === 0) { toast.error("Pilih minimal 1 invoice."); return }
    setBusy(true)
    const loadingId = toast.loading(mode === "Issue" ? "Menerbitkan TF…" : "Menyimpan draft TF…")
    const createdTfIds: string[] = []
    let currentTfId: string | null = null
    let needsCleanup = false
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
        currentTfId = tf.id
        needsCleanup = true
        if (mode === "Issue") {
          await issueTukarFaktur(
            tf.id,
            g.invoices.map(i => i.id),
            tf.issueDate,
            currentUser?.id || "system"
          )
        } else {
          await linkInvoicesToTukarFaktur(tf.id, g.invoices.map(i => i.id))
        }
        needsCleanup = false
        createdTfIds.push(tf.id)
      }
      toast.dismiss(loadingId)
      onOpenChange(false)
      toast.success(
        mode === "Issue"
          ? `${groups.length} TF diterbitkan. Lanjut: print → bawa ke klien → tandai diterima.`
          : `${groups.length} TF disimpan sebagai Draft. Buka detail untuk Issue kapan saja.`,
      )
      if (createdTfIds.length === 1) {
        const prefix = pathname.startsWith('/admin') ? '/admin' : '/finance';
        router.push(`${prefix}/tukar-faktur/${createdTfIds[0]}`)
      }
    } catch (e) {
      console.error("[GenerateTfModal] runGenerate failed", e)
      const msg = e instanceof Error ? e.message : String(e)
      toast.dismiss(loadingId)
      if (needsCleanup && currentTfId) {
        try {
          await deleteTukarFaktur(currentTfId)
        } catch (cleanupErr) {
          console.error("[GenerateTfModal] cleanup delete failed", cleanupErr)
        }
      }
      toast.error(`Penerbitan belum terkonfirmasi${currentTfId ? ` (TF ${currentTfId})` : ""}. Periksa daftar TF sebelum mengulang: ${msg}`, { duration: 10000 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl bg-white p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle className="text-lg font-bold">Buat Tukar Faktur</DialogTitle>
          <DialogDescription className="text-slate-500">
            Centang pesanan yang mau ditagihkan. Satu tukar faktur untuk satu klien —
            memilih pesanan klien lain otomatis berpindah ke klien itu.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {perKlien.length === 0 && (
            <p className="py-8 text-center text-sm italic text-slate-500">
              Belum ada pesanan terkirim yang menunggu ditukarfakturkan.
            </p>
          )}

          {perKlien.map(k => {
            const aktif = k.id === clientId
            return (
              <div
                key={k.id}
                className={`rounded-2xl border p-4 ${aktif ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-100 bg-slate-50'}`}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{k.nama}</p>
                    <p className="text-xs text-slate-500">
                      {k.baris.length} pesanan · {formatRupiah(k.total)}
                    </p>
                  </div>
                  {aktif && (
                    <span className="rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white">
                      Klien terpilih
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {k.baris.map(({ inv, po, kirim }) => (
                    <label
                      key={inv.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-sm ${
                        aktif ? 'hover:bg-white' : 'opacity-60 hover:opacity-100'
                      }`}
                    >
                      <Checkbox
                        checked={selectedInvIds.has(inv.id)}
                        onCheckedChange={(checked) => pilihBaris(k.id, inv.id, checked as boolean)}
                      />
                      <span className="font-medium text-slate-800">{po}</span>
                      <span className="text-xs text-slate-400">kirim {kirim}</span>
                      <span className="ml-auto font-medium text-slate-600">{formatRupiah(inv.totalAmount)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}

          {clientId && candidateGroups.some(g => g.period.periodEnd >= today) && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
              Ada pesanan yang periodenya belum selesai minggu ini. Boleh diterbitkan sekarang,
              tapi tagihan minggu berjalan jadi terpotong.
            </p>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t bg-slate-50 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Batal</Button>
          <Button variant="outline" onClick={() => runGenerate("Draft")} disabled={busy || selectedInvIds.size === 0}>Simpan Draft</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => runGenerate("Issue")} disabled={busy || selectedInvIds.size === 0}>
            Terbitkan Sekarang{selectedInvIds.size > 0 ? ` (${selectedInvIds.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

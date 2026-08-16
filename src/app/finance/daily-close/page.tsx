"use client"

import { useMemo, useState } from "react"
import { useAppStore } from "@/lib/store"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CalendarDays, Lock, AlertTriangle, CheckCircle2, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { cn, formatRupiah } from "@/lib/utils"
import {
  grossProfit, netProfit, variances, canClose,
  type LedgerLine, type DayExpense, type PocketClose,
} from "@/lib/daily-close"
import { overdueIssues } from "@/lib/delivery-issue"

/** YYYY-MM-DD di zona setempat — bukan toISOString(), yang menggeser tengah malam WIB ke hari sebelumnya. */
const localDay = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export default function DailyClosePage() {
  const journalEntries = useAppStore(s => s.journalEntries)
  const journalLines = useAppStore(s => s.journalLines)
  const coas = useAppStore(s => s.coas)
  const expenses = useAppStore(s => s.expenses)
  const invoices = useAppStore(s => s.invoices)
  const deliveries = useAppStore(s => s.deliveries)
  const tutupHariKantong = useAppStore(s => s.tutupHariKantong)
  const salesOrders = useAppStore(s => s.salesOrders)
  const clients = useAppStore(s => s.clients)
  const products = useAppStore(s => s.products)
  const purchaseItems = useAppStore(s => s.purchaseItems)
  const salesOrderItems = useAppStore(s => s.salesOrderItems)
  const pendingReturns = useAppStore(s => s.pendingReturns)
  const dailyCloses = useAppStore(s => s.dailyCloses)
  const dailyCostConfig = useAppStore(s => s.dailyCostConfig)
  const currentUser = useAppStore(s => s.currentUser)
  const addDailyClose = useAppStore(s => s.addDailyClose)
  const saveDailyCostConfig = useAppStore(s => s.saveDailyCostConfig)

  const [day, setDay] = useState(localDay(new Date()))
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [showCostSetup, setShowCostSetup] = useState(false)
  const [monthlyTotal, setMonthlyTotal] = useState(dailyCostConfig?.monthlyTotal ?? 0)
  const [workingDays, setWorkingDays] = useState(dailyCostConfig?.workingDays ?? 26)
  const [busy, setBusy] = useState(false)

  const codeOf = useMemo(() => {
    const m = new Map(coas.map(c => [c.id, c.accountCode]))
    return (id: string) => m.get(id) || ''
  }, [coas])

  const dayOfEntry = useMemo(() => {
    const m = new Map(journalEntries.map(e => [e.id, localDay(e.transactionDate)]))
    return (entryId: string) => m.get(entryId) || ''
  }, [journalEntries])

  const ledger: LedgerLine[] = useMemo(() => journalLines.map(l => ({
    day: dayOfEntry(l.journalEntryId),
    accountCode: codeOf(l.accountId),
    debit: Number(l.debitAmount || 0),
    credit: Number(l.creditAmount || 0),
  })), [journalLines, dayOfEntry, codeOf])

  const dayExpenses: DayExpense[] = useMemo(() => expenses.map(e => ({
    day: localDay(e.date),
    amount: Number(e.amount || 0),
    // Hanya biaya yang sudah diaudit Finance yang mengurangi laba — yang masih
    // menunggu audit belum tentu diakui.
    approved: e.status === 'Approved',
  })), [expenses])

  const pockets: PocketClose[] = useMemo(() => tutupHariKantong.map(t => ({
    day: localDay(t.date),
    ditarik: Number(t.ditarik || 0),
    belanja: Number(t.belanja || 0),
    disetor: Number(t.disetor || 0),
  })), [tutupHariKantong])

  const auditedToday = deliveries.filter(d => d.status === 'Terkirim' && d.deliveryDate && localDay(d.deliveryDate) === day).length
  const invoicesToday = invoices.filter(i => localDay(i.issueDate) === day).length

  const angka = netProfit(ledger, day, dayExpenses, dailyCostConfig)
  const vs = variances(ledger, day, pockets, auditedToday, invoicesToday)
  const sudahDitutup = dailyCloses.find(d => d.day === day)
  const lewatTenggat = overdueIssues(pendingReturns, day)
  const boleh = canClose(vs, reasons)

  // --- Lapis 3: bedah per klien dan per SKU ---
  const invToday = invoices.filter(i => localDay(i.issueDate) === day)
  const perKlien = useMemo(() => {
    const m = new Map<string, { omzet: number; nama: string }>()
    invToday.forEach(i => {
      const nama = clients.find(c => c.id === i.clientId)?.companyName || '—'
      const cur = m.get(i.clientId) || { omzet: 0, nama }
      cur.omzet += Number(i.totalAmount || 0)
      m.set(i.clientId, cur)
    })
    return [...m.values()].sort((a, b) => b.omzet - a.omzet)
  }, [invToday, clients])

  const perSku = useMemo(() => {
    const soIds = new Set(invToday.map(i => i.salesOrderId).filter(Boolean))
    const m = new Map<string, { nama: string; qty: number; omzet: number; hpp: number }>()
    salesOrderItems.filter(i => soIds.has(i.salesOrderId)).forEach(item => {
      const qty = item.qtyFinal ?? item.qty
      const p = products.find(x => x.id === item.productId)
      const beli = purchaseItems.find(pi => pi.salesOrderId === item.salesOrderId && pi.productId === item.productId && pi.actualUnitPrice > 0)
      const cur = m.get(item.productId) || { nama: p?.name || item.productId, qty: 0, omzet: 0, hpp: 0 }
      cur.qty += qty
      cur.omzet += qty * Number(item.unitPrice || 0)
      cur.hpp += qty * Number(beli?.actualUnitPrice || p?.basePrice || 0)
      m.set(item.productId, cur)
    })
    return [...m.values()].sort((a, b) => (b.omzet - b.hpp) - (a.omzet - a.hpp))
  }, [invToday, salesOrderItems, products, purchaseItems])

  const simpanSetelan = async () => {
    if (monthlyTotal <= 0 || workingDays <= 0) { toast.error("Isi biaya tetap sebulan dan jumlah hari kerja."); return }
    await saveDailyCostConfig({ monthlyTotal, workingDays, updatedAt: new Date().toISOString(), updatedBy: currentUser?.name })
    setShowCostSetup(false)
    toast.success("Setelan biaya tetap tersimpan. Semua hari yang sudah lewat ikut terhitung ulang.")
  }

  const tutupHari = async () => {
    if (!boleh) { toast.error("Beri nama dulu setiap selisih sebelum menutup hari."); return }
    setBusy(true)
    try {
      await addDailyClose({
        id: `close-${day}`,
        day,
        closedAt: new Date().toISOString(),
        closedBy: currentUser?.name || currentUser?.id,
        grossProfit: angka.gross,
        netProfit: angka.net,
        varianceReasons: reasons,
      })
      toast.success(`Hari ${day} ditutup.`)
    } catch (e) {
      toast.error("Gagal menutup hari: " + (e instanceof Error ? e.message : String(e)))
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Tutup Hari</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            Untung hari ini, dan setiap selisih yang harus dijelaskan
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-slate-400" />
          <Input type="date" value={day} onChange={e => { setDay(e.target.value); setReasons({}) }} className="h-10 w-44 font-bold" />
        </div>
      </div>

      {sudahDitutup && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 flex items-center gap-3">
          <Lock className="w-5 h-5 text-emerald-600" />
          <p className="text-xs font-black text-emerald-800 dark:text-emerald-400">
            Hari ini sudah ditutup oleh {sudahDitutup.closedBy || '—'} pada {new Date(sudahDitutup.closedAt).toLocaleString('id-ID')}.
          </p>
        </div>
      )}

      {/* LAPIS 1 & 2 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-slate-900 text-white">
          <CardContent className="p-6 space-y-1">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Laba Kotor</p>
            <h3 className="text-3xl font-black text-emerald-400">{formatRupiah(angka.gross)}</h3>
            <p className="text-[11px] text-slate-400 font-bold">
              Omzet {formatRupiah(angka.revenue)} − HPP {formatRupiah(angka.cogs)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-1">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Biaya Hari Ini</p>
            <h3 className="text-2xl font-black text-rose-600">{formatRupiah(angka.ops)}</h3>
            <p className="text-[11px] text-slate-400 font-bold">Bensin, parkir, kuli — yang sudah diaudit</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-1">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Laba Bersih</p>
            {angka.net === null ? (
              <>
                {/* Bukan nol. Nol terbaca sebagai "tidak ada biaya tetap", dan itu
                    membuat laba terlihat lebih besar dari kenyataannya. */}
                <p className="text-sm font-black text-amber-600">Belum bisa dihitung</p>
                <Button size="sm" variant="outline" className="mt-2 font-black text-[10px] uppercase" onClick={() => setShowCostSetup(v => !v)}>
                  <Settings2 className="w-3 h-3 mr-1" /> Isi Biaya Tetap Bulanan
                </Button>
              </>
            ) : (
              <>
                <h3 className={cn("text-3xl font-black", angka.net >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  {formatRupiah(angka.net)}
                </h3>
                <p className="text-[11px] text-slate-400 font-bold">
                  Termasuk jatah harian biaya tetap {formatRupiah(angka.fixedDaily || 0)}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {showCostSetup && (
        <Card className="border-amber-200">
          <CardContent className="p-6 flex flex-wrap items-end gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500">Biaya tetap sebulan</label>
              <Input type="number" value={monthlyTotal} onChange={e => setMonthlyTotal(Number(e.target.value))} className="h-10 w-56 font-bold" />
              <p className="text-[10px] text-slate-400 mt-1">Gaji, sewa, listrik, internet</p>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500">Hari kerja sebulan</label>
              <Input type="number" value={workingDays} onChange={e => setWorkingDays(Number(e.target.value))} className="h-10 w-32 font-bold" />
            </div>
            <Button onClick={simpanSetelan} className="h-10 font-black bg-emerald-600 hover:bg-emerald-700">Simpan</Button>
          </CardContent>
        </Card>
      )}

      {/* REKONSILIASI */}
      <Card className={cn(vs.length > 0 ? "border-amber-300" : "border-emerald-200")}>
        <CardContent className="p-6 space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
            {vs.length > 0 ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            Rekonsiliasi Hari Ini
          </h3>

          {/* Retur klien yang lewat tenggat ikut ditampilkan di sini. Bukan selisih uang,
              jadi tidak menahan penutupan — tapi kalau tidak pernah muncul di layar
              yang dibuka tiap sore, tidak ada yang mengejarnya. */}
          {lewatTenggat.length > 0 && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 space-y-1">
              <p className="font-black text-sm text-rose-800 dark:text-rose-400">
                {lewatTenggat.length} retur klien lewat tenggat
              </p>
              {lewatTenggat.slice(0, 5).map(r => (
                <p key={r.id} className="text-[11px] font-bold text-rose-700 dark:text-rose-500">
                  {r.diNumber || r.id.slice(0, 8)} — {products.find(p => p.id === r.productId)?.name || r.productId} {r.qty}, jatuh tempo {r.dueDate}
                </p>
              ))}
            </div>
          )}

          {vs.length === 0 ? (
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-500">
              Uang, barang, dan tagihan hari ini cocok semua. Tidak ada yang perlu dijelaskan.
            </p>
          ) : (
            <div className="space-y-3">
              {vs.map(v => (
                <div key={v.key} className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 space-y-2">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <p className="font-black text-sm text-amber-900 dark:text-amber-400">{v.label}</p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-600 font-bold">{v.detail}</p>
                    </div>
                    <p className="font-black text-lg text-amber-900 dark:text-amber-400 shrink-0">
                      {v.key === 'kirim-vs-tagih' ? `${v.amount} dokumen` : formatRupiah(v.amount)}
                    </p>
                  </div>
                  <Input
                    placeholder="Kenapa selisihnya? (contoh: 3 kg cabe susut, sisa Rp50.000 belum disetor)"
                    value={reasons[v.key] || ''}
                    onChange={e => setReasons(r => ({ ...r, [v.key]: e.target.value }))}
                    className="h-10 text-xs font-bold bg-white dark:bg-slate-900"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              disabled={!boleh || busy || !!sudahDitutup}
              onClick={tutupHari}
              className={cn("h-12 px-8 font-black rounded-xl",
                boleh && !sudahDitutup ? "bg-slate-900 hover:bg-slate-800 text-white" : "bg-slate-200 text-slate-400")}
            >
              <Lock className="w-4 h-4 mr-2" />
              {sudahDitutup ? "Sudah Ditutup" : boleh ? "Tutup Hari Ini" : `${vs.length} Selisih Belum Dijelaskan`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* LAPIS 3 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500 p-5 pb-3">Per Klien</p>
            <Table>
              <TableHeader><TableRow className="bg-slate-50 dark:bg-slate-900/50">
                <TableHead className="text-[10px] font-black">Klien</TableHead>
                <TableHead className="text-[10px] font-black text-right">Omzet</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {perKlien.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-xs text-slate-400 py-8">Belum ada tagihan hari ini.</TableCell></TableRow>}
                {perKlien.map(k => (
                  <TableRow key={k.nama}><TableCell className="font-bold text-sm">{k.nama}</TableCell>
                    <TableCell className="text-right font-black">{formatRupiah(k.omzet)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500 p-5 pb-3">Per Barang</p>
            <Table>
              <TableHeader><TableRow className="bg-slate-50 dark:bg-slate-900/50">
                <TableHead className="text-[10px] font-black">Barang</TableHead>
                <TableHead className="text-[10px] font-black text-center">Qty</TableHead>
                <TableHead className="text-[10px] font-black text-right">Laba</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {perSku.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-xs text-slate-400 py-8">Belum ada barang terkirim hari ini.</TableCell></TableRow>}
                {perSku.map(s => {
                  const laba = s.omzet - s.hpp
                  return (
                    <TableRow key={s.nama}>
                      <TableCell className="font-bold text-sm">{s.nama}</TableCell>
                      <TableCell className="text-center font-bold text-xs">{s.qty}</TableCell>
                      <TableCell className={cn("text-right font-black", laba >= 0 ? "text-emerald-600" : "text-rose-600")}>
                        {formatRupiah(laba)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

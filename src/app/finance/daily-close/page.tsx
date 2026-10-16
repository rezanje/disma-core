"use client"

import { useMemo, useState } from "react"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { StatBand } from "@/components/ui/stat-band"
import { CalendarDays, Lock, CheckCircle2, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { cn, formatRupiah, formatRupiahShort } from "@/lib/utils"
import {
  grossProfit, netProfit, variances, canClose, postedDay, postedLedger,
  INVENTORY, ACCRUAL,
  type LedgerLine, type DayExpense, type PocketClose,
} from "@/lib/daily-close"
import { operatingInvoices, invoiceSkuFacts } from "@/lib/po-reconciliation"
import { overdueIssues } from "@/lib/delivery-issue"
import { ceilingByLine, isOverCeiling, overByPct } from "@/lib/price-ceiling"

import { petaHariKirim, hariOperasi, localDay } from "@/lib/hari-operasi"

const tanggalPanjang = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** Satu baris daftar periksa. Yang cocok diam; yang selisih minta alasan. */
type CheckRow = {
  key: string
  label: string
  detail?: string
  /** true = cocok, false = perlu perhatian */
  ok: boolean
  /** nilai selisih, sudah diformat */
  amount?: string
  /** selisih ini menahan penutupan hari dan alasannya diketik di sini */
  blocking?: boolean
  /** alasan yang datang dari tempat lain (mis. dicatat saat belanja) */
  readOnlyReason?: string
}

export default function DailyClosePage() {
  const journalEntries = useAppStore(s => s.journalEntries)
  const journalLines = useAppStore(s => s.journalLines)
  const coas = useAppStore(s => s.coas)
  const expenses = useAppStore(s => s.expenses)
  const invoices = useAppStore(s => s.invoices)
  const creditNotes = useAppStore(s=>s.creditNotes)
  const deliveries = useAppStore(s => s.deliveries)
  const tutupHariKantong = useAppStore(s => s.tutupHariKantong)
  const clients = useAppStore(s => s.clients)
  const products = useAppStore(s => s.products)
  const purchaseItems = useAppStore(s => s.purchaseItems)
  const purchases = useAppStore(s => s.purchases)
  const minMarginPct = useAppStore(s => s.minMarginPct)
  const salesOrderItems = useAppStore(s => s.salesOrderItems)
  const salesOrders = useAppStore(s => s.salesOrders)
  const pendingReturns = useAppStore(s => s.pendingReturns)
  const dailyCloses = useAppStore(s => s.dailyCloses)
  const dailyCostConfig = useAppStore(s => s.dailyCostConfig)
  const currentUser = useAppStore(s => s.currentUser)
  const addDailyClose = useAppStore(s => s.addDailyClose)
  const saveDailyCostConfig = useAppStore(s => s.saveDailyCostConfig)

  const [day, setDay] = useState(postedDay(new Date()))
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [showCostSetup, setShowCostSetup] = useState(false)
  const [monthlyTotal, setMonthlyTotal] = useState(dailyCostConfig?.monthlyTotal ?? 0)
  const [workingDays, setWorkingDays] = useState(dailyCostConfig?.workingDays ?? 26)
  const [busy, setBusy] = useState(false)

  const codeOf = useMemo(() => {
    const m = new Map(coas.map(c => [c.id, c.accountCode]))
    return (id: string) => m.get(id) || ''
  }, [coas])

  const petaKirim = useMemo(
    () => petaHariKirim({salesOrders,purchaseItems,deliveries,invoices}),
    [salesOrders,purchaseItems,deliveries,invoices],
  )
  const ledger = useMemo(()=>postedLedger(journalEntries,journalLines,coas),[journalEntries,journalLines,coas])
  const operationalLedger:LedgerLine[] = useMemo(()=>{
    const entryDays=new Map(journalEntries.map(entry=>[entry.id,hariOperasi(entry,petaKirim)]))
    return journalLines.map(line=>({day:entryDays.get(line.journalEntryId) || '',accountCode:codeOf(line.accountId),debit:Number(line.debitAmount || 0),credit:Number(line.creditAmount || 0)}))
  },[journalEntries,journalLines,petaKirim,codeOf])

  const dayExpenses: DayExpense[] = useMemo(() => expenses.map(e => ({
    day: postedDay(e.date),
    amount: Number(e.amount || 0),
    // Hanya biaya yang sudah diaudit Finance yang mengurangi laba — yang masih
    // menunggu audit belum tentu diakui.
    approved: e.status === 'Approved',
  })), [expenses])

  const pockets: PocketClose[] = useMemo(() => tutupHariKantong.map(t => ({
    day: postedDay(t.date),
    ditarik: Number(t.ditarik || 0),
    belanja: Number(t.belanja || 0),
    disetor: Number(t.disetor || 0),
  })), [tutupHariKantong])

  const sourceInvoices=operatingInvoices(invoices)
  const auditedToday = deliveries.filter(d => d.status === 'Terkirim' && postedDay(d.occurredAt || d.deliveryDate || '') === day).length
  const invoicesToday = sourceInvoices.filter(i => postedDay(i.issueDate) === day).length

  const angka = netProfit(ledger, day, dayExpenses, dailyCostConfig)
  const operationalEstimate=netProfit(operationalLedger,day,[],dailyCostConfig)
  const kotor = grossProfit(ledger, day)
  const vs = variances(ledger, day, pockets, auditedToday, invoicesToday)
  const sudahDitutup = dailyCloses.find(d => d.day === day)
  const lewatTenggat = overdueIssues(pendingReturns, day)
  const boleh = canClose(vs, reasons)

  // Belanja yang harganya di atas batas margin. Tidak pernah diblokir di lapangan,
  // jadi di sini lah satu-satunya tempat angka itu terlihat lagi — lengkap dengan
  // alasan yang ditulis orang yang belanja.
  const lewatBatas = useMemo(() => {
    const hariPembelian = new Map(purchases.map(p => [p.id, localDay(p.date)]))
    const itemHariIni = purchaseItems.filter(i => i.isChecked && hariPembelian.get(i.purchaseId) === day)
    const batas = ceilingByLine(itemHariIni, salesOrderItems, minMarginPct)
    return itemHariIni
      .filter(i => isOverCeiling(Number(i.actualUnitPrice || 0), batas.get(i.id) || 0))
      .map(i => ({
        id: i.id,
        nama: products.find(p => p.id === i.productId)?.name || i.productId,
        harga: Number(i.actualUnitPrice || 0),
        batas: batas.get(i.id) || 0,
        pct: overByPct(Number(i.actualUnitPrice || 0), batas.get(i.id) || 0),
        alasan: i.overCeilingReason || '',
      }))
  }, [purchases, purchaseItems, salesOrderItems, products, minMarginPct, day])

  // Angka pembanding untuk baris yang cocok — dibaca dari buku besar yang sama
  // dengan variances(), supaya kalimat "cocok" menyebut angka aslinya.
  const bandingan = useMemo(() => {
    const p = pockets.filter(x => x.day === day)
    const ditarik = p.reduce((s, x) => s + x.ditarik, 0)
    const belanja = p.reduce((s, x) => s + x.belanja, 0)
    const disetor = p.reduce((s, x) => s + x.disetor, 0)
    const sum = (code: string) => ledger
      .filter(l => l.day === day && l.accountCode === code)
      .reduce((s, l) => s + l.debit, 0)
    return { ditarik, belanja, disetor, barangMasuk: sum(INVENTORY), uangBarang: sum(ACCRUAL) }
  }, [pockets, ledger, day])

  const daftarPeriksa: CheckRow[] = useMemo(() => {
    const bySelisih = new Map(vs.map(v => [v.key, v]))
    const baris: CheckRow[] = []

    const selisihKantong = bySelisih.get('kantong')
    baris.push({
      key: 'kantong',
      label: selisihKantong?.label || 'Kas belanja lapangan',
      detail: `Ditarik ${formatRupiahShort(bandingan.ditarik)} · belanja ${formatRupiahShort(bandingan.belanja)} · disetor ${formatRupiahShort(bandingan.disetor)}`,
      ok: !selisihKantong,
      amount: selisihKantong ? formatRupiah(selisihKantong.amount) : undefined,
      blocking: !!selisihKantong,
    })

    const selisihBarang = bySelisih.get('belanja-vs-barang')
    baris.push({
      key: 'belanja-vs-barang',
      label: selisihBarang?.label || 'Uang belanja vs barang masuk',
      detail: `Uang untuk barang ${formatRupiahShort(bandingan.uangBarang)} vs nilai barang masuk ${formatRupiahShort(bandingan.barangMasuk)}`,
      ok: !selisihBarang,
      amount: selisihBarang ? formatRupiah(selisihBarang.amount) : undefined,
      blocking: !!selisihBarang,
    })

    const selisihTagih = bySelisih.get('kirim-vs-tagih')
    baris.push({
      key: 'kirim-vs-tagih',
      label: selisihTagih?.label || 'Kiriman diaudit vs tagihan terbit',
      detail: `${auditedToday} pengiriman diaudit · ${invoicesToday} tagihan terbit`,
      ok: !selisihTagih,
      amount: selisihTagih ? `${selisihTagih.amount} dokumen` : undefined,
      blocking: !!selisihTagih,
    })

    // Dua baris di bawah tidak menahan penutupan — tapi kalau tidak pernah muncul
    // di layar yang dibuka tiap sore, tidak ada yang mengejarnya.
    baris.push({
      key: 'retur',
      label: lewatTenggat.length > 0 ? `Retur klien lewat tenggat — ${lewatTenggat.length} dokumen` : 'Retur klien — tidak ada yang lewat tenggat',
      detail: lewatTenggat.length > 0
        ? lewatTenggat.slice(0, 3).map(r => `${r.diNumber || r.id.slice(0, 8)} ${products.find(p => p.id === r.productId)?.name || ''} ${r.qty}`).join(' · ')
        : undefined,
      ok: lewatTenggat.length === 0,
    })

    const nilaiLewatBatas = lewatBatas.reduce((s, b) => s + (b.harga - b.batas), 0)
    baris.push({
      key: 'plafon',
      label: lewatBatas.length > 0 ? `Belanja di atas batas harga — ${lewatBatas.length} barang` : 'Belanja — semua di bawah batas harga',
      detail: lewatBatas.length > 0
        ? lewatBatas.slice(0, 3).map(b => `${b.nama} ${formatRupiah(b.harga)} vs batas ${formatRupiah(b.batas)} (+${b.pct}%)`).join(' · ')
        : undefined,
      ok: lewatBatas.length === 0,
      amount: lewatBatas.length > 0 ? formatRupiah(nilaiLewatBatas) : undefined,
      readOnlyReason: lewatBatas.find(b => b.alasan)?.alasan || (lewatBatas.length > 0 ? 'Belum ada alasan dari yang belanja.' : undefined),
    })

    return baris
  }, [vs, bandingan, auditedToday, invoicesToday, lewatTenggat, lewatBatas, products])

  const jumlahCocok = daftarPeriksa.filter(b => b.ok).length
  const jumlahSelisih = daftarPeriksa.length - jumlahCocok
  const alasanKurang = vs.filter(v => (reasons[v.key] || '').trim().length < 3).length

  // --- Bedah per klien dan per SKU ---
  const invToday = sourceInvoices.filter(i => postedDay(i.issueDate) === day)
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

  const snapshotFacts=invoiceSkuFacts(invToday,{creditNotes,pendingReturns})
  const perSku=snapshotFacts.rows.map(row=>({nama:row.name,qty:row.qty,omzet:row.revenue,hpp:row.cost}))

  const marginKotor = angka.revenue > 0 ? (kotor.gross / angka.revenue) * 100 : 0

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
    <div className="-m-4 md:-m-6 lg:-m-8">
      <PageHeader
        title="Tutup hari"
        context="Laba resmi mengikuti jurnal pada tanggal kejadian yang dibukukan dalam WIB. Estimasi operasional ditampilkan terpisah."
        actions={
          <>
            <label
              className="flex h-[34px] items-center gap-1.5 rounded-md border border-input px-3 text-[12.5px] font-medium text-slate-700"
              title="Tanggal transaksi jurnal dalam WIB."
            >
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tanggal buku</span>
              <input
                type="date"
                value={day}
                onChange={e => { setDay(e.target.value); setReasons({}) }}
                className="bg-transparent text-[12.5px] font-medium outline-none"
              />
            </label>
            <Button variant="outline" size="sm" disabled={currentUser?.role!=='super_admin'} onClick={() => setShowCostSetup(v => !v)}>
              <Settings2 className="h-3.5 w-3.5" /> Biaya tetap
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-[18px] px-6 py-6 md:px-7">
        {sudahDitutup && (
          <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <Lock className="h-4 w-4 text-emerald-600" />
            <p className="text-[12.5px] text-emerald-800">
              Hari ini sudah ditutup oleh {sudahDitutup.closedBy || '—'} pada {new Date(sudahDitutup.closedAt).toLocaleString('id-ID')}.
            </p>
          </div>
        )}

        <StatBand
          leader={{
            label: 'Laba bersih dibukukan',
            value: formatRupiahShort(angka.net),
            tone: angka.net >= 0 ? 'ink' : 'risk',
            note: 'Pendapatan dikurangi seluruh beban di buku besar; estimasi biaya tetap terpisah.',
          }}
          items={[
            { label: 'Omzet', value: formatRupiahShort(angka.revenue), note: `${invoicesToday} tagihan terbit` },
            { label: 'HPP', value: formatRupiahShort(angka.cogs), note: 'HPP yang dibukukan' },
            {
              label: 'Laba kotor',
              value: formatRupiahShort(kotor.gross),
              tone: kotor.gross >= 0 ? 'ok' : 'risk',
              note: angka.revenue > 0 ? `margin ${marginKotor.toFixed(1)}%` : 'belum ada omzet',
            },
            { label: 'Beban lainnya', value: formatRupiahShort(angka.ops), note: 'Seluruh beban GL selain HPP' },
          ]}
        />

        <div className="rounded-lg border border-border bg-card p-4 text-sm text-slate-600">
          Estimasi operasional hari kirim: {formatRupiah(operationalEstimate.estimatedNetAfterFixed ?? operationalEstimate.net)}.
          {angka.fixedDaily===null ? ' Alokasi biaya tetap belum dikonfigurasi.' : ` Termasuk estimasi biaya tetap ${formatRupiah(angka.fixedDaily)} per hari kerja; belum merupakan tambahan beban GL.`}
          <p className="mt-1 text-xs">Laba per SKU di bawah menggunakan rincian invoice beku. {snapshotFacts.missingSnapshotCount} invoice belum memiliki rincian beku; {snapshotFacts.snapshotMismatchCount} nilai rincian berbeda dari header; {snapshotFacts.missingCostCount} rincian belum memiliki biaya beku. Koreksi tanpa tautan retur dibagi proporsional ke SKU ({snapshotFacts.estimatedCreditAllocationCount} invoice); ini estimasi rincian dokumen. Lengkapi bukti untuk alokasi tepat.</p>
        </div>

        {showCostSetup && (
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-5">
            <div>
              <label className="text-xs text-slate-400">Biaya tetap sebulan</label>
              <Input type="number" value={monthlyTotal} onChange={e => setMonthlyTotal(Number(e.target.value))} className="h-10 w-56" />
              <p className="mt-1 text-[11.5px] text-slate-400">Gaji, sewa, listrik, internet</p>
            </div>
            <div>
              <label className="text-xs text-slate-400">Hari kerja sebulan</label>
              <Input type="number" value={workingDays} onChange={e => setWorkingDays(Number(e.target.value))} className="h-10 w-32" />
            </div>
            <Button onClick={simpanSetelan} className="h-10">Simpan</Button>
          </div>
        )}

        {/* Daftar periksa — yang cocok satu baris, yang selisih minta alasan */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Daftar periksa sebelum ditutup</h2>
              <p className="mt-[3px] text-xs text-slate-400">
                {jumlahCocok} cocok{jumlahSelisih > 0 ? ` · ${jumlahSelisih} selisih perlu alasan` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="block h-2 w-2 rounded-full bg-emerald-600" />cocok
              <span className="ml-2 block h-2 w-2 rounded-full bg-amber-500" />selisih
            </div>
          </div>

          {daftarPeriksa.map(baris => (
            baris.ok ? (
              <div key={baris.key} className="flex items-center gap-3 border-b border-hairline-row px-6 py-3">
                <CheckCircle2 className="h-[15px] w-[15px] flex-none text-emerald-600" />
                <span className="flex-1 text-[13px] leading-snug text-slate-700">
                  {baris.label}
                  {baris.detail ? <span className="text-slate-400"> — {baris.detail}</span> : null}
                </span>
                <span className="text-[12.5px] font-medium text-emerald-600">cocok</span>
              </div>
            ) : (
              <div
                key={baris.key}
                className="border-b border-hairline-row border-l-2 border-l-amber-500 bg-row-warning px-6 py-4"
              >
                <div className="flex items-baseline justify-between gap-5">
                  <div className="min-w-0">
                    <div className="text-[13px] leading-snug font-medium text-slate-900">{baris.label}</div>
                    {baris.detail ? (
                      <div className="mt-[3px] text-xs leading-normal text-slate-500">{baris.detail}</div>
                    ) : null}
                  </div>
                  {baris.amount ? (
                    <div className="tabular flex-none text-[15px] leading-tight font-semibold text-amber-500">{baris.amount}</div>
                  ) : null}
                </div>

                {baris.blocking ? (
                  <Input
                    value={reasons[baris.key] || ''}
                    onChange={e => setReasons(r => ({ ...r, [baris.key]: e.target.value }))}
                    placeholder={`Kenapa ${baris.label.toLowerCase()}? Tulis di sini biar bisa ditutup.`}
                    className="mt-3 h-[38px] bg-card text-[12.5px]"
                  />
                ) : baris.readOnlyReason ? (
                  <div className="mt-3 flex h-[38px] items-center rounded-md border border-amber-200 bg-card px-3 text-[12.5px] text-slate-700">
                    {baris.readOnlyReason}
                  </div>
                ) : null}
              </div>
            )
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 bg-row-head px-6 py-4">
            <p className="max-w-[52ch] text-[12.5px] leading-relaxed text-slate-500">
              Penutupan menyimpan rekap pada saat ini. Jurnal susulan dapat mengubah saldo; simpan koreksi melalui transaksi sumber.
            </p>
            <div className="flex items-center gap-2.5">
              {/* Tombol mati harus menyebutkan sebabnya — bukan cuma diredupkan. */}
              {sudahDitutup ? (
                <span className="text-[12.5px] text-slate-400">Sudah ditutup {tanggalPanjang(day)}</span>
              ) : alasanKurang > 0 ? (
                <span className="text-[12.5px] text-amber-500">{alasanKurang} alasan belum diisi</span>
              ) : null}
              <Button
                disabled={!boleh || busy || !!sudahDitutup}
                onClick={tutupHari}
                className="h-[42px] px-[22px] text-[13.5px]"
              >
                <Lock className="h-4 w-4" />
                {sudahDitutup ? "Sudah ditutup" : "Simpan penutupan tanggal ini"}
              </Button>
            </div>
          </div>
        </div>

        {/* Dua tabel bawah */}
        <div className="grid gap-[18px] lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-hairline px-5 py-4 text-[13.5px] font-semibold text-slate-900">
              Omzet per klien
            </div>
            {perKlien.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-slate-400">Belum ada invoice sumber pada tanggal ini.</p>
            ) : perKlien.map(k => (
              <div key={k.nama} className="flex justify-between gap-4 border-b border-hairline-row px-5 py-2.5 text-[12.5px] leading-snug text-slate-900 last:border-b-0">
                <span className="min-w-0 truncate">{k.nama}</span>
                <span className="tabular flex-none font-medium">{formatRupiah(k.omzet)}</span>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-baseline justify-between border-b border-hairline px-5 py-4">
              <span className="text-[13.5px] font-semibold text-slate-900">Margin bersih rincian invoice</span>
              <span className="text-[11.5px] text-slate-400">snapshot beku + koreksi nilai; belum laba bersih GL per SKU</span>
            </div>
            <div className="grid grid-cols-[1.6fr_.5fr_.9fr] border-b border-hairline bg-row-head px-5 py-2 text-[11.5px] font-medium text-slate-500">
              <span>Barang</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Laba</span>
            </div>
            {perSku.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-slate-400">Belum ada rincian invoice beku pada tanggal ini.</p>
            ) : perSku.map(s => {
              const laba = s.hpp===null ? null : s.omzet - s.hpp
              return (
                <div key={s.nama} className="grid grid-cols-[1.6fr_.5fr_.9fr] border-b border-hairline-row px-5 py-2.5 text-[12.5px] leading-snug text-slate-900 last:border-b-0">
                  <span className="min-w-0 truncate">{s.nama}</span>
                  <span className="tabular text-right">{s.qty}</span>
                  <span className={cn("tabular text-right font-medium", laba!==null && laba >= 0 ? "text-emerald-600" : "text-rose-500")}>
                    {laba===null ? "Perlu biaya beku" : formatRupiah(laba)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

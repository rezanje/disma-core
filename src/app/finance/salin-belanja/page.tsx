"use client"

// Menyalin kertas belanja, bukan mengisi ulang formulir.
//
// Tim lapangan menulis di kertas cetakan kita, lalu Finance mengetik ulang. Layar
// sourcing yang lama dirancang untuk orang yang sedang berdiri di pasar memegang HP:
// satu kartu per barang, buka-tutup. Untuk tiga puluh baris dari selembar kertas, itu
// tiga puluh kali buka-tutup.
//
// Layar ini bentuknya mengikuti kertasnya: tabel datar, urutan kolom sama persis
// dengan cetakan, dan yang diketik cuma empat kolom yang di kertas ditulis tangan.
// Sisanya sudah tercetak — tinggal dibaca.

import { useEffect, useMemo, useState } from "react"
import { useAppStore } from "@/lib/store"
import AuthGuard from "@/components/auth/auth-guard"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SearchSelect } from "@/components/ui/search-select"
import ReceiptUpload from "@/components/ui/receipt-upload"
import { ClipboardList, Loader2, Plus, Trash2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { cn, formatRupiah, formatNumber, parseNumber } from "@/lib/utils"
import { selectableVendors } from "@/lib/vendor-status"
import { pocketOwners } from "@/lib/sourcing-pocket"
import { ceilingByLine, isOverCeiling, overByPct } from "@/lib/price-ceiling"
import { allocateMergedActuals, purchaseUnitPrice, reportProblems, submitShoppingReport, type ReportLine, type ReportInput } from "@/lib/shopping-report"
import { toggleAll } from "@/lib/plan-table"
import { OperationalExpense } from "@/types"
import { v4 as uuidv4 } from "uuid"

type OpsRow = { id: string; kategori: string; nominal: number; keterangan: string; sourceBankAccountId?: string }
type DraftLine = Partial<ReportLine> & { actualTotal?: number }

const KATEGORI_OPS = ['Bensin', 'Tol', 'Parkir', 'Kuli', 'Makan', 'Lainnya']

export default function SalinBelanjaPage() {
  const purchases = useAppStore(s => s.purchases)
  const purchaseItems = useAppStore(s => s.purchaseItems)
  const products = useAppStore(s => s.products)
  const vendors = useAppStore(s => s.vendors)
  const vendorsLoading = useAppStore(s => s.vendorsLoading)
  const vendorsError = useAppStore(s => s.vendorsError)
  const refreshVendors = useAppStore(s => s.refreshVendors)
  useEffect(() => { void refreshVendors() }, [refreshVendors])
  const salesOrders = useAppStore(s => s.salesOrders)
  const salesOrderItems = useAppStore(s => s.salesOrderItems)
  const bankAccounts = useAppStore(s => s.bankAccounts)
  const performers = useAppStore(s=>s.users)
  const currentUser = useAppStore(s => s.currentUser)
  const minMarginPct = useAppStore(s => s.minMarginPct)

  const [pendingReport, setPendingReport] = useState<{input:ReportInput; expenses:OperationalExpense[]} | null>(null)
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())
  const [eventId, setEventId] = useState(() => uuidv4())
  const [transferBankId, setTransferBankId] = useState('')
  const [performedBy, setPerformedBy] = useState('')
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0,16))
  const [draft, setDraft] = useState<Record<string, DraftLine>>({})
  const [pilih, setPilih] = useState<Set<string>>(new Set())
  const [pocketId, setPocketId] = useState("")
  const [foto, setFoto] = useState<string | null>(null)
  const [catatan, setCatatan] = useState("")
  const [ops, setOps] = useState<OpsRow[]>([])
  const [kirim, setKirim] = useState(false)

  // Finance explicitly selects the documents on the returned paper.
  const menunggu = purchases.filter(p =>
    ['Pending', 'Belanja'].includes(p.status) &&
    p.reconciliationStatus !== 'Laporan Masuk' && p.reconciliationStatus !== 'Terverifikasi')
  const selectedPurchases = menunggu.filter(p => selectedDocs.has(p.id))
  const idMenunggu = selectedPurchases.map(p => p.id).join('|')
  const baris = useMemo(() => {
    const ids = new Set(idMenunggu ? idMenunggu.split('|') : [])
    const groups = new Map<string, typeof purchaseItems[number] & { members: typeof purchaseItems }>()
    for (const pi of purchaseItems.filter(pi => ids.has(pi.purchaseId) && (!pi.purchaseMethod || pi.purchaseMethod === 'Pasar') && pi.qtyPurchased < pi.qtyTarget)) {
      const key = [pi.productId, pi.plannedVendorId || '', pi.purchaseMethod || 'Pasar', pi.paymentMethod || 'Cash'].join('|')
      const remaining = pi.qtyTarget - (pi.qtyPurchased || 0)
      const old = groups.get(key)
      if (old) { old.qtyTarget += remaining; old.members.push({...pi, qtyTarget:remaining}); old.estimatedUnitPrice = Math.max(old.estimatedUnitPrice, pi.estimatedUnitPrice) }
      else groups.set(key, {...pi, id:key, qtyTarget:remaining, qtyPurchased:0, members:[{...pi,qtyTarget:remaining}]})
    }
    return [...groups.values()].sort((a,b) => {
      const va = vendors.find(v=>v.id===a.plannedVendorId)?.companyName || ''
      const vb = vendors.find(v=>v.id===b.plannedVendorId)?.companyName || ''
      if (!va && vb) return 1
      if (va && !vb) return -1
      return va.localeCompare(vb) || (products.find(p=>p.id===a.productId)?.name || '').localeCompare(products.find(p=>p.id===b.productId)?.name || '')
    })
  }, [purchaseItems, idMenunggu, vendors, products])

  const kodeDokumen = (purchaseId: string) => {
    const p = purchases.find(x => x.id === purchaseId)
    return p?.advanceCode || purchaseId.slice(0, 8)
  }

  const nilai = (id: string, field: keyof ReportLine) => draft[id]?.[field]
  const set = (id: string, patch: DraftLine) =>
    setDraft(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  /** Baris siap kirim: gabungan yang tersimpan dengan yang barusan diketik. */
  const lines: ReportLine[] = baris.map(pi => ({
    id: pi.id,
    productId: pi.productId,
    purchaseId: pi.purchaseId,
    purchaseMethod: pi.purchaseMethod,
    isChecked: (nilai(pi.id, 'isChecked') as boolean | undefined) ?? false,
    actualUnitPrice: draft[pi.id]?.actualTotal !== undefined
      ? purchaseUnitPrice(draft[pi.id].actualTotal!, (nilai(pi.id, 'qtyPurchased') as number | undefined) ?? (pi.qtyPurchased || 0))
      : (nilai(pi.id, 'actualUnitPrice') as number | undefined) ?? (pi.actualUnitPrice || pi.estimatedUnitPrice || 0),
    qtyPurchased: (nilai(pi.id, 'qtyPurchased') as number | undefined) ?? (pi.qtyPurchased || 0),
    vendorId: (nilai(pi.id, 'vendorId') as string | undefined) ?? pi.vendorId ?? pi.plannedVendorId ?? null,
    paymentMethod: (nilai(pi.id, 'paymentMethod') as ReportLine['paymentMethod']) ?? (pi.paymentMethod as ReportLine['paymentMethod']) ?? 'Cash',
    notes: (nilai(pi.id, 'notes') as string | undefined) ?? pi.notes ?? '',
    overCeilingReason: (nilai(pi.id, 'overCeilingReason') as string | undefined) ?? pi.overCeilingReason ?? '',
  }))

  const batas = useMemo(() => {
    const original = ceilingByLine(purchaseItems, salesOrderItems, minMarginPct)
    return new Map(baris.map(g => [g.id, Math.min(...g.members.map(m=>original.get(m.id) || Infinity))]))
  }, [baris, purchaseItems, salesOrderItems, minMarginPct])
  const allocatedLines = () => lines.flatMap(l => {
    const group = baris.find(b=>b.id===l.id)!
    return allocateMergedActuals(group.members, l.isChecked ? l.qtyPurchased : 0, l.isChecked ? l.qtyPurchased * l.actualUnitPrice : 0)
      .filter(a=>a.qtyPurchased > 0)
      .map(a=>({...l,...a,purchaseId:group.members.find(m=>m.id===a.id)!.purchaseId,isChecked:true}))
  })

  const totalTunai = lines.filter(l => l.isChecked && l.paymentMethod === 'Cash').reduce((s, l) => s + l.qtyPurchased * l.actualUnitPrice, 0)
  const totalBelanja = lines.filter(l=>l.isChecked).reduce((s,l)=>s+l.qtyPurchased*l.actualUnitPrice,0)
  const totalTransfer = lines.filter(l=>l.isChecked && l.paymentMethod === 'Transfer').reduce((s,l)=>s+l.qtyPurchased*l.actualUnitPrice,0)
  const totalTempo = lines.filter(l=>l.isChecked && l.paymentMethod === 'Tempo').reduce((s,l)=>s+l.qtyPurchased*l.actualUnitPrice,0)
  const totalOps = ops.reduce((s, o) => s + o.nominal, 0)

  const namaProduk = (productId: string) => products.find(p => p.id === productId)?.name || productId

  // Keep the usual pocket as the default, while letting Finance choose another source.
  const kantong = pocketOwners(bankAccounts)
  const kantongTunggal = kantong.length === 1 ? kantong[0] : null
  const kantongTerpakai = bankAccounts.find(b => b.id === (pocketId || kantongTunggal?.id)) || null
  // Yang belanja di lapangan = pemilik kantongnya. Kalau itu bukan yang mengetik,
  // foto kertasnya tetap wajib — aturan buktinya tidak ikut disederhanakan.
  const atasNama = kantongTerpakai?.ownerUserId || kantongTunggal?.ownerUserId || ""
  const pocketDipakai = kantongTerpakai?.id || ""
  const terpilih = lines.filter(l => pilih.has(l.id))

  const massal = (patch: Partial<ReportLine>) => {
    if (terpilih.length === 0) return
    setDraft(prev => {
      const next = { ...prev }
      for (const l of terpilih) next[l.id] = { ...next[l.id], ...patch }
      return next
    })
    toast.success(`${terpilih.length} baris diubah.`)
  }

  const masalah = menunggu.length > 0 ? reportProblems(
    { purchaseIds: selectedPurchases.map(p => p.id), lines, pocketBankAccountId: pocketDipakai || null, onBehalfOfUserId: performedBy || atasNama || null, proofImage: foto, ceilings: batas },
    namaProduk, currentUser?.id,
  ) : ['Belum ada dokumen belanja yang menunggu laporan.']
  if (!selectedPurchases.length) masalah.push('Pilih dokumen pada kertas yang diterima.')
  if (!lines.some(l=>l.isChecked && l.qtyPurchased > 0)) masalah.push('Isi hasil pembelian yang benar-benar terjadi; sisanya tetap terbuka.')
  if (lines.some(l=>l.paymentMethod === 'Transfer' && l.isChecked) && !transferBankId) masalah.push('Pilih rekening sumber transfer.')
  if (lines.some(l=>l.qtyPurchased > (baris.find(b=>b.id===l.id)?.qtyTarget || 0))) masalah.push('Qty beli melebihi sisa kebutuhan.')
  if (!occurredAt || !performedBy.trim()) masalah.push('Isi tanggal kejadian dan pelaksana pada kertas.')
  for (const o of ops) {
    if (o.nominal > 0 && !bankAccounts.some(b => b.id === (o.sourceBankAccountId || pocketDipakai) && b.accountCode)) {
      masalah.push(`Pilih sumber kas untuk biaya ${o.kategori}.`)
    }
  }

  const simpan = async () => {
    if (kirim || (!pendingReport && (menunggu.length === 0 || masalah.length > 0))) return
    setKirim(true)
    const t = toast.loading("Menyimpan salinan kertas belanja…")
    try {
      const submission = pendingReport || {
        input: {
          purchaseIds: selectedPurchases.map(p => p.id), lines: allocatedLines(),
          eventId, transferBankAccountId: transferBankId, occurredAt: new Date(occurredAt).toISOString(),
          pocketBankAccountId: pocketDipakai || null, onBehalfOfUserId: performedBy || atasNama || null,
          proofImage: foto, reconciliationNote: catatan, ceilings: ceilingByLine(purchaseItems, salesOrderItems, minMarginPct),
        },
        expenses: ops.filter(o=>o.nominal > 0).map(o=>({
          id:o.id,date:new Date(occurredAt).toISOString(),reporterId:performedBy || atasNama,
          sourceBankAccountId:o.sourceBankAccountId || pocketDipakai,purchaseId:selectedPurchases[0].id,
          category:(o.kategori || 'Lainnya') as OperationalExpense['category'],amount:o.nominal,
          description:o.keterangan || o.kategori,receiptUrl:foto || undefined,status:'Pending Audit' as const,
        })),
      }
      setPendingReport(submission)
      const res = await submitShoppingReport(useAppStore.getState, {...submission.input,expenses:submission.expenses})
      if (!res.ok) { setPendingReport(null); toast.error(res.problems.join(' · '), { id: t }); return }
      res.warnings.forEach(w => toast.warning(w))
      setPendingReport(null)

      toast.success(`Salinan tersimpan. Belanja ${formatRupiah(totalBelanja)}${totalOps > 0 ? ` + ops ${formatRupiah(totalOps)}` : ''}.`, { id: t })
      setEventId(uuidv4()); setSelectedDocs(new Set()); setDraft({}); setPilih(new Set()); setOps([]); setFoto(null); setCatatan("")
    } catch (e) {
      toast.error("Gagal menyimpan: " + (e instanceof Error ? e.message : String(e)), { id: t })
    } finally {
      setKirim(false)
    }
  }

  return (
    <AuthGuard allowedRoles={['finance', 'admin_po', 'super_admin', 'coo']}>
      <div className="space-y-6 pb-24">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Salin Kertas Belanja</h2>
          <p className="text-[11px] font-bold text-slate-400  mt-1">
            Urutan kolomnya sama dengan lembar yang dibawa ke pasar — tinggal disalin
          </p>
        </div>

        {pendingReport && <div role="alert" className="p-4 rounded border border-amber-300 bg-amber-50 text-sm">Transaksi {pendingReport.input.eventId} belum selesai. Percobaan ulang memakai angka dan ID yang sama.<Button onClick={simpan} disabled={kirim} className="ml-3">Coba simpan ulang</Button></div>}
        {menunggu.length > 0 && <Card><CardContent className="space-y-3 p-4">
          <Label>Pilih persis dokumen yang tertulis pada kertas / sesi gabungan</Label>
          {menunggu.map(p=><label key={p.id} className="flex gap-2 text-sm"><input type="checkbox" disabled={!!pendingReport} checked={selectedDocs.has(p.id)} onChange={()=>{setSelectedDocs(prev=>{const n=new Set(prev);n.has(p.id)?n.delete(p.id):n.add(p.id);return n});setDraft({});setEventId(uuidv4())}} />{kodeDokumen(p.id)} · {p.paperSessionId || 'Kertas lama tanpa ID sesi'}</label>)}
          <div className="flex flex-wrap gap-3">
            <label>Pelaksana di kertas<select className="block border rounded p-2" value={performedBy} onChange={e=>setPerformedBy(e.target.value)}><option value="">Pilih pelaksana</option>{performers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Tanggal kejadian<Input type="datetime-local" value={occurredAt} onChange={e=>setOccurredAt(e.target.value)} /></label>
            <label>Sumber transfer<select className="block border rounded p-2" value={transferBankId} onChange={e=>setTransferBankId(e.target.value)}><option value="">Pilih rekening</option>{bankAccounts.filter(b=>b.accountCode).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          </div>
          <p className="text-xs text-slate-500">Satu SKU/vendor pada kertas diisi sekali. Qty dialokasikan berurutan ke dokumen dan PO di bawah; pembelian parsial tetap terbuka.</p>
        </CardContent></Card>}

        {menunggu.length === 0 && (
          <Card className="py-20 text-center border-dashed">
            <CardContent className="flex flex-col items-center gap-3">
              <ClipboardList className="w-14 h-14 text-slate-200" />
              <p className="font-bold text-slate-500">Tidak ada kertas belanja yang menunggu disalin.</p>
              <p className="text-xs text-slate-400 max-w-md">
                Dokumen muncul di sini setelah Finance melepas rencananya ke sourcing.
              </p>
            </CardContent>
          </Card>
        )}

        {(vendorsLoading || vendorsError) && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" role={vendorsError ? 'alert' : 'status'}>
            <p className="text-xs text-slate-700">{vendorsLoading ? 'Memuat daftar vendor lengkap…' : vendorsError}{vendors.length > 0 && ` ${vendors.length} vendor terakhir tetap bisa dicari.`}</p>
            {vendorsError && <Button variant="outline" size="sm" disabled={vendorsLoading} onClick={() => refreshVendors()}>Coba lagi</Button>}
          </div>
        )}

        {menunggu.length > 0 && (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="p-5 flex flex-wrap justify-between items-center gap-4 border-b bg-slate-50 dark:bg-slate-900/50">
                <div>
                  <p className="text-[11px] font-bold uppercase text-slate-400 tracking-widest">Kertas Belanja</p>
                  <h3 className="font-bold text-lg">
                    {selectedPurchases.length === 1
                      ? kodeDokumen(selectedPurchases[0].id)
                      : `${selectedPurchases.length} dokumen dipilih`}
                  </h3>
                  <p className="text-xs text-slate-500 font-bold">{baris.length} barang siap disalin</p>
                  {selectedPurchases.length > 1 && (
                    <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                      {selectedPurchases.map(p => kodeDokumen(p.id)).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-64">
                    <Label className="text-[11px] font-bold uppercase text-slate-500">Sumber kas belanja tunai</Label>
                    <SearchSelect
                      value={pocketDipakai}
                      onChange={setPocketId}
                      options={bankAccounts.map(b => ({ value: b.id, label: b.name || b.id }))}
                      placeholder="— Pilih sumber kas —"
                    />
                  </div>
                </div>
              </div>

              {terpilih.length > 0 && (
                <div className="px-5 py-3 border-b bg-emerald-50/70 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold  text-emerald-700">
                    {terpilih.length} baris dipilih
                  </span>
                  <div className="w-44">
                    <SearchSelect
                      value=""
                      onChange={v => v && massal({ vendorId: v })}
                      options={selectableVendors(vendors).map(v => ({ value: v.id, label: v.companyName }))}
                      disabled={vendorsLoading && vendors.length === 0}
                      placeholder="Vendor…"
                      className="border-emerald-200"
                    />
                  </div>
                  <select
                    className="h-9 rounded-lg border border-emerald-200 px-2 text-xs font-bold bg-white"
                    value=""
                    onChange={e => { if (e.target.value) massal({ paymentMethod: e.target.value as ReportLine['paymentMethod'] }); e.target.value = '' }}
                  >
                    <option value="">Cara bayar…</option>
                    <option value="Cash">Cash</option>
                    <option value="Tempo">Tempo</option>
                    <option value="Transfer">Transfer</option>
                  </select>
                  <Button variant="outline" className="h-9 font-bold text-[11px] uppercase"
                    onClick={() => massal({ isChecked: false, qtyPurchased: 0 })}>
                    Tandai kosong di pasar
                  </Button>
                  <Button variant="ghost" className="h-9 font-bold text-[11px] uppercase text-slate-400"
                    onClick={() => setPilih(new Set())}>
                    Batal pilih
                  </Button>
                </div>
              )}

              <div className="overflow-x-auto">
                <Table className="min-w-[1100px]">
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-900/50">
                      <TableHead className="w-10">
                        <input type="checkbox" className="w-4 h-4 accent-emerald-600"
                          checked={lines.length > 0 && lines.every(l => pilih.has(l.id))}
                          onChange={() => setPilih(prev => toggleAll(lines.map(l => l.id), prev))} />
                      </TableHead>
                      <TableHead className="text-[11px] font-bold">SKU</TableHead>
                      <TableHead className="text-[11px] font-bold">Nama Barang</TableHead>
                      <TableHead className="text-[11px] font-bold text-center">Qty Beli</TableHead>
                      <TableHead className="text-[11px] font-bold text-right">Perkiraan belanja</TableHead>
                      <TableHead className="text-[11px] font-bold bg-amber-50">Total Beli Asli (Rp)</TableHead>
                      <TableHead className="text-[11px] font-bold bg-amber-50">Qty Asli</TableHead>
                      <TableHead className="text-[11px] font-bold bg-amber-50">Vendor</TableHead>
                      <TableHead className="text-[11px] font-bold bg-amber-50">Catatan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map(l => {
                      const pi = baris.find(b => b.id === l.id)!
                      const product = products.find(p => p.id === l.productId)
                      const so = salesOrders.find(s => s.id === pi.salesOrderId)
                      const allocations = l.qtyPurchased >= 0 && l.qtyPurchased <= pi.qtyTarget ? allocateMergedActuals(pi.members,l.qtyPurchased,l.qtyPurchased*l.actualUnitPrice) : []
                      const ceil = batas.get(l.id) || 0
                      const lewat = isOverCeiling(l.actualUnitPrice, ceil)
                      return (
                        <TableRow key={l.id} className={cn(!l.isChecked && "opacity-50", pilih.has(l.id) && "bg-emerald-50/60")}>
                          <TableCell>
                            <input type="checkbox" className="w-4 h-4 accent-emerald-600"
                              checked={pilih.has(l.id)}
                              onChange={() => setPilih(prev => { const n = new Set(prev); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n })} />
                          </TableCell>
                          <TableCell className="text-[11px] font-bold text-slate-400">{product?.skuCode}</TableCell>
                          <TableCell>
                            <p className="font-bold text-sm">{product?.name}</p>
                            <p className="text-[11px] text-slate-400 font-bold uppercase">
                              {pi.members.map(m => `${kodeDokumen(m.purchaseId)} / ${salesOrders.find(s=>s.id===m.salesOrderId)?.poNumber || 'stok'}: sisa ${m.qtyTarget}`).join(' · ')}
                              {menunggu.length > 1 && ` · ${kodeDokumen(l.purchaseId)}`}
                            </p>
                            <p className="text-[11px] text-emerald-700">{allocations.filter(a=>a.qtyPurchased > 0).map(a=>`${kodeDokumen(pi.members.find(m=>m.id===a.id)!.purchaseId)}: ${a.qtyPurchased} ${product?.uom || ''} = ${formatRupiah(a.qtyPurchased*a.actualUnitPrice)}`).join(' · ')}</p>
                          </TableCell>
                          <TableCell className="text-center font-bold text-sm">{pi.qtyTarget} {product?.uom}</TableCell>
                          <TableCell className="text-right">
                            <span className="block text-xs font-bold text-slate-700">{formatRupiah((pi.estimatedUnitPrice || 0) * pi.qtyTarget)}</span>
                            <span className="mt-0.5 block text-[11px] text-slate-500">{formatRupiah(pi.estimatedUnitPrice || 0)} per {product?.uom || 'unit'}</span>
                          </TableCell>

                          <TableCell className="bg-amber-50/40 whitespace-normal min-w-[160px] max-w-[220px]">
                            <Input
                              type="text" inputMode="numeric"
                              className={cn("h-9 w-28 text-right font-bold", lewat && "border-rose-300 text-rose-600")}
                              aria-label={`Total beli asli ${product?.name || l.productId}`}
                              disabled={l.qtyPurchased <= 0}
                              value={formatNumber(draft[l.id]?.actualTotal ?? Math.round(l.actualUnitPrice * l.qtyPurchased))}
                              placeholder="0"
                              onChange={e => set(l.id, { actualTotal: parseNumber(e.target.value) })}
                            />
                            <p className="mt-1 text-[11px] text-slate-500">Total untuk {l.qtyPurchased} {product?.uom || 'unit'} · {formatRupiah(l.actualUnitPrice)} per {product?.uom || 'unit'}</p>
                            {/* Batas 0 = sistem tidak tahu harga jualnya (belanja stok atau
                                barang belum pernah dijual). Diamnya harus terbaca sebagai
                                "belum ketahuan", bukan "aman". */}
                            {!ceil && (
                              <p className="mt-1 text-[11px] text-slate-400">
                                Belum ada patokan untung — barang ini tidak menempel ke pesanan klien.
                              </p>
                            )}
                            {/* Angka batasnya ditulis apa adanya — biar ruang tawar
                                kelihatan SEBELUM nawar, bukan setelah kena merah. */}
                            {ceil > 0 && !lewat && (
                              <p className="tabular mt-1 text-[11px] text-slate-400">
                                Batas total {formatRupiah(ceil * l.qtyPurchased)}
                              </p>
                            )}
                            {lewat && (
                              <>
                                <p className="text-[11px] font-bold text-rose-600 mt-1">
                                  Lewat batas total {formatRupiah(ceil * l.qtyPurchased)} ({overByPct(l.actualUnitPrice, ceil)}%) — alasannya?
                                </p>
                                <Input
                                  className="h-8 mt-1 text-xs border-rose-200"
                                  placeholder="Kenapa mahal?"
                                  value={l.overCeilingReason || ''}
                                  onChange={e => set(l.id, { overCeilingReason: e.target.value })}
                                />
                              </>
                            )}
                          </TableCell>

                          <TableCell className="bg-amber-50/40">
                            <Input
                              type="number" min="0" step="any"
                              onWheel={(e) => e.currentTarget.blur()}
                              className="h-9 w-20 text-right font-bold"
                              value={l.qtyPurchased || ''}
                              onChange={e => {
                                const q = parseFloat(e.target.value) || 0
                                set(l.id, { qtyPurchased: q, isChecked: q > 0, ...(q <= 0 ? { actualTotal: 0 } : {}) })
                              }}
                            />
                          </TableCell>

                          <TableCell className="bg-amber-50/40 min-w-[180px]">
                            <SearchSelect
                              value={l.vendorId || ''}
                              onChange={v => set(l.id, { vendorId: v || null })}
                              options={selectableVendors(vendors, l.vendorId || undefined).map(v => ({ value: v.id, label: v.companyName }))}
                              disabled={vendorsLoading && vendors.length === 0}
                              placeholder="— Pilih vendor —"
                              emptyLabel="— Kosongkan —"
                            />
                          </TableCell>

                          <TableCell className="bg-amber-50/40 min-w-[160px]">
                            <Input
                              className="h-9 text-xs"
                              placeholder="—"
                              value={l.notes || ''}
                              onChange={e => set(l.id, { notes: e.target.value })}
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Ops ada di bawah tabel, sama seperti di kertasnya. */}
              <div className="p-5 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold  text-slate-500">Pengeluaran Operasional</p>
                  <Button variant="outline" size="sm" className="font-bold text-[11px] uppercase"
                    onClick={() => setOps(prev => [...prev, { id: uuidv4(), kategori: 'Bensin', nominal: 0, keterangan: '' }])}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Tambah baris
                  </Button>
                </div>
                <p className="text-xs text-slate-500">Sumber kas bisa berbeda tiap biaya. Jika tidak dipilih, mengikuti kas belanja. Kas biaya operasional dipotong setelah disetujui Finance.</p>
                {ops.length === 0 && <p className="text-xs text-slate-400 font-bold">Belum ada. Bensin, tol, parkir, kuli, makan.</p>}
                {ops.map(o => (
                  <div key={o.id} className="flex flex-wrap items-center gap-2">
                    <select
                      className="h-9 rounded-lg border border-slate-200 px-2 text-xs font-bold bg-white"
                      value={o.kategori}
                      onChange={e => setOps(prev => prev.map(x => x.id === o.id ? { ...x, kategori: e.target.value } : x))}
                    >
                      {KATEGORI_OPS.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                    <Input
                      type="text" inputMode="numeric"
                      className="h-9 w-32 text-right font-bold"
                      placeholder="0"
                      value={o.nominal ? formatNumber(o.nominal) : ''}
                      onChange={e => setOps(prev => prev.map(x => x.id === o.id ? { ...x, nominal: parseNumber(e.target.value) } : x))}
                    />
                    <div className="w-60" aria-label={`Sumber kas biaya ${o.kategori}`}>
                      <SearchSelect
                        value={o.sourceBankAccountId || ''}
                        onChange={v => setOps(prev => prev.map(x => x.id === o.id ? { ...x, sourceBankAccountId: v || undefined } : x))}
                        options={bankAccounts.map(b => ({ value: b.id, label: b.name || b.id }))}
                        placeholder={`Kas belanja: ${kantongTerpakai?.name || 'belum dipilih'}`}
                        emptyLabel="Ikuti sumber kas belanja"
                      />
                    </div>
                    <Input
                      className="h-9 flex-1 min-w-[160px] text-xs"
                      placeholder="Keterangan"
                      value={o.keterangan}
                      onChange={e => setOps(prev => prev.map(x => x.id === o.id ? { ...x, keterangan: e.target.value } : x))}
                    />
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-500"
                      onClick={() => setOps(prev => prev.filter(x => x.id !== o.id))}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Rekap uang: bukan rekonsiliasi, cuma supaya salah ketik nol kelihatan.
                  Kantong sourcing diisi mingguan dan ditarik seperlunya, jadi tidak ada
                  uang titipan per perjalanan yang perlu dicocokkan di sini. Saldo
                  kantongnya sendiri yang jadi pemeriksanya, di layar Pantau Harian. */}
              <div className="p-5 border-t bg-slate-50 dark:bg-slate-900/50 space-y-3">
                <div className="grid gap-2 md:grid-cols-2 text-sm">
                  <div className="flex justify-between"><span className="font-bold text-slate-500">Belanja</span><span className="font-bold">{formatRupiah(totalBelanja)}</span></div>
                  <div className="flex justify-between"><span>Tunai / Transfer / Tempo</span><span>{formatRupiah(totalTunai)} / {formatRupiah(totalTransfer)} / {formatRupiah(totalTempo)}</span></div>
                  <div className="flex justify-between"><span className="font-bold text-slate-500">Operasional</span><span className="font-bold">{formatRupiah(totalOps)}</span></div>
                  <div className="flex justify-between md:col-span-2 border-t pt-2">
                    <span className="font-bold text-slate-500">Total pengeluaran kas</span>
                    <span className="font-bold text-emerald-600">{formatRupiah(totalTunai + totalTransfer + totalOps)}</span>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-[11px] font-bold uppercase text-slate-500">Foto kertasnya (opsional)</Label>
                    <ReceiptUpload label="Foto lembar belanja" currentFile={foto || undefined} onFileSelect={setFoto} />
                  </div>
                  <div>
                    <Label className="text-[11px] font-bold uppercase text-slate-500">Catatan</Label>
                    <Input className="h-10" placeholder="Opsional" value={catatan} onChange={e => setCatatan(e.target.value)} />
                  </div>
                </div>

                {masalah.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
                    <p className="text-xs font-bold text-amber-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Belum bisa disimpan
                    </p>
                    {masalah.map((m, i) => <p key={i} className="text-[11px] font-bold text-amber-900">{m}</p>)}
                  </div>
                )}

                <div className="flex justify-between items-center gap-4">
                  <Badge variant="outline" className="font-bold text-[11px] uppercase">
                    {lines.filter(l => l.isChecked).length} dari {lines.length} barang kebeli
                  </Badge>
                  <Button
                    className="h-12 px-8 bg-emerald-600 hover:bg-emerald-700 font-bold"
                    disabled={kirim || masalah.length > 0}
                    onClick={simpan}
                  >
                    {kirim ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan…</> : 'Simpan salinan'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AuthGuard>
  )
}

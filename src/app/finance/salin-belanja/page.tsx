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

import { useMemo, useState } from "react"
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
import { reportProblems, submitShoppingReport, type ReportLine } from "@/lib/shopping-report"
import { toggleAll } from "@/lib/plan-table"
import { OperationalExpense } from "@/types"
import { v4 as uuidv4 } from "uuid"

type OpsRow = { id: string; kategori: string; nominal: number; keterangan: string }

const KATEGORI_OPS = ['Bensin', 'Tol', 'Parkir', 'Kuli', 'Makan', 'Lainnya']

export default function SalinBelanjaPage() {
  const purchases = useAppStore(s => s.purchases)
  const purchaseItems = useAppStore(s => s.purchaseItems)
  const products = useAppStore(s => s.products)
  const vendors = useAppStore(s => s.vendors)
  const salesOrders = useAppStore(s => s.salesOrders)
  const salesOrderItems = useAppStore(s => s.salesOrderItems)
  const bankAccounts = useAppStore(s => s.bankAccounts)
  const users = useAppStore(s => s.users)
  const currentUser = useAppStore(s => s.currentUser)
  const minMarginPct = useAppStore(s => s.minMarginPct)
  const addExpense = useAppStore(s => s.addExpense)

  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, Partial<ReportLine>>>({})
  const [pilih, setPilih] = useState<Set<string>>(new Set())
  const [pocketId, setPocketId] = useState("")
  const [atasNama, setAtasNama] = useState("")
  const [foto, setFoto] = useState<string | null>(null)
  const [catatan, setCatatan] = useState("")
  const [ops, setOps] = useState<OpsRow[]>([])
  const [sisaFisik, setSisaFisik] = useState<number | null>(null)
  const [alasanSelisih, setAlasanSelisih] = useState("")
  const [kirim, setKirim] = useState(false)

  // Dokumen yang rencananya sudah dilepas dan laporannya belum masuk.
  const menunggu = purchases.filter(p =>
    ['Pending', 'Belanja'].includes(p.status) &&
    p.reconciliationStatus !== 'Laporan Masuk' && p.reconciliationStatus !== 'Terverifikasi')
  const aktif = openId ? purchases.find(p => p.id === openId) : menunggu[0]

  // Barang yang dibeli sendiri di pasar. Kiriman vendor dan belanja online tidak lewat
  // kertas ini — vendor mengantar sendiri, online dipesan Finance dari mejanya.
  const baris = useMemo(
    () => purchaseItems.filter(pi => pi.purchaseId === aktif?.id && (pi.purchaseMethod === 'Pasar' || !pi.purchaseMethod)),
    [purchaseItems, aktif?.id],
  )

  const nilai = (id: string, field: keyof ReportLine) => draft[id]?.[field]
  const set = (id: string, patch: Partial<ReportLine>) =>
    setDraft(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  /** Baris siap kirim: gabungan yang tersimpan dengan yang barusan diketik. */
  const lines: ReportLine[] = baris.map(pi => ({
    id: pi.id,
    productId: pi.productId,
    purchaseId: pi.purchaseId,
    purchaseMethod: pi.purchaseMethod,
    isChecked: (nilai(pi.id, 'isChecked') as boolean | undefined) ?? true,
    actualUnitPrice: (nilai(pi.id, 'actualUnitPrice') as number | undefined) ?? (pi.actualUnitPrice || pi.estimatedUnitPrice || 0),
    qtyPurchased: (nilai(pi.id, 'qtyPurchased') as number | undefined) ?? (pi.qtyPurchased || pi.qtyTarget || 0),
    vendorId: (nilai(pi.id, 'vendorId') as string | undefined) ?? pi.vendorId ?? pi.plannedVendorId ?? null,
    paymentMethod: (nilai(pi.id, 'paymentMethod') as ReportLine['paymentMethod']) ?? (pi.paymentMethod as ReportLine['paymentMethod']) ?? 'Cash',
    notes: (nilai(pi.id, 'notes') as string | undefined) ?? pi.notes ?? '',
    overCeilingReason: (nilai(pi.id, 'overCeilingReason') as string | undefined) ?? pi.overCeilingReason ?? '',
  }))

  const batas = useMemo(
    () => ceilingByLine(baris, salesOrderItems, minMarginPct),
    [baris, salesOrderItems, minMarginPct],
  )

  const totalBelanja = lines.filter(l => l.isChecked).reduce((s, l) => s + l.qtyPurchased * l.actualUnitPrice, 0)
  const totalOps = ops.reduce((s, o) => s + o.nominal, 0)
  const uangDibawa = Number(aktif?.disbursedAmount || aktif?.budgetAmount || 0)
  const sisaSeharusnya = uangDibawa - totalBelanja - totalOps
  const selisihKas = sisaFisik === null ? 0 : sisaFisik - sisaSeharusnya

  const namaProduk = (productId: string) => products.find(p => p.id === productId)?.name || productId
  const kantong = pocketOwners(bankAccounts)
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

  const masalah = aktif ? reportProblems(
    { purchaseIds: [aktif.id], lines, pocketBankAccountId: pocketId || null, onBehalfOfUserId: atasNama || null, proofImage: foto, ceilings: batas },
    namaProduk, currentUser?.id,
  ) : ['Belum ada dokumen belanja yang menunggu laporan.']

  const simpan = async () => {
    if (!aktif || masalah.length > 0) return
    if (sisaFisik !== null && selisihKas !== 0 && !alasanSelisih.trim()) {
      toast.error("Sisa uangnya tidak cocok. Tulis dulu kenapa.")
      return
    }
    setKirim(true)
    const t = toast.loading("Menyimpan salinan kertas belanja…")
    try {
      const res = await submitShoppingReport(useAppStore.getState, {
        purchaseIds: [aktif.id],
        lines,
        pocketBankAccountId: pocketId || null,
        onBehalfOfUserId: atasNama || null,
        proofImage: foto,
        reconciliationNote: [catatan, alasanSelisih && `Selisih kas: ${alasanSelisih}`].filter(Boolean).join(' | '),
      })
      if (!res.ok) { toast.error(res.problems.join(' · '), { id: t }); return }
      res.warnings.forEach(w => toast.warning(w))

      // Ops ikut disimpan dari layar yang sama — di kertasnya juga ada di bawah tabel.
      for (const o of ops) {
        if (!(o.nominal > 0)) continue
        await addExpense({
          id: uuidv4(),
          date: new Date().toISOString(),
          reporterId: currentUser?.id || 'system',
          purchaseId: aktif.id,
          category: (o.kategori || 'Lainnya') as OperationalExpense['category'],
          amount: o.nominal,
          description: o.keterangan || o.kategori,
          receiptUrl: foto || undefined,
          status: 'Pending Audit',
        })
      }

      toast.success(`Salinan tersimpan. Belanja ${formatRupiah(totalBelanja)}${totalOps > 0 ? ` + ops ${formatRupiah(totalOps)}` : ''}.`, { id: t })
      setDraft({}); setPilih(new Set()); setOps([]); setFoto(null); setSisaFisik(null); setAlasanSelisih(""); setCatatan("")
      setOpenId(null)
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
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Salin Kertas Belanja</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            Urutan kolomnya sama dengan lembar yang dibawa ke pasar — tinggal disalin
          </p>
        </div>

        {menunggu.length === 0 && (
          <Card className="py-20 text-center border-dashed">
            <CardContent className="flex flex-col items-center gap-3">
              <ClipboardList className="w-14 h-14 text-slate-200" />
              <p className="font-black text-slate-500">Tidak ada kertas belanja yang menunggu disalin.</p>
              <p className="text-xs text-slate-400 max-w-md">
                Dokumen muncul di sini setelah Finance melepas rencananya ke sourcing.
              </p>
            </CardContent>
          </Card>
        )}

        {menunggu.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {menunggu.map(p => (
              <Button key={p.id} size="sm" variant={aktif?.id === p.id ? "default" : "outline"}
                className="font-black text-[11px]" onClick={() => { setOpenId(p.id); setDraft({}); setPilih(new Set()) }}>
                {p.advanceCode || p.id.slice(0, 8)}
              </Button>
            ))}
          </div>
        )}

        {aktif && (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="p-5 flex flex-wrap justify-between items-center gap-4 border-b bg-slate-50 dark:bg-slate-900/50">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Kertas Belanja</p>
                  <h3 className="font-black text-lg">{aktif.advanceCode || aktif.id.slice(0, 8)}</h3>
                  <p className="text-xs text-slate-500 font-bold">{baris.length} barang · uang dibawa {formatRupiah(uangDibawa)}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="w-52">
                    <Label className="text-[10px] font-black uppercase text-slate-500">Kantong yang dipotong</Label>
                    <SearchSelect
                      value={pocketId}
                      onChange={setPocketId}
                      options={kantong.map(b => ({ value: b.id, label: b.name }))}
                      placeholder="— Pilih kantong —"
                    />
                  </div>
                  <div className="w-52">
                    <Label className="text-[10px] font-black uppercase text-slate-500">Yang belanja di lapangan</Label>
                    <SearchSelect
                      value={atasNama}
                      onChange={setAtasNama}
                      options={users.filter(u => ['sourcing', 'gudang', 'kurir'].includes(u.role)).map(u => ({ value: u.id, label: u.name }))}
                      placeholder="— Saya sendiri —"
                      emptyLabel="— Saya sendiri —"
                    />
                  </div>
                </div>
              </div>

              {terpilih.length > 0 && (
                <div className="px-5 py-3 border-b bg-emerald-50/70 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                    {terpilih.length} baris dipilih
                  </span>
                  <div className="w-44">
                    <SearchSelect
                      value=""
                      onChange={v => v && massal({ vendorId: v })}
                      options={selectableVendors(vendors).map(v => ({ value: v.id, label: v.companyName }))}
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
                  <Button variant="outline" className="h-9 font-black text-[10px] uppercase"
                    onClick={() => massal({ isChecked: false, qtyPurchased: 0 })}>
                    Tandai kosong di pasar
                  </Button>
                  <Button variant="ghost" className="h-9 font-black text-[10px] uppercase text-slate-400"
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
                      <TableHead className="text-[10px] font-black">SKU</TableHead>
                      <TableHead className="text-[10px] font-black">Nama Barang</TableHead>
                      <TableHead className="text-[10px] font-black text-center">Qty Beli</TableHead>
                      <TableHead className="text-[10px] font-black text-right">Harga Patokan</TableHead>
                      <TableHead className="text-[10px] font-black bg-amber-50">Harga Beli Asli</TableHead>
                      <TableHead className="text-[10px] font-black bg-amber-50">Qty Asli</TableHead>
                      <TableHead className="text-[10px] font-black bg-amber-50">Vendor</TableHead>
                      <TableHead className="text-[10px] font-black bg-amber-50">Catatan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map(l => {
                      const pi = baris.find(b => b.id === l.id)!
                      const product = products.find(p => p.id === l.productId)
                      const so = salesOrders.find(s => s.id === pi.salesOrderId)
                      const ceil = batas.get(l.id) || 0
                      const lewat = isOverCeiling(l.actualUnitPrice, ceil)
                      return (
                        <TableRow key={l.id} className={cn(!l.isChecked && "opacity-50", pilih.has(l.id) && "bg-emerald-50/60")}>
                          <TableCell>
                            <input type="checkbox" className="w-4 h-4 accent-emerald-600"
                              checked={pilih.has(l.id)}
                              onChange={() => setPilih(prev => { const n = new Set(prev); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n })} />
                          </TableCell>
                          <TableCell className="text-[10px] font-bold text-slate-400">{product?.skuCode}</TableCell>
                          <TableCell>
                            <p className="font-bold text-sm">{product?.name}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase">{so?.poNumber || '—'}</p>
                          </TableCell>
                          <TableCell className="text-center font-black text-sm">{pi.qtyTarget} {product?.uom}</TableCell>
                          <TableCell className="text-right text-xs font-bold text-slate-500">{formatRupiah(pi.estimatedUnitPrice || 0)}</TableCell>

                          <TableCell className="bg-amber-50/40">
                            <Input
                              type="text" inputMode="numeric"
                              className={cn("h-9 w-28 text-right font-bold", lewat && "border-rose-300 text-rose-600")}
                              value={l.actualUnitPrice ? formatNumber(l.actualUnitPrice) : ''}
                              placeholder="0"
                              onChange={e => set(l.id, { actualUnitPrice: parseNumber(e.target.value) })}
                            />
                            {lewat && (
                              <>
                                <p className="text-[9px] font-black text-rose-600 mt-1">
                                  Lewat batas {overByPct(l.actualUnitPrice, ceil)}% — alasannya?
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
                                set(l.id, { qtyPurchased: q, isChecked: q > 0 })
                              }}
                            />
                          </TableCell>

                          <TableCell className="bg-amber-50/40 min-w-[180px]">
                            <SearchSelect
                              value={l.vendorId || ''}
                              onChange={v => set(l.id, { vendorId: v || null })}
                              options={selectableVendors(vendors, l.vendorId || undefined).map(v => ({ value: v.id, label: v.companyName }))}
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
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">Pengeluaran Operasional</p>
                  <Button variant="outline" size="sm" className="font-black text-[10px] uppercase"
                    onClick={() => setOps(prev => [...prev, { id: uuidv4(), kategori: 'Bensin', nominal: 0, keterangan: '' }])}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Tambah baris
                  </Button>
                </div>
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

              {/* Rekap uang: satu-satunya tempat selisih kas ketahuan hari itu juga. */}
              <div className="p-5 border-t bg-slate-50 dark:bg-slate-900/50 space-y-3">
                <div className="grid gap-2 md:grid-cols-2 text-sm">
                  <div className="flex justify-between"><span className="font-bold text-slate-500">Uang dibawa</span><span className="font-black">{formatRupiah(uangDibawa)}</span></div>
                  <div className="flex justify-between"><span className="font-bold text-slate-500">Belanja</span><span className="font-black">{formatRupiah(totalBelanja)}</span></div>
                  <div className="flex justify-between"><span className="font-bold text-slate-500">Operasional</span><span className="font-black">{formatRupiah(totalOps)}</span></div>
                  <div className="flex justify-between"><span className="font-bold text-slate-500">Sisa seharusnya</span><span className="font-black text-emerald-600">{formatRupiah(sisaSeharusnya)}</span></div>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <Label className="text-[10px] font-black uppercase text-slate-500">Sisa uang yang dikembalikan</Label>
                    <Input
                      type="text" inputMode="numeric"
                      className="h-10 w-40 text-right font-bold"
                      placeholder="—"
                      value={sisaFisik === null ? '' : formatNumber(sisaFisik)}
                      onChange={e => setSisaFisik(e.target.value.trim() === '' ? null : parseNumber(e.target.value))}
                    />
                  </div>
                  {sisaFisik !== null && selisihKas !== 0 && (
                    <div className="flex-1 min-w-[240px]">
                      <Label className="text-[10px] font-black uppercase text-amber-700">
                        {selisihKas > 0 ? 'Lebih' : 'Kurang'} {formatRupiah(Math.abs(selisihKas))} — kenapa?
                      </Label>
                      <Input className="h-10 border-amber-200" placeholder="Misal: kembalian belum dihitung, ada ongkos tak terduga"
                        value={alasanSelisih} onChange={e => setAlasanSelisih(e.target.value)} />
                    </div>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-[10px] font-black uppercase text-slate-500">Foto kertasnya</Label>
                    <ReceiptUpload label="Foto lembar belanja" currentFile={foto || undefined} onFileSelect={setFoto} />
                  </div>
                  <div>
                    <Label className="text-[10px] font-black uppercase text-slate-500">Catatan</Label>
                    <Input className="h-10" placeholder="Opsional" value={catatan} onChange={e => setCatatan(e.target.value)} />
                  </div>
                </div>

                {masalah.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
                    <p className="text-xs font-black text-amber-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Belum bisa disimpan
                    </p>
                    {masalah.map((m, i) => <p key={i} className="text-[11px] font-bold text-amber-900">{m}</p>)}
                  </div>
                )}

                <div className="flex justify-between items-center gap-4">
                  <Badge variant="outline" className="font-black text-[10px] uppercase">
                    {lines.filter(l => l.isChecked).length} dari {lines.length} barang kebeli
                  </Badge>
                  <Button
                    className="h-12 px-8 bg-emerald-600 hover:bg-emerald-700 font-black"
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

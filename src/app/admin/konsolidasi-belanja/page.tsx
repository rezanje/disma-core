"use client"

import FieldPacketWorkspace from "@/components/field-packet-workspace"
import { v4 as uuidv4, v5 as uuidv5 } from "uuid"
import React, { useMemo, useState } from "react"
import Link from "next/link"
import { executePurchaseCommand } from "@/lib/purchase-command"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PdfCanvasPreview } from "@/components/pdf-canvas-preview"
import { generateShoppingListPDFDataUrl } from "@/lib/pdf"
import { gabungBaris, tunaiDibutuhkan, type BarisBelanja } from "@/lib/belanja-merge"
import { dayKey, dayLabel } from "@/lib/po-grouping"
import { cn, formatRupiah } from "@/lib/utils"
import { toast } from "sonner"
import { FileText, Printer, Send, Truck, ShoppingBasket, Loader2, X, Download } from "lucide-react"

const LOKASI_LABEL: Record<string, string> = {
  Pasar: 'Pasar', Online: 'Beli Online', Vendor: 'Vendor Kirim', Dropship: 'Dropship',
}

/** Baris cetak untuk satu dokumen, dibaca dari yang tersimpan. */
function barisDokumen(
  purchaseId: string,
  purchaseItems: ReturnType<typeof useAppStore.getState>['purchaseItems'],
  products: ReturnType<typeof useAppStore.getState>['products'],
  vendors: ReturnType<typeof useAppStore.getState>['vendors'],
): BarisBelanja[] {
  return purchaseItems.filter(pi => pi.purchaseId === purchaseId).map(pi => {
    const product = products.find(p => p.id === pi.productId)
    // Vendor pilihan Finance ada di plannedVendorId; vendorId baru terisi setelah
    // barangnya benar-benar dibeli.
    const vendorId = pi.plannedVendorId || null
    return {
      purchaseId,
      productId: pi.productId,
      productName: product?.name || pi.productId,
      skuCode: product?.skuCode || '',
      uom: product?.uom,
      totalQty: pi.qtyTarget,
      estimatedPrice: pi.estimatedUnitPrice,
      purchaseMethod: pi.purchaseMethod,
      paymentMethod: pi.paymentMethod,
      vendorId,
      vendorName: vendors.find(v => v.id === vendorId)?.companyName,
    }
  })
}

export default function KonsolidasiBelanjaPage() {
  const purchases = useAppStore(s => s.purchases)
  const purchaseItems = useAppStore(s => s.purchaseItems)
  const products = useAppStore(s => s.products)
  const vendors = useAppStore(s => s.vendors)
  const salesOrders = useAppStore(s => s.salesOrders)
  const updatePurchase = useAppStore(s => s.updatePurchase)

  const [dipilih, setDipilih] = useState<Set<string>>(new Set())
  const [melepas, setMelepas] = useState(false)
  const [printedSelection, setPrintedSelection] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [pdf, setPdf] = useState<{ url: string; title: string } | null>(null)

  const siapCetak = useMemo(
    () => purchases.filter(p => p.status === 'Siap Cetak')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [purchases],
  )
  const sudahDilepas = useMemo(
    () => purchases.filter(p => p.status === 'Pending' || p.status === 'Belanja')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [purchases],
  )

  // Dokumen baru otomatis tercentang. Yang biasa terjadi adalah semuanya dicetak jadi
  // satu; mencentang ulang tiap pagi cuma pekerjaan tambahan yang gampang terlewat.
  const kunciSiap = siapCetak.map(p => p.id).join('|')
  React.useEffect(() => { setDipilih(new Set(siapCetak.map(p => p.id))) }, [kunciSiap])

  /** Tanggal kirim dokumen, diambil dari PO yang menyumbang barisnya. */
  const tanggalKirim = (purchaseId: string): string => {
    const soIds = new Set(purchaseItems.filter(pi => pi.purchaseId === purchaseId).map(pi => pi.salesOrderId).filter(Boolean))
    const kunci = [...soIds]
      .map(id => dayKey(salesOrders.find(so => so.id === id)?.targetDeliveryDate))
      .filter(Boolean)
      .sort()
    return kunci[0] || ''
  }

  const barisMentah = useMemo(
    () => [...dipilih].flatMap(id => barisDokumen(id, purchaseItems, products, vendors)),
    [dipilih, purchaseItems, products, vendors],
  )
  const gabungan = useMemo(() => gabungBaris(barisMentah), [barisMentah])
  const barisPasar = gabungan.filter(r => r.purchaseMethod === 'Pasar')
  const tunai = tunaiDibutuhkan(gabungan)
  const hematBaris = barisMentah.length - gabungan.length

  // Dokumen yang sudah dilepas tetap boleh ikut dicetak — lembarnya bisa hilang di
  // jalan, dan yang sudah berjalan kemarin sering perlu dicetak ulang bersama yang
  // baru. Yang tidak boleh diulang cuma pelepasannya.
  const bisaDilepas = [...dipilih].filter(id => siapCetak.some(p => p.id === id))

  const kodeDokumen = (id: string) => purchases.find(p => p.id === id)?.advanceCode || id.slice(0, 8)

  const toggle = (id: string) => setDipilih(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const cetakGabungan = async () => {
    if (barisPasar.length === 0) return toast.error("Tidak ada barang jalur pasar untuk dicetak.")
    const selected = purchases.filter(p=>dipilih.has(p.id))
    const released = selected.filter(p=>p.status !== 'Siap Cetak')
    const sessions = new Set(released.map(p=>p.paperSessionId || p.id))
    if (released.length && (released.length !== selected.length || sessions.size > 1)) return toast.error('Cetak ulang satu sesi yang sudah dilepas secara terpisah agar ID kertas tetap dapat ditelusuri.')
    const session = released[0]?.paperSessionId || `KERTAS-${uuidv4().slice(0,8).toUpperCase()}`
    try { for (const id of dipilih) await updatePurchase(id, {paperSessionId:session}) }
    catch (e) { toast.error('ID sesi kertas gagal disimpan.'); return }
    setSessionId(session); setPrintedSelection([...dipilih].sort().join('|'))
    const judul = `${session} | ${[...dipilih].map(kodeDokumen).join(', ')}`
    setPdf({ title: judul, url: generateShoppingListPDFDataUrl(barisPasar, judul) })
  }

  const cetakSatuDokumen = (purchaseId: string) => {
    const judul = `DAFTAR BELANJA #${kodeDokumen(purchaseId)}`
    const isi = gabungBaris(barisDokumen(purchaseId, purchaseItems, products, vendors))
      .filter(r => r.purchaseMethod === 'Pasar')
    if (isi.length === 0) return toast.error("Dokumen ini tidak punya barang jalur pasar.")
    setPdf({ title: judul, url: generateShoppingListPDFDataUrl(isi, judul) })
  }

  const lepasKeSourcing = async () => {
    if (bisaDilepas.length === 0 || melepas) return
    if (barisPasar.length > 0 && (printedSelection !== [...dipilih].sort().join('|') || !sessionId)) return toast.error('Cetak gabungan untuk pilihan dokumen ini terlebih dahulu agar ID sesi pada kertas sama.')
    setMelepas(true)
    try {
      useAppStore.getState().takeDevSnapshot()
      await executePurchaseCommand(useAppStore.getState,{eventId:uuidv5(`paper-release:${sessionId}:${bisaDilepas.slice().sort().join('|')}`,uuidv5.URL),stage:'paper-release',sourceId:sessionId || bisaDilepas[0],payload:{purchaseIds:bisaDilepas,paperSessionId:sessionId}})
      toast.success(`${bisaDilepas.length} dokumen dilepas. Tim sourcing sudah bisa melihatnya.`)
    } catch (e) {
      toast.error("Gagal melepas: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setMelepas(false)
    }
  }

  return (
    <div className="space-y-6">
      <FieldPacketWorkspace/>
      <div>
        <h2 className="text-[19px] leading-tight font-semibold text-slate-900">Kertas belanja</h2>
        <p className="text-muted-foreground">
          Satukan dokumen yang sudah direncanakan Finance jadi satu lembar, cetak, lalu lepas ke sourcing.
        </p>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-500" />
            Dokumen Siap Dicetak
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {siapCetak.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-8 text-center">
              <p className="text-sm font-bold text-slate-500">Belum ada dokumen yang selesai direncanakan Finance.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link
                  href="/admin/shopping-list"
                  className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-[11px] font-bold  text-slate-600 hover:bg-slate-50"
                >
                  Satukan PO Dulu
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50/80">
              {siapCetak.map(p => {
                const jml = purchaseItems.filter(pi => pi.purchaseId === p.id).length
                return (
                  <label key={p.id} className={cn(
                    "flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-white",
                    dipilih.has(p.id) && "bg-emerald-50/60",
                  )}>
                    <Checkbox
                      checked={dipilih.has(p.id)}
                      onCheckedChange={() => toggle(p.id)}
                      className="h-5 w-5 rounded-md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">{p.advanceCode || p.id.slice(0, 8)}</span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold  text-emerald-600 shadow-sm">
                          {jml} item
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                        Kirim {dayLabel(tanggalKirim(p.id))} • Rencana tunai {formatRupiah(p.budgetAmount || 0)}
                      </p>
                    </div>
                  </label>
                )
              })}
            </div>
          )}

        </CardContent>
      </Card>

      {gabungan.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBasket className="h-5 w-5 text-emerald-500" />
              Lembar Gabungan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[11px] font-bold  text-emerald-600">Hasil Gabungan</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">
                      {gabungan.length} baris dari {dipilih.size} dokumen
                    </h3>
                    <p className="mt-1 text-sm font-bold text-slate-500">
                      Uang tunai yang perlu disiapkan {formatRupiah(tunai)}
                    </p>
                    {hematBaris > 0 && (
                      <p className="mt-1 text-xs font-bold text-emerald-700">
                        {hematBaris} baris kembar disatukan — tidak perlu mendatangi lapak yang sama dua kali.
                      </p>
                    )}
                    {gabungan.length > barisPasar.length && (
                      <p className="mt-1 text-xs font-bold text-amber-600">
                        {barisPasar.length} baris masuk lembar pasar. Sisanya lewat vendor / belanja online, jadi tidak ikut tercetak.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="h-11 rounded-xl bg-white text-[11px] font-bold "
                      onClick={cetakGabungan}
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      Print Gabungan
                    </Button>
                    <Button
                      className="h-11 gap-2 rounded-xl bg-emerald-600 text-[11px] font-bold  text-white hover:bg-emerald-700"
                      disabled={melepas || bisaDilepas.length === 0}
                      title={bisaDilepas.length === 0 ? 'Semua yang dicentang sudah pernah dilepas.' : undefined}
                      onClick={lepasKeSourcing}
                    >
                      {melepas ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {melepas ? 'Melepas...' : bisaDilepas.length === 0 ? 'Sudah Dilepas Semua' : `Lepas ${bisaDilepas.length} Dokumen ke Sourcing`}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="max-h-[420px] overflow-auto rounded-2xl border border-slate-100">
                <Table className="min-w-[820px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">SKU</TableHead>
                      <TableHead>Produk</TableHead>
                      <TableHead className="w-[150px]">Vendor</TableHead>
                      <TableHead className="w-[90px] text-right">Qty</TableHead>
                      <TableHead className="w-[180px] text-right">Perkiraan belanja</TableHead>
                      <TableHead className="w-[150px] text-center">Lokasi · Bayar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gabungan.map((r, idx) => (
                      <TableRow key={`${r.productId}-${idx}`}>
                        <TableCell className="text-xs font-bold text-slate-400">{r.skuCode}</TableCell>
                        <TableCell className="text-xs font-bold text-slate-700">
                          <span>{r.productName}</span>
                          {r.dariDokumen.length > 1 && (
                            <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold  text-emerald-700">
                              gabungan {r.dariDokumen.length} dok
                            </span>
                          )}
                          <span className="mt-0.5 block text-[11px] font-bold text-slate-400">
                            {r.dariDokumen.map(kodeDokumen).join(' · ')}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-bold text-slate-500">{r.vendorName || 'Pasar umum'}</TableCell>
                        <TableCell className="text-right text-sm font-bold text-slate-700">
                          {r.totalQty}{r.uom ? ` ${r.uom}` : ''}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="block text-sm font-bold text-emerald-600">{formatRupiah(r.estimatedPrice * r.totalQty)}</span>
                          <span className="mt-0.5 block text-[11px] text-slate-500">{formatRupiah(r.estimatedPrice)} per {r.uom || 'unit'}</span>
                        </TableCell>
                        <TableCell className="text-center text-[11px] font-bold  text-slate-400">
                          {LOKASI_LABEL[r.purchaseMethod || 'Pasar'] || r.purchaseMethod} · {r.paymentMethod || 'Cash'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
          </CardContent>
        </Card>
      )}

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-slate-400" />
            Sudah Dilepas ke Sourcing
          </CardTitle>
          <p className="text-xs font-bold text-slate-400">
            Centang kalau mau ikut digabung ke lembar cetak di atas. Pelepasannya tidak diulang.
          </p>
        </CardHeader>
        <CardContent>
          {sudahDilepas.length === 0 ? (
            <p className="py-6 text-center text-sm font-bold text-slate-400">Belum ada dokumen yang dilepas.</p>
          ) : (
            <div className="space-y-2">
              {sudahDilepas.map(p => (
                <div key={p.id} className={cn(
                  "flex items-center gap-4 rounded-2xl border border-slate-100 px-4 py-3",
                  dipilih.has(p.id) && "border-emerald-200 bg-emerald-50/50",
                )}>
                  {/* Bisa ikut dicentang supaya dokumen yang sudah berjalan tetap bisa
                      digabung ke lembar cetak yang sama — misalnya lembarnya hilang di
                      jalan, atau susulan hari ini mau dicetak bareng sisa kemarin. */}
                  <Checkbox
                    checked={dipilih.has(p.id)}
                    onCheckedChange={() => toggle(p.id)}
                    className="h-5 w-5 rounded-md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">{p.advanceCode || p.id.slice(0, 8)}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold  text-slate-500">
                        {p.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                      {purchaseItems.filter(pi => pi.purchaseId === p.id).length} item • {formatRupiah(p.budgetAmount || 0)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    className="h-9 rounded-xl text-[11px] font-bold  text-slate-500"
                    onClick={() => cetakSatuDokumen(p.id)}
                  >
                    <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!pdf} onOpenChange={open => !open && setPdf(null)}>
        <DialogContent showCloseButton={false} className="max-w-[96vw] sm:max-w-[96vw] w-[96vw] h-[96vh] p-0 rounded-xl overflow-hidden border-none bg-slate-900 shadow-sm flex flex-col">
          <DialogHeader className="shrink-0 flex-row items-center justify-between space-y-0 bg-slate-900 p-6 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <ShoppingBasket className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold tracking-tight">Preview Daftar Belanja</DialogTitle>
                <p className="text-[11px] font-bold  text-slate-400">Cek dokumen sebelum download atau print</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Tutup preview"
              className="rounded-xl text-slate-400 hover:bg-slate-700 hover:text-white"
              onClick={() => setPdf(null)}
            >
              <X className="h-5 w-5" />
            </Button>
          </DialogHeader>
          <div className="flex-1 overflow-hidden bg-slate-800 p-4">
            {pdf && <PdfCanvasPreview url={pdf.url} />}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-slate-900 p-5">
            <p className="text-[11px] font-bold  text-slate-500">
              File belum diunduh sampai klik Download.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="h-11 rounded-xl border-slate-700 bg-slate-800 text-[11px] font-bold  text-white hover:bg-white hover:text-slate-900"
                onClick={() => {
                  if (!pdf) return
                  const w = window.open(pdf.url, '_blank')
                  w?.addEventListener('load', () => w.print())
                }}
              >
                <Printer className="mr-2 h-4 w-4" /> Print
              </Button>
              <Button
                className="h-11 rounded-xl bg-white text-[11px] font-bold  text-slate-900 hover:bg-slate-100"
                onClick={() => {
                  if (!pdf) return
                  const link = document.createElement('a')
                  link.href = pdf.url
                  link.download = `${pdf.title}.pdf`
                  link.click()
                }}
              >
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

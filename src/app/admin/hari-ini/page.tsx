"use client"

// Satu layar untuk satu hari kerja.
//
// Kejadian fisiknya cuma dua: barang datang pagi, barang dikirim siang. Aplikasinya
// dulu memecah itu jadi enam layar (Inbound, QC, Outbound, Serah Terima, Daftar Kurir,
// Audit Kiriman) karena dulu dipegang enam orang berbeda. Sekarang dipegang dua orang,
// jadi enam layar itu cuma memindahkan orang yang sama dari tab ke tab.
//
// Tidak ada logika baru di sini. Semua tombol memanggil fungsi yang sama dengan layar
// lamanya (qc-process.ts, dispatch.ts) — layar lama tetap ada untuk kasus aneh, dan
// dua jalur yang diam-diam berbeda adalah cara aplikasi ini pernah kehilangan stok.

import { useMemo, useState } from "react"
import { useAppStore } from "@/lib/store"
import AuthGuard from "@/components/auth/auth-guard"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PackageCheck, Truck, Receipt, AlertTriangle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { cn, formatRupiah } from "@/lib/utils"
import { awaitingQc, buildFifoAllocations, stillOwed } from "@/lib/daily-flow"
import { processInboundQC, type RejectAction } from "@/lib/qc-process"
import { releaseForDelivery, applyClientReceipt, finalizeDeliveryAndInvoice } from "@/lib/dispatch"
import { roundQtyToBook } from "@/lib/backorder"

export default function HariIniPage() {
  const purchaseItems = useAppStore(s => s.purchaseItems)
  const purchases = useAppStore(s => s.purchases)
  const products = useAppStore(s => s.products)
  const salesOrders = useAppStore(s => s.salesOrders)
  const salesOrderItems = useAppStore(s => s.salesOrderItems)
  const clients = useAppStore(s => s.clients)
  const deliveries = useAppStore(s => s.deliveries)
  const users = useAppStore(s => s.users)

  const [busy, setBusy] = useState<string | null>(null)
  const [openItem, setOpenItem] = useState<string | null>(null)

  // --- Bagian 1: barang datang ---
  const [vendorPrice, setVendorPrice] = useState<Record<string, string>>({})
  const [rejectQty, setRejectQty] = useState<Record<string, number>>({})
  const [rejectAction, setRejectAction] = useState<Record<string, RejectAction>>({})
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({})
  const [checkedBy, setCheckedBy] = useState<Record<string, string>>({})

  const masuk = useMemo(
    () => awaitingQc(purchaseItems, purchases).map(i => ({ ...i, product: products.find(p => p.id === i.productId) })).filter(i => i.product),
    [purchaseItems, purchases, products],
  )

  const namaKlien = (soId: string) => {
    const so = salesOrders.find(s => s.id === soId)
    return clients.find(c => c.id === so?.clientId)?.companyName || so?.poNumber || soId.slice(0, 8)
  }

  const pembagian = (productId: string, qty: number) =>
    buildFifoAllocations(productId, qty, salesOrders, salesOrderItems)

  const prosesBarang = async (itemId: string) => {
    const item = masuk.find(i => i.id === itemId)
    if (!item) return
    const ditolak = Math.max(0, rejectQty[itemId] || 0)
    const lolos = Math.max(0, item.qtyPurchased - ditolak)
    const { allocations, inventoryRemainder } = pembagian(item.productId, lolos)

    setBusy(itemId)
    const res = await processInboundQC(useAppStore.getState, {
      purchaseItemId: item.id,
      qtyPassToInventory: inventoryRemainder,
      allocations: allocations.filter(a => a.qty > 0),
      qtyReject: ditolak,
      rejectAction: rejectAction[itemId] || 'Disposal',
      rejectReason: rejectReason[itemId],
      vendorUnitPrice: Number(vendorPrice[itemId]) || 0,
      qcPerformedByUserId: checkedBy[itemId],
    })
    setBusy(null)

    if (!res.ok) { toast.error(res.error); return }
    res.warnings.forEach(w => toast.warning(w))
    res.infos.forEach(i => toast.info(i))
    toast.success(`${item.product?.name} beres — stok dan pembukuannya sudah jalan.`)
    setOpenItem(null)
  }

  // --- Barang kurang: yang harus dikabarin ke klien SEBELUM dikirim ---
  //
  // Selama ini yang dikabarkan cuma barang yang DITOLAK QC. Kalau barangnya sekadar
  // kurang — di pasar cuma dapat 8 dari 10 kg, atau kebagi ke pesanan yang lebih tua —
  // tidak ada yang memberi tahu siapa pun, dan status "Kurang Kirim" baru muncul setelah
  // barangnya terlanjur berangkat. Terlambat untuk menelepon klien.
  const kurang = useMemo(() => {
    return salesOrders
      .filter(so => ['Packing', 'Siap Kirim'].includes(so.status))
      .map(so => ({
        so,
        lines: salesOrderItems
          .filter(i => i.salesOrderId === so.id && stillOwed(i) > 0)
          .map(i => ({
            id: i.id,
            nama: products.find(p => p.id === i.productId)?.name || i.productId,
            uom: products.find(p => p.id === i.productId)?.uom || '',
            kurang: stillOwed(i),
            dipesan: i.qty,
          })),
      }))
      .filter(x => x.lines.length > 0)
  }, [salesOrders, salesOrderItems, products])

  // --- Bagian 2: siap dikirim ---
  const siapDilepas = salesOrders.filter(so => so.status === 'Packing')

  const lepasKiriman = async (soId: string) => {
    setBusy(soId)
    try {
      await releaseForDelivery(useAppStore.getState, soId)
      toast.success(`Kiriman untuk ${namaKlien(soId)} sudah disiapkan.`)
    } finally {
      setBusy(null)
    }
  }

  // --- Bagian 3: hasil kirim ---
  const [diterima, setDiterima] = useState<Record<string, number>>({})

  const sedangJalan = deliveries.filter(d => ['Menunggu', 'Dikirim', 'Tunggu Konfirmasi'].includes(d.status))

  const qtyBerangkat = (soId: string) =>
    salesOrderItems.filter(i => i.salesOrderId === soId).map(i => ({ item: i, shipped: roundQtyToBook(i) })).filter(x => x.shipped > 0)

  const catatSampai = async (deliveryId: string, soId: string) => {
    const baris = qtyBerangkat(soId)
    setBusy(deliveryId)
    try {
      await applyClientReceipt(useAppStore.getState, soId, baris.map(({ item, shipped }) => ({
        salesOrderItemId: item.id,
        qtyReceived: diterima[item.id] ?? shipped,
      })))
      const res = await finalizeDeliveryAndInvoice(useAppStore.getState, deliveryId, soId)
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`Tagihan ${formatRupiah(res.total)} untuk ${namaKlien(soId)} sudah terbit.`)
    } finally {
      setBusy(null)
    }
  }

  const kosong = masuk.length === 0 && siapDilepas.length === 0 && sedangJalan.length === 0 && kurang.length === 0

  return (
    <AuthGuard allowedRoles={['admin_po', 'finance', 'super_admin', 'coo', 'ceo']}>
      <div className="space-y-6 pb-24">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Hari Ini</h2>
          <p className="text-slate-500 font-medium text-sm">
            Barang datang, barang dikirim, tagihan terbit — satu halaman, urut dari atas ke bawah.
          </p>
        </div>

        {kosong && (
          <Card className="border-none shadow-lg rounded-3xl">
            <CardContent className="p-10 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <p className="font-black text-slate-700 dark:text-slate-200">Tidak ada yang menunggu.</p>
              <p className="text-sm text-slate-500 mt-1">Belum ada barang datang, dan tidak ada kiriman yang jalan.</p>
            </CardContent>
          </Card>
        )}

        {/* ---------- 1. BARANG DATANG ---------- */}
        {masuk.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-emerald-600" />
              <h3 className="font-black text-lg text-slate-800 dark:text-slate-100">1 · Barang Datang & Diperiksa</h3>
              <Badge className="bg-emerald-100 text-emerald-700 border-none">{masuk.length}</Badge>
            </div>

            {masuk.map(item => {
              const ditolak = Math.max(0, rejectQty[item.id] || 0)
              const lolos = Math.max(0, item.qtyPurchased - ditolak)
              const { allocations, inventoryRemainder } = pembagian(item.productId, lolos)
              const terpakai = allocations.filter(a => a.qty > 0)
              const isOpen = openItem === item.id

              return (
                <Card key={item.id} className="border-none shadow-lg rounded-2xl overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setOpenItem(isOpen ? null : item.id)}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <p className="font-black text-slate-800 dark:text-slate-100">{item.product?.name}</p>
                          <p className="text-xs text-slate-500 font-bold">
                            Datang {item.qtyPurchased} {item.product?.uom} · {item.purchaseMethod || 'Pasar'}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[10px] font-black uppercase">
                          {isOpen ? 'Tutup' : 'Buka'}
                        </Badge>
                      </div>
                    </button>

                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-xs space-y-1">
                      {terpakai.length > 0 ? terpakai.map(a => (
                        <div key={a.soId} className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-300 font-bold">{namaKlien(a.soId)}</span>
                          <span className="font-black text-slate-800 dark:text-slate-100">{a.qty} {item.product?.uom}</span>
                        </div>
                      )) : (
                        <p className="text-slate-500 font-bold">Tidak ada pesanan yang menunggu barang ini.</p>
                      )}
                      {inventoryRemainder > 0 && (
                        <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
                          <span className="text-slate-500 font-bold">Sisa masuk gudang</span>
                          <span className="font-black text-slate-700 dark:text-slate-200">{inventoryRemainder} {item.product?.uom}</span>
                        </div>
                      )}
                    </div>

                    {isOpen && (
                      <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase text-slate-500">Ada yang ditolak? ({item.product?.uom})</Label>
                            <Input
                              type="number" min="0" step="any"
                              onWheel={(e) => e.currentTarget.blur()}
                              className="h-11 font-bold"
                              placeholder="0"
                              value={rejectQty[item.id] || ''}
                              onChange={e => setRejectQty(p => ({ ...p, [item.id]: parseFloat(e.target.value) || 0 }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase text-slate-500">Harga vendor (kalau beda)</Label>
                            <Input
                              type="number" min="0" step="any"
                              onWheel={(e) => e.currentTarget.blur()}
                              className="h-11 font-bold"
                              placeholder={String(item.actualUnitPrice || item.estimatedUnitPrice || 0)}
                              value={vendorPrice[item.id] || ''}
                              onChange={e => setVendorPrice(p => ({ ...p, [item.id]: e.target.value }))}
                            />
                          </div>
                        </div>

                        {ditolak > 0 && (
                          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3">
                            <Label className="text-[10px] font-black uppercase text-amber-800">Yang ditolak diapain?</Label>
                            <Select
                              value={rejectAction[item.id] || 'Disposal'}
                              onValueChange={v => setRejectAction(p => ({ ...p, [item.id]: (v as RejectAction) || 'Disposal' }))}
                            >
                              <SelectTrigger className="h-11 bg-white dark:bg-slate-900 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Return">Retur ke vendor (minta ganti)</SelectItem>
                                <SelectItem value="B2C">Masuk stok jual eceran</SelectItem>
                                <SelectItem value="Disposal">Buang</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              className="h-11 bg-white dark:bg-slate-900 font-bold"
                              placeholder="Kenapa ditolak? (busuk, ukuran beda, dll)"
                              value={rejectReason[item.id] || ''}
                              onChange={e => setRejectReason(p => ({ ...p, [item.id]: e.target.value }))}
                            />
                          </div>
                        )}

                        <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase text-slate-500">Yang memeriksa di gudang</Label>
                          <Select
                            value={checkedBy[item.id] || ''}
                            onValueChange={v => setCheckedBy(p => ({ ...p, [item.id]: v || '' }))}
                          >
                            <SelectTrigger className="h-11 rounded-xl font-bold"><SelectValue placeholder="— Saya sendiri —" /></SelectTrigger>
                            <SelectContent>
                              {users.filter(u => ['gudang', 'sourcing', 'admin_po', 'finance'].includes(u.role)).map(u => (
                                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <Button
                          className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 font-black"
                          disabled={busy === item.id}
                          onClick={() => prosesBarang(item.id)}
                        >
                          {busy === item.id ? 'Memproses…' : 'Beres — catat barangnya'}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </section>
        )}

        {/* ---------- KURANG BARANG: KABARIN KLIEN ---------- */}
        {kurang.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h3 className="font-black text-lg text-slate-800 dark:text-slate-100">Perlu Dikabarin ke Klien</h3>
              <Badge className="bg-amber-100 text-amber-700 border-none">{kurang.length}</Badge>
            </div>
            <p className="text-xs text-slate-500 font-bold -mt-1">
              Pesanan ini bakal dikirim kurang. Telepon kliennya sekarang, sebelum barangnya jalan.
            </p>

            {kurang.map(({ so, lines }) => (
              <Card key={so.id} className="border-none shadow-lg rounded-2xl border-l-4 border-l-amber-400">
                <CardContent className="p-4 space-y-2">
                  <div>
                    <p className="font-black text-slate-800 dark:text-slate-100">{namaKlien(so.id)}</p>
                    <p className="text-xs text-slate-500 font-bold">{so.poNumber}</p>
                  </div>
                  {lines.map(l => (
                    <div key={l.id} className="flex justify-between text-sm">
                      <span className="font-bold text-slate-600 dark:text-slate-300">{l.nama}</span>
                      <span className="font-black text-amber-700">
                        kurang {l.kurang} {l.uom} <span className="text-slate-400 font-bold">dari {l.dipesan}</span>
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        {/* ---------- 2. SIAP DIKIRIM ---------- */}
        {siapDilepas.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-blue-600" />
              <h3 className="font-black text-lg text-slate-800 dark:text-slate-100">2 · Siap Dikirim</h3>
              <Badge className="bg-blue-100 text-blue-700 border-none">{siapDilepas.length}</Badge>
            </div>

            {siapDilepas.map(so => {
              const baris = salesOrderItems.filter(i => i.salesOrderId === so.id)
              return (
                <Card key={so.id} className="border-none shadow-lg rounded-2xl">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <p className="font-black text-slate-800 dark:text-slate-100">{namaKlien(so.id)}</p>
                        <p className="text-xs text-slate-500 font-bold">{so.poNumber} · {baris.length} jenis barang</p>
                      </div>
                      {baris.some(i => stillOwed(i) > 0) && (
                        <Badge className="bg-amber-100 text-amber-700 border-none text-[10px] font-black shrink-0">
                          <AlertTriangle className="w-3 h-3 mr-1" /> Belum lengkap
                        </Badge>
                      )}
                    </div>
                    <Button
                      className="w-full h-12 bg-blue-600 hover:bg-blue-700 font-black"
                      disabled={busy === so.id}
                      onClick={() => lepasKiriman(so.id)}
                    >
                      {busy === so.id ? 'Menyiapkan…' : 'Keluarkan barang & siapkan kiriman'}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </section>
        )}

        {/* ---------- 3. HASIL KIRIM ---------- */}
        {sedangJalan.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-violet-600" />
              <h3 className="font-black text-lg text-slate-800 dark:text-slate-100">3 · Sudah Sampai?</h3>
              <Badge className="bg-violet-100 text-violet-700 border-none">{sedangJalan.length}</Badge>
            </div>

            {sedangJalan.map(d => {
              const baris = qtyBerangkat(d.salesOrderId)
              const total = baris.reduce((sum, { item, shipped }) => sum + ((diterima[item.id] ?? shipped) * item.unitPrice), 0)
              return (
                <Card key={d.id} className="border-none shadow-lg rounded-2xl">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="font-black text-slate-800 dark:text-slate-100">{namaKlien(d.salesOrderId)}</p>
                      <p className="text-xs text-slate-500 font-bold">
                        Isi berapa yang benar-benar diterima klien. Kalau pas semua, biarkan saja.
                      </p>
                    </div>

                    <div className="space-y-2">
                      {baris.map(({ item, shipped }) => {
                        const product = products.find(p => p.id === item.productId)
                        const nilai = diterima[item.id] ?? shipped
                        const kurang = nilai < shipped
                        return (
                          <div key={item.id} className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{product?.name}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Berangkat {shipped} {product?.uom}</p>
                            </div>
                            <Input
                              type="number" min="0" step="any"
                              onWheel={(e) => e.currentTarget.blur()}
                              className={cn("h-11 w-28 font-black text-right", kurang && "border-rose-300 text-rose-600")}
                              value={nilai}
                              onChange={e => setDiterima(p => ({ ...p, [item.id]: parseFloat(e.target.value) || 0 }))}
                            />
                          </div>
                        )
                      })}
                    </div>

                    <div className="flex justify-between items-center rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                      <span className="text-xs font-black uppercase text-slate-500">Tagihan terbit</span>
                      <span className="font-black text-slate-800 dark:text-slate-100">{formatRupiah(total)}</span>
                    </div>

                    <Button
                      className="w-full h-12 bg-violet-600 hover:bg-violet-700 font-black"
                      disabled={busy === d.id}
                      onClick={() => catatSampai(d.id, d.salesOrderId)}
                    >
                      {busy === d.id ? 'Menyimpan…' : 'Sudah sampai — terbitkan tagihan'}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </section>
        )}
      </div>
    </AuthGuard>
  )
}

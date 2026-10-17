"use client"

// Audit pengiriman dipegang Admin PO, bukan Finance.
//
// Yang menerima surat jalan dan berita acara bertanda tangan dari klien adalah orang
// yang berhubungan dengan klien — Admin PO. Menaruh tombolnya di meja Finance berarti
// dokumennya harus berpindah tangan dulu sebelum ada yang bisa menutup pengiriman, dan
// selama itu PO-nya diam di "Dibawa kurir" tanpa ada yang merasa memilikinya.
//
// Pembukuannya sendiri tidak berpindah: menekan tombol di sini menjalankan alur yang
// sama persis dengan yang dulu dijalankan Finance (src/lib/delivery-audit.ts) — invoice
// terbit, omzet dan HPP masuk jurnal, stok berkurang.

import Link from "next/link"
import { useMemo, useState } from "react"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { auditPengiriman } from "@/lib/delivery-audit"
import { roundQtyToBook } from "@/lib/backorder"
import { cogsFallbackItems } from "@/lib/cogs-source"
import { formatRupiah, cn } from "@/lib/utils"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, Eye, Image as ImageIcon, Loader2, Truck } from "lucide-react"

export default function AuditPengirimanPage() {
  const deliveries = useAppStore(s => s.deliveries)
  const salesOrders = useAppStore(s => s.salesOrders)
  const salesOrderItems = useAppStore(s => s.salesOrderItems)
  const purchaseItems = useAppStore(s => s.purchaseItems)
  const clients = useAppStore(s => s.clients)
  const users = useAppStore(s => s.users)
  const products = useAppStore(s => s.products)

  const [memproses, setMemproses] = useState<string | null>(null)
  const [lihatFoto, setLihatFoto] = useState<string | null>(null)

  const menunggu = useMemo(
    () => deliveries.filter(d => d.status === 'Awaiting Audit'),
    [deliveries],
  )

  // Kiriman yang masih di jalan.
  //
  // Ditampilkan terpisah karena inilah pertanyaan yang muncul lebih dulu: "statusnya
  // dibawa kurir, kenapa layar auditnya kosong?". Audit baru bisa dikerjakan setelah ada
  // yang menyatakan barangnya SAMPAI — dan selama tidak ada yang menyebut langkah itu,
  // kirimannya menggantung tanpa ada yang merasa memilikinya.
  const diJalan = useMemo(
    () => deliveries.filter(d => d.status === 'Dikirim'),
    [deliveries],
  )

  const jalankan = async (deliveryId: string) => {
    if (memproses) return
    setMemproses(deliveryId)
    const t = toast.loading("Finalisasi pengiriman & invoice…")
    try {
      useAppStore.getState().takeDevSnapshot()
      const res = await auditPengiriman(useAppStore.getState, deliveryId)
      if (!res.ok) { toast.error(res.error, { id: t }); return }
      toast.success("Pengiriman ditutup. Invoice terbit, omzet & HPP tercatat, stok berkurang.", { id: t })
    } catch (e) {
      toast.error("Gagal: " + (e instanceof Error ? e.message : String(e)), { id: t })
    } finally {
      setMemproses(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Audit Pengiriman</h2>
        <p className="text-muted-foreground">
          Cek surat jalan & berita acara yang pulang dari klien, lalu tutup pengirimannya.
        </p>
      </div>

      {menunggu.length === 0 ? (
        <Card className="border-dashed py-16">
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-200" />
            <p className="font-bold text-slate-500">Tidak ada pengiriman yang menunggu diaudit.</p>
            <p className="max-w-md text-xs text-slate-400">
              Pengiriman muncul di sini setelah ada yang menyatakan barangnya SAMPAI di klien —
              dicatat di layar <b>Hari ini</b>. Diserahkan ke kurir saja belum cukup.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {menunggu.map(delivery => {
            const so = salesOrders.find(s => s.id === delivery.salesOrderId)
            const client = clients.find(c => c.id === so?.clientId)
            const kurir = users.find(u => u.id === delivery.courierId)
            const soItems = salesOrderItems.filter(i => i.salesOrderId === so?.id)
            const totalRev = soItems.reduce((sum, i) => sum + (roundQtyToBook(i) * i.unitPrice), 0)
            // Baris tanpa catatan pembelian memakai harga dasar produk sebagai HPP.
            // Jurnalnya tetap seimbang, jadi tanpa peringatan ini biayanya tertebak diam-diam.
            const ditebak = so
              ? cogsFallbackItems(so.id, soItems.filter(i => roundQtyToBook(i) > 0), purchaseItems)
              : []

            const pendingCost=(delivery.acceptedLineSnapshots||[]).some(line=>line.qty>0&&line.costSources?.some(source=>purchaseItems.some(item=>item.id===source.purchaseItemId&&item.costPending)))
            return (
              <Card key={delivery.id} className="overflow-hidden rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold text-slate-800">
                    {client?.companyName || 'Klien'}
                  </CardTitle>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    {so?.poNumber} · {kurir?.name || 'Kurir belum tercatat'}
                  </p>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                    {delivery.baUrl ? (
                      <>
                        <img src={delivery.baUrl} alt="Berita acara" className="h-full w-full object-cover" />
                        <Button
                          variant="secondary"
                          size="icon"
                          className="absolute bottom-2 right-2 rounded-xl"
                          onClick={() => setLihatFoto(delivery.baUrl!)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-slate-300">
                        <ImageIcon className="h-8 w-8" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Belum ada foto dokumen</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nilai tagihan</span>
                    <span className="text-lg font-black text-slate-900">{formatRupiah(totalRev)}</span>
                  </div>

                  {ditebak.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="flex items-center gap-1.5 text-[11px] font-black text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" /> HPP ditebak ({ditebak.length} barang)
                      </p>
                      <p className="mt-1 text-[11px] font-bold leading-snug text-slate-600">
                        Tidak ada catatan pembelian, jadi biayanya memakai harga dasar produk. Laba yang tercatat bisa meleset.
                      </p>
                      <ul className="mt-1.5 space-y-0.5">
                        {ditebak.map(pid => (
                          <li key={pid} className="truncate text-[11px] font-bold text-amber-800">
                            • {products.find(p => p.id === pid)?.name || pid}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {pendingCost&&<p className="text-sm text-amber-700">Biaya belum lengkap. Lengkapi laporan belanja sourcing sebelum finalisasi invoice dan HPP.</p>}
                  <Button
                    className={cn(
                      "h-12 w-full rounded-xl bg-emerald-600 text-[11px] font-black uppercase tracking-widest text-white hover:bg-emerald-700",
                    )}
                    disabled={memproses === delivery.id || pendingCost}
                    onClick={() => jalankan(delivery.id)}
                  >
                    {memproses === delivery.id
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memproses…</>
                      : <><Truck className="mr-2 h-4 w-4" /> Tutup & Terbitkan Invoice</>}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {diJalan.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-5 w-5 text-slate-400" />
              Masih di jalan ({diJalan.length})
            </CardTitle>
            <p className="text-xs text-slate-500">
              Barangnya sudah dibawa kurir tapi belum ada yang menyatakan sampai. Konfirmasi
              penerimaannya di layar <b>Hari ini</b> — setelah itu baru muncul di daftar audit di atas.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {diJalan.map(d => {
              const so = salesOrders.find(s => s.id === d.salesOrderId)
              const client = clients.find(c => c.id === so?.clientId)
              const kurir = users.find(u => u.id === d.courierId)
              return (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">{client?.companyName || 'Klien'}</p>
                    <p className="text-[11px] font-bold text-slate-400">
                      {so?.poNumber} · dibawa {kurir?.name || 'kurir belum tercatat'}
                    </p>
                  </div>
                  <Link
                    href="/admin/hari-ini"
                    className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-3 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Konfirmasi di Hari ini
                  </Link>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!lihatFoto} onOpenChange={open => !open && setLihatFoto(null)}>
        <DialogContent className="w-[95vw] overflow-hidden rounded-xl border-none bg-slate-900 p-0 sm:max-w-4xl">
          {lihatFoto && <img src={lihatFoto} alt="Dokumen pengiriman" className="h-auto w-full" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

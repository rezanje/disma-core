"use client"

import React from "react"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Trash2, Ban, Wrench, AlertTriangle } from "lucide-react"

/** Kata yang harus diketik utuh sebelum penghapusan boleh jalan. */
const KATA_KUNCI = "HAPUS"

export default function DevOverlay() {
  const [isVisible, setIsVisible] = React.useState(true)
  const [isDev, setIsDev] = React.useState(false)
  const [konfirmasiTerbuka, setKonfirmasiTerbuka] = React.useState(false)
  const [ketikan, setKetikan] = React.useState("")
  const [sedangHapus, setSedangHapus] = React.useState(false)

  React.useEffect(() => {
    // Only show on localhost / development
    const hostname = window.location.hostname
    setIsDev(hostname === 'localhost' || hostname === '127.0.0.1')
  }, [])

  const resetSimulation = useAppStore(state => state.resetSimulation)

  if (!isDev) return null

  // Sama persis dengan tombol di Settings → Maintenance → Wipe Transactions.
  //
  // Konfirmasinya dulu pakai confirm() bawaan browser. Dua masalah sekaligus:
  // di browser yang dikendalikan otomatis (panel preview, Playwright) dialog itu
  // ditutup sendiri dan mengembalikan false, jadi tombolnya terlihat mati total —
  // sementara satu Enter yang tidak sengaja sudah cukup untuk meluluskannya.
  //
  // Diganti dialog di dalam aplikasi yang menuntut kata kuncinya diketik utuh:
  // jalan di browser mana pun, dan tidak bisa dilewati oleh satu klik/Enter nyasar
  // seperti insiden 2026-07-04.
  const bolehHapus = ketikan.trim().toUpperCase() === KATA_KUNCI && !sedangHapus

  const jalankanWipe = async () => {
    if (!bolehHapus) return
    setSedangHapus(true)
    try {
      // resetSimulation() menyimpan cadangan dulu dan membatalkan diri kalau
      // cadangannya gagal — jaring itu tetap satu-satunya yang menahan.
      await resetSimulation()
      setKonfirmasiTerbuka(false)
      setKetikan("")
    } finally {
      setSedangHapus(false)
    }
  }

  // Saat minimize, yang tersisa ikon netral — bukan tombol wipe — supaya klik
  // nyasar pada state ini tidak bisa menghapus apa pun.
  if (!isVisible) return (
    <div className="fixed bottom-24 right-4 z-[9999]">
      <Button
        variant="outline"
        size="icon"
        className="rounded-full shadow-sm bg-slate-900 border-none text-white hover:bg-slate-800"
        onClick={() => setIsVisible(true)}
        title="Tampilkan alat dev"
      >
        <Wrench className="w-4 h-4" />
      </Button>
    </div>
  )

  return (
    <>
      <div className="fixed bottom-24 right-4 z-[9999] duration-150">
        <div className="bg-slate-900/90 border border-border p-2 rounded-xl shadow-sm flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full text-slate-400 hover:text-white"
            onClick={() => setIsVisible(false)}
            title="Sembunyikan"
          >
            <Ban className="w-4 h-4" />
          </Button>

          <div className="h-8 w-[1px] bg-card" />

          <Button
            onClick={() => { setKetikan(""); setKonfirmasiTerbuka(true) }}
            className="h-10 px-6 gap-2 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold uppercase text-[11px] tracking-widest shadow-sm"
          >
            <Trash2 className="w-4 h-4" />
            Bersihkan Data Transaksi
          </Button>
        </div>
      </div>

      <Dialog open={konfirmasiTerbuka} onOpenChange={open => { if (!sedangHapus) setKonfirmasiTerbuka(open) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              Hapus semua data transaksi?
            </DialogTitle>
            <DialogDescription className="sr-only">
              Penghapusan permanen data transaksi. Perlu konfirmasi diketik.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-left">
            <p className="text-sm font-bold text-slate-700">
              Yang dihapus: PO, Sales Order, dokumen belanja, Invoice, jurnal, dan
              pergerakan stok.
            </p>
            <p className="text-sm font-bold text-emerald-700">
              Yang aman: katalog produk, data klien, vendor, dan daftar harga.
            </p>
            <p className="text-xs font-bold text-slate-500">
              Cadangan otomatis dibuat lebih dulu. Kalau cadangannya gagal, penghapusan
              dibatalkan sendiri.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold  text-slate-500">
              Ketik <span className="text-rose-600">{KATA_KUNCI}</span> untuk melanjutkan
            </p>
            <Input
              autoFocus
              value={ketikan}
              onChange={e => setKetikan(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && bolehHapus) jalankanWipe() }}
              placeholder={KATA_KUNCI}
              disabled={sedangHapus}
              className="font-bold tracking-widest"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setKonfirmasiTerbuka(false)}
              disabled={sedangHapus}
            >
              Batal
            </Button>
            <Button
              onClick={jalankanWipe}
              disabled={!bolehHapus}
              className="gap-2 bg-rose-600 text-white hover:bg-rose-700"
            >
              <Trash2 className="h-4 w-4" />
              {sedangHapus ? 'Menghapus...' : 'Hapus Sekarang'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

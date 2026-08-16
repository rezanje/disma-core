"use client"

import React from "react"
import { usePathname } from "next/navigation"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Trash2, Ban, Wrench } from "lucide-react"

export default function DevOverlay() {
  const pathname = usePathname()
  const [isVisible, setIsVisible] = React.useState(true)
  const [isDev, setIsDev] = React.useState(false)

  React.useEffect(() => {
    // Only show on localhost / development
    const hostname = window.location.hostname
    setIsDev(hostname === 'localhost' || hostname === '127.0.0.1')
  }, [])

  const resetSimulation = useAppStore(state => state.resetSimulation)


  if (!isDev) return null

  // Sama persis dengan tombol di Settings → Maintenance → Wipe Transactions.
  // confirm() wajib: toolbar ini tampil di setiap halaman, dan pernah terpicu
  // tanpa sengaja oleh selector otomatis (insiden 2026-07-04) saat aksinya
  // masih langsung jalan tanpa konfirmasi.
  const handleQuickWipeTransactions = async () => {
    if (!confirm("HAPUS SEMUA data transaksi (PO, Order, Invoice, Jurnal)? Katalog Produk & Client akan tetap aman.")) return
    await resetSimulation()
  }

  // Saat minimize, yang tersisa ikon netral — bukan tombol wipe — supaya klik
  // nyasar pada state ini tidak bisa menghapus apa pun.
  if (!isVisible) return (
    <div className="fixed bottom-24 right-4 z-[9999]">
      <Button
        variant="outline"
        size="icon"
        className="rounded-full shadow-lg bg-slate-900 border-none text-white hover:bg-slate-800"
        onClick={() => setIsVisible(true)}
        title="Tampilkan alat dev"
      >
        <Wrench className="w-4 h-4" />
      </Button>
    </div>
  )

  return (
    <div className="fixed bottom-24 right-4 z-[9999] animate-in slide-in-from-right-10 duration-500">
      <div className="bg-slate-900/90 backdrop-blur-xl border border-white/20 p-2 rounded-[2rem] shadow-2xl flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full text-slate-400 hover:text-white"
          onClick={() => setIsVisible(false)}
          title="Sembunyikan"
        >
          <Ban className="w-4 h-4" />
        </Button>

        <div className="h-8 w-[1px] bg-white/10" />

        <Button
          onClick={handleQuickWipeTransactions}
          className="h-10 px-6 gap-2 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl"
        >
          <Trash2 className="w-4 h-4" />
          Bersihkan Data Transaksi
        </Button>
      </div>
    </div>
  )
}

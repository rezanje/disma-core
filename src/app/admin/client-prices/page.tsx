"use client"

import React, { useState } from "react"
import { useAppStore } from "@/lib/store"
import { Search, Calculator, Check, ChevronsUpDown, Info, Download, Link as LinkIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn, getEffectiveBasePrice } from "@/lib/utils"
import { rescaleTiers } from "@/lib/tier-rescale"
import { toast } from "sonner"
import { ClientPriceList } from "@/components/client-prices/ClientPriceList"
import { generatePriceListPDF } from "@/lib/pdf"

export default function ClientPricesPage() {
  const clients = useAppStore(state => state.clients)
  const products = useAppStore(state => state.products)
  const updateProduct = useAppStore(state => state.updateProduct)
  const priceBaseline = useAppStore(state => state.priceBaseline)

  const [selectedClientId, setSelectedClientId] = useState<string>("")
  const [isClientSearchOpen, setIsClientSearchOpen] = useState(false)
  const [clientSearch, setClientSearch] = useState("")

  const activeClient = clients.find(c => c.id === selectedClientId)

  // Filter clients for dropdown
  const filteredClients = clients.filter(c => 
    c.companyName.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.picName.toLowerCase().includes(clientSearch.toLowerCase())
  ).slice(0, 50)

  /**
   * Publish-mingguan: snapshot `weeklyPriceRange.min` → `basePrice` for every product
   * that has a fresh weekly low. After this runs, every client pricelist is locked
   * to the lowest market HPP captured during the Thu-Wed window. Tier price overrides
   * are also cleared so future quotes recompute from the new master base.
   *
   * This action is global across every product, so it lives on the page rather than
   * inside `ClientPriceList` — that component also renders inside a single client's
   * detail tab, where a global republish would read as client-scoped.
   */
  const handlePublishWeeklyHPP = async () => {
    const candidates = products.filter(p => {
      const eff = getEffectiveBasePrice(p)
      return eff.source === 'weekly_low' && eff.price > 0 && eff.price !== p.basePrice
    })

    if (candidates.length === 0) {
      toast.info("Tidak ada HPP weekly low baru yang perlu disinkronkan.")
      return
    }

    setTimeout(async () => {
      if (!confirm(
        `Publish pricelist mingguan?\n\n` +
        `${candidates.length} barang akan di-update HPP master-nya ke harga terendah ` +
        `minggu berjalan. Semua pricelist client otomatis mengikuti.\n\n` +
        `Lanjutkan?`
      )) return

      toast.loading(`Sinkron HPP ${candidates.length} barang...`, { id: "publish_weekly" })

      try {
        const chunkSize = 15
        for (let i = 0; i < candidates.length; i += chunkSize) {
          const chunk = candidates.slice(i, i + chunkSize)
          await Promise.all(chunk.map(p => {
            const { price } = getEffectiveBasePrice(p)
            // Carry each product's own margin across the new base. The published
            // pricelist sets margins per item, so clearing the overrides here would
            // silently reprice every product whose margin is not the global default.
            // Slots that yield undefined fall back to the global margin, as before.
            const [t1, t2, t3, t4, t5] = rescaleTiers(p.basePrice, price, [
              p.tier1Price, p.tier2Price, p.tier3Price, p.tier4Price, p.tier5Price,
            ])
            return updateProduct(p.id, {
              basePrice: price,
              tier1Price: t1,
              tier2Price: t2,
              tier3Price: t3,
              tier4Price: t4,
              tier5Price: t5,
            })
          }))
        }
        toast.success(
          `${candidates.length} HPP master tersinkron. Pricelist client locked untuk minggu ini.`,
          { id: "publish_weekly" }
        )
      } catch (err) {
        console.error('[Publish Weekly HPP] failed:', err)
        toast.error("Gagal sinkron HPP mingguan", { id: "publish_weekly" })
      }
    }, 100)
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Client Price Lists</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Atur harga jual kustom berdasarkan masing-masing client dan download penawarannya.
          </p>
        </div>
        {priceBaseline && (
          <div className="w-full md:w-auto flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
            <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
              Data dasar: <span className="text-slate-800">{priceBaseline.label}</span>
              {" · "}{priceBaseline.productCount.toLocaleString('id-ID')} produk
              <br />
              Perubahan setelah ini mengikuti sistem.
            </p>
          </div>
        )}
        {/* Aksi global: menyentuh SEMUA produk, bukan client yang sedang dipilih.
            Karena itu tombolnya di chrome halaman, bukan di dalam ClientPriceList —
            di dalam tab detail client, tombol ini akan terbaca seolah hanya
            mempengaruhi client tersebut. */}
        <div className="w-full md:w-auto rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Sinkron HPP Mingguan</p>
          <p className="text-[11px] font-bold text-amber-800/70 leading-relaxed mt-0.5 mb-2">
            Ambil HPP terendah minggu ini jadi HPP master — berlaku untuk semua produk, bukan cuma client ini.
          </p>
          <Button
            onClick={handlePublishWeeklyHPP}
            variant="outline"
            className="h-9 border-amber-300 text-amber-800 bg-white hover:bg-amber-100 font-bold text-xs"
          >
            <Calculator className="mr-2 h-4 w-4" /> Sync HPP Weekly Low → Master
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col md:flex-row gap-6 items-end">
        <div className="grid gap-2 flex-1 w-full max-w-md">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Pilih Client</label>
          <Popover open={isClientSearchOpen} onOpenChange={setIsClientSearchOpen}>
            <PopoverTrigger render={
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={isClientSearchOpen}
                className="h-12 bg-slate-50 border-slate-200 text-base font-bold w-full justify-between"
              >
                <div className="flex items-center gap-2 truncate">
                  {activeClient ? (
                    <>
                      <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shrink-0">
                        {activeClient.companyName.charAt(0)}
                      </div>
                      <span className="truncate">{activeClient.companyName}</span>
                    </>
                  ) : (
                    <span className="text-slate-400 font-normal">-- Pilih Klien / Customer --</span>
                  )}
                </div>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            } />
            <PopoverContent className="w-[400px] p-0" align="start">
              <div className="flex items-center border-b px-3 h-12">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <input
                  placeholder="Cari PT atau Nama PIC..."
                  className="flex h-full w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
              </div>
              <div className="max-h-[300px] overflow-y-auto p-1">
                {filteredClients.length === 0 ? (
                  <div className="py-6 text-center text-sm text-slate-500">Klien tidak ditemukan.</div>
                ) : (
                  filteredClients.map((c) => (
                    <button
                      key={c.id}
                      className={cn(
                        "relative flex w-full cursor-default select-none items-center rounded-md py-3 pl-10 pr-3 text-sm outline-none hover:bg-slate-100 transition-colors",
                        selectedClientId === c.id && "bg-slate-100"
                      )}
                      onClick={() => {
                        setSelectedClientId(c.id)
                        setIsClientSearchOpen(false)
                        setClientSearch("")
                      }}
                    >
                      <span className="absolute left-3 flex h-4 w-4 items-center justify-center">
                        {selectedClientId === c.id && <Check className="h-4 w-4 text-emerald-600" />}
                      </span>
                      <div className="flex flex-col text-left">
                        <span className="font-bold text-slate-900">{c.companyName}</span>
                        <span className="text-[10px] text-slate-500 uppercase font-medium">{c.picName}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Daftar harga cuma berguna kalau bisa sampai ke tangan klien. Sebelum ini
            harganya cuma bisa dilihat di dalam aplikasi, jadi orang balik ke Excel. */}
        {activeClient && (
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <Button
              variant="outline"
              className="h-12 font-bold"
              onClick={() => generatePriceListPDF(activeClient.id)}
            >
              <Download className="mr-2 h-4 w-4" /> Daftar Harga PDF
            </Button>
            <Button
              variant="outline"
              className="h-12 font-bold"
              onClick={async () => {
                const url = `${window.location.origin}/order/${activeClient.id}`
                try {
                  await navigator.clipboard.writeText(url)
                  toast.success("Link pesanan tersalin — tinggal kirim ke klien.")
                } catch {
                  // Clipboard diblokir (biasanya karena bukan HTTPS): tampilkan linknya
                  // supaya tetap bisa disalin manual, jangan diam-diam gagal.
                  toast.info(url, { duration: 15000 })
                }
              }}
            >
              <LinkIcon className="mr-2 h-4 w-4" /> Salin Link Pesanan
            </Button>
          </div>
        )}
      </div>

      {!activeClient ? (
        <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center bg-slate-50">
          <Calculator className="w-16 h-16 text-slate-300 mb-4" />
          <h3 className="text-xl font-bold text-slate-700">Belum Ada Klien Terpilih</h3>
          <p className="text-slate-500 mt-2 max-w-md mx-auto">
            Pilih nama klien dari dropdown di atas untuk mulai mengatur harga khusus bagi mereka.
          </p>
        </div>
      ) : (
        <ClientPriceList clientId={selectedClientId} />
      )}
    </div>
  )
}

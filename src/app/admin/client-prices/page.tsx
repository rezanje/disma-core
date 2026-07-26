"use client"

import React, { useState } from "react"
import { useAppStore } from "@/lib/store"
import { Search, Calculator, Check, ChevronsUpDown, Info } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ClientPriceList } from "@/components/client-prices/ClientPriceList"

export default function ClientPricesPage() {
  const clients = useAppStore(state => state.clients)
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

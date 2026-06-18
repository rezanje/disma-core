"use client"

import { useState, useMemo } from "react"
import { useParams } from "next/navigation"
import { useAppStore } from "@/lib/store"
import { VendorPrice } from "@/types"
import { format, addDays, parseISO, isAfter } from "date-fns"
import { id as localeId } from "date-fns/locale"
import { v4 as uuidv4 } from "uuid"
import { formatRupiah } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "sonner"
import { Search, Plus, CheckCircle2, Clock, Store } from "lucide-react"

export default function VendorSupplyPortal() {
  const params = useParams()
  const vendorId = params.vendorId as string

  const vendors = useAppStore(state => state.vendors)
  const products = useAppStore(state => state.products)
  const vendorPrices = useAppStore(state => state.vendorPrices)
  const addVendorPrice = useAppStore(state => state.addVendorPrice)
  const updateVendorPrice = useAppStore(state => state.updateVendorPrice)

  const vendor = useMemo(() => vendors.find(v => v.id === vendorId), [vendors, vendorId])

  const [searchTerm, setSearchTerm] = useState("")
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string; uom: string } | null>(null)
  const [isRequestNew, setIsRequestNew] = useState(false)
  const [form, setForm] = useState({
    proposedName: "",
    price: "",
    uom: "",
    validFrom: format(new Date(), "yyyy-MM-dd"),
    validTo: format(addDays(new Date(), 7), "yyyy-MM-dd"),
    notes: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const myPrices = useMemo(
    () => vendorPrices.filter(vp => vp.vendorId === vendorId).sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated)),
    [vendorPrices, vendorId]
  )

  const searchResults = useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return []
    return products
      .filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.skuCode.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .slice(0, 6)
  }, [products, searchTerm])

  const resetForm = () => {
    setSelectedProduct(null)
    setIsRequestNew(false)
    setSearchTerm("")
    setForm({
      proposedName: "",
      price: "",
      uom: "",
      validFrom: format(new Date(), "yyyy-MM-dd"),
      validTo: format(addDays(new Date(), 7), "yyyy-MM-dd"),
      notes: "",
    })
  }

  const handleSubmit = async () => {
    const price = parseFloat(form.price)
    if (!price || price <= 0) { toast.error("Isi harga dengan benar"); return }
    if (!form.uom) { toast.error("Isi satuan (UOM)"); return }
    if (!form.validFrom || !form.validTo) { toast.error("Isi rentang tanggal berlaku"); return }
    if (new Date(form.validTo) < new Date(form.validFrom)) { toast.error("Tanggal akhir harus setelah tanggal mulai"); return }
    if (!selectedProduct && !form.proposedName) { toast.error("Pilih produk atau isi nama produk baru"); return }

    setIsSubmitting(true)
    try {
      const existing = selectedProduct
        ? myPrices.find(vp => vp.productId === selectedProduct.id && ['pending', 'active'].includes(vp.status))
        : null

      if (existing) {
        await updateVendorPrice(existing.id, {
          price,
          uom: form.uom,
          validFrom: form.validFrom,
          validTo: form.validTo,
          notes: form.notes || undefined,
          status: 'pending',
          lastUpdated: new Date().toISOString(),
        })
        toast.success("Penawaran harga diperbarui, menunggu persetujuan")
      } else {
        await addVendorPrice({
          id: uuidv4(),
          vendorId,
          productId: selectedProduct?.id,
          proposedName: selectedProduct ? undefined : form.proposedName,
          price,
          uom: form.uom,
          validFrom: form.validFrom,
          validTo: form.validTo,
          status: 'pending',
          source: 'portal',
          notes: form.notes || undefined,
          lastUpdated: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        })
        toast.success("Penawaran harga dikirim, menunggu persetujuan")
      }
      resetForm()
      setSubmitted(true)
      setTimeout(() => setSubmitted(false), 3000)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!vendor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-sm w-full text-center p-10 space-y-4">
          <Store className="w-12 h-12 mx-auto text-slate-300" />
          <p className="font-black text-slate-700">Vendor tidak ditemukan</p>
          <p className="text-xs text-slate-400">Link tidak valid atau vendor tidak terdaftar.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="bg-white border-b sticky top-0 z-40 px-4 py-3 shadow-sm">
        <div className="max-w-xl mx-auto">
          <h1 className="text-base font-black text-slate-800">{vendor.companyName}</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Portal Penawaran Harga</p>
        </div>
      </div>

      <main className="max-w-xl mx-auto px-4 mt-5 space-y-6">
        {submitted && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-700">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <p className="text-xs font-bold">Penawaran dikirim — menunggu persetujuan admin.</p>
          </div>
        )}

        <Card>
          <CardContent className="pt-4 space-y-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Input Penawaran Harga</p>

            {!selectedProduct && !isRequestNew && (
              <div className="space-y-2">
                <Label className="text-xs">Cari Produk</Label>
                <div className="relative">
                  <Input
                    placeholder="Ketik nama produk..."
                    className="pl-9"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                </div>
                {searchResults.length > 0 && (
                  <div className="border rounded-xl overflow-hidden divide-y bg-white shadow">
                    {searchResults.map(p => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex justify-between items-center"
                        onClick={() => {
                          setSelectedProduct({ id: p.id, name: p.name, uom: p.uom })
                          setForm(f => ({ ...f, uom: p.uom }))
                          setSearchTerm("")
                        }}
                      >
                        <span className="text-sm font-bold">{p.name}</span>
                        <span className="text-[10px] text-slate-400">{p.uom}</span>
                      </button>
                    ))}
                    <button
                      className="w-full text-left px-3 py-2 text-xs text-amber-600 font-bold hover:bg-amber-50 flex items-center gap-1"
                      onClick={() => { setIsRequestNew(true); setForm(f => ({ ...f, proposedName: searchTerm })); setSearchTerm("") }}
                    >
                      <Plus className="w-3 h-3" /> Produk tidak ada? Request nama baru
                    </button>
                  </div>
                )}
                {searchTerm.length >= 2 && searchResults.length === 0 && (
                  <button
                    className="text-xs text-amber-600 font-bold flex items-center gap-1 mt-1"
                    onClick={() => { setIsRequestNew(true); setForm(f => ({ ...f, proposedName: searchTerm })); setSearchTerm("") }}
                  >
                    <Plus className="w-3 h-3" /> Request produk baru: &ldquo;{searchTerm}&rdquo;
                  </button>
                )}
              </div>
            )}

            {selectedProduct && (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                <div>
                  <p className="text-xs font-black text-emerald-800">{selectedProduct.name}</p>
                  <p className="text-[10px] text-emerald-600">{selectedProduct.uom}</p>
                </div>
                <button className="text-[10px] text-slate-400 hover:text-rose-500 font-bold" onClick={resetForm}>Ganti</button>
              </div>
            )}

            {isRequestNew && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Nama Produk Baru</Label>
                  <button className="text-[10px] text-slate-400 hover:text-rose-500 font-bold" onClick={resetForm}>Batal</button>
                </div>
                <Input
                  placeholder="Nama produk yang ingin ditawarkan"
                  value={form.proposedName}
                  onChange={e => setForm(f => ({ ...f, proposedName: e.target.value }))}
                />
                <p className="text-[10px] text-amber-600 font-medium">Admin akan verifikasi dan mapping ke SKU produk.</p>
              </div>
            )}

            {(selectedProduct || isRequestNew) && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Harga Beli (Rp)</Label>
                    <Input
                      type="number"
                      placeholder="15000"
                      value={form.price}
                      onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Satuan (UOM)</Label>
                    <Input
                      placeholder="kg / pcs / ikat"
                      value={form.uom}
                      onChange={e => setForm(f => ({ ...f, uom: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Berlaku Dari</Label>
                    <Input
                      type="date"
                      value={form.validFrom}
                      onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Berlaku Sampai</Label>
                    <Input
                      type="date"
                      value={form.validTo}
                      onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">Harga ini berlaku sebagai komitmen selama periode tersebut.</p>

                <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? "Mengirim..." : "Kirim Penawaran"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500 px-1">Penawaran yang Dikirim ({myPrices.length})</p>
          {myPrices.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-8">Belum ada penawaran harga yang dikirim.</div>
          ) : (
            myPrices.map(vp => {
              const product = products.find(p => p.id === vp.productId)
              const productName = product?.name ?? vp.proposedName ?? "—"
              const isExpiredEntry = vp.status === 'active' && isAfter(new Date(), parseISO(vp.validTo))
              const displayStatus = isExpiredEntry ? 'expired' : vp.status
              return (
                <div key={vp.id} className="bg-white border rounded-xl px-4 py-3 flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-sm font-black">{productName}</p>
                    <p className="text-xs font-black text-emerald-600">{formatRupiah(vp.price)} <span className="text-slate-400 font-medium">/ {vp.uom}</span></p>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <Clock className="w-2.5 h-2.5" />
                      {format(parseISO(vp.validFrom), 'd MMM', { locale: localeId })} — {format(parseISO(vp.validTo), 'd MMM yy', { locale: localeId })}
                      <span className="mx-1">•</span>
                      diupdate {format(parseISO(vp.lastUpdated), 'd MMM yy', { locale: localeId })}
                    </div>
                  </div>
                  <Badge className={`text-[9px] shrink-0 ${
                    displayStatus === 'active' ? 'bg-emerald-100 text-emerald-700 border-none' :
                    displayStatus === 'pending' ? 'bg-amber-100 text-amber-700 border-none' :
                    displayStatus === 'expired' ? 'bg-slate-100 text-slate-500 border-none' :
                    'bg-rose-100 text-rose-700 border-none'
                  }`}>
                    {displayStatus}
                  </Badge>
                </div>
              )
            })
          )}
        </div>
      </main>
    </div>
  )
}

"use client"

import React, { useState, useEffect } from "react"
import { useAppStore } from "@/lib/store"
import { recordOnlinePurchase } from "@/lib/accounting"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ShoppingBag, Globe, CheckCircle2, Package, Search, Calculator, Truck, ShieldCheck, Plus } from "lucide-react"
import { toast } from "sonner"
import { formatRupiah, formatNumber, parseNumber } from "@/lib/utils"
import { cn } from "@/lib/utils"

export default function OnlinePurchasePage() {
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const products = useAppStore(state => state.products)
  const updatePurchaseItem = useAppStore(state => state.updatePurchaseItem)
  const bankAccounts = useAppStore(state => state.bankAccounts) || []

  const vendors = useAppStore(state => state.vendors)
  const salesOrders = useAppStore(state => state.salesOrders)

  const [searchTerm, setSearchTerm] = useState("")
  const [filter, setFilter] = useState<'semua' | 'Online' | 'Vendor' | 'Dropship'>('semua')
  const [menandai, setMenandai] = useState<string | null>(null)
  // Harga yang disepakati dengan vendor, per baris. Dulu ditanyakan di layar QC —
  // padahal gudang cuma menerima barang, bukan yang menawar harganya.
  const [hargaVendor, setHargaVendor] = useState<Record<string, number>>({})
  
  // Local state for calculators
  const [calculatorState, setCalculatorState] = useState<Record<string, {
    unitPrice: number,
    adminFee: number,
    shippingFee: number,
    totalPrice: number,
    ref: string
  }>>({})

  // Barang online baru boleh dipesan setelah rencananya dilepas Finance — di situlah
  // sebuah barang ditetapkan jalur "Online". Dulu gerbangnya status rekonsiliasi
  // 'Belum Transfer', yang dipasang tombol "Kirim ke Finance"; tombol itu sudah tidak
  // ada sejak rencana dan pencairan digabung ke satu dokumen, jadi gerbangnya pindah
  // ke status dokumen. Dokumen lama tetap lolos lewat cek status rekonsiliasi di bawah.
  const sentPurchaseIds = new Set(
    purchases
      .filter(p => p.status !== 'Menunggu Rencana' || !!p.budgetTransferDate ||
        p.reconciliationStatus === 'Belum Transfer' || p.reconciliationStatus === 'Laporan Masuk' || p.reconciliationStatus === 'Terverifikasi')
      .map(p => p.id)
  )

  // Pending Online Items
  const pendingOnlineItems = purchaseItems
    .filter(pi =>
       pi.purchaseMethod === 'Online' &&
       !pi.isOnlineOrdered &&
       sentPurchaseIds.has(pi.purchaseId) &&
       (products.find(p => p.id === pi.productId)?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pi.notes?.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .map(item => ({
      ...item,
      product: products.find(p => p.id === item.productId)
    }))

  // Jalur vendor & dropship: barangnya tidak dibeli di pasar, dipesan dari meja
  // purchasing sama seperti belanja online. Sebelum ini tidak ada tempat mengatakan
  // "sudah saya pesan ke vendornya" — begitu rencana dilepas, gudang langsung menunggu
  // barang yang belum tentu pernah dipesan ke siapa pun.
  //
  // Penandanya menumpang `isOnlineOrdered`, kolom yang sudah ada dan artinya memang
  // "sudah dipesan dari meja". Menambah kolom baru menuntut perubahan struktur database
  // yang tidak bisa dijalankan dari sini, dan fitur yang menunggu itu tidak menolong
  // siapa pun hari ini. Semua pembaca kolom ini sudah menyaring `purchaseMethod`
  // duluan, jadi tidak ada yang salah membacanya.
  const barisJalur = (metode: 'Vendor' | 'Dropship', sudah: boolean) => purchaseItems
    .filter(pi =>
      pi.purchaseMethod === metode &&
      !!pi.isOnlineOrdered === sudah &&
      !pi.isQCed &&
      sentPurchaseIds.has(pi.purchaseId))
    .map(pi => ({ ...pi, product: products.find(p => p.id === pi.productId) }))
    .filter(pi => !searchTerm ||
      pi.product?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pi.notes?.toLowerCase().includes(searchTerm.toLowerCase()))

  const JALUR = [
    { key: 'Online' as const, label: 'Belanja Online' },
    { key: 'Vendor' as const, label: 'Vendor Kirim' },
    { key: 'Dropship' as const, label: 'Dropship' },
  ]

  const belumDipesan = (metode: 'Online' | 'Vendor' | 'Dropship') =>
    metode === 'Online' ? pendingOnlineItems : barisJalur(metode, false)

  /**
   * Semua yang belum dipesan, dikelompokkan jalur lalu vendor.
   *
   * Satu halaman dengan kelompok, bukan tiga tab: yang mengerjakannya satu orang di satu
   * meja, dan tab menyembunyikan pekerjaan yang belum selesai di balik klik — tab yang
   * tidak dibuka hari itu isinya tidak pernah dilihat. Filter di atas hanya menyaring
   * tampilan, bukan memindahkan pekerjaan ke tempat lain.
   */
  const kelompok = JALUR
    .filter(j => filter === 'semua' || filter === j.key)
    .map(j => {
      const perVendor = new Map<string, ReturnType<typeof barisJalur>>()
      for (const pi of belumDipesan(j.key)) {
        const key = pi.plannedVendorId || pi.vendorId || ''
        if (!perVendor.has(key)) perVendor.set(key, [])
        perVendor.get(key)!.push(pi as any)
      }
      return { ...j, vendor: [...perVendor.entries()].sort((a, b) => a[0].localeCompare(b[0])) }
    })
    .filter(j => j.vendor.length > 0)

  const totalBelumDipesan = JALUR.reduce((n, j) => n + belumDipesan(j.key).length, 0)

  const namaVendor = (id: string) => vendors.find(v => v.id === id)?.companyName || 'Vendor belum dipilih'

  const tandaiDipesan = async (metode: 'Vendor' | 'Dropship', vendorId: string) => {
    const items = barisJalur(metode, false).filter(pi => (pi.plannedVendorId || pi.vendorId || '') === vendorId)
    if (items.length === 0 || menandai) return
    setMenandai(`${metode}:${vendorId}`)
    const t = toast.loading(`Menandai ${items.length} barang sudah dipesan…`)
    try {
      for (const pi of items) {
        // Sengaja TIDAK menyentuh isChecked: barangnya baru dipesan, belum diterima.
        // Tapi harga kesepakatannya disimpan sekarang — di sinilah harga itu benar-benar
        // diketahui. QC nanti tinggal memakainya untuk nilai persediaan, HPP dan nominal
        // tagihan tempo, tanpa perlu menanyakannya lagi ke gudang.
        const harga = hargaVendor[pi.id]
        await updatePurchaseItem(pi.id, {
          isOnlineOrdered: true,
          onlineOrderDate: new Date().toISOString(),
          ...(harga > 0 ? { actualUnitPrice: harga } : {}),
        })
      }
      toast.success(`${items.length} barang ditandai sudah dipesan ke ${namaVendor(vendorId)}.`, { id: t })
    } catch (e) {
      toast.error("Gagal menandai: " + (e instanceof Error ? e.message : String(e)), { id: t })
    } finally {
      setMenandai(null)
    }
  }

  // Sync items to calculator state
  useEffect(() => {
    const newState = { ...calculatorState }
    let changed = false
    pendingOnlineItems.forEach(item => {
      if (!newState[item.id]) {
        newState[item.id] = {
          unitPrice: 0,
          adminFee: 0,
          shippingFee: 0,
          totalPrice: 0,
          ref: ""
        }
        changed = true
      }
    })
    if (changed) setCalculatorState(newState)
  }, [pendingOnlineItems.length])

  const updateCalc = (itemId: string, updates: any) => {
    setCalculatorState(prev => {
      const current = prev[itemId] || { unitPrice: 0, adminFee: 0, shippingFee: 0, totalPrice: 0, ref: "" }
      const item = pendingOnlineItems.find(i => i.id === itemId)
      const qty = item?.qtyTarget || 1
      
      let next = { ...current, ...updates }

      // Logic Auto-Sync
      if ('unitPrice' in updates || 'adminFee' in updates || 'shippingFee' in updates) {
        next.totalPrice = (next.unitPrice * qty) + next.adminFee + next.shippingFee
      } else if ('totalPrice' in updates) {
        next.unitPrice = (next.totalPrice - next.adminFee - next.shippingFee) / qty
      }

      return { ...prev, [itemId]: next }
    })
  }

  const currentUser = useAppStore(state => state.currentUser)
  const handleCompleteOrder = async (itemId: string) => {
    const calc = calculatorState[itemId]
    if (!calc || calc.totalPrice <= 0) {
      toast.error("Masukkan detail harga yang valid.")
      return
    }

    const item = purchaseItems.find(i => i.id === itemId)
    const product = products.find(p => p.id === item?.productId)
    if (!item || !product) return

    const toastId = toast.loading(`Memproses order ${product.name}...`)

    // 1. Determine bank account from parent purchase
    const parentPurchase = purchases.find(p => p.id === item.purchaseId)
    const bankAccountId = parentPurchase?.budgetBankAccountId || bankAccounts[0]?.id || 'bank-1'

    // 2. Mark item as ordered + checked (so it appears in settlement QC gate)
    await updatePurchaseItem(itemId, {
      isOnlineOrdered: true,
      isChecked: true,
      actualUnitPrice: calc.unitPrice,
      qtyPurchased: item.qtyTarget,
      onlineRef: calc.ref,
      onlineOrderDate: new Date().toISOString(),
      notes: `${item.notes || ''} (Detailed Cost: Unit @${calc.unitPrice}, Admin: ${calc.adminFee}, Ship: ${calc.shippingFee})`
    })

    // 3. Record journal entry + cash transaction immediately (no separate audit step needed)
    const success = await recordOnlinePurchase(
      itemId,
      calc.totalPrice,
      product.name,
      calc.adminFee,
      calc.shippingFee,
      bankAccountId
    )

    if (!success) {
      toast.error(`Gagal mencatat jurnal untuk ${product.name}.`, { id: toastId })
      return
    }

    toast.success(`Order ${product.name} selesai & dijurnal otomatis.`, { id: toastId })

    // 3. Auto-advance Sales Order if ALL items are now ready/sourced
    if (item.salesOrderId) {
      const store = useAppStore.getState()
      const soId = item.salesOrderId
      const allPOItems = store.purchaseItems.filter(pi => pi.salesOrderId === soId)
      
      // All items are READY if: (Market & Tempo: isChecked) AND (Online: isOnlineOrdered)
      // Note: In sourcing list, Market and Tempo items are marked isChecked
      // ("Tandai Sudah Diambil" for Tempo). In this hub, Online items are marked isOnlineOrdered.
      const isAllReady = allPOItems.every(pi => {
        if (pi.id === itemId) return true; // Just finished this one
        if (pi.purchaseMethod === 'Online') return pi.isOnlineOrdered;
        return pi.isChecked; // Market & Tempo items
      })

      if (isAllReady) {
        store.updateSalesOrder(soId, { status: 'QC' })
        toast.info(`PO ${store.salesOrders.find(s => s.id === soId)?.poNumber} kini masuk ke Antrean QC (Semua barang sudah dibeli/dipesan).`)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white dark:bg-slate-900 -mx-4 -mt-4 p-6 border-b shadow-sm">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3"> Belanja <span className="text-blue-600">Purchasing</span>
          </h2>
          <p className="text-sm text-slate-500 font-bold mt-1">Semua belanja yang dipesan dari meja — bukan yang dibeli sendiri di pasar.</p>
        </div>
      </div>

      {/* Filter, bukan tab: yang disaring cuma tampilannya. */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          ['semua', 'Semua', totalBelumDipesan],
          ['Online', 'Belanja Online', belumDipesan('Online').length],
          ['Vendor', 'Vendor Kirim', belumDipesan('Vendor').length],
          ['Dropship', 'Dropship', belumDipesan('Dropship').length],
        ] as const).map(([key, label, jml]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "h-9 rounded-2xl px-3.5 text-[11px] font-bold  transition-colors",
              filter === key ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:text-slate-800",
            )}
          >
            {label}
            <span className={cn(
              "ml-2 rounded-full px-2 py-0.5 text-[11px]",
              filter === key ? "bg-card" : "bg-slate-100 text-slate-500",
            )}>{jml}</span>
          </button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Cari produk atau catatan..."
          className="pl-10 h-12 bg-white rounded-2xl border-none shadow-sm focus:ring-4 focus:ring-blue-500/10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {kelompok.length === 0 ? (
        <Card className="border-dashed py-20 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-2xl">
          <ShoppingBag className="w-16 h-16 mb-4 opacity-10" />
          <p className="font-bold text-lg">Tidak ada yang perlu dipesan.</p>
          <p className="text-sm">Barang muncul di sini setelah rencananya dilepas Finance.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-lg">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50 dark:bg-slate-900/50 text-left">
                  <th className="px-4 py-3 text-[11px] font-bold  text-slate-500">Barang</th>
                  <th className="px-3 py-3 text-[11px] font-bold  text-slate-500">Dari PO</th>
                  <th className="px-3 py-3 text-right text-[11px] font-bold  text-slate-500">Qty</th>
                  <th className="px-3 py-3 text-right text-[11px] font-bold  text-slate-500">Patokan</th>
                  <th className="px-3 py-3 text-[11px] font-bold  text-slate-500">Bayar · Ambil</th>
                  <th className="px-3 py-3 text-[11px] font-bold  text-slate-500 bg-amber-50">Harga Beli</th>
                  <th className="px-3 py-3 text-[11px] font-bold  text-slate-500 bg-amber-50">Admin</th>
                  <th className="px-3 py-3 text-[11px] font-bold  text-slate-500 bg-amber-50">Ongkir</th>
                  <th className="px-3 py-3 text-[11px] font-bold  text-slate-500 bg-amber-50">Total Bayar</th>
                  <th className="px-3 py-3 text-[11px] font-bold  text-slate-500 bg-amber-50">Ref Order</th>
                  <th className="px-3 py-3 text-[11px] font-bold  text-slate-500"></th>
                </tr>
              </thead>
              <tbody>
                {kelompok.map(j => (
                  <React.Fragment key={j.key}>
                    <tr className="border-b bg-slate-900/90">
                      <td colSpan={11} className="px-4 py-2 text-[11px] font-bold  text-white">
                        {j.label} · {j.vendor.reduce((n, [, items]) => n + items.length, 0)} barang
                      </td>
                    </tr>

                    {j.vendor.map(([vendorId, items]) => (
                      <React.Fragment key={`${j.key}-${vendorId || 'tanpa'}`}>
                        <tr className="border-b bg-slate-50 dark:bg-slate-900/40">
                          <td colSpan={11} className="px-4 py-2">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="text-[11px] font-bold text-slate-600">{namaVendor(vendorId)}</span>
                              <span className="text-[11px] font-bold text-slate-400">{items.length} barang</span>
                              {j.key !== 'Online' && (
                                <Button
                                  size="sm"
                                  disabled={!vendorId || menandai === `${j.key}:${vendorId}`}
                                  title={!vendorId ? 'Vendornya belum ditentukan Finance di Rencana Pembelian.' : undefined}
                                  className="h-8 rounded-xl bg-emerald-600 text-[11px] font-bold  text-white hover:bg-emerald-700"
                                  onClick={() => tandaiDipesan(j.key as 'Vendor' | 'Dropship', vendorId)}
                                >
                                  {menandai === `${j.key}:${vendorId}` ? 'Menandai…' : 'Tandai Dipesan'}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {items.map((item: any) => {
                          const calc = calculatorState[item.id] || { unitPrice: 0, adminFee: 0, shippingFee: 0, totalPrice: 0, ref: "" }
                          const so = salesOrders.find(o => o.id === item.salesOrderId)
                          const online = j.key === 'Online'
                          return (
                            <tr key={item.id} className="border-b last:border-0 align-middle">
                              <td className="px-4 py-3">
                                <p className="font-bold text-slate-800 leading-tight">{item.product?.name}</p>
                                <p className="text-[11px] font-bold  text-slate-400">{item.product?.skuCode}</p>
                              </td>
                              <td className="px-3 py-3 text-xs font-bold text-slate-500">{so?.poNumber || '—'}</td>
                              <td className="px-3 py-3 text-right font-bold text-slate-700 whitespace-nowrap">
                                {item.qtyTarget} {item.product?.uom}
                              </td>
                              <td className="px-3 py-3 text-right text-xs font-bold text-slate-500 whitespace-nowrap">
                                {formatRupiah(item.estimatedUnitPrice || 0)}
                              </td>
                              <td className="px-3 py-3 text-[11px] font-bold  text-slate-400 whitespace-nowrap">
                                {item.paymentMethod || 'Cash'} · {j.key === 'Dropship' ? 'Ke klien' : 'Ke gudang'}
                              </td>

                              {online ? (
                                <>
                                  <td className="px-3 py-2 bg-amber-50/40">
                                    <Input inputMode="numeric" className="h-9 w-28 text-right font-bold" placeholder="0"
                                      value={calc.unitPrice ? formatNumber(calc.unitPrice) : ''}
                                      onChange={e => updateCalc(item.id, { unitPrice: parseNumber(e.target.value) })} />
                                  </td>
                                  <td className="px-3 py-2 bg-amber-50/40">
                                    <Input inputMode="numeric" className="h-9 w-24 text-right font-bold" placeholder="0"
                                      value={calc.adminFee ? formatNumber(calc.adminFee) : ''}
                                      onChange={e => updateCalc(item.id, { adminFee: parseNumber(e.target.value) })} />
                                  </td>
                                  <td className="px-3 py-2 bg-amber-50/40">
                                    <Input inputMode="numeric" className="h-9 w-24 text-right font-bold" placeholder="0"
                                      value={calc.shippingFee ? formatNumber(calc.shippingFee) : ''}
                                      onChange={e => updateCalc(item.id, { shippingFee: parseNumber(e.target.value) })} />
                                  </td>
                                  <td className="px-3 py-2 bg-amber-50/40">
                                    <Input inputMode="numeric" className="h-9 w-32 text-right font-bold" placeholder="0"
                                      value={calc.totalPrice ? formatNumber(calc.totalPrice) : ''}
                                      onChange={e => updateCalc(item.id, { totalPrice: parseNumber(e.target.value) })} />
                                  </td>
                                  <td className="px-3 py-2 bg-amber-50/40">
                                    <Input className="h-9 w-36 text-xs" placeholder="ID Shopee/Tokped"
                                      value={calc.ref}
                                      onChange={e => updateCalc(item.id, { ref: e.target.value })} />
                                  </td>
                                  <td className="px-3 py-2">
                                    <Button
                                      size="sm"
                                      disabled={calc.totalPrice <= 0}
                                      className="h-9 rounded-xl bg-slate-900 text-[11px] font-bold  text-white hover:bg-black disabled:bg-slate-100 disabled:text-slate-400"
                                      onClick={() => handleCompleteOrder(item.id)}
                                    >
                                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Order
                                    </Button>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-3 py-2 bg-amber-50/40">
                                    <Input
                                      inputMode="numeric"
                                      className="h-9 w-28 text-right font-bold"
                                      placeholder={String(item.estimatedUnitPrice || 0)}
                                      value={hargaVendor[item.id] ? formatNumber(hargaVendor[item.id]) : ''}
                                      onChange={e => setHargaVendor(prev => ({ ...prev, [item.id]: parseNumber(e.target.value) }))}
                                    />
                                  </td>
                                  <td colSpan={5} className="px-3 py-3 text-[11px] font-bold text-slate-400">
                                    Kosongkan kalau sesuai patokan. Angka ini dipakai untuk nilai stok dan tagihan vendor.
                                  </td>
                                </>
                              )}
                            </tr>
                          )
                        })}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t bg-slate-50 px-4 py-2 text-[11px] font-bold text-slate-400 dark:bg-slate-900/50">
            Kolom kuning yang diketik. Sisanya sudah diputuskan di Rencana Pembelian.
          </p>
        </Card>
      )}

      {(['Vendor', 'Dropship'] as const).some(m => barisJalur(m, true).length > 0) && (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              Sudah dipesan, menunggu barang datang
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(['Vendor', 'Dropship'] as const).flatMap(m => barisJalur(m, true)).map(pi => (
              <div key={pi.id} className="flex items-center justify-between rounded-2xl border px-4 py-2">
                <span className="text-sm font-bold text-slate-700">{pi.product?.name || pi.productId}</span>
                <span className="text-xs font-bold text-slate-400">
                  {pi.qtyTarget} {pi.product?.uom} · {namaVendor(pi.plannedVendorId || pi.vendorId || '')}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

    </div>
  )
}

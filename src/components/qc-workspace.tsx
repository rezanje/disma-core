"use client"

import type { SVGProps } from "react"
import Link from "next/link"
import React, { useState, useCallback } from "react"
import { WorksheetPrintButton } from "@/components/worksheet-print-button"
import { qty as qtyTeks } from "@/lib/worksheet-rows"
import { barisSiap, kesiapan, labelKesiapan } from "@/lib/kesiapan-po"
import { useAppStore } from "@/lib/store"
import { processInboundQC } from "@/lib/qc-process"
import { costBasisFor } from "@/lib/cogs-source"
import { awaitingQc, buildFifoAllocations } from "@/lib/daily-flow"
import { recordShrinkage, recordStockMovement, createAccountingEntry, VENDOR_RETURN_CLAIM_ACCOUNT } from "@/lib/accounting"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ShieldAlert, ShieldCheck, Tag, RefreshCcw, PackageSearch, AlertTriangle, Warehouse, Truck, ClipboardCheck, ChevronDown, Store } from "lucide-react"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import { cn } from "@/lib/utils"
import { qtyOwed } from "@/lib/backorder"
import { isReturnSplitValid, isSwapSplitValid } from "@/lib/vendor-return"
import { PelakuPicker } from "@/components/pelaku-picker"

type PoAllocation = { soId: string; qty: number }

export default function QCWorkspace({ transcription = false }: { transcription?: boolean }) {
  const products = useAppStore(state => state.products)
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const allPendingReturns = useAppStore(state => state.pendingReturns)
  // Yang sudah diproses tetap tersimpan sebagai riwayat, tapi tidak boleh muncul
  // lagi di antrian — kalau muncul, barangnya bisa di-restock dua kali.
  const pendingReturns = allPendingReturns.filter(r => r.status !== 'Processed')
  const salesOrders = useAppStore(state => state.salesOrders)
  const salesOrderItems = useAppStore(state => state.salesOrderItems)
  const clients = useAppStore(state => state.clients)
  const vendors = useAppStore(state => state.vendors)
  const vendorPrices = useAppStore(state => state.vendorPrices)
  const vendorReturns = useAppStore(state => state.vendorReturns)


  const updatePurchaseItem = useAppStore(state => state.updatePurchaseItem)
  const updatePendingReturn = useAppStore(state => state.updatePendingReturn)
  const updateSalesOrder = useAppStore(state => state.updateSalesOrder)
  const users = useAppStore(state => state.users)
  const kurirs = users.filter(u => u.role === 'kurir')

  // Antreannya dihitung di src/lib/daily-flow.ts supaya layar harian gabungan
  // melihat daftar yang persis sama.
  const pendingQCItems = awaitingQc(purchaseItems, purchases)
    .map(item => ({ ...item, product: products.find(p => p.id === item.productId) }))
    .filter(item => item.product)

  const [selectedPurchaseItemId, setSelectedPurchaseItemId] = useState("")
  const [qtyPassToInventory, setQtyPassToInventory] = useState(0)
  const [poAllocations, setPoAllocations] = useState<PoAllocation[]>([])
  const [qtyReject, setQtyReject] = useState(0)
  const [rejectReason, setRejectReason] = useState("")
  const [unbalanceReason, setUnbalanceReason] = useState("")
  const [qcPhoto, setQcPhoto] = useState<string | null>(null)
  const [expiryDate, setExpiryDate] = useState("")
  const [batchNumber, setBatchNumber] = useState("")
  // Harga beli untuk barang yang diantar vendor — satu-satunya tempat harga itu bisa masuk.
  // Mode Salin: siapa yang benar-benar memeriksa barangnya di gudang, terpisah dari
  // siapa yang mengetikkan hasilnya.
  const [qcPerformedBy, setQcPerformedBy] = useState("")
  const [rejectAction, setRejectAction] = useState<'Return' | 'Disposal' | 'B2C'>('Disposal')

  // Usulan pembagian ke pesanan: pesanan tertua dapat duluan (src/lib/daily-flow.ts).
  const buildFifo = useCallback(
    (productId: string, totalPassed: number) => buildFifoAllocations(productId, totalPassed, salesOrders, salesOrderItems),
    [salesOrders, salesOrderItems])

  const activePurchaseItem = pendingQCItems.find(i => i.id === selectedPurchaseItemId)
  const activeProduct = products.find(p => p.id === activePurchaseItem?.productId)

  const handleProcessQC = async () => {
    if (!activeProduct || !activePurchaseItem) return

    if (transcription && !users.some(u => u.id === qcPerformedBy && u.role === 'gudang')) {
      toast.error("Pilih nama pemeriksa sesuai berkas QC.")
      return
    }

    toast.loading("Memproses verifikasi inbound & pencatatan jurnal...", { id: "qc-process" })
    // Isinya pindah ke src/lib/qc-process.ts supaya layar harian gabungan memanggil
    // alur yang sama persis, bukan salinannya.
    const res = await processInboundQC(useAppStore.getState, {
      purchaseItemId: activePurchaseItem.id,
      qtyPassToInventory,
      allocations: poAllocations.map(a => ({ soId: a.soId, qty: a.qty })),
      qtyReject,
      rejectAction,
      rejectReason,
      unbalanceReason,
      batchNumber,
      expiryDate,
      qcPhoto,
      qcPerformedByUserId: qcPerformedBy,
    })

    if (!res.ok) {
      toast.error(res.error, { id: "qc-process" })
      return
    }
    res.warnings.forEach(w => toast.warning(w))
    res.infos.forEach(i => toast.info(i))

    toast.success("QC berhasil disimpan dan stok telah diperbarui!", { id: "qc-process" })

    // Cleanup
    setSelectedPurchaseItemId("")
    setQtyPassToInventory(0)
    setPoAllocations([])
    setQtyReject(0)
    setRejectReason("")
    setUnbalanceReason("")
    setQcPerformedBy("")
    setQcPhoto(null)
    setExpiryDate("")
    setBatchNumber("")
  }

  // --- TAB 2: CUSTOMER RETURN QC LOGIC ---
  const [selectedReturnId, setSelectedReturnId] = useState("")
  const activeReturn = pendingReturns.find(r => r.id === selectedReturnId)
  const activeReturnProduct = products.find(p => p.id === activeReturn?.productId)
  const [retQtyPass, setRetQtyPass] = useState(0)
  const [retQtyReject, setRetQtyReject] = useState(0)
  const [retReason, setRetReason] = useState("")
  const [retQtyVendor, setRetQtyVendor] = useState(0)
  const [retVendorId, setRetVendorId] = useState("")
  const [selectedVendorReturnId, setSelectedVendorReturnId] = useState("")
  const [swapPassQty, setSwapPassQty] = useState(0)
  const [swapRejectQty, setSwapRejectQty] = useState(0)
  const pendingVendorReturns = vendorReturns.filter(v => v.status === 'Menunggu Vendor')
  const activeVendorReturn = pendingVendorReturns.find(v => v.id === selectedVendorReturnId)
  const activeVendorReturnProduct = products.find(p => p.id === activeVendorReturn?.productId)

  const handleProcessReturnQC = async () => {
    if (!activeReturn || !activeReturnProduct) return
    const currentUser = useAppStore.getState().currentUser

    // Barangnya masuk Persediaan dengan harga beli, jadi harus keluar dengan harga
    // beli juga. Dulu dinilai pakai harga master produk: selisihnya mengendap di
    // nilai persediaan dan tidak pernah bisa dikeluarkan lagi. Jalur retur vendor di
    // bawah sudah benar sejak lama — jalur ini yang terlewat.
    const retBasis = costBasisFor(
      activeReturn.originalSoId, activeReturnProduct.id, purchaseItems, purchases,
    )
    const retUnitCost = retBasis?.actualUnitPrice || activeReturnProduct.basePrice || 0

    if (!isReturnSplitValid({ pass: retQtyPass, buang: retQtyReject, vendor: retQtyVendor }, activeReturn.qty)) {
      toast.error(`Total QC harus match dengan jumlah retur (${activeReturn.qty})`)
      return
    }
    if (retQtyVendor > 0 && !retVendorId) {
      toast.error("Pilih vendor tujuan retur dulu.")
      return
    }

    if (retQtyPass > 0) {
      await recordStockMovement({
        productId: activeReturnProduct.id,
        quantity: retQtyPass,
        stockDelta: retQtyPass,
        direction: 'In',
        kind: 'RETURN_RESTOCK',
        source: 'Return QC',
        destination: 'Inventory',
        referenceType: 'QC',
        referenceId: activeReturn.id,
        note: `Retur customer lolos QC dan kembali ke inventory`,
        createdByUserId: currentUser?.id || 'system',
        unitCost: retUnitCost,
      })
      toast.success(`${retQtyPass} unit dikembalikan ke stok layak jual.`)
    }

    if (retQtyReject > 0) {
      const rejectId = uuidv4()
      await recordShrinkage(rejectId, retQtyReject * retUnitCost, `Return Reject - ${activeReturnProduct.name}: ${retReason || activeReturn.reason}`)
      await recordStockMovement({
        productId: activeReturnProduct.id,
        quantity: retQtyReject,
        stockDelta: 0,
        direction: 'Info',
        kind: 'RETURN_REJECT',
        source: 'Return QC',
        destination: 'Reject/Write-off',
        referenceType: 'QC',
        referenceId: activeReturn.id,
        note: `Retur customer reject: ${retReason || activeReturn.reason}`,
        createdByUserId: currentUser?.id || 'system',
      })
      await useAppStore.getState().addRejectedItem({
        id: rejectId,
        date: new Date().toISOString(),
        productId: activeReturnProduct.id,
        qty: retQtyReject,
        reason: retReason || activeReturn.reason,
        source: 'Return',
        referenceId: activeReturn.id,
        reportedBy: currentUser?.id || 'system'
      })
      toast.error(`${retQtyReject} unit rusak/dibuang.`)
    }

    if (retQtyVendor > 0) {
      const vrId = uuidv4()
      await useAppStore.getState().addVendorReturn({
        id: vrId,
        productId: activeReturnProduct.id,
        vendorId: retVendorId,
        qty: retQtyVendor,
        reason: retReason || activeReturn.reason,
        date: new Date().toISOString(),
        originalReturnId: activeReturn.id,
        status: 'Menunggu Vendor',
      })
      // Notify Admin PO — they coordinate the swap with the vendor.
      const vendorName = vendors.find(v => v.id === retVendorId)?.companyName || 'vendor'
      const adminUsers = useAppStore.getState().users.filter(u => u.role === 'admin_po')
      for (const adminUser of adminUsers) {
        await useAppStore.getState().addNotification({
          id: uuidv4(),
          userId: adminUser.id,
          title: `Retur ke Vendor: ${activeReturnProduct.name}`,
          message: `${retQtyVendor} ${activeReturnProduct.uom} diretur ke ${vendorName} untuk ditukar.`,
          type: 'system',
          link: '/warehouse/qc',
          read: false,
          createdAt: new Date().toISOString()
        })
      }
      toast.success(`${retQtyVendor} unit diretur ke vendor untuk ditukar.`)
    }

    // Persist completion — a state-only mutation reappears on next sync.
    await updatePendingReturn(activeReturn.id, { status: 'Processed' })
    setSelectedReturnId("")
    setRetQtyPass(0)
    setRetQtyReject(0)
    setRetQtyVendor(0)
    setRetVendorId("")
    setRetReason("")
  }

  const handleResolveVendorReturn = async (mode: 'swap' | 'reject') => {
    if (!activeVendorReturn || !activeVendorReturnProduct) return
    const currentUser = useAppStore.getState().currentUser
    const prod = activeVendorReturnProduct

    // Dua asal retur vendor, dua tempat nilainya sekarang berada:
    //  - dari QC barang masuk  → nilainya sudah pindah ke 1-2100 (tagihan ke vendor)
    //  - dari retur customer   → barangnya masih tercatat di Persediaan
    // Salah pilih lawan jurnal bikin salah satu akun itu nyangkut selamanya.
    const originPurchaseItem = purchaseItems.find(pi => pi.id === activeVendorReturn.originalReturnId)
    const claimAccount = originPurchaseItem ? VENDOR_RETURN_CLAIM_ACCOUNT : '1-3000'
    const unitCost = originPurchaseItem?.actualUnitPrice || originPurchaseItem?.estimatedUnitPrice || prod.basePrice || 0

    if (mode === 'swap') {
      if (!isSwapSplitValid({ pass: swapPassQty, reject: swapRejectQty }, activeVendorReturn.qty)) {
        toast.error(`Total QC pengganti harus match dengan jumlah retur (${activeVendorReturn.qty})`)
        return
      }
      if (swapPassQty > 0) {
        // Barang pengganti datang: nilainya balik ke Persediaan dan tagihan ke vendor lunas.
        // Dulu cuma stoknya yang nambah — nilainya tidak pernah ikut kembali.
        if (claimAccount !== '1-3000' && swapPassQty * unitCost > 0) {
          await createAccountingEntry(
            `Pengganti Retur Vendor - ${prod.name}`,
            'QC',
            activeVendorReturn.id,
            [{ accountCode: '1-3000', amount: swapPassQty * unitCost }],
            [{ accountCode: claimAccount, amount: swapPassQty * unitCost }]
          )
        }
        await recordStockMovement({
          productId: prod.id,
          quantity: swapPassQty,
          stockDelta: swapPassQty,
          direction: 'In',
          kind: 'RETURN_RESTOCK',
          source: 'Vendor Swap',
          destination: 'Inventory',
          referenceType: 'QC',
          referenceId: activeVendorReturn.id,
          note: `Barang pengganti dari vendor lolos QC, masuk stok`,
          createdByUserId: currentUser?.id || 'system',
        })
      }
      if (swapRejectQty > 0) {
        const rejectId = uuidv4()
        await recordShrinkage(rejectId, swapRejectQty * unitCost, `Vendor Swap Reject - ${prod.name}`, claimAccount)
        await useAppStore.getState().addRejectedItem({
          id: rejectId,
          date: new Date().toISOString(),
          productId: prod.id,
          qty: swapRejectQty,
          reason: `Pengganti vendor gagal QC: ${activeVendorReturn.reason}`,
          source: 'Return',
          referenceId: activeVendorReturn.id,
          reportedBy: currentUser?.id || 'system'
        })
      }
      await useAppStore.getState().updateVendorReturn(activeVendorReturn.id, {
        status: 'Selesai-Ditukar',
        resolvedDate: new Date().toISOString(),
        replacementPassQty: swapPassQty,
        replacementRejectQty: swapRejectQty,
      })
      toast.success(`Tukar selesai: ${swapPassQty} masuk stok, ${swapRejectQty} dibuang.`)
    } else {
      // Vendor refused — the full quantity becomes a loss now.
      const rejectId = uuidv4()
      await recordShrinkage(rejectId, activeVendorReturn.qty * unitCost, `Vendor Tolak Retur - ${prod.name}`, claimAccount)
      await useAppStore.getState().addRejectedItem({
        id: rejectId,
        date: new Date().toISOString(),
        productId: prod.id,
        qty: activeVendorReturn.qty,
        reason: `Vendor tolak tukar: ${activeVendorReturn.reason}`,
        source: 'Return',
        referenceId: activeVendorReturn.id,
        reportedBy: currentUser?.id || 'system'
      })
      await useAppStore.getState().updateVendorReturn(activeVendorReturn.id, {
        status: 'Selesai-Ditolak',
        resolvedDate: new Date().toISOString(),
      })
      toast.error(`${activeVendorReturn.qty} unit ditolak vendor, dibuang.`)
    }

    setSelectedVendorReturnId("")
    setSwapPassQty(0)
    setSwapRejectQty(0)
  }

  // --- TAB 3: PERSIAPAN PENGIRIMAN ---
  const [selectedDispatchSoIds, setSelectedDispatchSoIds] = useState<Set<string>>(new Set())
  const [dispatchQty, setDispatchQty] = useState<Record<string, number>>({}) // soItemId → qty
  const [dispatchNote, setDispatchNote] = useState<Record<string, string>>({}) // soItemId → note
  // Bukti bahwa persiapannya benar-benar tersimpan, plus ke mana lanjutnya.
  //
  // Toast hilang dalam beberapa detik dan daftar PO-nya langsung kosong sesudah simpan —
  // dari sisi pemakai, "berhasil" dan "tidak terjadi apa-apa" terlihat sama persis, dan
  // barangnya diam di gudang karena tidak ada yang tahu masih ada satu langkah lagi.
  const [tersimpan, setTersimpan] = useState<{ jumlah: number; po: string[] } | null>(null)

  // PO yang barangnya BELUM lengkap pun ikut ditampilkan.
  //
  // Dulu hanya status 'Packing' — artinya seluruh barangnya sudah lolos QC. PO yang
  // tinggal menunggu satu barang online tidak muncul di mana pun: gudang tidak bisa
  // mulai menyiapkan yang sudah ada, dan tidak ada yang tahu tinggal berapa barang lagi.
  const packingSos = salesOrders
    .filter(so => so.status === 'Packing' || so.status === 'QC')
    .sort((a, b) => a.targetDeliveryDate.localeCompare(b.targetDeliveryDate))

  const kesiapanSO = (soId: string) =>
    kesiapan(salesOrderItems.filter(i => i.salesOrderId === soId))

  const selectedSoItems = salesOrderItems.filter(i =>
    selectedDispatchSoIds.has(i.salesOrderId)
  )

  const handleConfirmDispatch = async () => {
    if (selectedDispatchSoIds.size === 0) return
    const currentUser = useAppStore.getState().currentUser

    toast.loading("Memproses serah terima...", { id: "dispatch" })

    for (const soItemId of Object.keys(dispatchQty)) {
      const qty = dispatchQty[soItemId]
      const note = dispatchNote[soItemId] || ''
      await useAppStore.getState().updateSalesOrderItem(soItemId, {
        isPacked: true,
        qtyDispatched: qty || undefined,
        dispatchNote: note || undefined,
      })
    }

    // Sengaja TIDAK memajukan status ke 'Siap Kirim'. Rilis barang hanya boleh
    // lewat Goods Outbound, karena di sanalah stok dikurangi dan misi pengiriman
    // untuk kurir dibuat. Memajukan status di sini justru mengeluarkan PO dari
    // antrian Outbound, sehingga satu-satunya jalur yang benar jadi tak bisa
    // ditempuh — barang berangkat tanpa pernah tercatat keluar.

    toast.success(`Persiapan ${selectedDispatchSoIds.size} PO tersimpan.`, { id: "dispatch" })
    setTersimpan({
      jumlah: selectedDispatchSoIds.size,
      po: [...selectedDispatchSoIds].map(id => salesOrders.find(s2 => s2.id === id)?.poNumber || id.slice(0, 8)),
    })
    setSelectedDispatchSoIds(new Set())
    setDispatchQty({})
    setDispatchNote({})
  }

  const groupedQCItems = pendingQCItems.reduce((acc, item) => {
    const so = salesOrders.find(s => s.id === item.salesOrderId);
    const groupKey = so ? `PO: ${so.poNumber}` : "Restock Gudang (Tanpa PO)";
    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(item);
    return acc;
  }, {} as Record<string, typeof pendingQCItems>);

  /**
   * Formulir QC yang dulu berdiri sendiri di bawah daftar, sekarang dibuka tepat di
   * bawah barisnya. Ukurannya dirapatkan supaya satu layar cukup memuat daftar dan
   * isiannya sekaligus — pemeriksa tidak perlu bolak-balik menggulung untuk memastikan
   * angka yang diketik milik barang yang benar.
   */
  const panelQC = activeProduct && activePurchaseItem ? (
                 <div className="space-y-4 px-4 py-4 duration-200">
                    {/* PO Allocation Table */}
                    <div className="space-y-3">
                      <Label className="text-slate-500 font-bold uppercase text-[11px] tracking-widest flex items-center gap-2">
                        <Tag className="w-4 h-4" /> Distribusi ke PO Klien (FIFO)
                      </Label>

                      {poAllocations.length === 0 ? (
                        <div className="p-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center">
                          <p className="text-[11px] font-bold  text-slate-400">Tidak ada PO pending untuk produk ini</p>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-indigo-100 overflow-hidden">
                          {poAllocations.map((alloc, idx) => {
                            const so = salesOrders.find(s => s.id === alloc.soId)
                            const client = clients.find(c => c.id === so?.clientId)
                            const soItem = salesOrderItems.find(i => i.salesOrderId === alloc.soId && i.productId === activePurchaseItem.productId)
                            const needed = soItem ? Math.max(0, soItem.qty - (soItem.qtyDelivered ?? 0) - (soItem.qtyFinal ?? 0)) : 0
                            return (
                              <div key={alloc.soId} className={cn(
                                "flex items-center gap-3 px-3 py-2 bg-indigo-50/40",
                                idx > 0 && "border-t border-indigo-100"
                              )}>
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-slate-800 text-sm truncate">{so?.poNumber ?? alloc.soId}</p>
                                  <p className="text-[11px] font-bold text-slate-400 ">{client?.companyName ?? '—'} · Butuh: {needed} {activeProduct?.uom}</p>
                                </div>
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  className="w-20 text-sm font-bold h-9 rounded-lg border-indigo-200 bg-white text-center"
                                  value={alloc.qty}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0
                                    setPoAllocations(prev => prev.map((a, i) => i === idx ? { ...a, qty: val } : a))
                                  }}
                                />
                                <span className="text-xs font-bold text-slate-400 uppercase w-8">{activeProduct?.uom}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Inventory + Reject */}
                    <div className="flex flex-wrap gap-3">
                      <div className="flex-1 min-w-[150px] bg-emerald-50/60 p-3 rounded-xl border border-emerald-100 space-y-1.5">
                        <Label className="text-emerald-700 font-bold uppercase text-[11px] tracking-widest flex items-center gap-2">
                          <Warehouse className="w-4 h-4" /> Stok Gudang
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          className="text-sm font-bold h-9 rounded-lg border-none shadow-sm"
                          value={qtyPassToInventory}
                          onChange={(e) => setQtyPassToInventory(parseFloat(e.target.value) || 0)}
                        />
                        <p className="text-[11px] font-bold text-emerald-400 uppercase">Masuk Stok Gudang (Available)</p>
                      </div>

                      <div className="flex-1 min-w-[150px] bg-rose-50/60 p-3 rounded-xl border border-rose-100 space-y-1.5">
                        <Label className="text-rose-700 font-bold uppercase text-[11px] tracking-widest flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4" /> Reject / Rusak
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          className="text-sm font-bold h-9 rounded-lg border-none shadow-sm"
                          value={qtyReject}
                          onChange={(e) => setQtyReject(parseFloat(e.target.value) || 0)}
                        />
                        <p className="text-[11px] font-bold text-rose-400 uppercase">Buang / Shrinkage</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <div className="space-y-2">
                        <Label className="text-slate-500 font-bold uppercase text-[11px] tracking-widest">Batch Number (Opsional)</Label>
                        <Input
                          placeholder="e.g. BATCH-A1"
                          className="h-9 rounded-lg border border-slate-200 bg-white text-xs"
                          value={batchNumber}
                          onChange={(e) => setBatchNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-500 font-bold uppercase text-[11px] tracking-widest">Tanggal Kedaluarsa (Wajib Pangan Segar)</Label>
                        <Input
                          type="date"
                          className="h-9 rounded-lg border border-slate-200 bg-white text-xs"
                          value={expiryDate}
                          onChange={(e) => setExpiryDate(e.target.value)}
                        />
                      </div>
                    </div>
 
                     <div className="space-y-4">
                        <div className="flex justify-between items-center px-4">
                           {(() => {
                             const totalAllocPos = poAllocations.reduce((s, a) => s + a.qty, 0)
                             const totalDone = qtyPassToInventory + totalAllocPos + qtyReject
                             const balanced = totalDone === activePurchaseItem.qtyPurchased
                             return <>
                               <span className={cn("text-xs font-bold ", balanced ? "text-emerald-600" : "text-rose-600")}>
                                 Status: {balanced ? "Balance ✓" : "Tidak Balance !"}
                               </span>
                               <span className="text-[11px] font-bold text-slate-400">Processed: {totalDone} / {activePurchaseItem.qtyPurchased}</span>
                             </>
                           })()}
                        </div>

                        {(() => {
                          const totalAllocPos = poAllocations.reduce((s, a) => s + a.qty, 0)
                          return (qtyPassToInventory + totalAllocPos + qtyReject !== activePurchaseItem.qtyPurchased)
                        })() && (
                           <div className="space-y-2 p-3 bg-rose-50 rounded-xl border border-rose-100">
                              <Label className="text-rose-700 font-bold uppercase text-[11px] tracking-widest">Alasan Selisih / Tidak Balance (Wajib)</Label>
                              <Input 
                                placeholder="Kenapa jumlah fisik beda?"
                                className="h-9 rounded-lg border-rose-200 bg-white text-xs"
                                value={unbalanceReason}
                                onChange={(e) => setUnbalanceReason(e.target.value)}
                              />
                              <div className="flex items-center gap-3 mt-4">
                                <div 
                                  className="h-10 flex-1 border-2 border-dashed border-rose-200 rounded-lg flex items-center justify-center bg-white cursor-pointer hover:border-rose-400 transition-all text-slate-400"
                                  onClick={() => {
                                    setQcPhoto("https://images.unsplash.com/photo-1582285273767-42f01eb0a316?auto=format&fit=crop&q=80&w=400")
                                    toast.success("Foto bukti selisih ditambahkan!")
                                  }}
                                >
                                   {qcPhoto ? <img src={qcPhoto} className="w-full h-full object-cover rounded-lg" /> : <div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4" /><span className="text-[11px] font-bold uppercase">Foto Bukti (Opsional)</span></div>}
                                </div>
                                {qcPhoto && <Button variant="outline" size="icon" className="h-10 w-10 rounded-lg" onClick={() => setQcPhoto(null)}>✕</Button>}
                              </div>
                           </div>
                        )}
 
                        {qtyReject > 0 && (
                          <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                             <Label className="text-slate-500 font-bold uppercase text-[11px] tracking-widest">Tindakan Barang Reject</Label>
                             <div className="grid grid-cols-3 gap-2">
                               <button
                                 type="button"
                                 onClick={() => setRejectAction('Return')}
                                 className={cn(
                                   "h-9 rounded-lg font-bold text-[11px] uppercase transition-all border",
                                   rejectAction === 'Return' ? "bg-rose-600 text-white border-rose-600 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                 )}
                               >
                                 Retur ke Supplier
                               </button>
                               <button
                                 type="button"
                                 onClick={() => setRejectAction('Disposal')}
                                 className={cn(
                                   "h-9 rounded-lg font-bold text-[11px] uppercase transition-all border",
                                   rejectAction === 'Disposal' ? "bg-rose-600 text-white border-rose-600 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                 )}
                               >
                                 Disposal (Buang)
                               </button>
                               <button
                                 type="button"
                                 onClick={() => setRejectAction('B2C')}
                                 className={cn(
                                   "h-9 rounded-lg font-bold text-[11px] uppercase transition-all border",
                                   rejectAction === 'B2C' ? "bg-emerald-600 text-white border-emerald-600 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                 )}
                               >
                                 Peralihan B2C
                               </button>
                             </div>
                             
                             <div className="space-y-2 mt-2">
                               <Label className="text-slate-500 font-bold uppercase text-[11px] tracking-widest">Alasan Reject</Label>
                               <Input 
                                 placeholder="Kondisi barang reject (pecah, busuk, dll)"
                                 className="h-9 rounded-lg border border-slate-200 bg-white text-xs"
                                 value={rejectReason}
                                 onChange={(e) => setRejectReason(e.target.value)}
                               />
                             </div>
                          </div>
                        )}

                    {transcription ? (
                      <div className="space-y-2">
                        <Label htmlFor="paper-qc-inspector">Diperiksa oleh (sesuai berkas QC)</Label>
                        <select id="paper-qc-inspector" className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={qcPerformedBy} onChange={e => setQcPerformedBy(e.target.value)} required>
                          <option value="">— Pilih pemeriksa —</option>
                          {users.filter(u => u.role === 'gudang').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </div>
                    ) : (
                    <PelakuPicker
                      value={qcPerformedBy}
                      onChange={setQcPerformedBy}
                      roles={['gudang']}
                      label="Diperiksa oleh"
                    />
                    )}

                    <Button
                      className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold  shadow active:scale-[0.99] transition-all text-xs"
                      onClick={handleProcessQC}
                    >
                      {transcription ? "Simpan Hasil QC" : "Konfirmasi QC Sourcing"}
                    </Button>
                  </div>
               </div>
  ) : null

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 uppercase">{transcription ? "Salin Berkas QC" : <>Input <span className="text-emerald-600">QC & Inspeksi</span></>}</h2>
          <p className="text-slate-500 font-bold mt-1 uppercase text-[11px] tracking-widest">{transcription ? "Salin hasil pemeriksaan dari berkas QC. Isi jumlah sesuai kertas dan pilih nama pemeriksanya." : "Validasi barang masuk dari Sourcing & Retur Customer."}</p>
        </div>
      </div>

      <Tabs defaultValue="sourcing" className="w-full">
        {!transcription && <TabsList className="bg-slate-100 p-1 rounded-2xl mb-6">
          <TabsTrigger value="sourcing" className="rounded-xl px-8 font-bold uppercase text-[11px] tracking-widest">
            QC Barang Baru (Sourcing)
          </TabsTrigger>
          <TabsTrigger value="returns" className="rounded-xl px-8 font-bold uppercase text-[11px] tracking-widest flex items-center gap-2">
            Retur dari Customer
            {pendingReturns.length > 0 && (
              <span className="bg-rose-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[11px]">
                {pendingReturns.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="dispatch" className="rounded-xl px-8 font-bold uppercase text-[11px] tracking-widest flex items-center gap-2">
            <Truck className="w-3 h-3" />
            Persiapan Pengiriman
            {packingSos.length > 0 && (
              <span className="bg-violet-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[11px]">
                {packingSos.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="vendor-returns" className="rounded-xl px-8 font-bold uppercase text-[11px] tracking-widest flex items-center gap-2">
            <Store className="w-4 h-4" /> Retur ke Vendor
            {pendingVendorReturns.length > 0 && (
              <span className="ml-1 bg-blue-600 text-white rounded-full px-2 py-0.5 text-[11px]">{pendingVendorReturns.length}</span>
            )}
          </TabsTrigger>
        </TabsList>}

        <TabsContent value="sourcing">
          <Card className="liquid-card shadow-sm">
            <CardHeader className="bg-white rounded-t-2xl border-b border-slate-50 px-5 py-4">
              <CardTitle className="text-lg font-bold text-slate-800 flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <PackageSearch className="w-6 h-6 text-emerald-600" /> {transcription ? "Berkas QC Barang Masuk" : "Inspeksi Kedatangan Sourcing"}
                </span>
                <WorksheetPrintButton
                  kind="qc"
                  title="LEMBAR QC BARANG MASUK"
                  label="Print Lembar QC"
                  rows={Object.entries(groupedQCItems).flatMap(([poName, items]) =>
                    items.map(item => ({
                      group: poName,
                      cells: [
                        item.product?.skuCode || '',
                        item.product?.name || item.productId,
                        qtyTeks(item.qtyPurchased, item.product?.uom),
                      ],
                    })),
                  )}
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-5">
               {/* Daftar kedatangan dibuat tabel, bukan tumpukan kartu besar.
                   Satu kartu per barang enak dilihat untuk tiga barang dan menyiksa
                   untuk tiga puluh — dan yang dibutuhkan gudang cuma memilih barisnya,
                   lalu mengisi angkanya di bawah. */}
               {Object.entries(groupedQCItems).length === 0 ? (
                 <div className="h-32 border border-dashed rounded-2xl flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                    <PackageSearch className="w-7 h-7 opacity-20 mb-2" />
                    <p className="text-[11px] font-bold ">Belum ada barang masuk untuk di-QC</p>
                 </div>
               ) : (
                 <div className="overflow-x-auto rounded-2xl border border-slate-100">
                   <table className="w-full min-w-[460px] text-sm">
                     <thead>
                       <tr className="border-b bg-slate-50 text-left">
                         <th className="px-4 py-2.5 text-[11px] font-bold  text-slate-500">Barang</th>
                         <th className="px-3 py-2.5 text-[11px] font-bold  text-slate-500">Jalur</th>
                         <th className="px-3 py-2.5 text-right text-[11px] font-bold  text-slate-500">Qty Datang</th>
                         <th className="px-3 py-2.5 text-right text-[11px] font-bold  text-slate-500"></th>
                       </tr>
                     </thead>
                     <tbody>
                       {Object.entries(groupedQCItems).map(([poName, items]) => (
                         <React.Fragment key={poName}>
                           <tr className="border-b bg-slate-100/70">
                             <td colSpan={4} className="px-4 py-1.5 text-[11px] font-bold  text-slate-500">
                               {poName}
                             </td>
                           </tr>
                           {items.map(item => {
                             const dipilih = selectedPurchaseItemId === item.id
                             const pilihBaris = () => {
                               setSelectedPurchaseItemId(item.id)
                               setQtyReject(0)
                               const { allocations, inventoryRemainder } = buildFifo(item.productId, item.qtyPurchased)
                               setPoAllocations(allocations)
                               setQtyPassToInventory(inventoryRemainder)
                             }
                             return (
                               <React.Fragment key={item.id}>
                               <tr
                                 onClick={pilihBaris}
                                 className={cn(
                                   "border-b last:border-0 cursor-pointer transition-colors",
                                   dipilih ? "bg-emerald-50/70" : "hover:bg-slate-50",
                                 )}
                               >
                                 <td className="px-4 py-2.5">
                                   <p className="font-bold text-slate-800 leading-tight">{item.product?.name}</p>
                                   <p className="text-[11px] font-bold  text-slate-400">{item.product?.skuCode}</p>
                                 </td>
                                 <td className="px-3 py-2.5 text-[11px] font-bold  text-slate-400">
                                   {item.purchaseMethod || 'Pasar'}
                                 </td>
                                 <td className="px-3 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">
                                   {item.qtyPurchased} {item.product?.uom}
                                 </td>
                                 <td className="px-3 py-2 text-right">
                                   <Button
                                     size="sm"
                                     variant={dipilih ? "default" : "outline"}
                                     className={cn(
                                       "h-8 rounded-xl text-[11px] font-bold ",
                                       dipilih && "bg-emerald-600 hover:bg-emerald-700 text-white",
                                     )}
                                     onClick={pilihBaris}
                                   >
                                     {transcription ? (dipilih ? 'Sedang Disalin' : 'Salin Hasil QC') : (dipilih ? 'Sedang Diperiksa' : 'Periksa')}
                                   </Button>
                                 </td>
                               </tr>
                               {dipilih && panelQC && (
                                 <tr className="border-b bg-emerald-50/20">
                                   <td colSpan={4} className="p-0">{panelQC}</td>
                                 </tr>
                               )}
                               </React.Fragment>
                             )
                           })}
                         </React.Fragment>
                       ))}
                     </tbody>
                   </table>
                 </div>
               )}

            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="returns">
          <Card className="liquid-card shadow-sm">
            <CardHeader className="bg-white rounded-t-2xl border-b border-slate-50 px-8 py-6">
              <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-3">
                <RefreshCcw className="w-6 h-6" /> Inspeksi Retur Customer (QC Balik)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
               <div className="space-y-3">
                 <Label className="font-bold text-xs  text-slate-400">Items Dibawa Balik Kurir</Label>
                 {pendingReturns.length === 0 ? (
                   <div className="h-40 border border-dashed rounded-2xl flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                      <RefreshCcw className="w-8 h-8 opacity-20 mb-2" />
                      <p className="text-[11px] font-bold ">Tidak ada barang retur yang menunggu QC</p>
                   </div>
                 ) : (
                   <div className="grid gap-3">
                      {pendingReturns.map(ret => {
                        const p = products.find(prod => prod.id === ret.productId)
                        const so = salesOrders.find(s => s.id === ret.originalSoId)
                        return (
                          <button 
                            key={ret.id} 
                            onClick={() => {
                              setSelectedReturnId(ret.id)
                              setRetQtyPass(ret.qty)
                              setRetQtyReject(0)
                              setRetQtyVendor(0)
                              const suggested = vendorPrices.find(vp => vp.productId === ret.productId && vp.status === 'active')?.vendorId || ""
                              setRetVendorId(suggested)
                            }}
                            className={cn(
                              "p-5 rounded-xl border text-left flex justify-between items-center transition-all",
                              selectedReturnId === ret.id ? "bg-blue-50 border-blue-200 shadow-md ring-2 ring-blue-500/10" : "bg-white border-slate-100 hover:bg-slate-50"
                            )}
                          >
                             <div>
                                <h4 className="font-bold text-slate-800 ">{p?.name}</h4>
                                <p className="text-[11px] font-bold text-slate-400 uppercase mt-1">Ref PO: {so?.poNumber} • Alasan: {ret.reason}</p>
                             </div>
                             <div className="bg-slate-100 px-4 py-2 rounded-2xl font-bold text-sm text-slate-600">
                                {ret.qty} {p?.uom}
                             </div>
                          </button>
                        )
                      })}
                   </div>
                 )}
               </div>

               {activeReturnProduct && activeReturn && (
                 <div className="pt-8 border-t border-slate-50 space-y-8 duration-150">
                    <div className="bg-amber-50 border border-amber-100 p-5 rounded-xl flex items-start gap-4">
                       <AlertTriangle className="w-5 h-5 text-amber-600 mt-1" />
                       <div>
                          <p className="font-bold text-[11px] uppercase text-amber-700 tracking-widest mb-1">Peringatan QC Retur</p>
                          <p className="text-xs font-bold text-amber-800/80 leading-relaxed">Cek kondisi fisik barang retur. Barang yang lolos (Restock) akan dikembalikan ke stok layak jual untuk dijual ke customer lain.</p>
                       </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-emerald-50/50 p-5 rounded-xl border border-emerald-100/50 space-y-3">
                        <Label className="text-emerald-700 font-bold uppercase text-[11px] tracking-widest flex items-center gap-2">
                          <RefreshCcw className="w-4 h-4" /> Masuk Stok
                        </Label>
                        <Input
                           type="number" min="0" step="any"
                           className="text-lg font-bold h-11 rounded-xl border-none shadow-sm"
                           value={retQtyPass}
                           onChange={(e) => setRetQtyPass(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="bg-rose-50/50 p-5 rounded-xl border border-rose-100/50 space-y-3">
                        <Label className="text-rose-700 font-bold uppercase text-[11px] tracking-widest flex items-center gap-2">
                          <Trash2 className="w-4 h-4" /> Buang
                        </Label>
                        <Input
                           type="number" min="0" step="any"
                           className="text-lg font-bold h-11 rounded-xl border-none shadow-sm"
                           value={retQtyReject}
                           onChange={(e) => setRetQtyReject(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100/50 space-y-3">
                        <Label className="text-blue-700 font-bold uppercase text-[11px] tracking-widest flex items-center gap-2">
                          <Store className="w-4 h-4" /> Retur ke Vendor
                        </Label>
                        <Input
                           type="number" min="0" step="any"
                           className="text-lg font-bold h-11 rounded-xl border-none shadow-sm"
                           value={retQtyVendor}
                           onChange={(e) => setRetQtyVendor(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    {retQtyVendor > 0 && (
                      <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100/50 space-y-3">
                        <Label className="text-blue-700 font-bold uppercase text-[11px] tracking-widest">Vendor Tujuan Retur</Label>
                        <select
                          className="w-full h-14 rounded-xl border border-blue-100 bg-white px-4 font-bold text-slate-700"
                          value={retVendorId}
                          onChange={(e) => setRetVendorId(e.target.value)}
                        >
                          <option value="">— Pilih vendor —</option>
                          {vendors.map(v => (
                            <option key={v.id} value={v.id}>{v.companyName}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <Button 
                      className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold  shadow-sm active:scale-95 transition-all"
                      disabled={!isReturnSplitValid({ pass: retQtyPass, buang: retQtyReject, vendor: retQtyVendor }, activeReturn.qty)}
                      onClick={handleProcessReturnQC}
                    >
                      Input Hasil QC Retur
                    </Button>
                 </div>
               )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vendor-returns">
          <Card className="liquid-card shadow-sm">
            <CardHeader className="bg-white rounded-t-2xl border-b border-slate-50 px-8 py-6">
              <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-3">
                <Store className="w-6 h-6" /> Retur ke Vendor (Menunggu Tukar)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              {pendingVendorReturns.length === 0 ? (
                <div className="h-40 border border-dashed rounded-2xl flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                  <Store className="w-8 h-8 opacity-20 mb-2" />
                  <p className="text-[11px] font-bold ">Tidak ada retur vendor yang menunggu</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {pendingVendorReturns.map(vr => {
                    const p = products.find(prod => prod.id === vr.productId)
                    const vend = vendors.find(v => v.id === vr.vendorId)
                    return (
                      <button
                        key={vr.id}
                        onClick={() => {
                          setSelectedVendorReturnId(vr.id)
                          setSwapPassQty(vr.qty)
                          setSwapRejectQty(0)
                        }}
                        className={cn(
                          "p-5 rounded-xl border text-left flex justify-between items-center transition-all",
                          selectedVendorReturnId === vr.id ? "bg-blue-50 border-blue-200 shadow-md ring-2 ring-blue-500/10" : "bg-white border-slate-100 hover:bg-slate-50"
                        )}
                      >
                        <div>
                          <h4 className="font-bold text-slate-800 ">{p?.name}</h4>
                          <p className="text-[11px] font-bold text-slate-400 uppercase mt-1">Vendor: {vend?.companyName} • Alasan: {vr.reason}</p>
                        </div>
                        <div className="bg-slate-100 px-4 py-2 rounded-2xl font-bold text-sm text-slate-600">{vr.qty} {p?.uom}</div>
                      </button>
                    )
                  })}
                </div>
              )}

              {activeVendorReturn && activeVendorReturnProduct && (
                <div className="pt-8 border-t border-slate-50 space-y-6 duration-150">
                  <div className="bg-blue-50 border border-blue-100 p-5 rounded-xl">
                    <p className="font-bold text-[11px] uppercase text-blue-700 tracking-widest mb-1">QC Barang Pengganti</p>
                    <p className="text-xs font-bold text-blue-800/80 leading-relaxed">Kalau vendor kasih pengganti, cek kondisinya lalu isi berapa yang layak masuk stok. Kalau vendor tolak tukar, pakai tombol merah.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-emerald-50/50 p-5 rounded-xl border border-emerald-100/50 space-y-3">
                      <Label className="text-emerald-700 font-bold uppercase text-[11px] tracking-widest">Pengganti Layak</Label>
                      <Input
                        type="number" min="0" step="any"
                        className="text-lg font-bold h-11 rounded-xl border-none shadow-sm"
                        value={swapPassQty}
                        onChange={(e) => setSwapPassQty(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="bg-rose-50/50 p-5 rounded-xl border border-rose-100/50 space-y-3">
                      <Label className="text-rose-700 font-bold uppercase text-[11px] tracking-widest">Pengganti Rusak</Label>
                      <Input
                        type="number" min="0" step="any"
                        className="text-lg font-bold h-11 rounded-xl border-none shadow-sm"
                        value={swapRejectQty}
                        onChange={(e) => setSwapRejectQty(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      className="h-16 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold  shadow-sm active:scale-95 transition-all"
                      disabled={!isSwapSplitValid({ pass: swapPassQty, reject: swapRejectQty }, activeVendorReturn.qty)}
                      onClick={() => handleResolveVendorReturn('swap')}
                    >
                      Ditukar (Pengganti Masuk)
                    </Button>
                    <Button
                      className="h-16 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold  shadow-sm active:scale-95 transition-all"
                      onClick={() => handleResolveVendorReturn('reject')}
                    >
                      Ditolak Vendor (Buang)
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dispatch">
          <Card className="liquid-card shadow-sm">
            <CardHeader className="bg-white rounded-t-2xl border-b border-slate-50 px-8 py-6">
              <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center">
                  <Truck className="w-5 h-5" />
                </div>
                Persiapan Pengiriman
              </CardTitle>
              <p className="text-slate-500 text-sm">Pilih PO yang akan dikirim hari ini, input qty &amp; catatan per item, lalu simpan. Rilis barangnya dilakukan di Gudang › Goods Outbound.</p>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              {packingSos.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-semibold">Tidak ada PO dalam status Packing</p>
                </div>
              ) : (
                <>
                  {tersimpan && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">Persiapan tersimpan</p>
                          <p className="mt-1 text-sm font-bold text-slate-800">
                            {tersimpan.jumlah} PO siap dirilis — {tersimpan.po.join(', ')}
                          </p>
                          <p className="mt-1 text-xs font-bold text-slate-500">
                            Barangnya belum keluar gudang. Rilis dulu di Goods Outbound supaya stok berkurang
                            dan misi kurirnya terbentuk.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTersimpan(null)}
                          className="text-[11px] font-bold text-slate-400 hover:text-slate-700"
                        >
                          Tutup
                        </button>
                      </div>
                      <Link href="/warehouse/outbound">
                        <Button className="mt-3 h-10 rounded-xl bg-emerald-600 text-[11px] font-bold uppercase tracking-widest text-white hover:bg-emerald-700">
                          <Truck className="mr-2 h-4 w-4" /> Lanjut ke Goods Outbound
                        </Button>
                      </Link>
                    </div>
                  )}

                  {/* PO Selection */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-700 ">Pilih PO</p>
                      <button
                        onClick={() => {
                          if (selectedDispatchSoIds.size === packingSos.length) {
                            setSelectedDispatchSoIds(new Set())
                          } else {
                            setSelectedDispatchSoIds(new Set(packingSos.map(s => s.id)))
                          }
                        }}
                        className="text-xs text-violet-600 hover:underline font-semibold"
                      >
                        {selectedDispatchSoIds.size === packingSos.length ? 'Batal Semua' : 'Pilih Semua'}
                      </button>
                    </div>
                    <div className="grid gap-2">
                      {packingSos.map(so => {
                        const client = clients.find(c => c.id === so.clientId)
                        const checked = selectedDispatchSoIds.has(so.id)
                        return (
                          <div
                            key={so.id}
                            onClick={() => {
                              const next = new Set(selectedDispatchSoIds)
                              if (next.has(so.id)) next.delete(so.id)
                              else next.add(so.id)
                              setSelectedDispatchSoIds(next)
                            }}
                            className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${checked ? 'border-violet-400 bg-violet-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}
                          >
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${checked ? 'border-violet-500 bg-violet-500' : 'border-slate-300'}`}>
                              {checked && <div className="w-2 h-2 bg-white rounded-full" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-800 text-sm">{so.poNumber}</p>
                              <p className="text-xs text-slate-500">{client?.companyName} · Target: {so.targetDeliveryDate ? new Date(so.targetDeliveryDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
                              {(() => {
                                const k = kesiapanSO(so.id)
                                return (
                                  <p className={cn(
                                    "mt-0.5 text-[11px] font-bold",
                                    k.lengkap ? "text-emerald-600" : "text-amber-600",
                                  )}>
                                    {labelKesiapan(k)}
                                  </p>
                                )
                              })()}
                            </div>
                            {/* Kurirnya ditentukan di sini, saat orang yang sama sedang
                                memutuskan PO mana yang berangkat hari ini. Menulis ke
                                kolom yang sama dengan layar Rencana Rute, jadi dua layar
                                itu tidak pernah berbeda isi. */}
                            <div onClick={e => e.stopPropagation()} className="shrink-0">
                              <select
                                value={so.assignedCourierId || ''}
                                onChange={e => updateSalesOrder(so.id, { assignedCourierId: e.target.value || undefined })}
                                className={cn(
                                  "h-9 rounded-lg border px-2 text-xs font-bold bg-white",
                                  so.assignedCourierId ? "border-slate-200 text-slate-700" : "border-amber-300 text-amber-700",
                                )}
                              >
                                <option value="">— Kurir belum dipilih —</option>
                                {kurirs.map(k => (
                                  <option key={k.id} value={k.id}>{k.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Items per selected SO */}
                  {selectedDispatchSoIds.size > 0 && (
                    <div className="space-y-4">
                      <p className="text-sm font-bold text-slate-700 ">Item yang Disiapkan</p>
                      {Array.from(selectedDispatchSoIds).map(soId => {
                        const so = packingSos.find(s => s.id === soId)
                        if (!so) return null
                        const client = clients.find(c => c.id === so.clientId)
                        const items = salesOrderItems.filter(i => i.salesOrderId === soId)
                        return (
                          <div key={soId} className="rounded-2xl border border-violet-100 overflow-hidden">
                            <div className="bg-violet-50 px-5 py-3 border-b border-violet-100">
                              <p className="font-bold text-violet-800 text-sm">{so.poNumber} — {client?.companyName}</p>
                            </div>
                            <div className="divide-y divide-slate-50">
                              {items.map(item => {
                                const product = products.find(p => p.id === item.productId)
                                // Yang masih harus dikirim, bukan qty asli PO — untuk pengiriman
                                // susulan sisanya lebih kecil dari pesanan awal.
                                const owed = qtyOwed(item)
                                const isPartial = (item.qtyDelivered || 0) > 0
                                const passed = item.qtyFinal ?? 0
                                const isShort = passed < owed
                                // Barang yang belum diperiksa QC tetap ditampilkan, tapi
                                // diredupkan dan isiannya dikunci: gudang perlu melihat
                                // apa yang masih ditunggu, bukan menyiapkan barang yang
                                // belum ada wujudnya.
                                const siap = barisSiap(item)
                                return (
                                  <div key={item.id} className={cn(
                                    "px-5 py-4 grid grid-cols-[1fr_120px_1fr] gap-4 items-center",
                                    siap ? "bg-white" : "bg-slate-50/70",
                                  )}>
                                    <div className={cn(!siap && "opacity-50")}>
                                      <p className="font-semibold text-slate-800 text-sm">
                                        {product?.name}
                                        {!siap && (
                                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700">
                                            Belum masuk
                                          </span>
                                        )}
                                      </p>
                                      <p className="text-xs font-bold text-slate-600">
                                        Dibutuhkan: {owed} {product?.uom}
                                        {isPartial && (
                                          <span className="font-normal text-slate-400"> (sisa dari {item.qty})</span>
                                        )}
                                      </p>
                                      <p className={cn("text-xs", !siap ? "font-bold text-amber-600" : isShort ? "font-bold text-amber-600" : "text-slate-400")}>
                                        {siap
                                          ? <>QC Passed: {item.qtyFinal ?? '-'} {product?.uom}{isShort && <span> — kurang {owed - passed}</span>}</>
                                          : <>Menunggu diperiksa di QC</>}
                                      </p>
                                    </div>
                                    <input
                                      type="number"
                                      disabled={!siap}
                                      placeholder={siap ? String(item.qtyFinal ?? item.qty) : '—'}
                                      value={dispatchQty[item.id] ?? ''}
                                      onChange={e => setDispatchQty(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-center w-full disabled:bg-slate-100 disabled:text-slate-300"
                                    />
                                    <input
                                      type="text"
                                      disabled={!siap}
                                      placeholder={siap ? "Catatan (opsional)" : "Barangnya belum masuk"}
                                      value={dispatchNote[item.id] ?? ''}
                                      onChange={e => setDispatchNote(prev => ({ ...prev, [item.id]: e.target.value }))}
                                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm w-full disabled:bg-slate-100 disabled:text-slate-300"
                                    />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}

                      <button
                        onClick={handleConfirmDispatch}
                        className="w-full py-4 bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm  rounded-2xl flex items-center justify-center gap-2 transition-colors"
                      >
                        <ClipboardCheck className="w-4 h-4" />
                        Simpan Persiapan ({selectedDispatchSoIds.size} PO)
                      </button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Trash2(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

"use client"

import type { SVGProps } from "react"
import Link from "next/link"
import { useState } from "react"
import { barisSiap, kesiapan, labelKesiapan } from "@/lib/kesiapan-po"
import { useAppStore } from "@/lib/store"
import { PaperEvidenceFields } from "@/components/paper-evidence-fields"
import { executeGoodsCommand, type PaperEvidence } from "@/lib/goods-command"
import { recordPacking } from "@/lib/dispatch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RefreshCcw, AlertTriangle, Truck, ClipboardCheck, Store } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import QcEntryTable from "@/components/qc-entry-table"
import { qtyOwed } from "@/lib/backorder"
import { returnOriginVendorIds, returnVendorChoices, returnPaperNumber } from "@/lib/return-origin-vendors"
import { balanceReturnSplit, returnEvidenceError, vendorReturnSubmitMessage, isReturnSplitValid, isSwapSplitValid } from "@/lib/vendor-return"


export default function QCWorkspace({ transcription = false }: { transcription?: boolean }) {
  const products = useAppStore(state => state.products)
  const allPendingReturns = useAppStore(state => state.pendingReturns)
  // Yang sudah diproses tetap tersimpan sebagai riwayat, tapi tidak boleh muncul
  // lagi di antrian — kalau muncul, barangnya bisa di-restock dua kali.
  const pendingReturns = allPendingReturns.filter(r => r.status !== 'Processed')
  const salesOrders = useAppStore(state => state.salesOrders)
  const salesOrderItems = useAppStore(state => state.salesOrderItems)
  const clients = useAppStore(state => state.clients)
  const vendors = useAppStore(state => state.vendors)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const deliveries = useAppStore(state => state.deliveries)
  const vendorReturns = useAppStore(state => state.vendorReturns)


  const updateSalesOrder = useAppStore(state => state.updateSalesOrder)
  const users = useAppStore(state => state.users)
  const kurirs = users.filter(u => u.role === 'kurir')

  const [returnEvidence,setReturnEvidence] = useState<PaperEvidence>({})
  const [returnError,setReturnError] = useState("")
  const [packingEvidence,setPackingEvidence] = useState<PaperEvidence>({})
  const [operationBusy,setOperationBusy] = useState(false)

  // --- TAB 2: CUSTOMER RETURN QC LOGIC ---
  const [selectedReturnId, setSelectedReturnId] = useState("")
  const activeReturn = pendingReturns.find(r => r.id === selectedReturnId)
  const activeReturnProduct = products.find(p => p.id === activeReturn?.productId)
  const [retQtyPass, setRetQtyPass] = useState(0)
  const [retQtyReject, setRetQtyReject] = useState(0)
  const [retReason, setRetReason] = useState("")
  const [retQtyVendor, setRetQtyVendor] = useState(0)
  const [retVendorId, setRetVendorId] = useState("")
  const [vendorSearch,setVendorSearch] = useState("")
  const [selectedVendorReturnId, setSelectedVendorReturnId] = useState("")
  const [vendorReturnError,setVendorReturnError] = useState("")
  const [swapPassQty, setSwapPassQty] = useState(0)
  const [swapRejectQty, setSwapRejectQty] = useState(0)
  const pendingVendorReturns = vendorReturns.filter(v => v.status === 'Menunggu Vendor')
  const activeVendorReturn = pendingVendorReturns.find(v => v.id === selectedVendorReturnId)
  const activeVendorReturnProduct = products.find(p => p.id === activeVendorReturn?.productId)

  const originVendorIds = activeReturn ? returnOriginVendorIds(activeReturn,{purchaseItems,deliveries}) : []
  const originVendors = vendors.filter(v=>originVendorIds.includes(v.id))
  const eligibleVendors = activeReturn ? returnVendorChoices(activeReturn,{purchaseItems,deliveries,vendors}) : []
  const visibleVendors = eligibleVendors.filter(v=>v.id===retVendorId||v.companyName.toLocaleLowerCase('id-ID').includes(vendorSearch.toLocaleLowerCase('id-ID')))
  const returnVendorId = originVendors.length===1 ? originVendors[0].id : retVendorId
  const changeReturnQty = (key:'pass'|'buang'|'vendor',value:number) => {
    if(!activeReturn)return
    const next=balanceReturnSplit({pass:retQtyPass,buang:retQtyReject,vendor:retQtyVendor},activeReturn.qty,key,value)
    setRetQtyPass(next.pass);setRetQtyReject(next.buang);setRetQtyVendor(next.vendor)
  }

  const handleProcessReturnQC = async () => {
    if (!activeReturn || operationBusy) return
    const evidenceError=returnEvidenceError(returnEvidence)
    if(evidenceError){setReturnError(evidenceError);return}
    if(retQtyVendor>0&&!returnVendorChoices(activeReturn,useAppStore.getState()).some(v=>v.id===returnVendorId)){setReturnError('Pilih vendor tujuan retur sesuai laporan.');return}
    setReturnError("")
    setOperationBusy(true)
    try {
      await executeGoodsCommand(useAppStore.getState,{eventId:`return:${activeReturn.id}`,stage:'return',sourceId:activeReturn.id,payload:{pass:retQtyPass,reject:retQtyReject,vendor:retQtyVendor,vendorId:returnVendorId,reason:retReason,...returnEvidence}})
      toast.success('QC retur tersimpan.');setSelectedReturnId('');setReturnEvidence({})
    } catch(error) {const message=error instanceof Error ? error.message : 'QC retur gagal.';setReturnError(message);toast.error(message)} finally {setOperationBusy(false)}
  }

  const handleResolveVendorReturn = async (mode: 'swap' | 'reject') => {
    if (!activeVendorReturn || operationBusy) return
    const evidenceError=returnEvidenceError(returnEvidence)
    if(evidenceError){setVendorReturnError(evidenceError);return}
    setVendorReturnError("")
    setOperationBusy(true)
    try {
      await executeGoodsCommand(useAppStore.getState,{eventId:`vendor-return:${activeVendorReturn.id}`,stage:'vendor-return',sourceId:activeVendorReturn.id,payload:{mode,pass:swapPassQty,reject:swapRejectQty,...returnEvidence}})
      toast.success('Penyelesaian retur vendor tersimpan.');setSelectedVendorReturnId('');setReturnEvidence({})
    } catch(error) {const message=vendorReturnSubmitMessage(error instanceof Error ? error.message : 'Retur vendor gagal.');setVendorReturnError(message);toast.error(message)} finally {setOperationBusy(false)}
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

    if(operationBusy)return
    setOperationBusy(true)
    try {
      for(const soId of selectedDispatchSoIds) {
        const lines=salesOrderItems.filter(i=>i.salesOrderId===soId && (i.qtyFinal||0)>0).map(i=>({salesOrderItemId:i.id,qty:dispatchQty[i.id]??i.qtyFinal??0,note:dispatchNote[i.id]}))
        await recordPacking(useAppStore.getState,soId,lines,packingEvidence)
      }
    } catch(error) {toast.error(error instanceof Error?error.message:'Packing gagal.',{id:'dispatch'});return} finally {setOperationBusy(false)}

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

  return (
    <div className="space-y-6 w-full min-w-0 pb-20">
      <Tabs defaultValue="sourcing" className="w-full">
        {!transcription && <TabsList aria-label="Jenis pekerjaan QC" className="mb-4 grid w-full grid-cols-2 gap-1 overflow-visible rounded-xl bg-slate-100 p-1 group-data-horizontal/tabs:h-auto md:grid-cols-4 md:group-data-horizontal/tabs:h-auto [&>button]:h-auto [&>button]:min-h-14 [&>button]:min-w-0 [&>button]:w-full [&>button]:flex-wrap [&>button]:whitespace-normal [&>button]:px-2 [&>button]:py-2 [&>button]:text-center [&>button]:leading-snug">
          <TabsTrigger value="sourcing" className="rounded-lg text-xs font-semibold">
            QC Barang Baru (Sourcing)
          </TabsTrigger>
          <TabsTrigger value="returns" className="flex items-center gap-1.5 rounded-lg text-xs font-semibold">
            Retur dari Customer
            {pendingReturns.length > 0 && (
              <span className="bg-rose-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[11px]">
                {pendingReturns.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="dispatch" className="flex items-center gap-1.5 rounded-lg text-xs font-semibold">
            <Truck className="w-3 h-3" />
            Persiapan Pengiriman
            {packingSos.length > 0 && (
              <span className="bg-violet-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[11px]">
                {packingSos.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="vendor-returns" className="flex items-center gap-1.5 rounded-lg text-xs font-semibold">
            <Store className="w-4 h-4" /> Retur ke Vendor
            {pendingVendorReturns.length > 0 && (
              <span className="ml-1 bg-blue-600 text-white rounded-full px-2 py-0.5 text-[11px]">{pendingVendorReturns.length}</span>
            )}
          </TabsTrigger>
        </TabsList>}

        <TabsContent value="sourcing"><QcEntryTable/></TabsContent>

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
                              setReturnError("")
                              setSelectedReturnId(ret.id)
                              setRetQtyPass(ret.qty)
                              setRetQtyReject(0)
                              setRetQtyVendor(0)
                              const origins = returnOriginVendorIds(ret,{purchaseItems,deliveries})
                              const suggested = origins.length===1 ? origins[0] : ""
                              setRetVendorId(suggested)
                              setVendorSearch("")
                              setReturnEvidence({paperNumber:returnPaperNumber(ret,{deliveries})})
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
                           type="number" min="0" max={activeReturn.qty} step="any"
                           className="text-lg font-bold h-11 rounded-xl border-none shadow-sm"
                           value={retQtyPass}
                           onChange={(e) => changeReturnQty('pass',Number(e.target.value))}
                        />
                      </div>
                      <div className="bg-rose-50/50 p-5 rounded-xl border border-rose-100/50 space-y-3">
                        <Label className="text-rose-700 font-bold uppercase text-[11px] tracking-widest flex items-center gap-2">
                          <Trash2 className="w-4 h-4" /> Buang
                        </Label>
                        <Input
                           type="number" min="0" max={activeReturn.qty} step="any"
                           className="text-lg font-bold h-11 rounded-xl border-none shadow-sm"
                           value={retQtyReject}
                           onChange={(e) => changeReturnQty('buang',Number(e.target.value))}
                        />
                      </div>
                      <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100/50 space-y-3">
                        <Label className="text-blue-700 font-bold uppercase text-[11px] tracking-widest flex items-center gap-2">
                          <Store className="w-4 h-4" /> Retur ke Vendor
                        </Label>
                        <Input
                           type="number" min="0" max={activeReturn.qty} step="any"
                           className="text-lg font-bold h-11 rounded-xl border-none shadow-sm"
                           value={retQtyVendor}
                           onChange={(e) => changeReturnQty('vendor',Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <p className="text-sm text-slate-600">Jumlah retur: {activeReturn.qty} {activeReturnProduct.uom} = Masuk stok {retQtyPass} + Buang {retQtyReject} + Retur vendor {retQtyVendor}. Angka lain menyesuaikan otomatis saat diubah.</p>

                    {retQtyVendor > 0 && (
                      <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100/50 space-y-3">
                        <Label className="text-blue-700 font-bold uppercase text-[11px] tracking-widest">{originVendorIds.length?"Vendor asal pembelian":"Vendor tujuan retur"}</Label>
                        {originVendors.length!==1&&<Input aria-label="Cari vendor retur" placeholder="Cari nama vendor…" value={vendorSearch} onChange={e=>setVendorSearch(e.target.value)}/>}
                        <select
                          className="w-full h-14 rounded-xl border border-blue-100 bg-white px-4 font-bold text-slate-700"
                          aria-label="Vendor tujuan retur"
                          disabled={originVendors.length===1}
                          value={returnVendorId}
                          onChange={(e) => setRetVendorId(e.target.value)}
                        >
                          <option value="">{originVendorIds.length?"— Pilih vendor asal —":"— Pilih vendor tujuan —"}</option>
                          {visibleVendors.map(v => (
                            <option key={v.id} value={v.id}>{v.companyName}</option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-600">{originVendors.length===0?"Vendor asal belum tercatat. Cari dan pilih vendor sesuai bukti pembelian / laporan retur.":originVendors.length===1?"Otomatis sesuai vendor tempat barang ini dibeli.":"Barang berasal dari beberapa vendor. Pilih sesuai barang dan bukti pembelian yang diretur."}</p>
                      </div>
                    )}

                    <PaperEvidenceFields value={returnEvidence} onChange={value=>{setReturnEvidence(value);setReturnError("")}} photoOptional/>
                    {returnError&&<p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{returnError}</p>}
                        <Button
                      className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold  shadow-sm active:scale-95 transition-all"
                      disabled={operationBusy || (retQtyVendor>0&&!eligibleVendors.some(v=>v.id===returnVendorId)) || !isReturnSplitValid({ pass: retQtyPass, buang: retQtyReject, vendor: retQtyVendor }, activeReturn.qty)} onClick={handleProcessReturnQC}
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
                          setVendorReturnError("");setSelectedVendorReturnId(vr.id)
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

                  <PaperEvidenceFields value={returnEvidence} onChange={value=>{setReturnEvidence(value);setVendorReturnError("")}} photoOptional/>
                  {vendorReturnError&&<p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{vendorReturnError}</p>}
<div className="grid grid-cols-2 gap-4">
                    <Button
                      className="h-16 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold  shadow-sm active:scale-95 transition-all"
                      disabled={operationBusy || !isSwapSplitValid({ pass: swapPassQty, reject: swapRejectQty }, activeVendorReturn.qty)}
                      onClick={() => handleResolveVendorReturn('swap')}
                    >
                      Ditukar (Pengganti Masuk)
                    </Button>
                    <Button
                      className="h-16 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold  shadow-sm active:scale-95 transition-all"
                      disabled={operationBusy} onClick={() => handleResolveVendorReturn('reject')}
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

                      <PaperEvidenceFields value={packingEvidence} onChange={setPackingEvidence}/>
                      <button
                        disabled={operationBusy} onClick={handleConfirmDispatch}
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

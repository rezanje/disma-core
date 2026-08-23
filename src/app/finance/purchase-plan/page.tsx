"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ClipboardList, PackageCheck, ShoppingBag, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { cn, formatRupiah } from "@/lib/utils"
import { selectableVendors } from "@/lib/vendor-status"
import {
  toPurchaseMethod, fromPurchaseMethod, unplannedLines, lineIsPlanned, cashNeeded,
  HANDLING_LABEL, type Handling, type PaymentMethod,
} from "@/lib/purchase-plan"
import { disbursementProblem } from "@/lib/shopping-money"
import { pocketOwners } from "@/lib/sourcing-pocket"
import { recordPocketWithdrawal, bankRequiresCfoApproval } from "@/lib/accounting"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Rencana Pembelian — milik Finance.
 *
 * Playbook §3.2 menutup ini di sisi Admin PO ("memilih supplier atau menyetujui
 * pembayaran" bukan wewenangnya) dan §3.3 memberikannya ke Finance sebagai Purchasing
 * Admin. Sebelum layar ini ada, keputusannya dibuat Admin PO — dan disimpan di
 * localStorage browsernya sampai dokumen dibuat, jadi selama itu tidak terlihat siapa
 * pun.
 */
export default function PurchasePlanPage() {
  const purchases = useAppStore(s => s.purchases)
  const purchaseItems = useAppStore(s => s.purchaseItems)
  const products = useAppStore(s => s.products)
  const vendors = useAppStore(s => s.vendors)
  const salesOrders = useAppStore(s => s.salesOrders)
  const clients = useAppStore(s => s.clients)
  const updatePurchase = useAppStore(s => s.updatePurchase)
  const updatePurchaseItem = useAppStore(s => s.updatePurchaseItem)
  const purchaseRequests = useAppStore(s => s.purchaseRequests)
  const updatePurchaseRequest = useAppStore(s => s.updatePurchaseRequest)

  const bankAccounts = useAppStore(s => s.bankAccounts)
  const currentUser = useAppStore(s => s.currentUser)

  const [openId, setOpenId] = useState<string | null>(null)
  const [releasing, setReleasing] = useState(false)

  // Pencairan ke kantong, dari layar yang sama dengan rencananya.
  const [cairId, setCairId] = useState<string | null>(null)
  const [cairAmount, setCairAmount] = useState<number>(0)
  const [cairPocket, setCairPocket] = useState<string>('')
  const [cairSource, setCairSource] = useState<string>('')
  const [cairNote, setCairNote] = useState<string>('')
  const [cairing, setCairing] = useState(false)

  const waiting = purchases.filter(p => p.status === 'Menunggu Rencana')
  // Sudah direncanakan tapi uangnya belum keluar. Dulu ini antrean di layar lain
  // (pengajuan dana + disbursement); sekarang lanjutannya ada di dokumen yang sama.
  const belumCair = purchases.filter(p => p.status === 'Pending' && !p.disbursedAt)
  const pockets = pocketOwners(bankAccounts)
  const pools = bankAccounts.filter(b => b.id !== cairPocket)
  const cairDoc = cairId ? purchases.find(p => p.id === cairId) : null
  const active = openId ? purchases.find(p => p.id === openId) : waiting[0]
  const lines = purchaseItems.filter(pi => pi.purchaseId === active?.id)
  const belum = unplannedLines(lines)

  const setLine = (itemId: string, patch: Record<string, unknown>) => updatePurchaseItem(itemId, patch)

  const setHandling = (itemId: string, isOnline: boolean, handling: Handling) => {
    const method = toPurchaseMethod(isOnline, handling)
    setLine(itemId, {
      purchaseMethod: method,
      // Vendor dan dropship dikirim vendor, jadi qty-nya tidak lewat checklist sourcing.
      // Diisi di sini supaya Inbound/QC tidak melihat 0 selamanya.
      qtyPurchased: (method === 'Vendor' || method === 'Dropship')
        ? (lines.find(l => l.id === itemId)?.qtyTarget ?? 0) : 0,
      // Pasar tidak punya vendor rencana — vendornya baru diketahui di lapangan.
      ...(method === 'Pasar' ? {} : {}),
    })
  }

  const release = async () => {
    if (!active) return
    if (belum.length > 0) {
      toast.error(`${belum.length} barang belum ditentukan vendor / jalur / cara bayarnya.`)
      return
    }
    setReleasing(true)
    try {
      // Nilai pengajuan dana = uang tunai yang benar-benar perlu dibawa. Tempo ditagih
      // belakangan dan Transfer dibayar dari rekening kantor.
      const tunai = cashNeeded(lines)
      await updatePurchase(active.id, {
        status: 'Pending',
        budgetAmount: tunai,
        plannedBy: currentUser?.name || currentUser?.id,
        plannedAt: new Date().toISOString(),
      })

      // Pengajuan dananya dibuat Admin PO SEBELUM rencana ini ada, jadi angkanya waktu
      // itu belum bisa diketahui. Kalau tidak diperbarui di sini, Finance menyetujui dan
      // mencairkan angka yang tidak pernah berhubungan dengan belanja yang direncanakan.
      const pr = purchaseRequests.find(r => r.id === active.purchaseRequestId)
      if (pr && !pr.disbursedAt && pr.amount !== tunai) {
        await updatePurchaseRequest(pr.id, { amount: tunai })
      }

      toast.success(`Rencana dilepas ke sourcing. Uang tunai yang perlu disiapkan ${formatRupiah(tunai)}.`)
      setOpenId(null)
    } catch (e) {
      toast.error("Gagal melepas rencana: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setReleasing(false)
    }
  }

  const bukaPencairan = (purchaseId: string) => {
    const doc = purchases.find(p => p.id === purchaseId)
    setCairId(purchaseId)
    setCairAmount(Number(doc?.budgetAmount || 0))
    setCairPocket('')
    setCairSource('')
    setCairNote('')
  }

  const cairkan = async () => {
    if (!cairDoc) return
    const masalah = disbursementProblem(cairAmount, Number(cairDoc.budgetAmount || 0), cairNote, cairPocket, cairSource)
    if (masalah) { toast.error(masalah); return }

    // Gerbang persetujuan menempel di REKENING sumbernya, bukan di dokumen terpisah —
    // jadi persetujuan kedua terjadi tepat waktu uangnya pindah, bukan sebagai ritual
    // yang bisa disetujui hari sebelumnya untuk angka yang belum diketahui.
    if (bankRequiresCfoApproval(cairSource)) {
      toast.error("Rekening ini butuh approval CFO. Pakai layar Disbursement untuk pengajuannya.")
      return
    }

    setCairing(true)
    try {
      const pocket = bankAccounts.find(b => b.id === cairPocket)
      const ok = await recordPocketWithdrawal(cairSource, cairPocket, cairAmount, pocket?.name || 'Sourcing')
      if (!ok) { toast.error("Pencairan gagal dibukukan. Cek saldo dan rekeningnya."); return }

      await updatePurchase(cairDoc.id, {
        disbursedAmount: cairAmount,
        disbursedAt: new Date().toISOString(),
        disbursedBy: currentUser?.name || currentUser?.id,
        disbursedToBankAccountId: cairPocket,
        disbursementNote: cairNote.trim() || undefined,
        // Status rekonsiliasi lama tetap ditulis supaya layar Belanja Online dan
        // Rekonsiliasi yang membacanya tidak kehilangan dokumen ini.
        reconciliationStatus: 'Dana Ditransfer',
        budgetTransferDate: new Date().toISOString(),
        budgetBankAccountId: cairSource,
        budgetDestBankAccountId: cairPocket,
      })
      toast.success(`${formatRupiah(cairAmount)} sudah masuk kantong ${pocket?.name || ''}.`)
      setCairId(null)
    } catch (e) {
      toast.error("Gagal mencairkan: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setCairing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Rencana Pembelian</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
          Tentukan beli ke siapa, lewat jalur apa, dan dibayar bagaimana — sebelum sourcing jalan
        </p>
      </div>

      {/* --- Sudah direncanakan, uangnya belum keluar --- */}
      {belumCair.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-5 space-y-4">
            <div>
              <p className="text-sm font-black text-emerald-800">Siap dicairkan</p>
              <p className="text-[11px] font-bold text-emerald-700/70">
                Rencananya sudah dilepas. Serahkan uangnya ke kantong yang belanja — tidak ada pengajuan terpisah lagi.
              </p>
            </div>

            {belumCair.map(p => (
              <div key={p.id} className="rounded-2xl bg-white border border-emerald-100 p-4 space-y-3">
                <div className="flex justify-between items-center gap-4">
                  <div>
                    <p className="font-black text-slate-800">{p.advanceCode || p.id.slice(0, 8)}</p>
                    <p className="text-[11px] font-bold text-slate-400">
                      Direncanakan {p.plannedBy || '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Perlu tunai</p>
                    <p className="text-xl font-black text-emerald-600">{formatRupiah(p.budgetAmount || 0)}</p>
                  </div>
                </div>

                {cairId === p.id ? (
                  <div className="space-y-3 border-t border-slate-100 pt-3">
                    <div className="grid md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase text-slate-500">Nominal</Label>
                        <Input
                          type="number" min="0"
                          className="h-11 font-bold"
                          value={cairAmount || ''}
                          onChange={e => setCairAmount(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase text-slate-500">Dari rekening</Label>
                        <select
                          className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold bg-white"
                          value={cairSource}
                          onChange={e => setCairSource(e.target.value)}
                        >
                          <option value="">— Pilih —</option>
                          {pools.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase text-slate-500">Ke kantong</Label>
                        <select
                          className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold bg-white"
                          value={cairPocket}
                          onChange={e => setCairPocket(e.target.value)}
                        >
                          <option value="">— Pilih —</option>
                          {pockets.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {cairAmount !== Number(p.budgetAmount || 0) && (
                      <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase text-amber-700">
                          Beda {formatRupiah(Math.abs(cairAmount - Number(p.budgetAmount || 0)))} dari rencana — alasannya?
                        </Label>
                        <Input
                          className="h-11 font-bold border-amber-200"
                          placeholder="Misal: harga cabe lagi naik, dilebihin buat jaga-jaga"
                          value={cairNote}
                          onChange={e => setCairNote(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button className="h-11 bg-emerald-600 hover:bg-emerald-700 font-black" disabled={cairing} onClick={cairkan}>
                        {cairing ? 'Mencairkan…' : 'Serahkan uangnya'}
                      </Button>
                      <Button variant="ghost" className="h-11 font-bold" onClick={() => setCairId(null)}>Batal</Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" className="h-11 font-black w-full" onClick={() => bukaPencairan(p.id)}>
                    Cairkan ke kantong
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {waiting.length === 0 && (
        <Card className="py-20 text-center border-dashed">
          <CardContent className="flex flex-col items-center gap-3">
            <PackageCheck className="w-14 h-14 text-slate-200" />
            <p className="font-black text-slate-500">Tidak ada dokumen yang menunggu rencana.</p>
            <p className="text-xs text-slate-400 max-w-md">
              Dokumen muncul di sini setelah Admin PO menggabungkan PO jadi daftar belanja.
            </p>
          </CardContent>
        </Card>
      )}

      {waiting.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {waiting.map(p => (
            <Button
              key={p.id}
              size="sm"
              variant={active?.id === p.id ? "default" : "outline"}
              className="font-black text-[11px]"
              onClick={() => setOpenId(p.id)}
            >
              {p.advanceCode || p.id.slice(0, 8)}
            </Button>
          ))}
        </div>
      )}

      {active && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="p-5 flex justify-between items-center border-b bg-slate-50 dark:bg-slate-900/50">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Dokumen Belanja</p>
                <h3 className="font-black text-lg">{active.advanceCode || active.id.slice(0, 8)}</h3>
                <p className="text-xs text-slate-500 font-bold">{lines.length} barang</p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Uang tunai perlu disiapkan</p>
                <p className="text-xl font-black text-emerald-600">{formatRupiah(cashNeeded(lines))}</p>
                {belum.length > 0 && (
                  <p className="text-[10px] font-black uppercase text-amber-600 flex items-center gap-1 justify-end">
                    <AlertTriangle className="w-3 h-3" /> {belum.length} barang belum direncanakan
                  </p>
                )}
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-900/50">
                  <TableHead className="text-[10px] font-black">Barang</TableHead>
                  <TableHead className="text-[10px] font-black">Untuk PO</TableHead>
                  <TableHead className="text-[10px] font-black text-center w-24">Qty</TableHead>
                  <TableHead className="text-[10px] font-black w-32">Harga perkiraan</TableHead>
                  <TableHead className="text-[10px] font-black">Beli online?</TableHead>
                  <TableHead className="text-[10px] font-black">Barangnya gimana</TableHead>
                  <TableHead className="text-[10px] font-black">Vendor</TableHead>
                  <TableHead className="text-[10px] font-black">Cara bayar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map(line => {
                  const product = products.find(p => p.id === line.productId)
                  const so = salesOrders.find(s => s.id === line.salesOrderId)
                  const client = clients.find(c => c.id === so?.clientId)
                  const { isOnline, handling } = fromPurchaseMethod(line.purchaseMethod as never)
                  const planned = lineIsPlanned(line)
                  const isPasar = line.purchaseMethod === 'Pasar'

                  return (
                    <TableRow key={line.id} className={cn(!planned && "bg-amber-50/40 dark:bg-amber-950/10")}>
                      <TableCell>
                        <p className="font-bold text-sm">{product?.name}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">{product?.skuCode}</p>
                      </TableCell>
                      <TableCell className="text-xs font-bold text-slate-500">
                        {so?.poNumber || '—'}
                        <span className="block text-[9px] text-slate-400">{client?.companyName}</span>
                      </TableCell>
                      <TableCell className="text-center font-black text-sm">
                        {line.qtyTarget} {product?.uom}
                      </TableCell>

                      {/* Harga diisi di sini, bukan di layar Admin PO. Yang tahu harga
                          pasar dan harga vendor adalah orang yang memilih vendornya —
                          dan angka inilah yang jadi uang tunai yang dia serahkan sendiri
                          ke kantong sourcing. */}
                      <TableCell>
                        <input
                          type="number"
                          min="0"
                          className="h-9 w-28 rounded-lg border border-slate-200 px-2 text-xs font-bold bg-white dark:bg-slate-900 text-right"
                          value={line.estimatedUnitPrice || ''}
                          placeholder="0"
                          onChange={e => setLine(line.id, { estimatedUnitPrice: parseFloat(e.target.value) || 0 })}
                        />
                        <span className="block text-[9px] text-slate-400 font-bold mt-0.5">
                          per {product?.uom || 'unit'}
                        </span>
                      </TableCell>

                      {/* Baris yang belum direncanakan TIDAK menampilkan jawaban default.
                          Menampilkannya membuat layar terlihat sudah terisi padahal tidak
                          ada yang tersimpan, dan orang melewatinya tanpa memutuskan. */}
                      <TableCell>
                        <select
                          className={cn("h-9 w-full rounded-lg border px-2 text-xs font-bold bg-white dark:bg-slate-900",
                            line.purchaseMethod ? "border-slate-200" : "border-amber-300 text-amber-700")}
                          value={line.purchaseMethod ? (isOnline ? 'ya' : 'tidak') : ''}
                          onChange={e => setHandling(line.id, e.target.value === 'ya', handling)}
                        >
                          <option value="" disabled>— Pilih —</option>
                          <option value="tidak">Tidak</option>
                          <option value="ya">Ya, beli online</option>
                        </select>
                      </TableCell>

                      <TableCell>
                        <select
                          className={cn("h-9 w-full rounded-lg border px-2 text-xs font-bold bg-white dark:bg-slate-900 disabled:opacity-40",
                            line.purchaseMethod ? "border-slate-200" : "border-amber-300 text-amber-700")}
                          value={line.purchaseMethod ? handling : ''}
                          disabled={isOnline}
                          onChange={e => setHandling(line.id, isOnline, e.target.value as Handling)}
                        >
                          <option value="" disabled>— Pilih —</option>
                          {(Object.keys(HANDLING_LABEL) as Handling[]).map(h => (
                            <option key={h} value={h}>{HANDLING_LABEL[h]}</option>
                          ))}
                        </select>
                        {isOnline && (
                          <p className="text-[9px] text-slate-400 mt-1">Online selalu masuk gudang</p>
                        )}
                      </TableCell>

                      <TableCell>
                        <select
                          className="h-9 w-full rounded-lg border border-slate-200 px-2 text-xs font-bold bg-white dark:bg-slate-900"
                          value={line.plannedVendorId || ''}
                          onChange={e => setLine(line.id, { plannedVendorId: e.target.value || undefined })}
                        >
                          <option value="">{isPasar ? '— Nanti dari lapangan —' : '— Wajib pilih —'}</option>
                          {selectableVendors(vendors, line.plannedVendorId).map(v => (
                            <option key={v.id} value={v.id}>{v.companyName}</option>
                          ))}
                        </select>
                        {isPasar && (
                          <p className="text-[9px] text-slate-400 mt-1">
                            Boleh diisi sebagai incaran; vendor aslinya dari kertas belanja
                          </p>
                        )}
                      </TableCell>

                      <TableCell>
                        <select
                          className={cn("h-9 w-full rounded-lg border px-2 text-xs font-bold bg-white dark:bg-slate-900",
                            line.paymentMethod ? "border-slate-200" : "border-amber-300 text-amber-700")}
                          value={line.paymentMethod || ''}
                          onChange={e => setLine(line.id, { paymentMethod: (e.target.value || undefined) as PaymentMethod })}
                        >
                          <option value="">— Pilih —</option>
                          <option value="Cash">Cash (bawa uang)</option>
                          <option value="Tempo">Tempo (bayar belakangan)</option>
                          <option value="Transfer">Transfer (dibayar kantor)</option>
                        </select>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            <div className="p-5 border-t flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <p className="text-xs font-bold text-slate-500 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" />
                Sourcing baru bisa melihat dokumen ini setelah rencananya dilepas.
              </p>
              <Button
                disabled={belum.length > 0 || releasing || lines.length === 0}
                className={cn(
                  "h-12 px-8 font-black rounded-xl",
                  belum.length === 0 && lines.length > 0
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/25"
                    : "bg-slate-200 text-slate-400"
                )}
                onClick={release}
              >
                <ClipboardList className="w-4 h-4 mr-2" />
                {belum.length > 0 ? `${belum.length} Barang Belum Direncanakan` : "Lepas ke Sourcing"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

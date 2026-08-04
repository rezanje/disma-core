"use client"

import { useMemo, useState } from "react"
import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import ReceiptUpload from "@/components/ui/receipt-upload"
import { cn, formatRupiah } from "@/lib/utils"
import { isDropship, groupDropship } from "@/lib/dropship"
import { recordDropshipDelivery, type DropshipConfirmLine } from "@/lib/accounting"
import { generateDropshipSuratJalan } from "@/lib/pdf"
import { Truck, FileText, CheckCircle2, PackageCheck, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

export default function DropshipPage() {
  const purchaseItems = useAppStore(state => state.purchaseItems) || []
  const salesOrders = useAppStore(state => state.salesOrders) || []
  const salesOrderItems = useAppStore(state => state.salesOrderItems) || []
  const clients = useAppStore(state => state.clients) || []
  const vendors = useAppStore(state => state.vendors) || []
  const products = useAppStore(state => state.products) || []
  const bankAccounts = useAppStore(state => state.bankAccounts) || []
  const deliveries = useAppStore(state => state.deliveries) || []
  const currentUser = useAppStore(state => state.currentUser)

  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [received, setReceived] = useState<Record<string, number>>({})
  const [confirmNote, setConfirmNote] = useState("")
  const [proofUrl, setProofUrl] = useState("")
  const [transferBankId, setTransferBankId] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const outstanding = useMemo(
    () => purchaseItems.filter(pi => isDropship(pi) && !pi.isQCed),
    [purchaseItems]
  )
  const groups = useMemo(() => groupDropship(outstanding), [outstanding])

  const confirmed = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    return purchaseItems
      .filter(pi => isDropship(pi) && pi.isQCed)
      .filter(pi => !pi.inboundVerifiedAt || new Date(pi.inboundVerifiedAt).getTime() >= cutoff)
      .sort((a, b) => new Date(b.inboundVerifiedAt || 0).getTime() - new Date(a.inboundVerifiedAt || 0).getTime())
  }, [purchaseItems])

  const nameOf = (productId: string) => products.find(p => p.id === productId)?.name || 'Barang'
  const uomOf = (productId: string) => products.find(p => p.id === productId)?.uom || ''
  const vendorNameOf = (vendorId?: string) => vendors.find(v => v.id === vendorId)?.companyName || 'Vendor'

  const soOf = (salesOrderId?: string) => salesOrders.find(s => s.id === salesOrderId)
  const clientNameOf = (salesOrderId?: string) => {
    const so = soOf(salesOrderId)
    return clients.find(c => c.id === so?.clientId)?.companyName || 'Klien'
  }
  const sellPriceOf = (salesOrderId: string | undefined, productId: string) =>
    salesOrderItems.find(i => i.salesOrderId === salesOrderId && i.productId === productId)?.unitPrice ?? 0

  const activeGroup = groups.find(g => g.key === activeKey) || null

  const openConfirm = (key: string) => {
    const group = groups.find(g => g.key === key)
    if (!group) return
    setActiveKey(key)
    setReceived(Object.fromEntries(group.items.map(pi => [pi.id, pi.qtyTarget])))
    setConfirmNote("")
    setProofUrl("")
    setTransferBankId(bankAccounts.find(b => b.accountCode === '1-1200')?.id || "")
  }

  const handleSuratJalan = (key: string) => {
    const group = groups.find(g => g.key === key)
    if (!group?.salesOrderId) return
    generateDropshipSuratJalan(
      group.salesOrderId,
      group.items.map(i => i.productId),
      vendorNameOf(group.vendorId)
    )
  }

  const handleConfirm = async () => {
    const group = activeGroup
    if (!group || !group.salesOrderId || !group.vendorId) return

    const invalid = group.items.find(pi => {
      const qty = received[pi.id] ?? pi.qtyTarget
      return !Number.isFinite(qty) || qty < 0 || qty > pi.qtyTarget
    })
    if (invalid) {
      toast.error(`Jumlah diterima untuk ${nameOf(invalid.productId)} harus antara 0 dan ${invalid.qtyTarget}.`)
      return
    }
    if (!proofUrl) {
      toast.error("Upload dulu foto atau tanda terima dari klien.")
      return
    }
    if (isSubmitting) return

    const lines: DropshipConfirmLine[] = group.items.map(pi => ({
      purchaseItemId: pi.id,
      productId: pi.productId,
      qtyOrdered: pi.qtyTarget,
      qtyReceived: received[pi.id] ?? pi.qtyTarget,
      unitCost: pi.estimatedUnitPrice,
      unitPrice: sellPriceOf(pi.salesOrderId, pi.productId),
    }))

    setIsSubmitting(true)
    try {
      const ok = await recordDropshipDelivery(
        group.salesOrderId,
        group.vendorId,
        lines,
        currentUser?.name || currentUser?.id || 'Admin',
        transferBankId || undefined,
        confirmNote || undefined,
        proofUrl,
      )
      if (ok) {
        toast.success("Kiriman dikonfirmasi. Tagihan klien terbit dan kewajiban vendor tercatat.")
        setActiveKey(null)
      } else {
        toast.error("Gagal mencatat konfirmasi.")
      }
    } catch (err) {
      console.error(err)
      toast.error("Gagal mencatat konfirmasi.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const groupPaymentMethod = activeGroup?.items[0]?.paymentMethod

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white uppercase">
          Kiriman <span className="text-orange-600">Vendor</span>
        </h2>
        <p className="text-slate-500 font-bold">
          Barang yang diantar vendor langsung ke klien, tidak lewat gudang.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="liquid-card border-orange-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black uppercase text-slate-400">Menunggu Konfirmasi</CardTitle>
            <Truck className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-800 dark:text-white">{groups.length}</div>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Kiriman belum dikonfirmasi klien</p>
          </CardContent>
        </Card>
        <Card className="liquid-card border-emerald-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-black uppercase text-slate-400">Selesai (30 Hari)</CardTitle>
            <PackageCheck className="h-5 w-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-800 dark:text-white">{confirmed.length}</div>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Barang sudah dikonfirmasi diterima</p>
          </CardContent>
        </Card>
      </div>

      {/* Outstanding */}
      <div className="space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Menunggu Konfirmasi Klien ({groups.length})
        </p>

        {groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center">
            <Truck className="w-8 h-8 mx-auto opacity-20 mb-2" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Belum ada kiriman vendor yang jalan
            </p>
          </div>
        ) : groups.map(group => {
          const total = group.items.reduce((s, i) => s + i.estimatedUnitPrice * i.qtyTarget, 0)
          const so = soOf(group.salesOrderId)
          return (
            <Card key={group.key} className="liquid-card border-orange-100">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <CardTitle className="text-base font-black uppercase tracking-tight text-slate-950 dark:text-white">
                      {vendorNameOf(group.vendorId)}
                    </CardTitle>
                    <CardDescription className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {so?.poNumber || 'PO'} • {clientNameOf(group.salesOrderId)}
                      {so?.targetDeliveryDate
                        ? ` • Target ${new Date(so.targetDeliveryDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`
                        : ''}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className="bg-orange-100 text-orange-700 text-[9px] font-black uppercase tracking-widest">
                      {group.items[0]?.paymentMethod || 'Transfer'}
                    </Badge>
                    <span className="text-sm font-black text-emerald-600">{formatRupiah(total)}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  {group.items.map(pi => (
                    <div key={pi.id} className="flex items-center justify-between gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                      <span className="truncate">{nameOf(pi.productId)}</span>
                      <span className="shrink-0 text-slate-400">
                        {pi.qtyTarget} {uomOf(pi.productId)} @ {formatRupiah(pi.estimatedUnitPrice)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <Button
                    variant="outline"
                    onClick={() => handleSuratJalan(group.key)}
                    className="text-[10px] font-extrabold uppercase tracking-wider h-10 rounded-xl"
                  >
                    <FileText className="w-3.5 h-3.5 mr-1.5" /> Surat Jalan
                  </Button>
                  <Button
                    onClick={() => openConfirm(group.key)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold uppercase tracking-wider h-10 rounded-xl"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Konfirmasi Diterima
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Confirmed history */}
      {confirmed.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Sudah Dikonfirmasi — 30 Hari Terakhir
          </p>
          <div className="rounded-2xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {confirmed.map(pi => {
              const short = pi.qtyTarget - (pi.inboundQtyReceived ?? 0)
              const delivery = deliveries.find(d => d.salesOrderId === pi.salesOrderId && d.baUrl)
              return (
                <div key={pi.id} className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-slate-900">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-800 dark:text-white truncate">{nameOf(pi.productId)}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      {vendorNameOf(pi.vendorId)} → {clientNameOf(pi.salesOrderId)}
                      {pi.inboundVerifiedAt
                        ? ` • ${new Date(pi.inboundVerifiedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {delivery?.baUrl && (
                      <a
                        href={delivery.baUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] font-black uppercase tracking-widest text-blue-600 hover:underline"
                      >
                        Bukti
                      </a>
                    )}
                    <span className={cn(
                      "text-[10px] font-black",
                      short > 0 ? "text-amber-600" : "text-emerald-600"
                    )}>
                      {pi.inboundQtyReceived ?? 0} / {pi.qtyTarget} {uomOf(pi.productId)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      <Dialog open={!!activeGroup} onOpenChange={(open) => { if (!open) setActiveKey(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-wider">
              Konfirmasi Kiriman — {vendorNameOf(activeGroup?.vendorId)}
            </DialogTitle>
          </DialogHeader>

          {activeGroup && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-3 space-y-2">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Jumlah yang benar-benar diterima klien
                </p>
                {activeGroup.items.map(pi => (
                  <div key={pi.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200 truncate">
                        {nameOf(pi.productId)}
                      </p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">
                        Dipesan {pi.qtyTarget} {uomOf(pi.productId)}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={pi.qtyTarget}
                      step="any"
                      value={received[pi.id] ?? pi.qtyTarget}
                      onChange={(e) => setReceived(prev => ({ ...prev, [pi.id]: Number(e.target.value) }))}
                      className="w-24 h-10 text-right font-black rounded-xl"
                    />
                  </div>
                ))}
                {activeGroup.items.some(pi => (received[pi.id] ?? pi.qtyTarget) < pi.qtyTarget) && (
                  <div className="flex items-center gap-1.5 pt-1 text-amber-600">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[9px] font-black uppercase tracking-wider">
                      Kekurangannya masuk daftar belanja susulan
                    </span>
                  </div>
                )}
              </div>

              <ReceiptUpload
                label="Foto / tanda terima dari klien"
                currentFile={proofUrl}
                onFileSelect={(url) => setProofUrl(url)}
              />

              {groupPaymentMethod === 'Transfer' && (
                <div>
                  <Label className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                    Bayar vendor dari rekening
                  </Label>
                  <Select value={transferBankId} onValueChange={(v) => setTransferBankId(v || '')}>
                    <SelectTrigger className="h-11 rounded-xl mt-1">
                      <SelectValue placeholder="Pilih rekening" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Catatan (opsional)
                </Label>
                <Textarea
                  value={confirmNote}
                  onChange={(e) => setConfirmNote(e.target.value)}
                  placeholder="Misal: diterima oleh Bu Ani jam 09.00"
                  className="rounded-xl mt-1"
                />
              </div>

              <Button
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider h-12 rounded-xl"
              >
                {isSubmitting ? 'Memproses...' : 'Konfirmasi & Terbitkan Tagihan'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

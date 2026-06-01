"use client"

import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ArrowDownToLine, Package, ShieldCheck, CheckCircle2, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { toast } from "sonner"

export default function InboundDashboard() {
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const products = useAppStore(state => state.products)
  const users = useAppStore(state => state.users)
  const updatePurchaseItem = useAppStore(state => state.updatePurchaseItem)

  const allInboundCandidates = purchaseItems
    .filter(pi => {
       if (pi.isQCed) return false;
       if (pi.inboundStatus === 'verified' || pi.inboundStatus === 'rejected') return false;

       if (pi.inboundStatus === 'pra_inbound') return true;

       const parentP = purchases.find(p => p.id === pi.purchaseId);
       if (!parentP) return false;

       if ((pi.purchaseMethod === 'Pasar' || !pi.purchaseMethod) && parentP.status === 'Selesai') return true;
       if (pi.purchaseMethod === 'Online' && pi.isOnlineOrdered) return true;

       return false;
    })
    .map(item => {
      const parentP = purchases.find(p => p.id === item.purchaseId);
      const buyer = users.find(u => u.id === parentP?.purchaserId);
      return {
        ...item,
        purchaseDate: parentP?.date || new Date().toISOString(),
        product: products.find(p => p.id === item.productId),
        buyerName: buyer?.name || 'System'
      }
    })

  // Split: not yet accepted vs already accepted (pending QC)
  const pendingAccept = allInboundCandidates.filter(i => i.inboundStatus !== 'pra_inbound')
  const pendingQC = allInboundCandidates.filter(i => i.inboundStatus === 'pra_inbound')

  const handleAcceptItem = async (itemId: string) => {
    await updatePurchaseItem(itemId, { inboundStatus: 'pra_inbound' })
    toast.success("Barang diterima. Lanjutkan ke QC.")
  }

  const handleAcceptAll = async () => {
    if (pendingAccept.length === 0) return
    const toastId = toast.loading(`Menerima ${pendingAccept.length} item...`)
    for (const item of pendingAccept) {
      await updatePurchaseItem(item.id, { inboundStatus: 'pra_inbound' })
    }
    toast.success(`${pendingAccept.length} item diterima. Lanjutkan ke QC.`, { id: toastId })
  }

  const ItemTable = ({ items, showAccept }: { items: typeof allInboundCandidates, showAccept: boolean }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Waktu Tiba</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>Nama Barang</TableHead>
          <TableHead>Metode</TableHead>
          <TableHead>Pembeli</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead>Status</TableHead>
          {showAccept && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item, idx) => (
          <TableRow key={item.id || idx}>
            <TableCell className="text-xs text-slate-500">
              {new Date(item.purchaseDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </TableCell>
            <TableCell className="text-xs text-slate-500">{item.product?.skuCode}</TableCell>
            <TableCell className="font-medium text-slate-900">{item.product?.name}</TableCell>
            <TableCell>
              <Badge variant="outline" className={
                item.purchaseMethod === 'Online'
                  ? 'bg-blue-50 text-blue-600 border-blue-200'
                  : 'bg-emerald-50 text-emerald-600 border-emerald-200'
              }>
                {item.purchaseMethod === 'Online' ? 'Online' : 'Pasar'}
              </Badge>
            </TableCell>
            <TableCell className="text-xs">
              <span className="font-bold text-slate-700">{item.buyerName}</span>
              {item.onlineRef && <p className="text-[10px] text-slate-400 mt-0.5">Ref: {item.onlineRef}</p>}
            </TableCell>
            <TableCell className="text-right font-bold text-slate-900">
              {item.qtyPurchased} {item.product?.uom}
            </TableCell>
            <TableCell>
              {showAccept ? (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                  <Clock className="w-3 h-3 mr-1" /> Belum Diterima
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-100 text-amber-800">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Diterima — Menunggu QC
                </Badge>
              )}
            </TableCell>
            {showAccept && (
              <TableCell>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-3"
                  onClick={() => handleAcceptItem(item.id)}
                >
                  Terima
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inbound / Penerimaan</h2>
          <p className="text-muted-foreground">Konfirmasi penerimaan fisik barang sebelum lanjut ke QC.</p>
        </div>
        <Link href="/warehouse/qc">
          <Button className="bg-emerald-600 hover:bg-emerald-700">
            <ShieldCheck className="mr-2 h-4 w-4" /> Mulai Proses QC
          </Button>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Belum Diterima</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{pendingAccept.length}</div>
            <p className="text-xs text-muted-foreground">Item menunggu konfirmasi fisik</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Antrean QC</CardTitle>
            <ArrowDownToLine className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{pendingQC.length}</div>
            <p className="text-xs text-muted-foreground">Sudah diterima, menunggu inspeksi</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Antrian</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allInboundCandidates.length}</div>
            <p className="text-xs text-muted-foreground">Semua item dalam pipeline</p>
          </CardContent>
        </Card>
      </div>

      {/* Section 1: Pending Accept */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              Menunggu Konfirmasi Penerimaan Fisik
            </CardTitle>
            <CardDescription>
              Barang sudah dilaporkan oleh Sourcing. Konfirmasi bahwa barang sudah ada di gudang secara fisik.
            </CardDescription>
          </div>
          {pendingAccept.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 shrink-0"
              onClick={handleAcceptAll}
            >
              Terima Semua ({pendingAccept.length})
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {pendingAccept.length === 0 ? (
            <div className="text-center py-8 text-slate-500 border rounded-lg bg-slate-50 border-dashed">
              <p className="text-sm">Tidak ada barang menunggu penerimaan.</p>
            </div>
          ) : (
            <ItemTable items={pendingAccept} showAccept={true} />
          )}
        </CardContent>
      </Card>

      {/* Section 2: Accepted — Pending QC */}
      {pendingQC.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-amber-500" />
              Sudah Diterima — Menunggu QC
            </CardTitle>
            <CardDescription>
              Barang sudah dikonfirmasi ada di gudang. Lanjutkan ke halaman QC untuk inspeksi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ItemTable items={pendingQC} showAccept={false} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

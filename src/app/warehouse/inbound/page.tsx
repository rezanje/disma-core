"use client"

import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ArrowDownToLine, Package, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function InboundDashboard() {
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const products = useAppStore(state => state.products)
  const users = useAppStore(state => state.users)

  // Combined Inbound Items (Market + Online)
  const inboundItems = purchaseItems
    .filter(pi => {
       if (pi.isQCed) return false;
       const parentP = purchases.find(p => p.id === pi.purchaseId);
       if (!parentP) return false;

       // 1. Market items (Method: Pasar) are ready when physical sourcing is done
       if ((pi.purchaseMethod === 'Pasar' || !pi.purchaseMethod) && parentP.status === 'Selesai') {
          return true;
       }

       // 2. Online items are ready when Finance points them as ordered/arrived
       if (pi.purchaseMethod === 'Online' && pi.isOnlineOrdered) {
          return true;
       }

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

  // To simplify the MVP state, we'll just show the recently purchased items in inbound
  // and direct the user to the QC page.

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inbound / Penerimaan</h2>
          <p className="text-muted-foreground">Barang masuk dari Tim Pasar yang menunggu QC dan masuk stok.</p>
        </div>
        <Link href="/warehouse/qc">
          <Button className="bg-emerald-600 hover:bg-emerald-700">
            <ShieldCheck className="mr-2 h-4 w-4" /> Mulai Proses QC
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Antrean Inbound</CardTitle>
            <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inboundItems.length}</div>
            <p className="text-xs text-muted-foreground">Jenis barang menunggu QC</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-emerald-500" />
            Daftar Kedatangan Barang Hari Ini
          </CardTitle>
          <CardDescription>
            Barang-barang ini baru saja diserahkan oleh Tim Pasar. Silakan lakukan Quality Control (QC) untuk memasukkan ke stok gudang.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inboundItems.length === 0 ? (
            <div className="text-center py-10 text-slate-500 border rounded-lg bg-slate-50 dark:bg-slate-900 border-dashed">
              <p>Tidak ada barang masuk hari ini.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu Tiba</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Nama Barang</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead>Pembeli / Vendor</TableHead>
                  <TableHead className="text-right">Qty Diterima</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inboundItems.map((item, idx) => (
                  <TableRow key={item.id || idx}>
                    <TableCell>{new Date(item.purchaseDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</TableCell>
                    <TableCell className="text-xs text-slate-500">{item.product?.skuCode}</TableCell>
                    <TableCell className="font-medium text-slate-900">{item.product?.name}</TableCell>
                    <TableCell>
                        <Badge variant="outline" className={item.purchaseMethod === 'Online' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}>
                           {item.purchaseMethod === 'Online' ? 'Online' : 'Pasar'}
                        </Badge>
                     </TableCell>
                     <TableCell className="text-xs">
                        <span className="font-bold text-slate-700">{item.buyerName}</span>
                        {item.onlineRef && <p className="text-[10px] text-slate-400 mt-0.5">Ref: {item.onlineRef}</p>}
                     </TableCell>
                    <TableCell className="text-right font-bold text-slate-900">{item.qtyPurchased} {item.product?.uom}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-amber-100 text-amber-800">
                        Menunggu QC
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { formatRupiah } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  aggregateDaily,
  classifyLossMovement,
  PurchaseRecord,
  LossRecord,
} from "@/lib/sku-pnl";

export default function SkuPnlPage() {
  const products = useAppStore((s) => s.products);
  const purchases = useAppStore((s) => s.purchases);
  const purchaseItems = useAppStore((s) => s.purchaseItems);
  const stockMovements = useAppStore((s) => s.stockMovements);

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  // Map store -> pure-module inputs.
  const rows = useMemo(() => {
    const purchaseById = new Map(purchases.map((p) => [p.id, p]));

    const purchaseRecords: PurchaseRecord[] = purchaseItems
      .filter((pi) => !pi.isOnlineOrdered) // "beli ke pasar": exclude online
      .map((pi) => {
        const parent = purchaseById.get(pi.purchaseId);
        if (!parent) return null;
        const price = pi.actualUnitPrice ?? 0;
        if (!(price > 0)) return null; // not yet priced -> skip
        return {
          productId: pi.productId,
          date: parent.date,
          actualUnitPrice: price,
          qtyReceived: pi.inboundQtyReceived ?? pi.qtyPurchased,
          finalized: !!pi.inboundStatus && pi.inboundStatus !== "pra_inbound",
        } as PurchaseRecord;
      })
      .filter((r): r is PurchaseRecord => r !== null);

    const lossRecords: LossRecord[] = stockMovements
      .map((m) => {
        const bucket = classifyLossMovement({
          kind: m.kind,
          referenceType: m.referenceType,
          source: m.source,
          destination: m.destination,
          stockDelta: m.stockDelta,
          note: m.note,
        });
        if (!bucket) return null;
        // ponytail: unitCost fallback to basePrice; client-return movements carry no
        // unitCost, so they fall back to basePrice — matches how the GL books them.
        const unitCost = m.unitCost ?? productById.get(m.productId)?.basePrice ?? 0;
        return {
          productId: m.productId,
          date: m.date,
          qty: m.quantity,
          unitCost,
          bucket,
        } as LossRecord;
      })
      .filter((r): r is LossRecord => r !== null);

    return aggregateDaily(purchaseRecords, lossRecords);
  }, [purchases, purchaseItems, stockMovements, productById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (!q) return true;
      const p = productById.get(r.productId);
      return (
        (p?.name ?? "").toLowerCase().includes(q) ||
        (p?.skuCode ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, from, to, productById]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => {
          acc.variance += r.varianceAmount;
          acc.loss += r.lossTotal;
          acc.net += r.netPnl;
          return acc;
        },
        { variance: 0, loss: 0, net: 0 }
      ),
    [filtered]
  );

  const money = (n: number) => formatRupiah(Math.round(n));
  const signClass = (n: number) =>
    n > 0 ? "text-emerald-600" : n < 0 ? "text-rose-600" : "text-muted-foreground";

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">Untung Rugi per SKU</h1>
        <p className="text-sm text-muted-foreground">
          Selisih harga beli vs acuan mingguan (harga tertinggi minggu lalu) plus
          kerugian fisik (reject, hilang, waste, retur). Selisih harga = KPI, tidak
          menyentuh GL; kerugian fisik sudah tercatat di jurnal (5-2000).
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <div className="grow">
            <Label htmlFor="search">Cari SKU</Label>
            <Input
              id="search"
              placeholder="Nama atau kode SKU"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="from">Dari</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="to">Sampai</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Selisih Harga (KPI)</CardTitle></CardHeader>
          <CardContent className={`text-xl font-bold ${signClass(totals.variance)}`}>{money(totals.variance)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Kerugian Fisik</CardTitle></CardHeader>
          <CardContent className="text-xl font-bold text-rose-600">{money(totals.loss)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Net Untung/Rugi</CardTitle></CardHeader>
          <CardContent className={`text-xl font-bold ${signClass(totals.net)}`}>{money(totals.net)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2">Tanggal</th>
                <th className="p-2">SKU</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">Avg Beli</th>
                <th className="p-2 text-right">Acuan</th>
                <th className="p-2 text-right">Selisih</th>
                <th className="p-2 text-right">Reject</th>
                <th className="p-2 text-right">Hilang</th>
                <th className="p-2 text-right">Waste</th>
                <th className="p-2 text-right">Retur</th>
                <th className="p-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const p = productById.get(r.productId);
                return (
                  <tr key={`${r.productId}-${r.date}`} className="border-b hover:bg-muted/40">
                    <td className="p-2 whitespace-nowrap">{r.date}</td>
                    <td className="p-2">
                      <div className="font-medium">{p?.name ?? r.productId}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {p?.skuCode}
                        {r.hasDraft && <Badge variant="outline" className="text-amber-600">draft</Badge>}
                      </div>
                    </td>
                    <td className="p-2 text-right">{r.qty}</td>
                    <td className="p-2 text-right">{r.qty > 0 ? money(r.avgBuyPrice) : "—"}</td>
                    <td className="p-2 text-right">{r.acuan == null ? "—" : money(r.acuan)}</td>
                    <td className={`p-2 text-right ${signClass(r.varianceAmount)}`}>{r.acuan == null ? "—" : money(r.varianceAmount)}</td>
                    <td className="p-2 text-right text-rose-600">{r.lossReject ? money(-r.lossReject) : "—"}</td>
                    <td className="p-2 text-right text-rose-600">{r.lossMissing ? money(-r.lossMissing) : "—"}</td>
                    <td className="p-2 text-right text-rose-600">{r.lossWaste ? money(-r.lossWaste) : "—"}</td>
                    <td className="p-2 text-right text-rose-600">{r.lossReturn ? money(-r.lossReturn) : "—"}</td>
                    <td className={`p-2 text-right font-semibold ${signClass(r.netPnl)}`}>{money(r.netPnl)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Tidak ada data.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

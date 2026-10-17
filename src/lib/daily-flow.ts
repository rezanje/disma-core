// Apa yang menunggu dikerjakan hari ini, dan ke pesanan mana barangnya jatuh.
//
// Murni — tanpa store, tanpa React. Dipakai halaman QC lama dan layar harian
// gabungan, supaya keduanya tidak pernah beda pendapat soal barang mana yang
// masih menunggu diperiksa. Lihat daily-flow.check.ts.

export type QueueItem = {
  id: string;
  purchaseId: string;
  isQCed?: boolean;
  inboundStatus?: 'pra_inbound' | 'verified' | 'rejected' | 'partial';
  purchaseMethod?: string | null;
  isOnlineOrdered?: boolean;
  qtyPurchased?: number;
  qtyTarget?: number;
  physicalQtyReceived?: number;
  physicalBeforeReport?: boolean;
  qcProcessedQty?: number;
  reportEventIds?: string[];
};

export type QueueParent = { id: string; status: string };

/** Pesanan ke gudang yang belum dikonfirmasi datang; dropship langsung ke klien. */
export function awaitingArrival<T extends QueueItem>(items: T[], purchases: QueueParent[]): T[] {
  return items.filter(item => {
    if (item.isQCed || !purchases.some(p => p.id === item.purchaseId && ['Pending','Belanja','Selesai'].includes(p.status))) return false;
    if (item.purchaseMethod === 'Pasar' || !item.purchaseMethod) {
      return !item.physicalBeforeReport && (item.qtyTarget || item.qtyPurchased || 0) > (item.physicalQtyReceived ?? item.qcProcessedQty ?? 0);
    }
    return (item.purchaseMethod === 'Vendor' || item.purchaseMethod === 'Online') && !!item.isOnlineOrdered &&
      (item.physicalQtyReceived != null ? (item.qtyPurchased || 0) > item.physicalQtyReceived : !item.inboundStatus);
  });
}

/** Barang yang sudah dibeli tapi belum diperiksa. */
export function awaitingQc<T extends QueueItem>(items: T[], purchases: QueueParent[]): T[] {
  return (items || []).filter(pi => {
    if (pi.isQCed) return false;
    if (pi.physicalQtyReceived != null && qcRemaining(pi) <= 0) return false;
    if (pi.inboundStatus === 'verified' || pi.inboundStatus === 'rejected') return false;
    const parent = (purchases || []).find(p => p.id === pi.purchaseId);
    if (!parent || !['Pending','Belanja','Selesai'].includes(parent.status)) return false;
    if (pi.purchaseMethod === 'Vendor' || pi.purchaseMethod === 'Online') {
      return !!pi.isOnlineOrdered && (pi.inboundStatus === 'pra_inbound' || pi.inboundStatus === 'partial');
    }
    if (pi.inboundStatus === 'partial' || pi.inboundStatus === 'pra_inbound') return true;
    // A measured partial market report is enough; other lines may still be bought.
    if (pi.purchaseMethod === 'Pasar' || !pi.purchaseMethod) {
      return parent.status === 'Selesai' || ((pi.qtyPurchased || 0) > 0 && !!pi.reportEventIds?.length);
    }
    return false;
  });
}

export type Allocation = { soId: string; qty: number };

export type OpenOrder = { id: string; status: string; orderDate: string };
export type OrderLine = {
  salesOrderId: string;
  productId: string;
  qty: number;
  qtyFinal?: number | null;
  qtyDelivered?: number;
  qtyCancelled?: number;
};

/** Sisa yang masih dijanjikan ke klien untuk satu baris pesanan. */
export function stillOwed(line: OrderLine): number {
  return Math.max(0, line.qty - (line.qtyDelivered ?? 0) - (line.qtyCancelled ?? 0) - (line.qtyFinal ?? 0));
}

const CLOSED_STATUSES = ['Batal', 'Selesai', 'Terkirim', 'Packing', 'Siap Kirim', 'Dikirim', 'Awaiting Audit'];

/**
 * Barang yang lolos dibagi ke pesanan yang menunggu, pesanan tertua dapat duluan.
 * Sisanya masuk stok gudang.
 *
 * Yang tertua duluan bukan sekadar adil: klien yang pesan paling awal punya jam
 * kirim paling pagi, dan barang segar yang menganggur sehari sudah turun kelas.
 */
export function buildFifoAllocations(
  productId: string,
  totalPassed: number,
  orders: OpenOrder[],
  lines: OrderLine[],
): { allocations: Allocation[]; inventoryRemainder: number } {
  const eligible = (orders || [])
    .filter(so => !CLOSED_STATUSES.includes(so.status))
    .filter(so => (lines || []).some(l => l.salesOrderId === so.id && l.productId === productId && stillOwed(l) > 0))
    .sort((a, b) => a.orderDate.localeCompare(b.orderDate));

  let remaining = totalPassed;
  const allocations: Allocation[] = eligible.map(so => {
    const line = lines.find(l => l.salesOrderId === so.id && l.productId === productId);
    const needed = line ? stillOwed(line) : 0;
    const alloc = Math.min(needed, remaining);
    remaining -= alloc;
    return { soId: so.id, qty: alloc };
  });

  return { allocations, inventoryRemainder: remaining };
}

/** Only measured receipts supply early QC; a plan never supplies physical stock. */
export function qcRemaining(item: QueueItem): number {
  const incoming = item.physicalBeforeReport ? (item.physicalQtyReceived || 0)
    : item.physicalQtyReceived ? Math.min(item.qtyPurchased || 0, item.physicalQtyReceived) : (item.qtyPurchased || 0);
  return Math.max(0, incoming - (item.qcProcessedQty || 0));
}
export function arrivalRemaining(item: QueueItem): number {
  return Math.max(0, (item.qtyPurchased || item.qtyTarget || 0) - (item.physicalQtyReceived ?? item.qcProcessedQty ?? 0));
}

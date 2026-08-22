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
};

export type QueueParent = { id: string; status: string };

/** Barang yang sudah dibeli tapi belum diperiksa. */
export function awaitingQc<T extends QueueItem>(items: T[], purchases: QueueParent[]): T[] {
  return (items || []).filter(pi => {
    if (pi.isQCed) return false;
    if (pi.inboundStatus === 'verified' || pi.inboundStatus === 'rejected') return false;
    // Barang kiriman vendor sudah diketuk "sudah datang" di Inbound.
    if (pi.inboundStatus === 'pra_inbound') return true;

    const parent = (purchases || []).find(p => p.id === pi.purchaseId);
    if (!parent) return false;
    // Belanja pasar baru boleh diperiksa setelah laporan belanjanya masuk.
    if ((pi.purchaseMethod === 'Pasar' || !pi.purchaseMethod) && parent.status === 'Selesai') return true;
    if (pi.purchaseMethod === 'Online' && pi.isOnlineOrdered) return true;
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
};

/** Sisa yang masih dijanjikan ke klien untuk satu baris pesanan. */
export function stillOwed(line: OrderLine): number {
  return Math.max(0, line.qty - (line.qtyDelivered ?? 0) - (line.qtyFinal ?? 0));
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

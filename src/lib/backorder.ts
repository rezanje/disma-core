// Pure fulfillment arithmetic for the backorder ("Kurang Kirim") flow.
// No store/React imports so it stays trivially testable.

/** Minimal shape these helpers read from a SalesOrderItem. */
type ItemFulfillment = {
  qty: number;              // ordered
  qtyFinal?: number | null; // current round's QC-committed qty (reset to null after each round's BAST)
  qtyDelivered?: number;    // cumulative accepted across rounds
};

/** Qty the client is still owed = ordered minus cumulative accepted. */
export function qtyOwed(item: ItemFulfillment): number {
  return Math.max(0, item.qty - (item.qtyDelivered ?? 0));
}

/**
 * Qty to book (revenue/HPP/stock) for the delivery round about to be finalized.
 * If the round went through QC, qtyFinal is that round's committed qty.
 * If it never went through QC (direct ship), book the remaining owed qty.
 */
export function roundQtyToBook(item: ItemFulfillment): number {
  if (item.qtyFinal != null) return Math.max(0, item.qtyFinal);
  return qtyOwed(item);
}

/** SO status after a BAST round: still owed anywhere => Kurang Kirim, else Selesai. */
export function nextSoStatus(items: ItemFulfillment[]): 'Kurang Kirim' | 'Selesai' {
  return items.some(i => qtyOwed(i) > 0) ? 'Kurang Kirim' : 'Selesai';
}

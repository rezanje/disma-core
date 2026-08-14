// One rule for the quantity printed on delivery paperwork. Pure — no store or
// jsPDF imports — so it stays trivially testable (delivery-qty.check.ts).
//
// Both the surat jalan and the berita acara are signed at the same handover,
// from the same correction form, so they must print the same number. They did
// not: only the berita acara honoured the courier's corrections, while the
// surat jalan always printed the ordered quantity.

type PrintableItem = {
  id: string;
  qty: number;
  qtyFinal?: number | null;
};

/**
 * What actually goes on the paper, most recent truth first:
 *   1. the courier's correction at the door,
 *   2. the quantity QC committed for this round,
 *   3. the quantity ordered.
 *
 * A correction of 0 is a real answer — the client took none of this line — so it
 * must not be treated as "nothing supplied" and fall back to the order.
 */
export function printedQty(
  item: PrintableItem,
  adjustments?: Record<string, number>
): number {
  const adjusted = adjustments?.[item.id];
  if (adjusted !== undefined && adjusted !== null) return Math.max(0, adjusted);
  if (item.qtyFinal !== undefined && item.qtyFinal !== null) return Math.max(0, item.qtyFinal);
  return Math.max(0, item.qty);
}

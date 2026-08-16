// The purchasing plan Finance sets on a shopping document before sourcing touches it.
//
// Playbook §3.2 puts this outside Admin PO's authority ("memilih supplier atau
// menyetujui pembayaran") and §3.3 gives it to Finance as Purchasing Admin. The app had
// it backwards, and worse: vendor, payment and price lived in Admin PO's browser
// localStorage until the document was created, so until that moment the decisions sat
// on one laptop where nobody else could see them.
//
// purchaseMethod is deliberately NOT split into separate columns. It is read across
// fourteen files and decides which screen an item appears on and which accounting path
// it takes. Only the question changes: Finance is asked the two things they actually
// think about, and one stored value comes out.
//
// Pure — no store, no React. See purchase-plan.check.ts.

export type PurchaseMethod = 'Pasar' | 'Online' | 'Vendor' | 'Dropship';
export type PaymentMethod = 'Cash' | 'Tempo' | 'Transfer';

/** How the goods reach us, asked only when the item is not bought online. */
export type Handling = 'ambil-sendiri' | 'vendor-antar-gudang' | 'vendor-antar-klien';

export const HANDLING_LABEL: Record<Handling, string> = {
  'ambil-sendiri': 'Kita ambil sendiri',
  'vendor-antar-gudang': 'Vendor antar ke gudang',
  'vendor-antar-klien': 'Vendor antar langsung ke klien',
};

/**
 * Two questions in, one stored value out.
 *
 * Online always lands at the warehouse — confirmed with the owner, so there is no
 * online-to-client or online-pickup combination to represent. If that ever changes,
 * this is the one function that has to learn about it.
 */
export function toPurchaseMethod(isOnline: boolean, handling: Handling): PurchaseMethod {
  if (isOnline) return 'Online';
  if (handling === 'vendor-antar-klien') return 'Dropship';
  if (handling === 'vendor-antar-gudang') return 'Vendor';
  return 'Pasar';
}

/** Reverse, so an already-planned line reopens showing the answers that produced it. */
export function fromPurchaseMethod(method?: PurchaseMethod | null): { isOnline: boolean; handling: Handling } {
  if (method === 'Online') return { isOnline: true, handling: 'vendor-antar-gudang' };
  if (method === 'Dropship') return { isOnline: false, handling: 'vendor-antar-klien' };
  if (method === 'Vendor') return { isOnline: false, handling: 'vendor-antar-gudang' };
  return { isOnline: false, handling: 'ambil-sendiri' };
}

export type PlannableLine = {
  id: string;
  purchaseMethod?: string | null;
  paymentMethod?: string | null;
  plannedVendorId?: string | null;
};

/**
 * A market line's vendor is not knowable until someone stands at the market, so it is
 * not required. Every other channel names a specific supplier up front — a vendor
 * delivery with no vendor has nobody to send the order to or bill it against.
 */
export function lineIsPlanned(line: PlannableLine): boolean {
  if (!line.purchaseMethod || !line.paymentMethod) return false;
  if (line.purchaseMethod === 'Pasar') return true;
  return !!line.plannedVendorId;
}

/** Ids of lines Finance still has to decide. Empty means the document can be released. */
export function unplannedLines(lines: PlannableLine[]): string[] {
  return (lines || []).filter(l => !lineIsPlanned(l)).map(l => l.id);
}

/**
 * Cash Finance actually has to hand over. Tempo is billed later and Transfer is paid
 * from the office account, so counting them makes sourcing carry money they do not
 * need — the same mistake the funding request used to make.
 */
export function cashNeeded(
  lines: Array<PlannableLine & { qtyTarget?: number | null; estimatedUnitPrice?: number | null }>,
): number {
  return (lines || []).reduce((sum, l) => {
    if (l.paymentMethod !== 'Cash') return sum;
    if (l.purchaseMethod === 'Online' || l.purchaseMethod === 'Dropship') return sum;
    return sum + Number(l.qtyTarget || 0) * Number(l.estimatedUnitPrice || 0);
  }, 0);
}

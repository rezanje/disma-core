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
  estimatedUnitPrice?: number | null;
  qtyTarget?: number | null;
};

/**
 * A market line's vendor is not knowable until someone stands at the market, so it is
 * not required. Every other channel names a specific supplier up front — a vendor
 * delivery with no vendor has nobody to send the order to or bill it against.
 */
export function lineIsPlanned(line: PlannableLine): boolean {
  if (!line.purchaseMethod || !line.paymentMethod) return false;
  if (line.qtyTarget != null && (!Number.isFinite(line.qtyTarget) || line.qtyTarget <= 0)) return false;
  if (line.estimatedUnitPrice != null && (!Number.isFinite(line.estimatedUnitPrice) || line.estimatedUnitPrice < 0)) return false;
  if (!['Pasar', 'Vendor', 'Online', 'Dropship'].includes(line.purchaseMethod) || !['Cash', 'Tempo', 'Transfer'].includes(line.paymentMethod)) return false;
  if (line.purchaseMethod === 'Dropship' && line.paymentMethod === 'Cash') return false;
  if (line.purchaseMethod === 'Online' && line.paymentMethod !== 'Transfer') return false;
  // Barang tunai tanpa harga membuat uang yang diserahkan ke kantong jadi nol untuk
  // baris itu — orangnya berangkat ke pasar dengan uang kurang, dan tidak ada yang
  // memberi tahu. Harga adalah bagian dari rencana, bukan pelengkap.
  if (line.paymentMethod === 'Cash' && !(Number(line.estimatedUnitPrice || 0) > 0)) return false;
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

/** Remove binary subtraction noise while retaining fractional purchase quantities. */
export const purchasingQuantity = (value:number):number => Number(value.toPrecision(12));

/** Allocate each product's free stock once; existing sourcing belongs to its PO row. */
export function allocateShoppingDemand<T extends { id: string; productId: string; quantity: number }>(
  rows: T[], onHand: Record<string, number>, reserved: Record<string, number> = {}, sourcedByRow: Record<string, number> = {},
): Array<T & { allocatedStock: number; toBuy: number }> {
  const free: Record<string, number> = {};
  return rows.map(row => {
    if (!(row.productId in free)) free[row.productId] = purchasingQuantity(Math.max(0, (onHand[row.productId] || 0) - (reserved[row.productId] || 0)));
    const demand = purchasingQuantity(Math.max(0, row.quantity - (sourcedByRow[row.id] || 0)));
    const fromStock = Math.min(demand, free[row.productId]);
    free[row.productId] = purchasingQuantity(free[row.productId] - fromStock);
    return { ...row, allocatedStock: fromStock, toBuy: purchasingQuantity(demand - fromStock) };
  });
}

type ReservationRow = {id:string;salesOrderId:string;productId:string;qtyFinal?:number|null};
type ReservationOrder = {id:string;status:string;poNumber?:string};
type ReservationDelivery = {salesOrderId:string;status:string;lineSnapshots?:Array<{salesOrderItemId:string;qty:number}>};

/** Packing is a plan. Only an active released delivery has actually removed stock. */
export function warehouseReservationDetails(rows:ReservationRow[],orders:ReservationOrder[],deliveries:ReservationDelivery[]) {
  const active = new Map(orders.filter(o=>!['Selesai','Batal','Cancelled'].includes(o.status)).map(o=>[o.id,o]));
  const details: Array<{salesOrderItemId:string;salesOrderId:string;productId:string;poNumber:string;status:string;quantity:number}> = [];
  for (const row of rows) {
    const order = active.get(row.salesOrderId);
    if (!order) continue;
    const released = deliveries.filter(d=>d.salesOrderId===row.salesOrderId && ['Dikirim','Tunggu Konfirmasi','Awaiting Audit'].includes(d.status))
      .reduce((sum,d)=>sum+(d.lineSnapshots || []).filter(l=>l.salesOrderItemId===row.id).reduce((s,l)=>s+l.qty,0),0);
    details.push({salesOrderItemId:row.id,salesOrderId:row.salesOrderId,productId:row.productId,poNumber:order.poNumber||order.id,status:order.status,quantity:Math.max(0,Number(row.qtyFinal||0)-released)});
  }
  return details;
}

export function warehouseReservations(rows:ReservationRow[],orders:ReservationOrder[],deliveries:ReservationDelivery[]):Record<string,number> {
  const owned:Record<string,number> = {};
  for (const row of warehouseReservationDetails(rows,orders,deliveries)) {
    owned[row.productId] = (owned[row.productId] || 0) + row.quantity;
  }
  return owned;
}

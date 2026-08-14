// Pure arithmetic and grouping for dropship (vendor delivers straight to the
// client). No store/React imports so it stays trivially testable — same shape
// as backorder.ts.

/** A row is dropship purely by its purchase method. */
export function isDropship(item: { purchaseMethod?: string }): boolean {
  return item.purchaseMethod === 'Dropship';
}

/**
 * Qty the client did not receive, which becomes a susulan.
 * A vendor who over-delivers never creates a negative susulan.
 */
export function dropshipShortfall(orderedQty: number, receivedQty: number): number {
  return Math.max(0, orderedQty - receivedQty);
}

/** Money for a line: the client is billed, and the vendor owed, for what arrived. */
export function dropshipLineValue(receivedQty: number, unitPrice: number): number {
  return Math.max(0, receivedQty) * unitPrice;
}

/** One delivery note per vendor + sales order pairing. */
export function groupKey(vendorId: string | undefined, salesOrderId: string | undefined): string {
  return `${vendorId || ''}::${salesOrderId || ''}`;
}

export type DropshipGroup<T> = {
  key: string;
  vendorId?: string;
  salesOrderId?: string;
  items: T[];
};

export function groupDropship<T extends { vendorId?: string; salesOrderId?: string }>(
  items: T[]
): DropshipGroup<T>[] {
  const groups = new Map<string, DropshipGroup<T>>();
  items.forEach(item => {
    const key = groupKey(item.vendorId, item.salesOrderId);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, { key, vendorId: item.vendorId, salesOrderId: item.salesOrderId, items: [item] });
    }
  });
  return Array.from(groups.values());
}

export type DropshipTotalsLine = {
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
  unitPrice: number;
};

/** Split a confirmed dropship delivery into what to bill, what to owe, what to re-buy. */
export function splitDropshipTotals(lines: DropshipTotalsLine[]) {
  let revenue = 0;
  let cogs = 0;
  const shortfalls: { index: number; qty: number }[] = [];
  lines.forEach((line, index) => {
    revenue += dropshipLineValue(line.qtyReceived, line.unitPrice);
    cogs += dropshipLineValue(line.qtyReceived, line.unitCost);
    const short = dropshipShortfall(line.qtyOrdered, line.qtyReceived);
    if (short > 0) shortfalls.push({ index, qty: short });
  });
  return { revenue, cogs, shortfalls };
}

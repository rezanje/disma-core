// Administrative follow-up target only. Invoice age never blocks a receipt or TF.

export const TF_WINDOW_DAYS = 14;

/** Days before the administrative target. Negative = overdue follow-up. */
export function daysLeftInTfWindow(issueDate: string, today: Date): number {
  const issued = new Date(issueDate);
  if (Number.isNaN(issued.getTime())) return -Infinity;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const age = Math.floor((startOfDay(today).getTime() - startOfDay(issued).getTime()) / MS_PER_DAY);
  return TF_WINDOW_DAYS - age;
}

export type TfWindowBucket = 'ok' | 'urgent' | 'expired';

/**
 * 'urgent' starts four days before the target. 'expired' denotes overdue follow-up,
 * never a restriction on billing or receiving payment.
 */
export function tfWindowBucket(issueDate: string, today: Date): TfWindowBucket {
  const left = daysLeftInTfWindow(issueDate, today);
  if (left < 0) return 'expired';
  if (left <= 4) return 'urgent';
  return 'ok';
}

/**
 * An invoice is only reachable by Tukar Faktur once finance has audited its
 * sales order out of 'Awaiting Audit'. Shared so the warning panel counts
 * exactly what the picker offers — a panel that promised invoices the picker
 * then refused would be worse than no panel.
 */
export function isInvoiceIssued(
  inv: { salesOrderId?: string; salesOrderIds?: string[] },
  salesOrders: { id: string; status: string }[],
): boolean {
  const soIds = inv.salesOrderIds?.length ? inv.salesOrderIds : (inv.salesOrderId ? [inv.salesOrderId] : []);
  // Invoice tanpa kaitan SO (input manual) dianggap sudah terbit.
  if (soIds.length === 0) return true;
  return soIds.every(id => {
    const so = salesOrders.find(s => s.id === id);
    return !so || so.status !== 'Awaiting Audit';
  });
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** Age is a follow-up warning only. A TF groups real outstanding invoices. */
export function isInvoiceEligibleForTf(
  inv: { salesOrderId?: string; salesOrderIds?: string[]; status?: string; totalAmount: number; amountPaid?: number; isConsolidated?: boolean; supersededByInvoiceId?: string; tukarFakturId?: string },
  salesOrders: { id: string; status: string }[],
  invoices: { isConsolidated?: boolean; salesOrderIds?: string[] }[] = [],
): boolean {
  const legacySummary = !!inv.salesOrderId && invoices.some(parent => parent.isConsolidated && parent.salesOrderIds?.includes(inv.salesOrderId!))
  return !legacySummary && !inv.tukarFakturId && !inv.isConsolidated && !inv.supersededByInvoiceId &&
    (inv.status === 'Unpaid' || inv.status === 'Partial') &&
    Number.isFinite(inv.totalAmount) && inv.totalAmount > (inv.amountPaid || 0) &&
    isInvoiceIssued(inv, salesOrders);
}

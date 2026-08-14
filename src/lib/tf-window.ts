// The Tukar Faktur eligibility window. Pure — no store/React imports — so it
// stays trivially testable (tf-window.check.ts).
//
// GenerateTfModal only offers invoices issued within this many days. Anything
// older drops out of the picker with no message: the goods shipped, the invoice
// exists, and there is no way to bill it from that screen. These helpers are
// shared with the picker so the warning panel and the picker cannot disagree
// about which invoices are still reachable.

export const TF_WINDOW_DAYS = 14;

/** Days before this invoice falls out of the picker. Negative = already out. */
export function daysLeftInTfWindow(issueDate: string, today: Date): number {
  const issued = new Date(issueDate);
  if (Number.isNaN(issued.getTime())) return -Infinity;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const age = Math.floor((startOfDay(today).getTime() - startOfDay(issued).getTime()) / MS_PER_DAY);
  return TF_WINDOW_DAYS - age;
}

export type TfWindowBucket = 'ok' | 'urgent' | 'expired';

/**
 * 'urgent' starts four days out — a week's worth of deliveries can be lost in
 * that gap, so it needs to be visible before the last day rather than on it.
 * An undateable invoice counts as 'expired': we cannot promise it is billable.
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

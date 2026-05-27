// src/lib/vendor-payable.ts
import type { PurchaseItem, Vendor } from "@/types";

export function groupItemsByVendor(items: PurchaseItem[]): Map<string, PurchaseItem[]> {
  const map = new Map<string, PurchaseItem[]>();
  for (const item of items) {
    const vId = item.vendorId || "";
    if (!map.has(vId)) {
      map.set(vId, []);
    }
    map.get(vId)!.push(item);
  }
  return map;
}

export function computeSettlementBreakdown(
  items: PurchaseItem[],
  vendors: Vendor[],
  advance: number
) {
  const vendorMap = new Map(vendors.map(v => [v.id, v]));
  const tempoTotals = new Map<string, number>();
  let cashTotal = 0;

  for (const item of items) {
    const vId = item.vendorId || "";
    const vendor = vendorMap.get(vId);
    // default to tempo if not explicitly set to false (isTempo: true or undefined)
    const isTempo = vendor ? (vendor.isTempo !== false) : true;
    const cost = (item.actualUnitPrice || 0) * (item.qtyPurchased || 0);

    if (isTempo) {
      tempoTotals.set(vId, (tempoTotals.get(vId) || 0) + cost);
    } else {
      cashTotal += cost;
    }
  }

  const defisit = cashTotal > advance ? cashTotal - advance : 0;
  const advanceRemainder = advance > cashTotal ? advance - cashTotal : 0;

  return {
    tempoTotals,
    cashTotal,
    defisit,
    advanceRemainder
  };
}

export function dueDateFor(today: Date | string, paymentTermDays: number = 14): string {
  const d = new Date(today);
  d.setDate(d.getDate() + paymentTermDays);
  return d.toISOString().slice(0, 10);
}

export function agingBucket(
  dueDate: Date | string,
  today: Date | string
): '0-7d' | '8-14d' | 'overdue 1-7' | 'overdue >7' | 'over 30' {
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const now = new Date(today);
  now.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    if (overdueDays > 30) {
      return 'over 30';
    } else if (overdueDays > 7) {
      return 'overdue >7';
    } else {
      return 'overdue 1-7';
    }
  } else {
    if (diffDays <= 7) {
      return '0-7d';
    } else {
      return '8-14d';
    }
  }
}

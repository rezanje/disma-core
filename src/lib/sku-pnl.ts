import { parseISO, subDays, getISOWeek, getISOWeekYear } from "date-fns";

// --- Input shapes (structural, deliberately decoupled from @/types) ---

export interface PurchaseRecord {
  productId: string;
  date: string;          // ISO string from parent Purchase.date
  actualUnitPrice: number;
  qtyReceived: number;   // inboundQtyReceived ?? qtyPurchased
  finalized: boolean;    // inbound QC completed
}

/** ISO week key, e.g. "2026-W07". Zero-padded week number. */
export function isoWeekKey(dateIso: string): string {
  const d = parseISO(dateIso);
  const year = getISOWeekYear(d);
  const week = getISOWeek(d);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** productId -> (weekKey -> max actualUnitPrice observed that week). */
export function buildWeeklyMax(
  purchases: PurchaseRecord[]
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const p of purchases) {
    if (!(p.actualUnitPrice > 0)) continue; // ignore unpriced/draft-zero rows
    const wk = isoWeekKey(p.date);
    let byWeek = out.get(p.productId);
    if (!byWeek) {
      byWeek = new Map<string, number>();
      out.set(p.productId, byWeek);
    }
    const prev = byWeek.get(wk) ?? 0;
    if (p.actualUnitPrice > prev) byWeek.set(wk, p.actualUnitPrice);
  }
  return out;
}

/** Acuan = max buy price of the record's PREVIOUS ISO week (same product), else null. */
export function acuanForRecord(
  rec: PurchaseRecord,
  weeklyMax: Map<string, Map<string, number>>
): number | null {
  const prevWeekKey = isoWeekKey(subDays(parseISO(rec.date), 7).toISOString());
  return weeklyMax.get(rec.productId)?.get(prevWeekKey) ?? null;
}

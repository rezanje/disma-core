// Pure, self-contained SKU daily P/L calculations. Deliberately decoupled from
// @/types so it runs under bare ts-node (no path-alias resolution).

// --- Input shapes (structural) ---

export interface PurchaseRecord {
  productId: string;
  date: string;          // ISO string from parent Purchase.date
  actualUnitPrice: number;
  qtyReceived: number;   // inboundQtyReceived ?? qtyPurchased
  finalized: boolean;    // inbound QC completed
}

// Business timezone: WIB (Asia/Jakarta, UTC+7, no DST). Day/week bucketing is
// computed in WIB and is deterministic regardless of the host machine's TZ.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Instant shifted so its UTC fields read as the WIB wall-clock. */
function wibDate(dateIso: string): Date {
  return new Date(Date.parse(dateIso) + WIB_OFFSET_MS);
}

/** yyyy-MM-dd of the WIB calendar day. */
export function dayKeyWib(dateIso: string): string {
  const d = wibDate(dateIso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO 8601 week key (e.g. "2026-W07") of the WIB calendar day. Computed purely
 *  from UTC fields so the result never depends on the host timezone. */
export function isoWeekKey(dateIso: string): string {
  const src = wibDate(dateIso);
  const target = new Date(Date.UTC(src.getUTCFullYear(), src.getUTCMonth(), src.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // nearest Thursday
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const ftDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDayNr + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
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
  const prevWeekKey = isoWeekKey(new Date(Date.parse(rec.date) - 7 * DAY_MS).toISOString());
  return weeklyMax.get(rec.productId)?.get(prevWeekKey) ?? null;
}

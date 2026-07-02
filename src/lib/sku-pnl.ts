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

// --- Physical loss classification (maps existing StockMovements to buckets) ---

export type LossBucket = "reject" | "missing" | "waste" | "return";

export interface MovementLike {
  kind: string;
  referenceType?: string;
  source?: string;
  destination?: string;
  stockDelta: number;
  note?: string;
}

const WASTE_RE = /busuk|waste|rusak|expired|kadaluarsa|kadaluwarsa/i;

/**
 * Which loss bucket (if any) a stock movement belongs to.
 * - QC reject we eat (Disposal) -> 'reject'. Vendor-replaceable ("Return to Supplier")
 *   and B2C-diversion (kind QC_INVENTORY) are excluded -> not our loss.
 * - Stock-opname deficit -> 'waste' if the note reads spoilage, else 'missing'.
 * - Client return that failed QC -> 'return'.
 */
export function classifyLossMovement(m: MovementLike): LossBucket | null {
  if (m.kind === "RETURN_REJECT") return "return";

  if (m.kind === "ADJUSTMENT") {
    // QC reject disposal: destination stamped "Reject/Write-off"; "Return to Supplier" excluded.
    if (m.referenceType === "QC") {
      return m.destination === "Reject/Write-off" ? "reject" : null;
    }
    // Stock opname: only deficits are losses.
    if (m.source === "Stock Opname" && m.stockDelta < 0) {
      return WASTE_RE.test(m.note ?? "") ? "waste" : "missing";
    }
  }
  return null;
}

// --- Daily aggregation (variance + losses -> per-SKU-per-day rows) ---

export interface LossRecord {
  productId: string;
  date: string;
  qty: number;
  unitCost: number;
  bucket: LossBucket;
}

export interface DailySkuPnl {
  productId: string;
  date: string; // yyyy-MM-dd
  qty: number;
  avgBuyPrice: number;
  acuan: number | null;
  varianceAmount: number;
  lossReject: number;
  lossMissing: number;
  lossWaste: number;
  lossReturn: number;
  lossTotal: number;
  netPnl: number;
  hasDraft: boolean;
}

const dayKey = dayKeyWib; // WIB calendar day, defined in Task 1 (host-TZ independent)
const rowKey = (productId: string, day: string) => `${productId}__${day}`;

/** One row per SKU per calendar day: weighted-avg buy price, variance vs acuan, summed losses. */
export function aggregateDaily(
  purchases: PurchaseRecord[],
  losses: LossRecord[]
): DailySkuPnl[] {
  const weeklyMax = buildWeeklyMax(purchases);

  const rows = new Map<string, DailySkuPnl>();
  const priceQtySum = new Map<string, number>(); // sum(price*qty) for weighted avg

  const ensure = (productId: string, day: string): DailySkuPnl => {
    const k = rowKey(productId, day);
    let r = rows.get(k);
    if (!r) {
      r = {
        productId,
        date: day,
        qty: 0,
        avgBuyPrice: 0,
        acuan: null,
        varianceAmount: 0,
        lossReject: 0,
        lossMissing: 0,
        lossWaste: 0,
        lossReturn: 0,
        lossTotal: 0,
        netPnl: 0,
        hasDraft: false,
      };
      rows.set(k, r);
      priceQtySum.set(k, 0);
    }
    return r;
  };

  // Purchases -> qty, weighted avg price, acuan, draft flag
  for (const p of purchases) {
    const day = dayKey(p.date);
    const k = rowKey(p.productId, day);
    const r = ensure(p.productId, day);
    r.qty += p.qtyReceived;
    priceQtySum.set(k, (priceQtySum.get(k) ?? 0) + p.actualUnitPrice * p.qtyReceived);
    if (!p.finalized) r.hasDraft = true;
    // acuan is a per-product/per-week constant; last write wins (identical within a day)
    r.acuan = acuanForRecord(p, weeklyMax);
  }

  // Losses -> bucket sums
  for (const l of losses) {
    const day = dayKey(l.date);
    const r = ensure(l.productId, day);
    const amt = l.qty * l.unitCost;
    if (l.bucket === "reject") r.lossReject += amt;
    else if (l.bucket === "missing") r.lossMissing += amt;
    else if (l.bucket === "waste") r.lossWaste += amt;
    else if (l.bucket === "return") r.lossReturn += amt;
  }

  // Finalize derived fields
  for (const [k, r] of rows) {
    r.avgBuyPrice = r.qty > 0 ? (priceQtySum.get(k) ?? 0) / r.qty : 0;
    r.varianceAmount = r.acuan == null ? 0 : (r.acuan - r.avgBuyPrice) * r.qty;
    r.lossTotal = r.lossReject + r.lossMissing + r.lossWaste + r.lossReturn;
    r.netPnl = r.varianceAmount - r.lossTotal;
  }

  return Array.from(rows.values()).sort(
    (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.productId.localeCompare(b.productId))
  );
}

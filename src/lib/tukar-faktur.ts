// src/lib/tukar-faktur.ts
// Pure helpers for Tukar Faktur period detection + numbering.
// No I/O, no React, no Supabase — safe to unit test from node.

export interface TfPeriod {
  periodStart: Date;
  periodEnd: Date;
  issueDate: Date;
}

export function mondayOf(d: Date): Date {
  const day = d.getDay() || 7; // Sunday (0) → 7
  const m = new Date(d);
  m.setDate(d.getDate() - (day - 1));
  m.setHours(0, 0, 0, 0);
  return m;
}

export function sundayOf(d: Date): Date {
  const m = mondayOf(d);
  m.setDate(m.getDate() + 6);
  return m;
}

export function lastDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function tfPeriodFor(deliveryDate: Date): TfPeriod {
  const d = new Date(deliveryDate);
  d.setHours(0, 0, 0, 0);
  const weekStart = mondayOf(d);
  const weekEnd = sundayOf(d);
  const crossesMonth = weekStart.getMonth() !== weekEnd.getMonth();

  if (!crossesMonth) {
    const issue = new Date(weekEnd);
    issue.setDate(issue.getDate() + 1);
    return { periodStart: weekStart, periodEnd: weekEnd, issueDate: issue };
  }

  const isInFirstMonth = d.getMonth() === weekStart.getMonth();
  if (isInFirstMonth) {
    const segEnd = lastDayOfMonth(weekStart);
    return { periodStart: weekStart, periodEnd: segEnd, issueDate: segEnd };
  }
  const segStart = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), 1);
  const issue = new Date(weekEnd);
  issue.setDate(issue.getDate() + 1);
  return { periodStart: segStart, periodEnd: weekEnd, issueDate: issue };
}

export function getISOWeek(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Client segment of a TF number. Every client id is prefixed `client-`, so slicing the
 * raw id gave literally "CLIENT" for everyone — the number carried no identity at all.
 * Strip the prefix (and separators) first so the segment names the client.
 */
function clientSegment(clientId: string): string {
  const bare = clientId.replace(/^client-/i, '').replace(/[^a-z0-9]/gi, '');
  return (bare || clientId).slice(0, 6).toUpperCase();
}

export function generateTfNumber(
  clientId: string,
  period: TfPeriod,
  existingCount: number
): string {
  const year = period.periodEnd.getFullYear();
  const isMonthEndSegment =
    period.periodEnd.getTime() === lastDayOfMonth(period.periodEnd).getTime();
  const label = isMonthEndSegment
    ? String(period.periodEnd.getMonth() + 1).padStart(2, '0')
    : `W${String(getISOWeek(period.periodEnd)).padStart(2, '0')}`;
  const seq = String(existingCount + 1).padStart(2, '0');
  return `TF-${year}-${label}-${clientSegment(clientId)}-${seq}`;
}

/** Local-date ISO string. `toISOString()` would shift WIB midnight back a day. */
export function isoLocalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function periodKey(period: TfPeriod): string {
  return `${isoLocalDate(period.periodStart)}_${isoLocalDate(period.periodEnd)}`;
}

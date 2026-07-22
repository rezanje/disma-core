export type ReturnSplit = { pass: number; buang: number; vendor: number };
export type SwapSplit = { pass: number; reject: number };

const EPS = 1e-6;
const bad = (n: number) => !Number.isFinite(n) || n < 0;

/** Three customer-return buckets: all non-negative and summing to the return total. */
export function isReturnSplitValid(split: ReturnSplit, total: number): boolean {
  const { pass, buang, vendor } = split;
  if ([pass, buang, vendor, total].some(bad)) return false;
  return Math.abs(pass + buang + vendor - total) < EPS;
}

/** Replacement QC split: non-negative and summing to the vendor-return qty. */
export function isSwapSplitValid(split: SwapSplit, total: number): boolean {
  const { pass, reject } = split;
  if ([pass, reject, total].some(bad)) return false;
  return Math.abs(pass + reject - total) < EPS;
}

// Daily market prices, harvested from what was already typed.
//
// The playbook asks for a daily price capture per supplier and SKU, and vendor_prices
// has existed for it since the table was created without ever being written to. The
// actual price paid per vendor per item is already entered when a shopping report is
// copied in, so no extra typing is needed — the rows fall out of the transcription.
//
// This is the data a purchase price ceiling would need later. Without collecting from
// today there is still nothing to calibrate against in three months.

export type PricedLine = {
  productId: string;
  vendorId?: string | null;
  actualUnitPrice?: number | null;
  qtyPurchased?: number | null;
  isChecked?: boolean;
};

export type MarketPriceRow = {
  vendorId: string;
  productId: string;
  price: number;
  validFrom: string;
  validTo: string;
  status: string;
  source: string;
};

export function buildMarketPriceRows(
  lines: PricedLine[],
  date: string,
  source: string,
): MarketPriceRow[] {
  const byKey = new Map<string, MarketPriceRow>();
  for (const l of lines || []) {
    if (l.isChecked === false) continue;
    if (!l.vendorId) continue;
    const price = Number(l.actualUnitPrice || 0);
    if (price <= 0) continue;
    if (Number(l.qtyPurchased || 0) <= 0) continue;
    // A market price is good for the day it was paid, nothing longer — produce prices
    // move daily and a stale ceiling is worse than none.
    byKey.set(`${l.vendorId}::${l.productId}`, {
      vendorId: l.vendorId, productId: l.productId, price,
      validFrom: date, validTo: date, status: 'actual', source,
    });
  }
  return [...byKey.values()];
}

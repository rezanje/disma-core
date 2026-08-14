// Which delivered lines will have a guessed cost. Pure — no store imports — so
// it stays trivially testable (cogs-source.check.ts).
//
// accounting.ts resolves COGS in this order: the purchase made for this very
// order, else any purchase of that product, else the product's base price. That
// last step is a guess, and nothing downstream says so — the journals balance,
// the profit report prints, and the number looks like every other number.
// Finance needs to know before approving, not after closing the month.

type PurchaseLine = { productId: string; salesOrderId?: string; actualUnitPrice: number };

/**
 * Product ids whose cost will fall back to the product's base price.
 * Mirrors the lookup in accounting.ts: a priced purchase for ANY order counts
 * as a real cost basis, so only lines with no priced purchase at all are listed.
 */
export function cogsFallbackItems(
  salesOrderId: string,
  items: { productId: string }[],
  purchaseItems: PurchaseLine[],
): string[] {
  return items
    .filter(item => {
      const priced = purchaseItems.filter(
        pi => pi.productId === item.productId && pi.actualUnitPrice > 0
      );
      // A zero price is not a cost — it falls back exactly like a missing row.
      return priced.length === 0;
    })
    .map(item => item.productId);
}

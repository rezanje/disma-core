import type { Purchase, PurchaseItem, OperationalExpense } from '@/types';

export interface SettlementFigures {
  /** True when money was handed over per-document under the pre-2026-07-21 model. */
  isLegacy: boolean;
  /** Legacy: advance handed over. New: budget approved on the PR. */
  baseline: number;
  shopSpent: number;
  opsSpent: number;
  /** Legacy only — cash the sourcer still owes back. Null under the new model. */
  expectedReturns: number | null;
  /** New model only — realised minus approved. Positive means overspend. Null when legacy. */
  variance: number | null;
}

/**
 * Which settlement model a purchase belongs to.
 *
 * Money used to be transferred per shopping document; it now sits in the Bank Jago
 * pool and sourcers draw from it into their own pockets.
 *
 * `budgetTransferDate` alone is NOT the marker, even though the comment here used to
 * say so. The Disbursement screen writes that field too, so every new document read as
 * legacy and every settlement took the legacy branch. Nothing broke only because a
 * second guard inside `recordReconciliationSettlement` notices the pocket already
 * booked the cash — remove that guard one day and HPP double-books silently. The old
 * per-document transfer never wrote `disbursedAt`; the single-door disbursement always
 * does. So legacy = budget moved, but not through that door.
 *
 * As of 26 Aug 2026 no purchase in the database matches. Once that is true of every
 * backup too, this function and every `isLegacy` branch can be deleted together.
 */
export const isLegacyAdvance = (
  purchase: Pick<Purchase, 'budgetTransferDate' | 'disbursedAt'>,
): boolean => Boolean(purchase.budgetTransferDate) && !purchase.disbursedAt;

export const computeSettlement = (
  purchase: Purchase,
  items: PurchaseItem[],
  opsExpenses: OperationalExpense[],
): SettlementFigures => {
  const isLegacy = isLegacyAdvance(purchase);
  const shopSpent = items.reduce(
    (sum, i) => sum + (i.actualUnitPrice || 0) * (i.qtyPurchased || 0), 0,
  );
  const opsSpent = opsExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  // The spare was part of the handover, so it only belongs in the legacy baseline.
  const baseline = isLegacy
    ? (purchase.budgetAmount || 0) + (purchase.operationalSpareAmount || 0)
    : (purchase.budgetAmount || 0);

  return {
    isLegacy,
    baseline,
    shopSpent,
    opsSpent,
    expectedReturns: isLegacy ? baseline - shopSpent - opsSpent : null,
    variance: isLegacy ? null : shopSpent + opsSpent - baseline,
  };
};

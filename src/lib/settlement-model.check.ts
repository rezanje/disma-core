/**
 * Runnable check for the settlement arithmetic. No test framework in this repo —
 * run directly:  npx tsx src/lib/settlement-model.check.ts
 */
import assert from 'node:assert/strict';
import { isLegacyAdvance, computeSettlement } from './settlement-model';
import type { Purchase, PurchaseItem, OperationalExpense } from '@/types';

const purchase = (over: Partial<Purchase>): Purchase =>
  ({ id: 'p1', date: '2026-07-21', status: 'Belanja', ...over } as Purchase);

const item = (price: number, qty: number): PurchaseItem =>
  ({ id: 'i', purchaseId: 'p1', actualUnitPrice: price, qtyPurchased: qty, isChecked: true } as PurchaseItem);

const ops = (amount: number): OperationalExpense =>
  ({ id: 'e', purchaseId: 'p1', amount } as OperationalExpense);

// Legacy: money was transferred, so we still ask for the balance back.
const legacy = purchase({
  budgetTransferDate: '2026-07-20T00:00:00.000Z',
  budgetAmount: 5_000_000,
  operationalSpareAmount: 200_000,
});
assert.equal(isLegacyAdvance(legacy), true);
const l = computeSettlement(legacy, [item(10_000, 400)], [ops(150_000)]);
assert.equal(l.isLegacy, true);
assert.equal(l.baseline, 5_200_000);
assert.equal(l.shopSpent, 4_000_000);
assert.equal(l.opsSpent, 150_000);
assert.equal(l.expectedReturns, 1_050_000);
assert.equal(l.variance, null);

// New model: no transfer, so we compare realised spend against the approved budget.
const fresh = purchase({ budgetAmount: 5_000_000 });
assert.equal(isLegacyAdvance(fresh), false);
const n = computeSettlement(fresh, [item(10_000, 400)], [ops(150_000)]);
assert.equal(n.isLegacy, false);
assert.equal(n.baseline, 5_000_000);
assert.equal(n.expectedReturns, null);
assert.equal(n.variance, -850_000); // under budget

// Overspend is a positive variance, never a payable.
const over = computeSettlement(purchase({ budgetAmount: 1_000_000 }), [item(10_000, 200)], []);
assert.equal(over.variance, 1_000_000);

// operationalSpareAmount is ignored under the new model even if stale data carries one.
const stale = computeSettlement(
  purchase({ budgetAmount: 1_000_000, operationalSpareAmount: 999_999 }), [], [],
);
assert.equal(stale.baseline, 1_000_000);

console.log('settlement-model: all checks passed');

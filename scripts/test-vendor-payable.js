#!/usr/bin/env node
// scripts/test-vendor-payable.js
// Standalone tests for src/lib/vendor-payable.ts helpers.
// Run: node scripts/test-vendor-payable.js

require('ts-node/register/transpile-only');
const {
  groupItemsByVendor,
  computeSettlementBreakdown,
  dueDateFor,
  agingBucket,
} = require('../src/lib/vendor-payable.ts');

let pass = 0;
let fail = 0;
function assert(label, cond) {
  if (cond) { pass++; console.log('  ✓', label); }
  else      { fail++; console.error('  ✗', label); }
}

// 1. groupItemsByVendor
console.log('--- groupItemsByVendor ---');
{
  const items = [
    { id: '1', vendorId: 'v1' },
    { id: '2', vendorId: 'v2' },
    { id: '3', vendorId: 'v1' },
    { id: '4', vendorId: '' },
    { id: '5' }
  ];
  const grouped = groupItemsByVendor(items);
  assert('grouped size is 3', grouped.size === 3);
  assert('v1 group size is 2', grouped.get('v1').length === 2);
  assert('v2 group size is 1', grouped.get('v2').length === 1);
  assert('empty group size is 2', grouped.get('').length === 2);
}

// 2. computeSettlementBreakdown
console.log('--- computeSettlementBreakdown ---');
{
  const items = [
    { id: '1', vendorId: 'v-tempo', actualUnitPrice: 1000, qtyPurchased: 5 }, // 5000 (tempo)
    { id: '2', vendorId: 'v-cash', actualUnitPrice: 2000, qtyPurchased: 2 },  // 4000 (cash)
    { id: '3', vendorId: 'v-tempo', actualUnitPrice: 1000, qtyPurchased: 3 }, // 3000 (tempo)
    { id: '4', vendorId: 'v-cash', actualUnitPrice: 1000, qtyPurchased: 1 },  // 1000 (cash)
  ];
  const vendors = [
    { id: 'v-tempo', isTempo: true },
    { id: 'v-cash', isTempo: false },
  ];

  // case 1: advance = 3000 (defisit should be cashTotal - advance = 5000 - 3000 = 2000)
  const res1 = computeSettlementBreakdown(items, vendors, 3000);
  assert('tempo total for v-tempo is 8000', res1.tempoTotals.get('v-tempo') === 8000);
  assert('cashTotal is 5000', res1.cashTotal === 5000);
  assert('defisit is 2000', res1.defisit === 2000);
  assert('remainder is 0', res1.advanceRemainder === 0);

  // case 2: advance = 6000 (defisit should be 0, remainder should be 1000)
  const res2 = computeSettlementBreakdown(items, vendors, 6000);
  assert('defisit is 0', res2.defisit === 0);
  assert('remainder is 1000', res2.advanceRemainder === 1000);
}

// 3. dueDateFor
console.log('--- dueDateFor ---');
{
  assert('2026-05-28 + 14d = 2026-06-11', dueDateFor('2026-05-28', 14) === '2026-06-11');
  assert('2026-05-28 + 0d = 2026-05-28', dueDateFor('2026-05-28', 0) === '2026-05-28');
  assert('2026-12-31 + 1d = 2027-01-01', dueDateFor('2026-12-31', 1) === '2027-01-01');
}

// 4. agingBucket
console.log('--- agingBucket ---');
{
  // today is 2026-05-28
  const today = '2026-05-28';
  assert('due 2026-05-28 is 0-7d', agingBucket('2026-05-28', today) === '0-7d');
  assert('due 2026-06-04 is 0-7d', agingBucket('2026-06-04', today) === '0-7d');
  assert('due 2026-06-05 is 8-14d', agingBucket('2026-06-05', today) === '8-14d');
  assert('due 2026-05-27 (overdue 1 day) is overdue 1-7', agingBucket('2026-05-27', today) === 'overdue 1-7');
  assert('due 2026-05-21 (overdue 7 days) is overdue 1-7', agingBucket('2026-05-21', today) === 'overdue 1-7');
  assert('due 2026-05-20 (overdue 8 days) is overdue >7', agingBucket('2026-05-20', today) === 'overdue >7');
  assert('due 2026-04-28 (overdue 30 days) is overdue >7', agingBucket('2026-04-28', today) === 'overdue >7');
  assert('due 2026-04-27 (overdue 31 days) is over 30', agingBucket('2026-04-27', today) === 'over 30');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

/**
 * Runnable check for the client-deletion guard. No test framework in this repo —
 * run directly:  npx tsx src/lib/client-delete.check.ts
 */
import assert from 'node:assert/strict';
import { clientDeletionBlockers, canDeleteClient, describeBlockers } from './client-delete';

const empty = { salesOrders: [], invoices: [], tukarFakturs: [], clientPrices: [] };

// A client nobody has traded with can go. This is the whole point: a typo'd
// entry should be removable.
assert.deepEqual(clientDeletionBlockers('c1', empty), []);
assert.equal(canDeleteClient('c1', empty), true);

// A price list is not history — it is a starting point that gets seeded on
// creation, so it must not block, and it goes with the client.
assert.deepEqual(
  clientDeletionBlockers('c1', { ...empty, clientPrices: [{ clientId: 'c1' }, { clientId: 'c2' }] }),
  []
);

// Anything the client actually did blocks the delete. Removing them would orphan
// money: an invoice with no client cannot be chased, a PO with no client cannot
// be delivered.
assert.deepEqual(
  clientDeletionBlockers('c1', { ...empty, salesOrders: [{ clientId: 'c1' }, { clientId: 'c1' }] }),
  [{ kind: 'salesOrders', count: 2 }]
);
assert.deepEqual(
  clientDeletionBlockers('c1', { ...empty, invoices: [{ clientId: 'c1' }] }),
  [{ kind: 'invoices', count: 1 }]
);
assert.deepEqual(
  clientDeletionBlockers('c1', { ...empty, tukarFakturs: [{ clientId: 'c1' }] }),
  [{ kind: 'tukarFakturs', count: 1 }]
);
assert.equal(canDeleteClient('c1', { ...empty, invoices: [{ clientId: 'c1' }] }), false);

// Another client's records never block this one.
assert.deepEqual(
  clientDeletionBlockers('c1', { ...empty, salesOrders: [{ clientId: 'c2' }], invoices: [{ clientId: 'c2' }] }),
  []
);

// Several kinds at once are all reported, so the message names everything.
const many = clientDeletionBlockers('c1', {
  ...empty,
  salesOrders: [{ clientId: 'c1' }, { clientId: 'c1' }, { clientId: 'c1' }],
  invoices: [{ clientId: 'c1' }],
  tukarFakturs: [{ clientId: 'c1' }, { clientId: 'c1' }],
});
assert.deepEqual(many, [
  { kind: 'salesOrders', count: 3 },
  { kind: 'invoices', count: 1 },
  { kind: 'tukarFakturs', count: 2 },
]);
assert.equal(describeBlockers(many), '3 PO, 1 tagihan, 2 tukar faktur');
assert.equal(describeBlockers([{ kind: 'invoices', count: 1 }]), '1 tagihan');
assert.equal(describeBlockers([]), '');

console.log('client-delete: all checks passed');

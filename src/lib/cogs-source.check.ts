/**
 * Runnable check for the COGS source detector. No test framework in this repo —
 * run directly:  npx tsx src/lib/cogs-source.check.ts
 *
 * When a delivered item has no purchase record, accounting falls back to the
 * product's base price for COGS. The books still balance and the profit report
 * still prints, so nothing on screen says the cost was a guess. This tells
 * Finance which lines are guesses BEFORE they approve the delivery.
 */
import assert from 'node:assert/strict';
import { cogsFallbackItems } from './cogs-source';

const purchaseItems = [
  { productId: 'p1', salesOrderId: 'so1', actualUnitPrice: 12_000 },
  { productId: 'p2', salesOrderId: 'so1', actualUnitPrice: 0 },
  { productId: 'p3', salesOrderId: 'so9', actualUnitPrice: 8_000 },
];

// A line bought for this very order has a real cost — no warning.
assert.deepEqual(cogsFallbackItems('so1', [{ productId: 'p1' }], purchaseItems), []);

// Bought, but the price was never filled in. A zero cost is not a cost, so it
// falls back the same way a missing row does.
assert.deepEqual(cogsFallbackItems('so1', [{ productId: 'p2' }], purchaseItems), ['p2']);

// Never bought at all for any order.
assert.deepEqual(cogsFallbackItems('so1', [{ productId: 'p4' }], purchaseItems), ['p4']);

// Bought for a DIFFERENT order: accounting accepts that as the cost basis, so
// this is not a fallback and must not be warned about.
assert.deepEqual(cogsFallbackItems('so1', [{ productId: 'p3' }], purchaseItems), []);

// Several lines at once, reported in the order given.
assert.deepEqual(
  cogsFallbackItems('so1', [{ productId: 'p1' }, { productId: 'p4' }, { productId: 'p2' }], purchaseItems),
  ['p4', 'p2']
);

// Nothing to deliver, nothing to warn about.
assert.deepEqual(cogsFallbackItems('so1', [], purchaseItems), []);
assert.deepEqual(cogsFallbackItems('so1', [{ productId: 'p1' }], []), ['p1']);

console.log('cogs-source: all checks passed');

// --- costBasisFor: dasar harga pokok, ronde terbaru yang menang ---
import { costBasisFor } from './cogs-source';

const purchases = [
  { id: 'doc-r1', date: '2026-08-26T01:00:00Z' },
  { id: 'doc-r2', date: '2026-08-27T01:00:00Z' },
];
// Sengaja diurutkan terbalik: larik dari server terurut id (uuid), jadi urutannya acak.
const lines = [
  { id: 'r2', purchaseId: 'doc-r2', productId: 'P', salesOrderId: 'SO-1', actualUnitPrice: 30000 },
  { id: 'r1', purchaseId: 'doc-r1', productId: 'P', salesOrderId: 'SO-1', actualUnitPrice: 29000 },
  { id: 'lain', purchaseId: 'doc-r1', productId: 'P', salesOrderId: 'SO-9', actualUnitPrice: 25000 },
  { id: 'kosong', purchaseId: 'doc-r2', productId: 'P', salesOrderId: 'SO-1', actualUnitPrice: 0 },
];

// Ronde susulan memakai harga ronde susulan, bukan harga ronde pertama.
assert.strictEqual(costBasisFor('SO-1', 'P', lines, purchases)?.id, 'r2');
// Urutan larik tidak boleh menentukan hasilnya.
assert.strictEqual(costBasisFor('SO-1', 'P', [...lines].reverse(), purchases)?.id, 'r2');
// Tanpa belanja untuk pesanan itu: jatuh ke belanja produk yang sama, tetap yang terbaru.
assert.strictEqual(costBasisFor('SO-KOSONG', 'P', lines, purchases)?.id, 'r2');
// Harga nol dilewati seperti baris yang tidak ada.
assert.strictEqual(costBasisFor('SO-1', 'P', [lines[3]], purchases), null);
// Produk yang tidak pernah dibeli tidak punya dasar harga.
assert.strictEqual(costBasisFor('SO-1', 'LAIN', lines, purchases), null);
// Dokumen tanpa tanggal tidak boleh melempar; dia cuma kalah dari yang bertanggal.
assert.strictEqual(
  costBasisFor('SO-1', 'P', lines, [{ id: 'doc-r1', date: '2026-08-26T01:00:00Z' }, { id: 'doc-r2' }])?.id,
  'r1',
);

console.log('cogs-source.check: costBasisFor assertions passed');

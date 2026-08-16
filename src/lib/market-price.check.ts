import assert from 'node:assert/strict';
import { buildMarketPriceRows } from './market-price';

const D = '2026-08-16';
const rows = buildMarketPriceRows([
  { productId: 'P1', vendorId: 'V1', actualUnitPrice: 30000, qtyPurchased: 10, isChecked: true },
  { productId: 'P2', vendorId: 'V1', actualUnitPrice: 12000, qtyPurchased: 5, isChecked: true },
  { productId: 'P3', vendorId: 'V2', actualUnitPrice: 0, qtyPurchased: 5, isChecked: true },     // harga 0 dilewati
  { productId: 'P4', vendorId: null, actualUnitPrice: 9000, qtyPurchased: 5, isChecked: true },  // tanpa vendor dilewati
  { productId: 'P5', vendorId: 'V2', actualUnitPrice: 8000, qtyPurchased: 0, isChecked: true },  // tidak jadi dibeli
  { productId: 'P6', vendorId: 'V2', actualUnitPrice: 7000, qtyPurchased: 5, isChecked: false }, // tidak dicentang
], D, 'salin-belanja');

assert.equal(rows.length, 2);
assert.deepEqual(rows.map(r => r.productId), ['P1', 'P2']);
assert.equal(rows[0].price, 30000);
assert.equal(rows[0].vendorId, 'V1');
assert.equal(rows[0].validFrom, D);
assert.equal(rows[0].validTo, D);      // harga pasar berlaku sehari
assert.equal(rows[0].status, 'actual');
assert.equal(rows[0].source, 'salin-belanja');

// baris kembar vendor+produk di hari yang sama: ambil yang terakhir, jangan dobel
const dup = buildMarketPriceRows([
  { productId: 'P1', vendorId: 'V1', actualUnitPrice: 30000, qtyPurchased: 5, isChecked: true },
  { productId: 'P1', vendorId: 'V1', actualUnitPrice: 31000, qtyPurchased: 5, isChecked: true },
], D, 'salin-belanja');
assert.equal(dup.length, 1);
assert.equal(dup[0].price, 31000);

assert.deepEqual(buildMarketPriceRows([], D, 'x'), []);

console.log('market-price: OK');

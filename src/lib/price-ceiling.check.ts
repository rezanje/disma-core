import assert from 'node:assert/strict';
import {
  ceilingFor, ceilingByLine, isOverCeiling, overByPct, linesNeedingReason,
  DEFAULT_MIN_MARGIN_PCT,
} from './price-ceiling';

// batas = harga jual dibalik pakai margin minimum
assert.equal(ceilingFor(12000, 20), 10000);
assert.equal(ceilingFor(12000, 0), 12000);
assert.equal(ceilingFor(0, 20), 0);      // harga jual tidak diketahui -> tidak ada batas
assert.equal(ceilingFor(12000, -5), 0);  // setelan ngawur -> tidak ada batas, bukan batas longgar
assert.equal(DEFAULT_MIN_MARGIN_PCT, 20);

const sold = [
  { salesOrderId: 'SO1', productId: 'P1', unitPrice: 12000 },
  { salesOrderId: 'SO2', productId: 'P1', unitPrice: 18000 },
  { salesOrderId: 'SO2', productId: 'P2', unitPrice: 6000 },
];

const lines = [
  { id: 'L1', productId: 'P1', salesOrderId: 'SO1', actualUnitPrice: 11000, isChecked: true },
  { id: 'L2', productId: 'P1', salesOrderId: 'SO2', actualUnitPrice: 11000, isChecked: true },
  { id: 'L3', productId: 'P1', actualUnitPrice: 11000, isChecked: true },  // gabungan, tanpa SO
  { id: 'L4', productId: 'P9', actualUnitPrice: 11000, isChecked: true },  // tidak pernah dijual
];
const c = ceilingByLine(lines, sold, 20);
assert.equal(c.get('L1'), 10000);
assert.equal(c.get('L2'), 15000);
assert.equal(c.get('L3'), 10000); // pesanan termurah yang menentukan
assert.equal(c.get('L4'), 0);

assert.equal(isOverCeiling(11000, 10000), true);
assert.equal(isOverCeiling(10000, 10000), false); // pas batas masih boleh
assert.equal(isOverCeiling(99000, 0), false);     // tanpa batas tidak pernah dianggap lewat
assert.equal(overByPct(11000, 10000), 10);
assert.equal(overByPct(9000, 10000), 0);

// L1 dan L3 lewat batas; L2 aman; L4 tidak punya batas
assert.deepEqual(linesNeedingReason(lines, c), ['L1', 'L3']);

// alasan sudah ditulis -> lolos
const withReason = lines.map(l => l.id === 'L1' ? { ...l, overCeilingReason: 'stok pasar kosong' } : l);
assert.deepEqual(linesNeedingReason(withReason, c), ['L3']);

// spasi doang bukan alasan
const blank = lines.map(l => l.id === 'L1' ? { ...l, overCeilingReason: '   ' } : l);
assert.deepEqual(linesNeedingReason(blank, c), ['L1', 'L3']);

// baris yang tidak jadi dibeli tidak menahan laporan
const unchecked = lines.map(l => ({ ...l, isChecked: false }));
assert.deepEqual(linesNeedingReason(unchecked, c), []);

assert.deepEqual(linesNeedingReason([], new Map()), []);

console.log('price-ceiling: OK');

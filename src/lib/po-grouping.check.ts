import assert from 'node:assert/strict';
import { dayKey, dayLabel, groupOrdersByDeliveryDate } from './po-grouping';

assert.equal(dayKey('2026-08-25T00:00:00.000Z'), '2026-08-25');
assert.equal(dayKey('2026-08-25'), '2026-08-25');
assert.equal(dayKey(null), '');
assert.equal(dayKey('bukan tanggal'), '');

assert.equal(dayLabel('2026-08-24'), 'Senin, 24 Agu 2026');
assert.equal(dayLabel(''), 'Tanpa tanggal kirim');

const ORDERS = [
  { id: 'a', targetDeliveryDate: '2026-08-26' },
  { id: 'b', targetDeliveryDate: '2026-08-24' },
  { id: 'c', targetDeliveryDate: '2026-08-26' },
  { id: 'd', targetDeliveryDate: null },
  { id: 'e', targetDeliveryDate: '2026-08-24' },
];

const grup = groupOrdersByDeliveryDate(ORDERS);
// paling dekat di atas, tanpa tanggal paling bawah
assert.deepEqual(grup.map(g => g.tanggal), ['2026-08-24', '2026-08-26', '']);
assert.deepEqual(grup[0].orders.map(o => o.id), ['b', 'e']);
assert.deepEqual(grup[1].orders.map(o => o.id), ['a', 'c']);
assert.deepEqual(grup[2].orders.map(o => o.id), ['d']);
assert.equal(grup[2].label, 'Tanpa tanggal kirim');

// tidak ada pesanan yang hilang atau dobel
assert.deepEqual(grup.flatMap(g => g.orders.map(o => o.id)).sort(), ['a', 'b', 'c', 'd', 'e']);

assert.deepEqual(groupOrdersByDeliveryDate([]), []);
// jam berbeda, hari sama -> tetap satu kelompok
assert.equal(
  groupOrdersByDeliveryDate([
    { id: 'x', targetDeliveryDate: '2026-08-24T01:00:00' },
    { id: 'y', targetDeliveryDate: '2026-08-24T23:30:00' },
  ]).length,
  1,
);

console.log('po-grouping: OK');

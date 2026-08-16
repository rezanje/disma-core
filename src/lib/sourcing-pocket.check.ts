import assert from 'node:assert/strict';
import { pocketOwners, resolvePocket } from './sourcing-pocket';

const BANKS = [
  { id: 'jago', purpose: 'sourcing', ownerUserId: null },
  { id: 'pocket-hilman', purpose: 'sourcing_pocket', ownerUserId: 'u-hilman' },
  { id: 'pocket-bagja', purpose: 'sourcing_pocket', ownerUserId: 'u-bagja' },
  { id: 'bca', purpose: 'umum', ownerUserId: null },
];

// hanya rekening kantong yang punya pemilik yang bisa dipilih
assert.deepEqual(pocketOwners(BANKS).map(b => b.id), ['pocket-hilman', 'pocket-bagja']);

// orang sourcing sendiri: kantongnya sendiri, tanpa memilih apa pun
assert.equal(resolvePocket(BANKS, 'u-hilman')?.id, 'pocket-hilman');

// penyalin (tidak punya kantong) memilih atas nama siapa
assert.equal(resolvePocket(BANKS, 'u-sifa', 'u-hilman')?.id, 'pocket-hilman');

// penyalin tanpa memilih: tidak ada kantong — pemanggil wajib menolak laporannya
assert.equal(resolvePocket(BANKS, 'u-sifa'), null);

// pilihan atas nama menang atas kantong sendiri: kalau orang sourcing menyalin
// belanja rekannya, uangnya harus keluar dari kantong rekannya
assert.equal(resolvePocket(BANKS, 'u-hilman', 'u-bagja')?.id, 'pocket-bagja');

// atas nama orang yang tidak punya kantong tetap null, bukan diam-diam jatuh ke sendiri
assert.equal(resolvePocket(BANKS, 'u-hilman', 'u-entah'), null);

assert.equal(resolvePocket([], 'u-hilman'), null);
assert.equal(resolvePocket(BANKS, null), null);

console.log('sourcing-pocket: OK');

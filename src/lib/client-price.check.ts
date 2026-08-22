import assert from 'node:assert/strict';
import { clientUnitPrice } from './client-price';

const margins = { 'Tier 1': 30, 'Tier 2': 25, 'Tier 3': 20, 'Tier 4': 10, 'Tier 5': 15 };

const lengkap = { sellingPrice: 15000, tier1Price: 13000, tier2Price: 12500, tier3Price: 12000 };
const polos = { sellingPrice: 15000 };

// harga tier yang sudah tertulis dipakai apa adanya, bukan dihitung ulang
assert.equal(clientUnitPrice(lengkap, 10000, margins, { tier: 'Tier 1', agreedPrice: 0 }), 13000);
assert.equal(clientUnitPrice(lengkap, 10000, margins, { tier: 'Tier 3', agreedPrice: 0 }), 12000);

// belum ada harga tier tertulis -> hitung dari HPP + margin tier
assert.equal(clientUnitPrice(polos, 10000, margins, { tier: 'Tier 1', agreedPrice: 0 }), 13000);
assert.equal(clientUnitPrice(polos, 10000, margins, { tier: 'Tier 4', agreedPrice: 0 }), 11000);

// kesepakatan khusus menang atas rumus apa pun
assert.equal(clientUnitPrice(lengkap, 10000, margins, { tier: 'Custom', agreedPrice: 9500 }), 9500);
assert.equal(clientUnitPrice(lengkap, 99999, margins, { tier: 'Custom', agreedPrice: 9500 }), 9500);

// tanpa kesepakatan: pakai tier bawaan klien
assert.equal(clientUnitPrice(lengkap, 10000, margins, null, 'Tier 2'), 12500);
assert.equal(clientUnitPrice(polos, 10000, margins, null, 'Tier 2'), 12500);

// tanpa kesepakatan dan tanpa tier: harga jual umum
assert.equal(clientUnitPrice(lengkap, 10000, margins, null, null), 15000);
assert.equal(clientUnitPrice(lengkap, 10000, margins, { tier: 'Standard', agreedPrice: 0 }), 15000);
assert.equal(clientUnitPrice(lengkap, 10000, margins, null, 'Standard'), 15000);

// tier klien mengalahkan tier bawaan
assert.equal(clientUnitPrice(lengkap, 10000, margins, { tier: 'Tier 3', agreedPrice: 0 }, 'Tier 1'), 12000);

// margin tier tidak dikenal -> jangan jual seharga modal; jatuh ke harga jual umum
assert.equal(clientUnitPrice(polos, 0, margins, { tier: 'Tier 5', agreedPrice: 0 }), 15000);

console.log('client-price: OK');

import assert from 'node:assert/strict';
import { selectableVendors } from './vendor-status';

const V = [
  { id: 'a', status: 'approved' as const },
  { id: 'b', status: 'suspended' as const },
  { id: 'c', status: 'blocked' as const },
  { id: 'd' },                                  // belum diisi = dianggap approved
];
const ids = (list: { id: string }[]) => list.map(v => v.id);

// blocked disembunyikan; suspended masih boleh dipilih (peringatan, bukan larangan)
assert.deepEqual(ids(selectableVendors(V, undefined, v => v.id)), ['a', 'b', 'd']);

// vendor yang SUDAH terpasang di baris tetap muncul walau kini blocked — kalau tidak,
// membuka baris lama diam-diam mengosongkan vendornya dan riwayatnya hilang.
assert.deepEqual(ids(selectableVendors(V, 'c', v => v.id)), ['a', 'b', 'c', 'd']);

// tanpa idOf, dipakai properti .id
assert.deepEqual(ids(selectableVendors(V)), ['a', 'b', 'd']);

// daftar kosong tidak meledak
assert.deepEqual(selectableVendors([]), []);

console.log('vendor-status: OK');

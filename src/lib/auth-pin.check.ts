import assert from 'node:assert/strict';
import { findActiveUserByPin } from './auth-pin';

const U = [
  { pin: '1111', name: 'aktif tanpa penanda' },
  { pin: '2222', name: 'diparkir', isActive: false },
  { pin: '3333', name: 'aktif eksplisit', isActive: true },
];

assert.equal(findActiveUserByPin(U, '1111')?.name, 'aktif tanpa penanda');
assert.equal(findActiveUserByPin(U, '3333')?.name, 'aktif eksplisit');

// akun yang diparkir ditolak — inti dari tugas ini
assert.equal(findActiveUserByPin(U, '2222'), null);

// PIN tidak dikenal, kosong, dan daftar kosong
assert.equal(findActiveUserByPin(U, '9999'), null);
assert.equal(findActiveUserByPin(U, ''), null);
assert.equal(findActiveUserByPin([], '1111'), null);

// PIN kosong di daftar user tidak boleh cocok dengan input kosong
assert.equal(findActiveUserByPin([{ pin: '' }], ''), null);

console.log('auth-pin: OK');

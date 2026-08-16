import assert from 'node:assert/strict';
import { creditLimit, validateCreditNote, applyCreditNote, buildCreditNoteNumber } from './credit-note';

const BELUM = { id: 'a', totalAmount: 1_000_000, amountPaid: 0, status: 'Unpaid' };
const SEBAGIAN = { id: 'b', totalAmount: 1_000_000, amountPaid: 400_000, status: 'Partial' };
const LUNAS = { id: 'c', totalAmount: 1_000_000, amountPaid: 1_000_000, status: 'Paid' };

// --- batas koreksi = sisa tagihan, bukan nilai invoice ---
assert.equal(creditLimit(BELUM), 1_000_000);
assert.equal(creditLimit(SEBAGIAN), 600_000);
assert.equal(creditLimit(LUNAS), 0);
assert.equal(creditLimit({ id: 'd', totalAmount: 100, amountPaid: 500 }), 0, 'lebih bayar tidak jadi batas negatif');

// --- penolakan ---
assert.match(validateCreditNote(null, 1000, 'salah harga') as string, /tidak ditemukan/i);
assert.match(validateCreditNote(BELUM, 0, 'salah harga') as string, /lebih dari nol/i);
assert.match(validateCreditNote(BELUM, -5000, 'salah harga') as string, /lebih dari nol/i);
assert.match(validateCreditNote(LUNAS, 1000, 'salah harga') as string, /sudah lunas/i);
assert.match(validateCreditNote(SEBAGIAN, 700_000, 'salah harga') as string, /melebihi sisa tagihan/i);
assert.match(validateCreditNote(BELUM, 1000, '') as string, /alasan/i);
assert.match(validateCreditNote(BELUM, 1000, '  -  ') as string, /alasan/i, 'tanda hubung bukan alasan');
assert.equal(validateCreditNote(BELUM, 1000, 'salah harga'), null);
// tepat sebesar sisa tagihan boleh
assert.equal(validateCreditNote(SEBAGIAN, 600_000, 'klien retur semua'), null);

// --- dampak ke invoice ---
assert.deepEqual(applyCreditNote(BELUM, 250_000), { totalAmount: 750_000, status: 'Unpaid' });
assert.deepEqual(applyCreditNote(SEBAGIAN, 200_000), { totalAmount: 800_000, status: 'Partial' });
// koreksi membuat yang sudah dibayar menutup seluruh sisa → lunas
assert.deepEqual(applyCreditNote(SEBAGIAN, 600_000), { totalAmount: 400_000, status: 'Paid' });
// dikoreksi habis → batal, bukan "lunas Rp0"
assert.deepEqual(applyCreditNote(BELUM, 1_000_000), { totalAmount: 0, status: 'Cancelled' });

// --- penomoran urut per bulan ---
const AGU = new Date(2026, 7, 16);
assert.equal(buildCreditNoteNumber(AGU, []), 'CN-202608-001');
assert.equal(buildCreditNoteNumber(AGU, ['CN-202608-001']), 'CN-202608-002');
// nomor bulan lain tidak ikut menaikkan urutan
assert.equal(buildCreditNoteNumber(AGU, ['CN-202607-009']), 'CN-202608-001');
// lompatan nomor tetap lanjut dari yang tertinggi, tidak mengisi lubang
assert.equal(buildCreditNoteNumber(AGU, ['CN-202608-001', 'CN-202608-007']), 'CN-202608-008');
// data sampah tidak bikin NaN
assert.equal(buildCreditNoteNumber(AGU, ['bukan-nomor', '', 'CN-202608-abc']), 'CN-202608-001');

console.log('credit-note: OK');

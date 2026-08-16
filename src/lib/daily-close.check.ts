import assert from 'node:assert/strict';
import { grossProfit, netProfit, variances, canClose, type LedgerLine } from './daily-close';

const D = '2026-08-16';
const LAIN = '2026-08-15';

const L: LedgerLine[] = [
  // hari ini
  { day: D, accountCode: '4-1000', debit: 0, credit: 9_000_000 },   // omzet
  { day: D, accountCode: '5-1000', debit: 6_000_000, credit: 0 },   // HPP
  { day: D, accountCode: '1-3000', debit: 7_000_000, credit: 0 },   // barang masuk
  { day: D, accountCode: '2-1100', debit: 7_000_000, credit: 0 },   // uang untuk barang
  // hari lain — tidak boleh ikut terhitung
  { day: LAIN, accountCode: '4-1000', debit: 0, credit: 99_000_000 },
  { day: LAIN, accountCode: '5-1000', debit: 50_000_000, credit: 0 },
];

// --- Lapis 1 ---
assert.deepEqual(grossProfit(L, D), { revenue: 9_000_000, cogs: 6_000_000, gross: 3_000_000 });
// hari tanpa transaksi tidak meledak
assert.deepEqual(grossProfit(L, '2026-01-01'), { revenue: 0, cogs: 0, gross: 0 });
// retur menurunkan omzet: debit di akun pendapatan ikut dihitung
assert.equal(grossProfit([...L, { day: D, accountCode: '4-1000', debit: 1_000_000, credit: 0 }], D).revenue, 8_000_000);

// --- Lapis 2 ---
const EXP = [
  { day: D, amount: 200_000, approved: true },
  { day: D, amount: 500_000, approved: false },   // belum diaudit, belum dihitung
  { day: LAIN, amount: 900_000, approved: true }, // hari lain
];
const tanpaSetelan = netProfit(L, D, EXP, null);
assert.equal(tanpaSetelan.ops, 200_000);
assert.equal(tanpaSetelan.fixedDaily, null);
assert.equal(tanpaSetelan.net, null, 'tanpa setelan biaya tetap, laba bersih harus null — bukan nol');

const denganSetelan = netProfit(L, D, EXP, { monthlyTotal: 26_000_000, workingDays: 26 });
assert.equal(denganSetelan.fixedDaily, 1_000_000);
assert.equal(denganSetelan.net, 3_000_000 - 200_000 - 1_000_000);
// pembagi nol tidak bikin Infinity
assert.equal(netProfit(L, D, EXP, { monthlyTotal: 26_000_000, workingDays: 0 }).net, null);

// --- Selisih ---
const POCKETS = [{ day: D, ditarik: 5_000_000, belanja: 4_000_000, disetor: 1_000_000 }];

// semua cocok: tidak ada temuan
assert.deepEqual(variances(L, D, POCKETS, 3, 3), []);

// kantong kurang setor
const kurang = variances(L, D, [{ day: D, ditarik: 5_000_000, belanja: 4_000_000, disetor: 700_000 }], 3, 3);
assert.equal(kurang.length, 1);
assert.equal(kurang[0].key, 'kantong');
assert.equal(kurang[0].amount, 300_000);

// uang keluar untuk barang lebih besar dari barang yang masuk
const kurangBarang = variances(
  [...L.filter(l => !(l.day === D && l.accountCode === '1-3000')),
   { day: D, accountCode: '1-3000', debit: 6_500_000, credit: 0 }],
  D, POCKETS, 3, 3);
assert.equal(kurangBarang.length, 1);
assert.equal(kurangBarang[0].key, 'belanja-vs-barang');
assert.equal(kurangBarang[0].amount, 500_000);

// kiriman lebih banyak dari tagihan
const belumTagih = variances(L, D, POCKETS, 5, 3);
assert.equal(belumTagih.length, 1);
assert.equal(belumTagih[0].key, 'kirim-vs-tagih');
assert.equal(belumTagih[0].amount, 2);

// beberapa selisih sekaligus
assert.equal(variances(L, D, [{ day: D, ditarik: 5_000_000, belanja: 4_000_000, disetor: 0 }], 5, 3).length, 2);

// pembulatan seribu rupiah ke bawah tidak dilaporkan sebagai temuan
assert.deepEqual(variances(L, D, [{ day: D, ditarik: 5_000_000, belanja: 4_000_000, disetor: 999_999.5 }], 3, 3), []);

// --- Gerbang penutupan ---
const VS = variances(L, D, POCKETS, 5, 3);
assert.equal(canClose(VS, {}), false);
assert.equal(canClose(VS, { 'kirim-vs-tagih': '' }), false);
assert.equal(canClose(VS, { 'kirim-vs-tagih': '  ' }), false, 'spasi bukan penjelasan');
assert.equal(canClose(VS, { 'kirim-vs-tagih': '-' }), false, 'satu strip bukan penjelasan');
assert.equal(canClose(VS, { 'kirim-vs-tagih': 'PO Anthem belum diaudit' }), true);
// tidak ada selisih sama sekali → boleh langsung ditutup
assert.equal(canClose([], {}), true);

console.log('daily-close: OK');

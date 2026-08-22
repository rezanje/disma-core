import assert from 'node:assert/strict';
import { moneyStage, disbursementProblem, disbursementGap } from './shopping-money';

// --- tahapan uang ---
assert.equal(moneyStage({ status: 'Menunggu Rencana' }), 'menunggu-rencana');
assert.equal(moneyStage({ status: 'Pending', budgetAmount: 500000 }), 'siap-cair');
assert.equal(moneyStage({ status: 'Pending', budgetAmount: 500000, disbursedAmount: 500000, disbursedAt: '2026-08-22' }), 'sudah-cair');
// dokumen yang sudah dibelanjakan tetap terhitung sudah cair
assert.equal(moneyStage({ status: 'Selesai', disbursedAt: '2026-08-22' }), 'sudah-cair');

const POCKET = 'bank-kantong';
const POOL = 'bank-jago';

// --- pas rencana: langsung boleh ---
assert.equal(disbursementProblem(500000, 500000, '', POCKET, POOL), null);

// --- beda rencana tanpa alasan: ditahan, dua arah ---
assert.match(disbursementProblem(600000, 500000, '', POCKET, POOL) || '', /lebih/);
assert.match(disbursementProblem(400000, 500000, '', POCKET, POOL) || '', /kurang/);
assert.match(disbursementProblem(600000, 500000, '   ', POCKET, POOL) || '', /lebih/);

// --- beda rencana dengan alasan: boleh ---
assert.equal(disbursementProblem(600000, 500000, 'harga cabe naik', POCKET, POOL), null);

// --- syarat dasar ---
assert.match(disbursementProblem(0, 500000, '', POCKET, POOL) || '', /Nominalnya belum diisi/);
assert.match(disbursementProblem(-1, 500000, '', POCKET, POOL) || '', /Nominalnya belum diisi/);
assert.match(disbursementProblem(500000, 500000, '', null, POOL) || '', /kantong siapa/);
assert.match(disbursementProblem(500000, 500000, '', POCKET, null) || '', /rekening mana/);
assert.match(disbursementProblem(500000, 500000, '', POCKET, POCKET) || '', /tidak boleh sama/);

// rencana Rp0 (semuanya tempo/transfer) tetap butuh alasan kalau tetap dicairkan
assert.match(disbursementProblem(100000, 0, '', POCKET, POOL) || '', /lebih/);
assert.equal(disbursementProblem(100000, 0, 'buat jaga-jaga di pasar', POCKET, POOL), null);

// --- selisih ---
assert.equal(disbursementGap({ status: 'Pending', budgetAmount: 500000, disbursedAmount: 600000, disbursedAt: 'x' }), 100000);
assert.equal(disbursementGap({ status: 'Pending', budgetAmount: 500000, disbursedAmount: 400000, disbursedAt: 'x' }), -100000);
// belum cair: tidak ada selisih untuk dilaporkan
assert.equal(disbursementGap({ status: 'Pending', budgetAmount: 500000 }), 0);

console.log('shopping-money: OK');

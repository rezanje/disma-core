import assert from 'node:assert/strict';
import { buildIssueNumber, defaultDueDate, overdueIssues, unownedIssues } from './delivery-issue';

const HARI = new Date(2026, 7, 16); // 16 Agustus 2026

// --- penomoran per hari ---
assert.equal(buildIssueNumber(HARI, []), 'DI-260816-001');
assert.equal(buildIssueNumber(HARI, ['DI-260816-001']), 'DI-260816-002');
// nomor hari lain tidak menaikkan urutan hari ini
assert.equal(buildIssueNumber(HARI, ['DI-260815-009']), 'DI-260816-001');
// lompatan lanjut dari tertinggi, tidak mengisi lubang
assert.equal(buildIssueNumber(HARI, ['DI-260816-001', 'DI-260816-005']), 'DI-260816-006');
// data sampah tidak bikin NaN
assert.equal(buildIssueNumber(HARI, ['', 'bukan', 'DI-260816-xx']), 'DI-260816-001');

// --- tenggat ---
assert.equal(defaultDueDate(HARI), '2026-08-18');
assert.equal(defaultDueDate(HARI, 0), '2026-08-16');
// lewat akhir bulan tetap benar
assert.equal(defaultDueDate(new Date(2026, 7, 30)), '2026-09-01');

// --- yang lewat tenggat ---
const ROWS = [
  { id: 'a', status: 'Pending QC', dueDate: '2026-08-15', ownerUserId: 'u1' }, // lewat
  { id: 'b', status: 'Pending QC', dueDate: '2026-08-16', ownerUserId: 'u1' }, // jatuh tempo hari ini, belum lewat
  { id: 'c', status: 'Pending QC', dueDate: '2026-08-20', ownerUserId: 'u1' },
  { id: 'd', status: 'Processed', dueDate: '2026-08-01', ownerUserId: 'u1' },  // sudah selesai
  { id: 'e', status: 'Pending QC', dueDate: null, ownerUserId: null },         // tanpa tenggat & tanpa pemilik
];
assert.deepEqual(overdueIssues(ROWS, '2026-08-16').map(r => r.id), ['a']);
assert.deepEqual(overdueIssues(ROWS, '2026-08-21').map(r => r.id), ['a', 'b', 'c']);
assert.deepEqual(overdueIssues([], '2026-08-16'), []);

// --- tanpa pemilik ---
assert.deepEqual(unownedIssues(ROWS).map(r => r.id), ['e']);
// yang sudah selesai tidak dihitung walau tanpa pemilik
assert.deepEqual(unownedIssues([{ id: 'z', status: 'Processed' }]), []);

console.log('delivery-issue: OK');

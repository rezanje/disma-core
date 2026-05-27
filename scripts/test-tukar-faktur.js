#!/usr/bin/env node
// scripts/test-tukar-faktur.js
// Standalone tests for src/lib/tukar-faktur.ts helpers.
// Run: node scripts/test-tukar-faktur.js

require('ts-node/register/transpile-only');
const {
  mondayOf,
  sundayOf,
  lastDayOfMonth,
  tfPeriodFor,
  getISOWeek,
  generateTfNumber,
} = require('../src/lib/tukar-faktur.ts');

let pass = 0;
let fail = 0;
function assert(label, cond) {
  if (cond) { pass++; console.log('  ✓', label); }
  else      { fail++; console.error('  ✗', label); }
}
function eqDate(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

console.log('mondayOf / sundayOf');
{
  const wed = new Date(2026, 4, 6); // Wed 6 May 2026
  assert('monday of Wed 6 May = Mon 4 May', eqDate(mondayOf(wed), new Date(2026, 4, 4)));
  assert('sunday of Wed 6 May = Sun 10 May', eqDate(sundayOf(wed), new Date(2026, 4, 10)));
  const sun = new Date(2026, 4, 10); // Sun 10 May
  assert('monday of Sun 10 May = Mon 4 May', eqDate(mondayOf(sun), new Date(2026, 4, 4)));
}

console.log('lastDayOfMonth');
{
  assert('Apr 2026 → 30', eqDate(lastDayOfMonth(new Date(2026, 3, 15)), new Date(2026, 3, 30)));
  assert('Feb 2024 (leap) → 29', eqDate(lastDayOfMonth(new Date(2024, 1, 1)), new Date(2024, 1, 29)));
  assert('Dec 2025 → 31', eqDate(lastDayOfMonth(new Date(2025, 11, 1)), new Date(2025, 11, 31)));
}

console.log('tfPeriodFor — normal week');
{
  const p = tfPeriodFor(new Date(2026, 4, 5));
  assert('period start = Mon 4 May', eqDate(p.periodStart, new Date(2026, 4, 4)));
  assert('period end = Sun 10 May', eqDate(p.periodEnd, new Date(2026, 4, 10)));
  assert('issueDate = Mon 11 May', eqDate(p.issueDate, new Date(2026, 4, 11)));
}

console.log('tfPeriodFor — cross-month first segment');
{
  const p = tfPeriodFor(new Date(2026, 3, 28));
  assert('period start = Mon 27 Apr', eqDate(p.periodStart, new Date(2026, 3, 27)));
  assert('period end = Thu 30 Apr', eqDate(p.periodEnd, new Date(2026, 3, 30)));
  assert('issueDate = Thu 30 Apr', eqDate(p.issueDate, new Date(2026, 3, 30)));
}

console.log('tfPeriodFor — cross-month second segment');
{
  const p = tfPeriodFor(new Date(2026, 4, 1));
  assert('period start = Fri 1 May', eqDate(p.periodStart, new Date(2026, 4, 1)));
  assert('period end = Sun 3 May', eqDate(p.periodEnd, new Date(2026, 4, 3)));
  assert('issueDate = Mon 4 May', eqDate(p.issueDate, new Date(2026, 4, 4)));
}

console.log('tfPeriodFor — year boundary');
{
  const p1 = tfPeriodFor(new Date(2025, 11, 30));
  assert('Dec segment end = Wed 31 Dec', eqDate(p1.periodEnd, new Date(2025, 11, 31)));
  assert('Dec segment issue = Wed 31 Dec', eqDate(p1.issueDate, new Date(2025, 11, 31)));
  const p2 = tfPeriodFor(new Date(2026, 0, 2));
  assert('Jan segment start = Thu 1 Jan', eqDate(p2.periodStart, new Date(2026, 0, 1)));
  assert('Jan segment end = Sun 4 Jan', eqDate(p2.periodEnd, new Date(2026, 0, 4)));
  assert('Jan segment issue = Mon 5 Jan', eqDate(p2.issueDate, new Date(2026, 0, 5)));
}

console.log('getISOWeek');
{
  assert('Mon 4 May 2026 = week 19', getISOWeek(new Date(2026, 4, 4)) === 19);
  assert('Mon 5 Jan 2026 = week 2', getISOWeek(new Date(2026, 0, 5)) === 2);
}

console.log('generateTfNumber');
{
  const weeklyPeriod = {
    periodStart: new Date(2026, 4, 4),
    periodEnd: new Date(2026, 4, 10),
    issueDate: new Date(2026, 4, 11),
  };
  const n1 = generateTfNumber('CLIENT001', weeklyPeriod, 0);
  assert('weekly format = TF-2026-W19-CLIENT-01', n1 === 'TF-2026-W19-CLIENT-01');

  const monthEndPeriod = {
    periodStart: new Date(2026, 3, 27),
    periodEnd: new Date(2026, 3, 30),
    issueDate: new Date(2026, 3, 30),
  };
  const n2 = generateTfNumber('CLIENT001', monthEndPeriod, 0);
  assert('month-end format = TF-2026-04-CLIENT-01', n2 === 'TF-2026-04-CLIENT-01');

  const n3 = generateTfNumber('CLIENT001', weeklyPeriod, 4);
  assert('sequence increments = TF-2026-W19-CLIENT-05', n3 === 'TF-2026-W19-CLIENT-05');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

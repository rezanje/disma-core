#!/usr/bin/env node
// scripts/test-bank-balance.js
// Standalone tests for src/lib/bank-balance.ts helpers.
// Run: node scripts/test-bank-balance.js

require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const {
  computeLedgerBalances,
  computeBankBalances,
  ledgerBalanceFor,
} = require('../src/lib/bank-balance.ts');

let pass = 0;
let fail = 0;
function assert(label, cond) {
  if (cond) { pass++; console.log('  ✓', label); }
  else      { fail++; console.error('  ✗', label); }
}

// Reproduces the production bug: money returned from Kas Sourcing -> BCA,
// but stored balance never updated (lost-update race). Ledger is correct.
console.log('--- computeLedgerBalances (the bug) ---');
{
  const txs = [
    // Kas Sourcing: opening 4M in, then 4M out (returned to BCA) => should be 0
    { id: 't1', type: 'In',  amount: 4_000_000, bankAccountId: 'kas-sourcing' },
    { id: 't2', type: 'Out', amount: 4_000_000, bankAccountId: 'kas-sourcing' },
    // BCA: opening 596M in, then 4M in (the return) => should be 600M
    { id: 't3', type: 'In',  amount: 596_000_000, bankAccountId: 'bca' },
    { id: 't4', type: 'In',  amount: 4_000_000,   bankAccountId: 'bca' },
  ];
  const led = computeLedgerBalances(txs);
  assert('kas-sourcing derived = 0 (not stale 4M)', led.get('kas-sourcing') === 0);
  assert('bca derived = 600M (not stale 596M)', led.get('bca') === 600_000_000);
}

console.log('--- computeBankBalances ---');
{
  const banks = [
    { id: 'kas-sourcing', name: 'Kas Sourcing', balance: 4_000_000 }, // stale stored
    { id: 'bca', name: 'BCA', balance: 596_000_000 },                 // stale stored
    { id: 'empty', name: 'No Tx', balance: 999 },                     // no ledger rows
  ];
  const txs = [
    { id: 't1', type: 'In',  amount: 4_000_000, bankAccountId: 'kas-sourcing' },
    { id: 't2', type: 'Out', amount: 4_000_000, bankAccountId: 'kas-sourcing' },
    { id: 't3', type: 'In',  amount: 600_000_000, bankAccountId: 'bca' },
  ];
  const out = computeBankBalances(banks, txs);
  assert('kas-sourcing overridden to 0', out.find(b => b.id === 'kas-sourcing').balance === 0);
  assert('bca overridden to 600M', out.find(b => b.id === 'bca').balance === 600_000_000);
  assert('empty account -> 0', out.find(b => b.id === 'empty').balance === 0);
  assert('preserves name/id', out.find(b => b.id === 'bca').name === 'BCA');
  assert('does not mutate input', banks.find(b => b.id === 'kas-sourcing').balance === 4_000_000);
}

console.log('--- ledgerBalanceFor ---');
{
  const txs = [
    { id: 't1', type: 'In',  amount: 100, bankAccountId: 'a' },
    { id: 't2', type: 'Out', amount: 30,  bankAccountId: 'a' },
  ];
  assert('a = 70', ledgerBalanceFor('a', txs) === 70);
  assert('missing = 0', ledgerBalanceFor('zzz', txs) === 0);
}

// ignores rows with no bankAccountId
console.log('--- edge cases ---');
{
  const txs = [
    { id: 't1', type: 'In', amount: 50, bankAccountId: '' },
    { id: 't2', type: 'In', amount: 50, bankAccountId: 'a' },
  ];
  const led = computeLedgerBalances(txs);
  assert('blank bankAccountId ignored', led.has('') === false);
  assert('a = 50', led.get('a') === 50);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

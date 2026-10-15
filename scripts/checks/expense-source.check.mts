import assert from 'node:assert/strict';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const { useAppStore } = await import('../../src/lib/store');
const { recordAdvanceExpense, recordOperationalExpense, recordPocketPurchase } = await import('../../src/lib/accounting');
const before = useAppStore.getState();
const originalFetch = globalThis.fetch;
const calls: Array<{ url: string; body: any }> = [];
try {
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    calls.push({ url: String(url), body });
    if (url === '/api/accounting/cash') return new Response(JSON.stringify({ transaction: body.transaction }));
    if (url === '/api/accounting/journal') return new Response(JSON.stringify({
      entry: { id: body.entryId, referenceId: body.referenceId },
      lines: [...body.debits.map((l: any) => ({ ...l, debitAmount: l.amount, creditAmount: 0 })), ...body.credits.map((l: any) => ({ ...l, debitAmount: 0, creditAmount: l.amount }))],
    }));
    if (url === '/api/db') return new Response(JSON.stringify({ success: true }));
    throw new Error(`Unexpected request: ${url}`);
  };
  useAppStore.setState({
    bankAccounts: [
      { id: 'cash', name: 'Petty Cash', accountNumber: 'CASH', accountCode: '1-1000', balance: 500000 },
      { id: 'bca', name: 'BCA', accountNumber: 'TEST', accountCode: '1-1200', balance: 500000 },
    ],
    coas: ['1-1000', '1-1200', '2-1100', '6-1400'].map(code => ({ id: code, accountCode: code, accountName: code, accountType: 'Asset' as const })),
    expenses: [
      { id: 'fuel', date: '2026-10-15', reporterId: 'finance', category: 'Bensin', amount: 100000, description: 'Fuel', status: 'Pending Audit', sourceBankAccountId: 'cash' },
      { id: 'toll', date: '2026-10-15', reporterId: 'finance', category: 'Tol', amount: 50000, description: 'Toll', status: 'Pending Audit', sourceBankAccountId: 'bca' },
      { id: 'missing', date: '2026-10-15', reporterId: 'finance', category: 'Tol', amount: 50000, description: 'Missing source', status: 'Pending Audit', sourceBankAccountId: 'deleted-bank' },
    ],
    cashTransactions: [], journalEntries: [], journalLines: [],
  });
  // The saved source must override both a reporter wallet and a different bank passed by an approval screen.
  assert.equal(await recordAdvanceExpense('fuel', 'unknown-reporter', 100000, 'Fuel', undefined, 'Bensin'), true);
  assert.equal(await recordOperationalExpense('toll', 50000, 'Toll', undefined, 'Tol', '1-1000', 'cash'), true);
  const cash = calls.filter(c => c.url === '/api/accounting/cash');
  assert.deepEqual(cash.map(c => [c.body.transaction.bankAccountId, c.body.transaction.amount]), [['cash', 100000], ['bca', 50000]]);
  const journals = calls.filter(c => c.url === '/api/accounting/journal');
  assert.deepEqual(journals.map(c => c.body.credits[0].accountCode), ['1-1000', '1-1200']);
  assert.equal(useAppStore.getState().bankAccounts.find(b => b.id === 'cash')?.balance, 400000);
  assert.equal(useAppStore.getState().bankAccounts.find(b => b.id === 'bca')?.balance, 450000);
  const count = calls.length;
  assert.equal(await recordAdvanceExpense('missing', 'finance', 50000, 'Missing'), false);
  assert.equal(calls.length, count, 'Missing saved source must not fall back to another account');
  assert.equal(await recordOperationalExpense('legacy', 1000, 'Legacy', undefined, 'Tol', '1-1200', 'bca'), true);
  assert.equal(calls.filter(c => c.url === '/api/accounting/cash').at(-1)?.body.transaction.bankAccountId, 'bca');
  assert.equal(await recordPocketPurchase('shopping', 'bca', 2000, 'Sourcer'), true);
  assert.equal(calls.filter(c => c.url === '/api/accounting/journal').at(-1)?.body.credits[0].accountCode, '1-1200');
  await useAppStore.getState().addExpense({ id: 'persist', date: '2026-10-15', reporterId: 'finance', category: 'Bensin', amount: 1000, description: 'Persist selection', status: 'Pending Audit', sourceBankAccountId: 'cash' });
  const saved = calls.find(c => c.url === '/api/db' && c.body.table === 'expenses');
  assert.ok(JSON.stringify(saved?.body).includes('sourceBankAccountId'), 'Source must be sent to persistence');
  console.log('expense-source: OK (selected cash, journal, balances, persistence, missing-source rejection, legacy fallback)');
} finally {
  globalThis.fetch = originalFetch;
  useAppStore.setState(before, true);
}

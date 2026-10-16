// Offline regression: never permit an unstubbed transport to reach a live service.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const originalLoad = Module._load;
let receiptCommand;
let vendorPaymentCommand;
Module._load = function (id, parent, main) {
  if ((receiptCommand || vendorPaymentCommand) && id === './accounting' && parent?.filename.endsWith('/src/lib/store.ts')) return { recordClientReceipt: receiptCommand, recordVendorPayment: vendorPaymentCommand };
  if (id === 'uuid') return { v4: () => 'offline-event-id' };
  if (id === 'sonner') return { toast: new Proxy(() => {}, { get: () => () => {} }) };
  if (id.startsWith('@/')) id = path.join(root, 'src', id.slice(2));
  return originalLoad.call(this, id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
global.fetch = async () => { throw new Error('OFFLINE TEST: unexpected network call'); };
const { useAppStore: store } = require(path.join(root, 'src/lib/store.ts'));
const initial = store.getState();
const reset = () => store.setState(initial, true);
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const cases = [];
const test = (name, run) => cases.push({ name, run });

test('hydration performs GETs only, even with incomplete masters and legacy duplicate postings', async () => {
  reset();
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    if ((options.method || 'GET') !== 'GET') return response({ success: true, count: 1 });
    return response({ clients: [{ id: 'c' }], coas: [], users: [], bankAccounts: [], purchaseItems: [],
      journalEntries: [], journalLines: [], cashTransactions: [], products: [] });
  };
  await store.getState().init();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.filter(call => call.method !== 'GET').length, 0);
});

test('hydration preserves authoritative chart IDs and distinct legacy financial rows', async () => {
  reset();
  const chart = { id: 'server-hpp', accountCode: '5-1000', name: 'Server HPP' };
  const cash = [{ id: 'cash-a', type: 'Out', amount: 10 }, { id: 'cash-b', type: 'Out', amount: 10 }];
  const journals = [{ id: 'journal-a', description: 'Sourcing (HPP)' }, { id: 'journal-b', description: 'Sourcing (HPP)' }];
  global.fetch = async (_url, options = {}) => {
    assert.equal(options.method || 'GET', 'GET');
    return response({ coas: [chart], clients: [{ id: 'c' }], cashTransactions: cash, journalEntries: journals, journalLines: [] });
  };
  await store.getState().init();
  assert.equal(store.getState().coas.find(row => row.accountCode === chart.accountCode).id, chart.id);
  assert.deepEqual(store.getState().cashTransactions, cash);
  assert.deepEqual(store.getState().journalEntries, journals);
});

test('user PINs travel only in provisioning writes; state, session cache and audit stay public', async () => {
  reset();
  const writes = [];
  global.fetch = async (_url, options = {}) => {
    writes.push(JSON.parse(options.body));
    return response({ success: true, count: 1 });
  };
  await store.getState().addUser({ id: 'new-user', name: 'New user', role: 'finance', pin: '6521', isActive: false });
  assert.equal(writes[0].data.pin, '6521');
  assert.equal(writes[0].data.isActive, false);
  assert.equal('pin' in store.getState().users.find(row => row.id === 'new-user'), false);
  await store.getState().updateUser('new-user', { pin: '7532', isActive: true });
  assert.equal(writes.findLast(row => row.table === 'users').data.pin, '7532');
  assert.equal(writes.findLast(row => row.table === 'users').data.isActive, true);
  assert.equal('pin' in store.getState().users.find(row => row.id === 'new-user'), false);
  const history = writes.findLast(row => row.table === 'record_history');
  assert.equal('pin' in history.data.newData, false);
  assert.equal('pin' in history.data.oldData, false);
  store.getState().setCurrentUser({ id: 'session', name: 'Session', role: 'finance', pin: '8643' });
  assert.equal('pin' in store.getState().currentUser, false);
});

test('user hydration uses server activation without restoring removed seed identities or PINs', async () => {
  reset();
  global.fetch = async () => response({ clients: [{ id: 'c' }], users: [{ id: 'only-server-user', name: 'Inactive', role: 'finance', pin: '6521', isActive: false }] });
  await store.getState().init();
  assert.deepEqual(store.getState().users, [{ id: 'only-server-user', name: 'Inactive', role: 'finance', isActive: false }]);
});

test('all authoritative sync failures reject, including missing-table and skipped 2xx', async () => {
  for (const [status, body] of [[404, { error: 'Could not find the table invoices' }], [200, { success: true, skipped: true, missingTable: true }], [200, {}], [200, { success: true }], [200, { success: true, count: 0 }], [403, { error: 'Forbidden' }], [500, { error: 'Unavailable' }]]) {
    reset();
    global.fetch = async () => response(body, status);
    await assert.rejects(store.getState().syncTable('invoices', { id: 'i' }, true));
  }
});

test('posted vendor bills reject raw edits and cleanup cannot remove a posted bill', async () => {
  reset();
  store.setState({ vendorBills: [{ id: 'bill', amountPaid: 0, totalAmount: 100, payments: [] }], journalLines: [{ id: 'line', vendorBillId: 'bill' }] });
  global.fetch = async () => { throw new Error('must reject before transport'); };
  await assert.rejects(store.getState().updateVendorBill('bill', { totalAmount: 1 }));
  await assert.rejects(store.getState().deleteVendorBill('bill', { reason: 'failed-posting' }));
  assert.equal(store.getState().vendorBills[0].totalAmount, 100);
});

test('TF receipt delegates one stable event and does not increment hydrated balances again', async () => {
  reset();
  const a = { id: 'a', clientId: 'client', tukarFakturId: 'tf', amountPaid: 0, totalAmount: 100 };
  const b = { id: 'b', clientId: 'client', tukarFakturId: 'tf', amountPaid: 0, totalAmount: 100 };
  store.setState({ invoices: [a, b] });
  const commands = [];
  receiptCommand = async command => {
    commands.push(command);
    store.setState({ invoices: [{ ...a, amountPaid: 100 }, { ...b, amountPaid: 50 }] });
    return true;
  };
  global.fetch = async () => { throw new Error('receipt must not issue generic writes'); };
  try {
    assert.equal(await store.getState().recordTukarFakturPayment('tf', { a: 100, b: 50 }, '2026-10-16', 'bank', 150, 'stable-event'), true);
    assert.deepEqual(commands, [{ paymentId: 'stable-event', date: '2026-10-16', bankAccountId: 'bank', amount: 150, allocations: [{ invoiceId: 'a', amount: 100 }, { invoiceId: 'b', amount: 50 }] }]);
    assert.deepEqual(store.getState().invoices.map(row => row.amountPaid), [100, 50]);
  } finally { receiptCommand = undefined; }
});

test('rejected ordinary DELETE restores the removed row', async () => {
  reset();
  const lead = { id: 'lead', name: 'Lead' };
  store.setState({ leads: [lead] });
  global.fetch = async () => response({ error: 'Forbidden' }, 403);
  await assert.rejects(store.getState().deleteLead('lead'));
  assert.equal(store.getState().leads[0], lead);
});

test('AP payment delegates one atomic event without local journal, cash or balance writes', async () => {
  reset();
  const commands = [];
  vendorPaymentCommand = async command => { commands.push(command); store.setState({ vendorBills: [{ id: 'bill', amountPaid: 40 }] }); return true; };
  global.fetch = async () => { throw new Error('AP must delegate to atomic command'); };
  try {
    await store.getState().payVendorBill('bill', { id: 'stable-ap', amount: 40, bankAccountId: 'bank', date: '2026-10-16', note: 'receipt' });
    assert.deepEqual(commands, [{ paymentId: 'stable-ap', billId: 'bill', amount: 40, bankAccountId: 'bank', date: '2026-10-16', note: 'receipt' }]);
    assert.equal(store.getState().vendorBills[0].amountPaid, 40);
  } finally { vendorPaymentCommand = undefined; }
});

test('bank balance cannot be overwritten through a generic store action', async () => {
  reset();
  store.setState({ bankAccounts: [{ id: 'bank', balance: 20 }] });
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('balance must reject before transport'); };
  await assert.rejects(store.getState().updateBankBalance('bank', 10));
  await assert.rejects(store.getState().updateBankAccount('bank', { balance: 10 }));
  assert.equal(store.getState().bankAccounts[0].balance, 20);
  assert.equal(calls, 0);
});

test('rejected optimistic rows restore prior state and preserve concurrent edits', async () => {
  reset();
  const one = { id: 'one', name: 'Before' }, two = { id: 'two', name: 'Other' };
  store.setState({ clients: [one, two] });
  let rejectWrite;
  global.fetch = () => new Promise((_, reject) => { rejectWrite = reject; });
  const write = store.getState().updateClient('one', { name: 'Optimistic' });
  const newerTwo = { ...two, name: 'Concurrent' };
  store.setState({ clients: [store.getState().clients[0], newerTwo] });
  rejectWrite(new Error('offline rejection'));
  await assert.rejects(write);
  assert.equal(store.getState().clients.find(row => row.id === 'one'), one);
  assert.equal(store.getState().clients.find(row => row.id === 'two'), newerTwo);
});

test('rollback does not overwrite a later edit to the same row', async () => {
  reset();
  store.setState({ clients: [{ id: 'one', name: 'Before' }] });
  let rejectWrite;
  global.fetch = () => new Promise((_, reject) => { rejectWrite = reject; });
  const write = store.getState().updateClient('one', { name: 'Optimistic' });
  const newer = { id: 'one', name: 'Later edit' };
  store.setState({ clients: [newer] });
  rejectWrite(new Error('offline rejection'));
  await assert.rejects(write);
  assert.equal(store.getState().clients[0], newer);
});

test('overlapping rejected edits do not revive an earlier rejected row', async () => {
  reset();
  const before = { id: 'one', name: 'Before' };
  store.setState({ clients: [before] });
  const rejects = [];
  global.fetch = () => new Promise((_, reject) => rejects.push(reject));
  const first = store.getState().updateClient('one', { name: 'First' });
  const second = store.getState().updateClient('one', { name: 'Second' });
  rejects[0](new Error('first rejected'));
  await assert.rejects(first);
  rejects[1](new Error('second rejected'));
  await assert.rejects(second);
  assert.equal(store.getState().clients[0], before);
});

test('a completed bulk update preserves unrelated edits made during transport', async () => {
  reset();
  const first = { id: 'one', name: 'Before' }, second = { id: 'two', name: 'Before other' };
  store.setState({ clients: [first, second] });
  let complete;
  global.fetch = () => new Promise(resolve => { complete = resolve; });
  const write = store.getState().updateMultipleClients([{ id: 'one', data: { name: 'Saved' } }]);
  const newer = { ...second, name: 'Concurrent other' };
  store.setState({ clients: [first, newer] });
  // History writes are separately acknowledged after the business update.
  const businessComplete = complete;
  global.fetch = async () => response({ success: true, count: 1 });
  businessComplete(response({ success: true, count: 1 }));
  await write;
  assert.equal(store.getState().clients.find(row => row.id === 'two'), newer);
});

test('posted money and broad undo cannot mutate history', async () => {
  reset();
  const tx = { id: 'cash', amount: 10, bankAccountId: 'bank', type: 'In' };
  store.setState({ cashTransactions: [tx], journalEntries: [{ id: 'je' }], vendorBills: [{ id: 'bill', amountPaid: 0, payments: [] }], devHistoryStack: [{ cashTransactions: [] }] });
  let calls = 0;
  global.fetch = async () => { calls++; return response({ success: true, count: 1 }); };
  for (const run of [() => store.getState().updateCashTransaction('cash', { amount: 1 }), () => store.getState().deleteCashTransaction('cash'), () => store.getState().bulkDeleteCashTransactions(['cash']), () => store.getState().updateJournalEntry('je', {}, []), () => store.getState().deleteVendorBill('bill'), () => store.getState().undoDevSnapshot()]) await assert.rejects(run);
  assert.equal(calls, 0);
  assert.equal(store.getState().cashTransactions[0], tx);
});

test('purchase deletion refuses downstream bills, stock, money and linked child history', async () => {
  for (const history of [{ vendorBills: [{ id: 'bill', purchaseId: 'po' }] }, { stockMovements: [{ id: 'sm', referenceId: 'po' }] }, { cashTransactions: [{ id: 'cash', referenceId: 'po' }] }, { purchaseItems: [{ id: 'pi', purchaseId: 'po' }] }]) {
    reset();
    store.setState({ purchases: [{ id: 'po', status: 'Draft' }], ...history });
    global.fetch = async () => { throw new Error('deletion must be blocked before transport'); };
    await assert.rejects(store.getState().deletePurchase('po'));
    assert.equal(store.getState().purchases.length, 1);
  }
});

(async () => {
  let failures = 0;
  for (const { name, run } of cases) {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); }
  }
  reset();
  if (failures) process.exitCode = 1;
})();

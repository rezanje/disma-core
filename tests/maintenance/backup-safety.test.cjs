const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
global.fetch = async () => { throw new Error('OFFLINE: no external transport'); };
const { BACKUP_TABLES, validateBackup, readCompleteBackup, restoreCompleteBackup, assertResetAllowed } = require('../../src/lib/backup-safety.ts');
const snapshot = () => ({ manifest: { format: 'disma-backup', version: 1, createdAt: '2026-10-16T00:00:00.000Z', tables: [...BACKUP_TABLES], counts: Object.fromEntries(BACKUP_TABLES.map(table => [table, 0])) }, data: Object.fromEntries(BACKUP_TABLES.map(table => [table, []])) });

test('backup manifest covers all app facts and excludes authentication secrets', () => {
  for (const table of ['app_settings', 'users', 'budget_plans', 'budget_categories', 'budget_sub_categories', 'budget_adjustments', 'disbursement_requests', 'daily_close', 'credit_notes', 'tutup_hari_kantong', 'vendor_prices', 'client_receipts', 'client_receipt_allocations', 'financial_events', 'financial_command_events', 'goods_events', 'purchase_events', 'bank_reconciliation_statements', 'bank_reconciliation_rows', 'bank_reconciliation_matches', 'vendor_advances', 'vendor_advance_allocations', 'vendor_claim_settlements', 'financial_reversals', 'paper_operations', 'courier_spares']) assert.ok(BACKUP_TABLES.includes(table), table);
  assert.equal(BACKUP_TABLES.includes('auth_sessions'), false);
  assert.equal(BACKUP_TABLES.includes('auth_login_attempts'), false);
  assert.equal(validateBackup(snapshot()).manifest.tables.length, BACKUP_TABLES.length);
  const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20261017000003_paper_operations_backups.sql'), 'utf8');
  const sqlTables = migration.match(/SELECT ARRAY\[(.*?)\]::text\[\]/s)?.[1].match(/'([^']+)'/g).map(value => value.slice(1, -1));
  assert.deepEqual(sqlTables, [...BACKUP_TABLES], 'SQL and API whitelists must stay identical');
});
test('partial, legacy, unknown-table and mismatched-count backups reject before any writes', async () => {
  const missing = snapshot(); delete missing.data.invoices;
  const badCount = snapshot(); badCount.manifest.counts.invoices = 1;
  const extra = snapshot(); extra.data.auth_sessions = [];
  const missingManifest = { users: [] };
  for (const value of [missing, badCount, extra, missingManifest]) {
    let called = false;
    await assert.rejects(restoreCompleteBackup({ rpc: async () => { called = true; } }, value, 'admin'));
    assert.equal(called, false);
  }
});
test('backup failure and incomplete RPC payload cannot create a successful backup', async () => {
  await assert.rejects(readCompleteBackup({ rpc: async () => ({ data: null, error: { message: 'missing invoices' } }) }));
  await assert.rejects(readCompleteBackup({ rpc: async () => ({ data: {}, error: null }) }));
});
test('restore sends exactly one validated transactional RPC and propagates rejection', async () => {
  const calls = [];
  await restoreCompleteBackup({ rpc: async (...args) => { calls.push(args); return { data: { success: true }, error: null }; } }, snapshot(), 'admin');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'restore_business_backup');
  assert.equal(calls[0][1].p_actor, 'admin');
  await assert.rejects(restoreCompleteBackup({ rpc: async () => ({ data: null, error: { message: 'constraint failure' } }) }, snapshot(), 'admin'));
});
test('destructive reset requires explicit mode, exact confirmation and nonproduction opt-in', () => {
  const body = { action: 'reset', mode: 'operational', confirmation: 'RESET NONPRODUCTION DATA' };
  assert.throws(() => assertResetAllowed(body, {}));
  assert.throws(() => assertResetAllowed(body, { NODE_ENV: 'production', DISMA_ENABLE_DESTRUCTIVE_MAINTENANCE: 'true' }));
  assert.throws(() => assertResetAllowed({}, { NODE_ENV: 'test', DISMA_ENABLE_DESTRUCTIVE_MAINTENANCE: 'true' }));
  assert.throws(() => assertResetAllowed({ ...body, mode: undefined }, { NODE_ENV: 'test', DISMA_ENABLE_DESTRUCTIVE_MAINTENANCE: 'true' }));
  assert.equal(assertResetAllowed(body, { NODE_ENV: 'test', DISMA_ENABLE_DESTRUCTIVE_MAINTENANCE: 'true' }), 'operational');
});

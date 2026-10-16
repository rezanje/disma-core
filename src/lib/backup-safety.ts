/** Parent-first order, shared with migration 007. Authentication runtime is excluded. */
export const BACKUP_TABLES = [
  'app_settings', 'users', 'clients', 'vendors', 'products', 'coas', 'bank_accounts',
  'employees', 'leads', 'budget_plans', 'budget_categories', 'budget_sub_categories', 'budget_adjustments',
  'purchase_requests', 'purchases', 'vendor_bills', 'sales_orders', 'sales_order_items', 'purchase_items',
  'tukar_faktur', 'deliveries', 'invoices', 'journal_entries', 'journal_lines', 'stock_movements',
  'expenses', 'reimbursements', 'cash_transactions', 'disbursement_requests', 'tutup_hari_kantong',
  'pending_returns', 'vendor_returns', 'rejected_items', 'fixed_assets', 'client_prices', 'vendor_prices',
  'notifications', 'disma_tasks', 'kpis', 'okr_objectives', 'okr_key_results', 'record_history',
  'shopping_draft', 'daily_close', 'credit_notes', 'client_receipts', 'client_receipt_allocations',
  'financial_events', 'financial_command_events', 'goods_events', 'purchase_events',
  'bank_reconciliation_statements', 'bank_reconciliation_rows', 'bank_reconciliation_matches',
  'vendor_advances', 'vendor_advance_allocations', 'vendor_claim_settlements', 'financial_reversals',
] as const;

export class BackupValidationError extends Error { readonly status = 400; }
type Backup = {
  manifest: { format: 'disma-backup'; version: 1; createdAt: string; tables: string[]; counts: Record<string, number> };
  data: Record<string, Record<string, unknown>[]>;
};
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
const object = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Legacy/partial dumps cannot be restored because absence is not an empty table. */
export function validateBackup(value: unknown): Backup {
  const invalid = (message: string): never => { throw new BackupValidationError(message); };
  if (!object(value) || !object(value.manifest) || !object(value.data)) return invalid('Cadangan lengkap dengan manifest diperlukan; dump lama/parsial ditolak.');
  const { manifest, data } = value;
  if (manifest.format !== 'disma-backup' || manifest.version !== 1 || typeof manifest.createdAt !== 'string'
    || !Number.isFinite(Date.parse(manifest.createdAt)) || !Array.isArray(manifest.tables) || !object(manifest.counts)) return invalid('Format manifest cadangan tidak valid.');
  const sameTables = (keys: string[]) => keys.length === BACKUP_TABLES.length && BACKUP_TABLES.every(table => keys.includes(table));
  if (!sameTables(Object.keys(data)) || !sameTables(Object.keys(manifest.counts))
    || JSON.stringify(manifest.tables) !== JSON.stringify(BACKUP_TABLES)) return invalid('Daftar tabel cadangan tidak lengkap atau berisi tabel yang tidak diizinkan.');
  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(data[table]) || !data[table].every(object)
      || !Number.isSafeInteger(manifest.counts[table]) || manifest.counts[table] !== data[table].length) return invalid(`Jumlah/baris cadangan tidak cocok: ${table}.`);
  }
  return value as Backup;
}

export async function readCompleteBackup(db: RpcClient): Promise<Backup> {
  const { data, error } = await db.rpc('snapshot_business_data');
  if (error) throw new Error(`Cadangan gagal: ${error.message}`);
  return validateBackup(data);
}

export async function restoreCompleteBackup(db: RpcClient, value: unknown, actor: string): Promise<void> {
  const backup = validateBackup(value);
  const { data, error } = await db.rpc('restore_business_backup', { p_backup: backup, p_actor: actor });
  if (error || !object(data) || data.success !== true) throw new Error(`Restore gagal: ${error?.message || 'server tidak mengonfirmasi transaksi'}`);
}

export function assertResetAllowed(body: unknown, environment: Record<string, string | undefined>): 'all' | 'operational' {
  if (environment.NODE_ENV === 'production' || environment.VERCEL_ENV === 'production'
    || environment.DISMA_ENABLE_DESTRUCTIVE_MAINTENANCE !== 'true') throw new BackupValidationError('Reset destruktif hanya tersedia di lingkungan nonproduction yang diaktifkan secara eksplisit.');
  if (!object(body) || body.action !== 'reset' || !['all', 'operational'].includes(body.mode)
    || body.confirmation !== 'RESET NONPRODUCTION DATA') throw new BackupValidationError('Mode reset dan konfirmasi eksplisit diperlukan; wipe/seed lama ditolak.');
  return body.mode;
}

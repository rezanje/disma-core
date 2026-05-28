import type { BankAccount, CashTransaction } from '@/types';

/**
 * Derive bank balances from the cash transaction ledger.
 *
 * Source of truth = the ledger, NOT the stored `balance` field.
 * Opening balances are already recorded in the ledger as "Saldo Awal" In transactions,
 * so balance = sum(In) - sum(Out) per bankAccountId.
 *
 * This removes the lost-update race caused by multiple unsynchronized writers
 * (atomic RPC + full-row bank_accounts overwrites + poll/broadcast rehydrate + optimistic deltas)
 * mutating the denormalized stored balance.
 *
 * @returns Map of bankAccountId -> derived balance
 */
export function computeLedgerBalances(transactions: CashTransaction[]): Map<string, number> {
  const balances = new Map<string, number>();
  for (const tx of transactions) {
    if (!tx.bankAccountId) continue;
    const delta = tx.type === 'In' ? tx.amount : -tx.amount;
    balances.set(tx.bankAccountId, (balances.get(tx.bankAccountId) ?? 0) + delta);
  }
  return balances;
}

/**
 * Return bank accounts with their `balance` field replaced by the ledger-derived value.
 * Accounts with no transactions get balance 0.
 */
export function computeBankBalances(
  bankAccounts: BankAccount[],
  transactions: CashTransaction[]
): BankAccount[] {
  const ledger = computeLedgerBalances(transactions);
  return bankAccounts.map((b) => ({
    ...b,
    balance: ledger.get(b.id) ?? 0,
  }));
}

/** Convenience: derived balance for a single account id. */
export function ledgerBalanceFor(
  bankAccountId: string,
  transactions: CashTransaction[]
): number {
  return computeLedgerBalances(transactions).get(bankAccountId) ?? 0;
}

// Rules for removing a client. Pure — no store/React imports — so the guard is
// trivially testable (client-delete.check.ts).
//
// Deleting a client is meant for the mis-typed entry nobody has traded with yet.
// Once a client has a PO, an invoice or a tukar faktur, deleting them orphans
// money: an invoice with no client cannot be chased and a PO with no client
// cannot be delivered. The database has no foreign key stopping that, so this
// guard is the only thing that does.
//
// A price list is deliberately NOT a blocker. Prices get seeded when the client
// is created, so treating them as history would make every new client
// undeletable — exactly the case this exists for. They are removed with the
// client instead.

export type ClientLink = { clientId?: string };

export type ClientRecords = {
  salesOrders: ClientLink[];
  invoices: ClientLink[];
  tukarFakturs: ClientLink[];
  clientPrices: ClientLink[];
};

export type BlockerKind = 'salesOrders' | 'invoices' | 'tukarFakturs';

export type DeletionBlocker = { kind: BlockerKind; count: number };

const LABELS: Record<BlockerKind, string> = {
  salesOrders: 'PO',
  invoices: 'tagihan',
  tukarFakturs: 'tukar faktur',
};

/** What this client has done that makes removing them unsafe. Empty = safe. */
export function clientDeletionBlockers(clientId: string, records: ClientRecords): DeletionBlocker[] {
  const kinds: BlockerKind[] = ['salesOrders', 'invoices', 'tukarFakturs'];
  return kinds
    .map(kind => ({ kind, count: records[kind].filter(r => r.clientId === clientId).length }))
    .filter(b => b.count > 0);
}

export function canDeleteClient(clientId: string, records: ClientRecords): boolean {
  return clientDeletionBlockers(clientId, records).length === 0;
}

/** Human-readable list for the refusal message, e.g. "3 PO, 1 tagihan". */
export function describeBlockers(blockers: DeletionBlocker[]): string {
  return blockers.map(b => `${b.count} ${LABELS[b.kind]}`).join(', ');
}

/** Price rows that must go with the client so they are not left orphaned. */
export function clientPriceIdsToRemove<T extends ClientLink & { id: string }>(
  clientId: string,
  clientPrices: T[]
): string[] {
  return clientPrices.filter(p => p.clientId === clientId).map(p => p.id);
}

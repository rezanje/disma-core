/** Reject acknowledgements that did not durably perform the requested write. */
export async function checkedDbMutation(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  const result = await response.clone().json().catch(() => null);
  const submitted = typeof init.body === 'string' ? JSON.parse(init.body) : null;
  const requestedRows = init.method === 'DELETE' ? submitted?.id : submitted?.data;
  const expectedCount = Array.isArray(requestedRows) ? requestedRows.length : 1;
  if (!response.ok || !result || result.success !== true || result.skipped || result.missingTable || result.error
    || result.count !== expectedCount) {
    throw new Error(result?.error || `Database write was not acknowledged (${response.status}).`);
  }
  return response;
}

type Row = { id: string };
// If a later optimistic edit was based on an earlier rejected edit, its rollback
// must resolve to the last valid object rather than reviving the rejected edit.
const rejectedRows = new WeakMap<object, Row | undefined>();
function lastValidRow(row: Row | undefined): Row | undefined {
  while (row && rejectedRows.has(row)) row = rejectedRows.get(row);
  return row;
}

/** Undo only this action's still-current optimistic objects, never another edit. */
export function optimisticRollback<S extends object>(before: S, optimistic: S, current: S): Partial<S> {
  const patch: Partial<S> = {};
  for (const key of Object.keys(before) as (keyof S)[]) {
    if (before[key] === optimistic[key] || typeof before[key] === 'function') continue;
    const oldValue = before[key], nextValue = optimistic[key], liveValue = current[key];
    if (Array.isArray(oldValue) && Array.isArray(nextValue) && Array.isArray(liveValue)
        && [...oldValue, ...nextValue, ...liveValue].every(row => row && typeof row.id === 'string')) {
      const oldRows = new Map<string, Row>(oldValue.map(row => [row.id, row]));
      const nextRows = new Map<string, Row>(nextValue.map(row => [row.id, row]));
      const liveRows = new Map<string, Row>(liveValue.map(row => [row.id, row]));
      const changedIds = new Set([...oldRows.keys(), ...nextRows.keys()].filter(id => oldRows.get(id) !== nextRows.get(id)));
      for (const id of changedIds) {
        const row = nextRows.get(id);
        if (row) rejectedRows.set(row, lastValidRow(oldRows.get(id)));
      }
      const restored = liveValue.flatMap(row => {
        if (!changedIds.has(row.id) || liveRows.get(row.id) !== nextRows.get(row.id)) return [row];
        const oldRow = lastValidRow(oldRows.get(row.id));
        return oldRow ? [oldRow] : [];
      });
      // Restore deleted rows only if no later action has reinserted their ID.
      for (const row of oldValue) {
        if (changedIds.has(row.id) && !nextRows.has(row.id) && !liveRows.has(row.id)) {
          const validRow = lastValidRow(row);
          if (validRow) restored.push(validRow);
        }
      }
      patch[key] = restored as S[keyof S];
    } else if (liveValue === nextValue) {
      patch[key] = oldValue;
    }
  }
  return patch;
}

/**
 * Capture the synchronous optimistic phase of an async action. Later committed
 * server hydration is deliberately outside this rollback boundary.
 */
export async function withOptimisticRollback<S extends object, T>(read: () => S, write: (patch: Partial<S>) => void,
  action: () => Promise<T>, afterRollback: () => void): Promise<T> {
  const before = read();
  const pending = action();
  const optimistic = read();
  try {
    return await pending;
  } catch (error) {
    write(optimisticRollback(before, optimistic, read()));
    afterRollback();
    throw error;
  }
}

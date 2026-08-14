/**
 * Runnable check for the localStorage cache helpers. No test framework in this
 * repo — run directly:  npx tsx src/lib/local-cache.check.ts
 *
 * The contract these pin down exists because of a real data-loss bug: the
 * client_prices cache outgrew the ~5MB per-origin quota, and the mutators wrote
 * it with a raw setItem. The QuotaExceededError propagated out of the mutator
 * BEFORE its syncTable call, so adding a price updated the screen and never
 * reached the database.
 */
import assert from 'node:assert/strict';
import { loadLocalCache, saveLocalCache } from './local-cache';

type Store = { store: Record<string, string>; setItem: (k: string, v: string) => void };

const fakeStorage = (opts: { throwOnSet?: boolean } = {}) => {
  const store: Record<string, string> = {};
  return {
    store,
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      if (opts.throwOnSet) {
        const err = new Error("Setting the value of 'x' exceeded the quota.");
        err.name = 'QuotaExceededError';
        throw err;
      }
      store[k] = v;
    },
    removeItem: (k: string) => { delete store[k]; },
  };
};

const withStorage = <T>(storage: unknown, fn: () => T): T => {
  const g = globalThis as { window?: unknown };
  const previous = g.window;
  g.window = { localStorage: storage };
  try { return fn(); } finally { g.window = previous; }
};

// Happy path: round-trips.
const ok = fakeStorage();
withStorage(ok, () => saveLocalCache('k', [{ id: 'a' }]));
assert.equal(ok.store['k'], JSON.stringify([{ id: 'a' }]));
assert.deepEqual(withStorage(ok, () => loadLocalCache<{ id: string }>('k')), [{ id: 'a' }]);

// The bug: a quota failure must NEVER escape to the caller. If it does, the
// caller's database write is skipped and the user silently loses the edit.
const full = fakeStorage({ throwOnSet: true });
assert.doesNotThrow(() => withStorage(full, () => saveLocalCache('k', [{ id: 'a' }])));

// A cache too big to write must not leave an older copy behind — the next boot
// would hydrate from it and show prices that are missing every edit since.
const stale = fakeStorage();
withStorage(stale, () => saveLocalCache('k', [{ id: 'old' }]));
assert.equal(stale.store['k'], JSON.stringify([{ id: 'old' }]));
const staleThenFull: Store = { ...stale, setItem: fakeStorage({ throwOnSet: true }).setItem };
withStorage(staleThenFull, () => saveLocalCache('k', [{ id: 'new' }]));
assert.equal(stale.store['k'], undefined, 'stale cache must be cleared when the new one will not fit');

// Reads never throw either: absent, malformed and non-array values all read as empty.
const empty = fakeStorage();
assert.deepEqual(withStorage(empty, () => loadLocalCache('missing')), []);
empty.store['garbage'] = '{not json';
assert.deepEqual(withStorage(empty, () => loadLocalCache('garbage')), []);
empty.store['object'] = JSON.stringify({ a: 1 });
assert.deepEqual(withStorage(empty, () => loadLocalCache('object')), []);

// Server-side rendering has no window at all.
const g = globalThis as { window?: unknown };
const saved = g.window;
delete g.window;
assert.doesNotThrow(() => saveLocalCache('k', [{ id: 'a' }]));
assert.deepEqual(loadLocalCache('k'), []);
g.window = saved;

console.log('local-cache: all checks passed');

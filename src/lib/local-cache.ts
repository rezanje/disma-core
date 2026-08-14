// localStorage caches for the boot snapshot. Extracted from store.ts so the
// contract below is testable on its own — see local-cache.check.ts.
//
// The rule that matters: a cache write is best-effort and must NEVER throw.
// localStorage is one ~5MB budget shared by every key on the origin, and this
// app caches a dozen tables into it. When a write is let through raw, the
// QuotaExceededError propagates into whatever mutator called it and skips the
// database write that follows — the screen updates, the server never hears
// about it, and the edit is gone on the next reload.

export const loadLocalCache = <T>(key: string): T[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

export const saveLocalCache = (key: string, data: unknown[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Too big to fit (or storage disabled). Drop any older copy rather than
    // leave one behind — the next boot hydrates from it and would show data
    // missing every edit made since it was written.
    try { window.localStorage.removeItem(key); } catch { /* nothing left to do */ }
  }
};

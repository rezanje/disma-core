import assert from 'node:assert/strict';

// Run the real sync effect with a minimal effect lifecycle. Navigation should
// not refetch the business snapshot; polling and sync broadcasts still should.
const Module = require('node:module');
const originalLoad = Module._load;
let pathname = '/finance';
let previousDeps: unknown[] | undefined;
let cleanup: (() => void) | undefined;
let poll: () => void;
let initCount = 0;
let sessionChecks = 0;
let sessionValid = true;
const user = { id: 'finance-user', role: 'finance', name: 'Finance' };
const state: any = {
  currentUser: user, isSessionVerified: false, isSyncing: false, _ignoreBroadcastUntil: 0,
  init: async () => { initCount++; },
  setCurrentUser: (value: unknown) => { state.currentUser = value; },
  setServerSession: (value: unknown) => { state.currentUser = value; state.isSessionVerified = !!value; },
};
const channels: any[] = [];
const oldChannel = globalThis.BroadcastChannel;
const oldInterval = globalThis.setInterval;
const oldClearInterval = globalThis.clearInterval;
const oldFetch = globalThis.fetch;
(globalThis as any).BroadcastChannel = class {
  onmessage: ((event: any) => void) | null = null;
  constructor() { channels.push(this); }
  close() {}
};
(globalThis as any).setInterval = (callback: () => void) => { poll = callback; return 1; };
(globalThis as any).clearInterval = () => {};
globalThis.fetch = async () => {
  sessionChecks++;
  return Response.json(sessionValid ? { user } : { error: 'expired' }, { status: sessionValid ? 200 : 401 });
};
Module._load = function(request: string, ...args: unknown[]) {
  if (request === 'react') return { useEffect: (effect: () => (() => void), deps: unknown[]) => {
    if (!previousDeps || deps.some((value, index) => value !== previousDeps![index])) {
      cleanup?.(); previousDeps = [...deps]; cleanup = effect();
    }
  } };
  if (request === 'next/navigation') return { usePathname: () => pathname };
  if (request === '@/lib/store') return { useAppStore: Object.assign((selector: any) => selector(state), { getState: () => state }) };
  return originalLoad.call(this, request, ...args);
};
const StoreSync = require('./store-sync').default;
Module._load = originalLoad;
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  try {
    StoreSync(); await flush();
    assert.equal(initCount, 1);
    for (const path of ['/finance/reports', '/admin/vendors', '/settings/profile']) {
      pathname = path; StoreSync(); await flush();
    }
    assert.equal(initCount, 1, 'switching protected menus must not reload every business group');
    assert.equal(sessionChecks, 1, 'menu navigation must not restart the global sync effect');
    poll!(); await flush();
    assert.equal(initCount, 2, 'background polling still refreshes data');
    channels.at(-1).onmessage({ data: { type: 'SYNC_UPDATE' } }); await flush();
    assert.equal(initCount, 3, 'cross-tab updates still refresh data');
    sessionValid = false; poll!(); await flush();
    assert.equal(state.currentUser, null);
    assert.equal(state.isSessionVerified, false, 'a server-rejected session loses its verified state');
    assert.equal(initCount, 3, 'expired sessions must not read business data');
    pathname = '/login'; StoreSync(); await flush();
    sessionValid = true; pathname = '/finance'; StoreSync(); await flush();
    assert.equal(initCount, 4, 'returning from login starts an authenticated refresh');
    console.log('menu navigation, background sync and expired-session checks passed');
  } finally {
    cleanup?.();
    globalThis.BroadcastChannel = oldChannel;
    globalThis.setInterval = oldInterval;
    globalThis.clearInterval = oldClearInterval;
    globalThis.fetch = oldFetch;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

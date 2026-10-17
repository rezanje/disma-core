import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Render the real gate while controlling the route and store subscription.
// Requiring business hydration on an anonymous route must fail these checks.
const Module = require('node:module');
const originalLoad = Module._load;
let pathname = '/login';
let state = { isHydrated: false, isSyncing: false, hydratedFromCache: false, currentUser: null as null | { id: string } };
Module._load = function(request: string, ...args: unknown[]) {
  if (request === 'next/navigation') return { usePathname: () => pathname };
  if (request === '@/lib/store') return { useAppStore: (selector: (value: typeof state) => unknown) => selector(state) };
  return originalLoad.call(this, request, ...args);
};
const HydrationGate = require('./hydration-gate').default;
Module._load = originalLoad;
const render = () => renderToStaticMarkup(createElement(HydrationGate, null, createElement('main', null, 'ROUTE_CONTENT')));

assert.match(render(), /ROUTE_CONTENT/, 'cold /login must expose the PIN form without a session or hydrated business data');

pathname = '/finance';
assert.match(render(), /ROUTE_CONTENT/, 'an anonymous protected visit must mount AuthGuard so it can redirect to login');

state.currentUser = { id: 'office-user' };
assert.doesNotMatch(render(), /ROUTE_CONTENT/, 'authenticated workspaces must still wait for initial hydration');
state.isSyncing = true;
state.isHydrated = true;
assert.doesNotMatch(render(), /ROUTE_CONTENT/, 'a cold authenticated workspace must wait for its first sync');

pathname = '/login';
assert.match(render(), /ROUTE_CONTENT/, 'a stale cached user must not hide the login form');

pathname = '/finance';
state.currentUser = null;
assert.match(render(), /ROUTE_CONTENT/, 'a rejected/expired session must release the gate for AuthGuard');

state.currentUser = { id: 'office-user' };
state.hydratedFromCache = true;
assert.match(render(), /ROUTE_CONTENT/, 'authenticated cached workspaces retain their existing hydration behavior');
state.hydratedFromCache = false;
state.isSyncing = false;
assert.match(render(), /ROUTE_CONTENT/, 'completed hydration exposes the workspace');
console.log('hydration gate cold-login and expired-session regression checks passed');

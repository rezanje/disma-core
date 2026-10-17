import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { User } from '@/types';

const Module = require('node:module');
const originalLoad = Module._load;
let pathname = '/finance';
const user = { id: 'finance-user', name: 'Finance', role: 'finance', isActive: true } as User;
let state = { currentUser: user as User | null, isSessionVerified: true };
Module._load = function(request: string, ...args: unknown[]) {
  if (request === 'next/navigation') return { usePathname: () => pathname, useRouter: () => ({ replace() {} }) };
  if (request === '@/lib/store') return { useAppStore: (selector: (value: typeof state) => unknown) => selector(state) };
  return originalLoad.call(this, request, ...args);
};
const AuthGuard = require('./auth-guard').default;
Module._load = originalLoad;
const render = () => renderToStaticMarkup(createElement(AuthGuard, null, createElement('main', null, 'WORKSPACE_CONTENT')));

for (const path of ['/finance', '/finance/reports', '/admin/vendors', '/settings/profile']) {
  pathname = path;
  assert.match(render(), /WORKSPACE_CONTENT/, `a server-verified session must open ${path} without another blocking spinner, including a fresh layout mount`);
}
state.isSessionVerified = false;
assert.doesNotMatch(render(), /WORKSPACE_CONTENT/, 'a cached identity alone must never open a protected workspace');
state.isSessionVerified = true;
state.currentUser = null;
assert.doesNotMatch(render(), /WORKSPACE_CONTENT/, 'logout or an expired session must hide protected content');
state.currentUser = user;
pathname = '/admin/users';
assert.doesNotMatch(render(), /WORKSPACE_CONTENT/, 'fast navigation must still reject routes outside the current role');
console.log('verified-session menu navigation and role-boundary checks passed');

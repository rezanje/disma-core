import assert from 'node:assert/strict';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const { useAppStore } = await import('../../src/lib/store');
const before = useAppStore.getState();
const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const cache = new Map<string, string>();
Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: (key: string) => cache.get(key) ?? null, setItem: (key: string, value: string) => cache.set(key, value), removeItem: (key: string) => cache.delete(key) } } });
try {
  assert.equal(before.vendors.some(v => v.id === 'v1'), false, 'Live boot must not use the sample vendor');
  useAppStore.setState({ vendors: [], vendorsLoading: false, vendorsError: null });
  const vendors = Array.from({ length: 153 }, (_, i) => ({ id: `vendor-${i}`, companyName: `Vendor ${i}`, status: 'approved' }));
  let calls = 0;
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/db?group=vendors');
    calls++;
    await new Promise(resolve => setTimeout(resolve, 1));
    return new Response(JSON.stringify({ vendors }));
  };
  await Promise.all([useAppStore.getState().refreshVendors(), useAppStore.getState().refreshVendors()]);
  assert.equal(calls, 1, 'Concurrent vendor reads must share the in-flight request');
  assert.equal(useAppStore.getState().vendors.length, 153);
  assert.equal(JSON.parse(cache.get('disma_local_vendors_cache')!).length, 153);
  assert.equal(useAppStore.getState().vendorsLoading, false);
  globalThis.fetch = async () => new Response('{}', { status: 503 });
  await useAppStore.getState().refreshVendors();
  assert.equal(useAppStore.getState().vendors.length, 153, 'A failed refresh must keep the last complete list');
  assert.ok(useAppStore.getState().vendorsError);
  globalThis.fetch = async () => new Response(JSON.stringify({ vendors: [] }));
  await useAppStore.getState().refreshVendors();
  assert.equal(useAppStore.getState().vendors.length, 0, 'An empty server list must not bring back a sample vendor');
  assert.equal(useAppStore.getState().vendorsError, null);
  globalThis.fetch = async () => {
    useAppStore.setState({ vendors: [{ id: 'new-local', companyName: 'Added while loading' } as any] });
    return new Response(JSON.stringify({ vendors }));
  };
  await useAppStore.getState().refreshVendors();
  assert.equal(useAppStore.getState().vendors[0].id, 'new-local', 'Refresh must not overwrite an in-flight edit');
  console.log('vendor-load: OK (complete list, cache, retries, concurrency, no sample fallback, in-flight edits)');
} finally {
  globalThis.fetch = originalFetch;
  useAppStore.setState(before, true);
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else delete (globalThis as any).window;
}

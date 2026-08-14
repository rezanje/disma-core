/**
 * Guards the wiring between menus, role permissions, and pages that exist.
 * Run directly:  npx tsx src/lib/nav-permissions.check.ts
 *
 * Written after an audit found nine broken connections at once: menus no role
 * could open (including Stock Opname, so the warehouse could not fix its own
 * stock), pages with no menu at all (Sourcing's fuel-and-parking screen), and
 * links pointing at tabs that do not exist, which render an empty page with no
 * message.
 *
 * None of that shows up in a type error or a failing page — every file compiles
 * fine. The only way to catch it is to compare the three lists against each
 * other, which is what this does.
 *
 * ponytail: reads the source text instead of importing it. Importing store.ts
 * drags in zustand, sonner and supabase for what is a wiring question. Swap to
 * real imports if that ever gets cheap.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const nav = fs.readFileSync('src/lib/navigation.tsx', 'utf8');
const store = fs.readFileSync('src/lib/store.ts', 'utf8');

type Entry = { key: string; href: string };
const entries: Entry[] = [...nav.matchAll(/key:\s*'([a-z_]+)'[^}]*?href:\s*'([^']+)'/g)]
  .map(m => ({ key: m[1], href: m[2] }));

assert.ok(entries.length > 40, `hanya menemukan ${entries.length} menu — pola pembacaannya kemungkinan rusak`);

// --- Permissions, one segment per role -------------------------------------
const block = store.slice(
  store.indexOf('const initialRolePermissions'),
  store.indexOf('export const useAppStore'),
);
const roleNames = [...block.matchAll(/^\s{2}([a-z_]+):/gm)].map(m => ({ name: m[1], idx: m.index! }));
const roles: Record<string, string[]> = {};
roleNames.forEach((r, i) => {
  const seg = block.slice(r.idx, i + 1 < roleNames.length ? roleNames[i + 1].idx : block.length);
  roles[r.name] = [...seg.matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
});

assert.ok(roles.finance && roles.gudang && roles.sourcing && roles.kurir && roles.admin_po,
  'daftar izin per peran tidak terbaca lengkap');

const owned = new Set(Object.values(roles).flat());

// --- 1. Every menu belongs to at least one role ----------------------------
// A menu nobody holds renders for nobody. It is not "hidden", it is dead.
const unowned = entries.filter(e => !owned.has(e.key));
assert.deepEqual(unowned.map(e => e.key), [],
  `menu tanpa pemilik (tidak akan pernah muncul untuk siapa pun): ${unowned.map(e => `${e.key} -> ${e.href}`).join(', ')}`);

// --- 2. Every menu points at a page that exists ----------------------------
const pageExists = (href: string) => {
  const route = href.split('?')[0];
  if (route === '/') return true;
  return fs.existsSync(path.join('src/app', route, 'page.tsx'));
};
const dangling = entries.filter(e => !pageExists(e.href));
assert.deepEqual(dangling.map(e => e.href), [],
  `menu menunjuk halaman yang tidak ada: ${dangling.map(e => `${e.key} -> ${e.href}`).join(', ')}`);

// --- 3. Every ?tab= link names a tab the page really has -------------------
// An unrecognised tab matches no TabsContent, so the page body renders empty
// with nothing explaining why. This is exactly how Finance's Audit Ops broke.
const tabbed = entries.filter(e => e.href.includes('?tab='));
tabbed.forEach(e => {
  const [route, query] = e.href.split('?');
  const tab = new URLSearchParams(query).get('tab')!;
  const file = path.join('src/app', route, 'page.tsx');
  if (!fs.existsSync(file)) return; // sudah ditangkap pemeriksaan di atas
  const src = fs.readFileSync(file, 'utf8');
  const tabs = [...src.matchAll(/<TabsContent\s+value="([^"]+)"/g)].map(m => m[1]);
  if (tabs.length === 0) {
    assert.fail(`${e.key} menunjuk ${e.href}, tapi halamannya tidak punya tab sama sekali`);
  }
  assert.ok(tabs.includes(tab),
    `${e.key} menunjuk tab "${tab}" yang tidak ada di ${route}. Tab yang tersedia: ${tabs.join(', ')}`);
});

// --- 4. Nobody is left without the tools their job needs -------------------
// Not exhaustive — a floor, so a permission list cannot silently lose the one
// screen that makes a role able to work at all.
const mustHave: Record<string, string[]> = {
  finance: ['finance_approvals', 'finance_invoices', 'finance_cash_bank', 'admin_purchase_requests'],
  gudang: ['warehouse_inbound', 'warehouse_qc', 'warehouse_outbound', 'warehouse_opname'],
  sourcing: ['sourcing_list', 'sourcing_expenses'],
  kurir: ['courier_list', 'courier_handover'],
  admin_po: ['admin_sales_orders', 'admin_shopping_list', 'admin_tukar_faktur'],
};
Object.entries(mustHave).forEach(([role, keys]) => {
  keys.forEach(k => assert.ok(roles[role]?.includes(k), `peran ${role} kehilangan izin wajib: ${k}`));
});

console.log(`nav-permissions: all checks passed (${entries.length} menu, ${Object.keys(roles).length} peran)`);

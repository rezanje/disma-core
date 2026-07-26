#!/usr/bin/env node
/**
 * One-off: record the 20-26 Jul 2026 pricelist as the app's baseline pricing data.
 *
 *   1. writes app_settings.nav_configs.price_baseline
 *   2. appends one priceHistory entry to every product carrying a baseline tier price
 *
 * Idempotent: products that already have an entry with this source are skipped.
 * Usage:  node scripts/seed-price-baseline.mjs [--apply]
 */
import { readFileSync } from 'node:fs';

const SOURCE = 'Pricelist 20-26 Juli 2026 (data awal)';
const BASELINE = {
  label: 'Pricelist DISMA 20–26 Juli 2026',
  date: '2026-07-26',
  productCount: 0, // filled in below from the live count
};

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const pick = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '');
const URL_BASE = pick('NEXT_PUBLIC_SUPABASE_URL');
const KEY = pick('SUPABASE_SERVICE_ROLE_KEY') || pick('SUPABASE_SERVICE_ROLE');
if (!URL_BASE || !KEY) {
  console.error('missing NEXT_PUBLIC_SUPABASE_URL or service role key in .env.local');
  process.exit(1);
}
const APPLY = process.argv.includes('--apply');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const rest = async (path, init = {}) => {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${path}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

// PostgREST caps a single response at 1000 rows, so page through with a stable order.
const restAll = async (path, pageSize = 1000) => {
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await rest(`${path}&order=id&limit=${pageSize}&offset=${offset}`);
    out.push(...page);
    if (page.length < pageSize) return out;
  }
};

// --- products carrying a baseline price ---
const products = await restAll('products?select=id,name,base_price,tier1_price,price_history&tier1_price=gt.0');
console.log(`products with a baseline tier price: ${products.length}`);
BASELINE.productCount = products.length;

const needsEntry = products.filter(
  (p) => !(Array.isArray(p.price_history) ? p.price_history : []).some((h) => h?.source === SOURCE)
);
console.log(`need a history entry: ${needsEntry.length}  (already stamped: ${products.length - needsEntry.length})`);

if (!APPLY) {
  console.log('\nDRY RUN — re-run with --apply to write.');
  console.log('baseline record that would be written:', JSON.stringify(BASELINE));
  process.exit(0);
}

// --- 1. the baseline setting, merged into the existing nav_configs JSON ---
const [settings] = await rest('app_settings?id=eq.global-settings&select=nav_configs');
const navConfigs = { ...(settings?.nav_configs || {}), price_baseline: BASELINE };
await rest('app_settings?id=eq.global-settings', {
  method: 'PATCH',
  body: JSON.stringify({ nav_configs: navConfigs }),
});
console.log('wrote app_settings.nav_configs.price_baseline');

// --- 2. one history entry per product ---
let done = 0;
for (const p of needsEntry) {
  const history = Array.isArray(p.price_history) ? p.price_history : [];
  history.push({ date: `${BASELINE.date}T00:00:00.000Z`, price: Number(p.base_price) || 0, source: SOURCE });
  await rest(`products?id=eq.${encodeURIComponent(p.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ price_history: history }),
  });
  if (++done % 200 === 0) console.log(`  ...${done}/${needsEntry.length}`);
}
console.log(`\nstamped ${done} products`);

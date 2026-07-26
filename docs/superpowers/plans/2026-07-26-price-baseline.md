# Price Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Label the 20–26 July 2026 pricelist as the app's day-zero pricing data, and make the weekly-HPP handover preserve each product's own margin instead of flattening everything to the global one.

**Architecture:** A `price_baseline` record lives inside the existing `app_settings.nav_configs` JSON next to `tier_margins`, surfaces through the same API field-mapping, and drives one banner on the Price Lists page. Per-product provenance reuses the existing `priceHistory` array and its existing history modal — no new screen. The margin-preserving handover is a pure function (`rescaleTiers`) called from `handlePublishWeeklyHPP`.

**Tech Stack:** Next.js App Router, Zustand (`src/lib/store.ts`), Supabase via `/api/db`, TypeScript. No test framework — pure logic uses the repo's `.check.ts` + `npx tsx` convention (see `src/lib/backorder.check.ts`); everything else is verified with `npx tsc --noEmit`, `npm run lint`, `npm run build`, and the browser preview.

---

## File Structure

- **Create** `src/lib/tier-rescale.ts` — pure `rescaleTiers` helper. No React, no store.
- **Create** `src/lib/tier-rescale.check.ts` — assert-based check for that helper.
- **Create** `scripts/seed-price-baseline.mjs` — one-off writer for the `price_baseline` setting and the per-product `priceHistory` entries. Idempotent, run manually.
- **Modify** `src/types/index.ts` — add the `PriceBaseline` interface.
- **Modify** `src/lib/store.ts` — `priceBaseline` state + hydration.
- **Modify** `src/app/api/db/route.ts` — expose `priceBaseline` from `nav_configs` in group 1.
- **Modify** `src/app/admin/client-prices/page.tsx` — render the banner; swap the tier-clearing block for `rescaleTiers`.

---

## Task 1: The `rescaleTiers` pure helper

**Files:**
- Create: `src/lib/tier-rescale.ts`
- Test: `src/lib/tier-rescale.check.ts`

- [ ] **Step 1: Write the failing check**

Create `src/lib/tier-rescale.check.ts`:

```ts
import assert from 'node:assert/strict';
import { rescaleTiers } from './tier-rescale';

// Proportional rescale: a +50% tier stays +50% of the new base.
assert.deepEqual(
  rescaleTiers(20000, 30000, [30000, 26000, 24000, 22000, 23000]),
  [45000, 39000, 36000, 33000, 34500]
);

// A +30% product stays +30%.
assert.deepEqual(rescaleTiers(10000, 12000, [13000]), [15600]);

// Rounds to whole rupiah.
assert.deepEqual(rescaleTiers(3, 10, [10]), [33]);

// oldBase <= 0 -> cannot derive a ratio -> clear the slot.
assert.deepEqual(rescaleTiers(0, 12000, [13000, 11000]), [undefined, undefined]);
assert.deepEqual(rescaleTiers(-5, 12000, [13000]), [undefined]);

// A missing / zero tier clears that slot but leaves its neighbours alone.
assert.deepEqual(
  rescaleTiers(10000, 20000, [13000, null, undefined, 0, 11000]),
  [26000, undefined, undefined, undefined, 22000]
);

// newBase of 0 yields 0, not a crash.
assert.deepEqual(rescaleTiers(10000, 0, [13000]), [0]);

// Non-finite input is treated as unusable, never propagated.
assert.deepEqual(rescaleTiers(NaN, 100, [200]), [undefined]);
assert.deepEqual(rescaleTiers(100, NaN, [200]), [undefined]);

// Empty input is an empty result.
assert.deepEqual(rescaleTiers(100, 200, []), []);

console.log('tier-rescale.check: all assertions passed');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx src/lib/tier-rescale.check.ts`
Expected: FAIL — `Cannot find module './tier-rescale'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/tier-rescale.ts`:

```ts
/**
 * Rescale a product's tier prices so each keeps its own ratio to the base price.
 *
 * The published pricelist sets margins per item, not by one formula, so clearing
 * the tier overrides on a weekly-HPP publish would silently reprice every product
 * whose margin is not the global default. Carrying the existing ratio forward keeps
 * a +50% item at +50%.
 *
 * Returns `undefined` in a slot when no ratio can be derived — the caller passes
 * that straight to `updateProduct`, which treats it as "clear this field" and lets
 * the global margin apply, exactly as before.
 */
export function rescaleTiers(
  oldBase: number,
  newBase: number,
  tiers: (number | null | undefined)[]
): (number | undefined)[] {
  const usableBase = Number.isFinite(oldBase) && oldBase > 0 && Number.isFinite(newBase);
  return tiers.map((tier) => {
    if (!usableBase) return undefined;
    if (tier === null || tier === undefined || !Number.isFinite(tier) || tier <= 0) return undefined;
    return Math.round(newBase * (tier / oldBase));
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx tsx src/lib/tier-rescale.check.ts`
Expected: PASS — prints `tier-rescale.check: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tier-rescale.ts src/lib/tier-rescale.check.ts
git commit -m "feat(pricing): rescale tier prices by each product's own ratio"
```

---

## Task 2: `PriceBaseline` type

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add the interface**

Append at the end of `src/types/index.ts`:

```ts
/** Provenance for the pricing data the app started from. Stored once in app_settings. */
export interface PriceBaseline {
  label: string;        // e.g. "Pricelist DISMA 20–26 Juli 2026"
  date: string;         // ISO date, e.g. "2026-07-26"
  productCount: number; // products carrying a baseline price at load time
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors. This repo has 5 known pre-existing errors — 1 in `src/app/admin/loss-analytics/page.tsx`, 1 in `src/app/admin/sales-orders/page.tsx` (line 215, `deliveredAt`), 3 in `src/app/finance/disbursements/page.tsx`. Your change must not add to that list.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(pricing): add PriceBaseline type"
```

---

## Task 3: Store state + hydration

**Files:**
- Modify: `src/lib/store.ts` — type import; `StoreState` interface (~line 364); default state (~line 1391); hydration (~line 1126)

- [ ] **Step 1: Import the type**

Find the import of `ClientPriceTier` from `@/types` in `src/lib/store.ts` and add `PriceBaseline` to the same import list.

Run `grep -n "ClientPriceTier" src/lib/store.ts | head -1` to locate it.

- [ ] **Step 2: Add to the StoreState interface**

Directly after the `updateTierMargins` line in the interface (around line 365):

```ts
  priceBaseline: PriceBaseline | null;
```

There is deliberately no setter — the record is written once by a script and only read by the app.

- [ ] **Step 3: Add the default value**

In the store body, directly after the closing `},` of the `updateTierMargins` action (around line 1411):

```ts
      priceBaseline: null,
```

- [ ] **Step 4: Hydrate from the API**

In the `setIfDefined` block, directly after `setIfDefined('vendorReturns', data.vendorReturns);`:

```ts
            setIfDefined('priceBaseline', data.priceBaseline);
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 5 known pre-existing errors listed in Task 2.

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat(pricing): read priceBaseline into the store"
```

---

## Task 4: Expose `priceBaseline` from the API

**Files:**
- Modify: `src/app/api/db/route.ts` (group 1 response, lines 100-108)

- [ ] **Step 1: Add the field**

In the group-1 `NextResponse.json({...})` block, directly after the `tierMargins` line:

```ts
        priceBaseline: globalSettings?.nav_configs?.price_baseline || null,
```

It reads from the same `nav_configs` JSON that already carries `tier_margins`, so no schema change is needed.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 5 known pre-existing errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/db/route.ts
git commit -m "feat(pricing): serve priceBaseline from app settings"
```

---

## Task 5: Baseline banner on Price Lists

**Files:**
- Modify: `src/app/admin/client-prices/page.tsx` — selector near the other `useAppStore` calls; banner markup after the header block (~line 583)

- [ ] **Step 1: Add the selector**

Next to the other `useAppStore` selectors near the top of the component (the file already has `const products = useAppStore(state => state.products)` and similar), add:

```ts
  const priceBaseline = useAppStore(state => state.priceBaseline)
```

- [ ] **Step 2: Add the icon import**

The file imports icons from `lucide-react`. Add `Info` to that existing import list.

- [ ] **Step 3: Render the banner**

In the JSX, find the header `<div>` that closes right after the "Atur harga jual kustom..." paragraph (around line 583, the `</div>` before `{activeClient && (`). Insert the banner immediately AFTER that closing `</div>` and BEFORE `{activeClient && (`:

```tsx
        {priceBaseline && (
          <div className="w-full md:w-auto flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
            <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
              Data dasar: <span className="text-slate-800">{priceBaseline.label}</span>
              {" · "}{priceBaseline.productCount.toLocaleString('id-ID')} produk
              <br />
              Perubahan setelah ini mengikuti sistem.
            </p>
          </div>
        )}
```

The `priceBaseline &&` guard is required: a fresh database has no such record and the page must still render.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/app/admin/client-prices/page.tsx`
Expected: tsc shows only the 5 known pre-existing errors; eslint shows 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/client-prices/page.tsx
git commit -m "feat(pricing): show the baseline pricelist banner"
```

---

## Task 6: Margin-preserving weekly publish

**Files:**
- Modify: `src/app/admin/client-prices/page.tsx` — import; `handlePublishWeeklyHPP` body (lines 431-447)

- [ ] **Step 1: Import the helper**

Add near the other `@/lib` imports at the top of the file:

```ts
import { rescaleTiers } from "@/lib/tier-rescale"
```

- [ ] **Step 2: Replace the tier-clearing block**

Find this exact block inside `handlePublishWeeklyHPP`:

```ts
          await Promise.all(chunk.map(p => {
            const { price } = getEffectiveBasePrice(p)
            return updateProduct(p.id, {
              basePrice: price,
              // Clear stale tier overrides so the new base flows through margin formulas.
              tier1Price: undefined,
              tier2Price: undefined,
              tier3Price: undefined,
              tier4Price: undefined,
              tier5Price: undefined,
            })
          }))
```

Replace it with:

```ts
          await Promise.all(chunk.map(p => {
            const { price } = getEffectiveBasePrice(p)
            // Carry each product's own margin across the new base. The published
            // pricelist sets margins per item, so clearing the overrides here would
            // silently reprice every product whose margin is not the global default.
            // Slots that yield undefined fall back to the global margin, as before.
            const [t1, t2, t3, t4, t5] = rescaleTiers(p.basePrice, price, [
              p.tier1Price, p.tier2Price, p.tier3Price, p.tier4Price, p.tier5Price,
            ])
            return updateProduct(p.id, {
              basePrice: price,
              tier1Price: t1,
              tier2Price: t2,
              tier3Price: t3,
              tier4Price: t4,
              tier5Price: t5,
            })
          }))
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `npx tsc --noEmit && npx eslint src/app/admin/client-prices/page.tsx && npm run build`
Expected: tsc shows only the 5 known pre-existing errors; eslint 0 errors; build compiles.

- [ ] **Step 4: Re-run the pure check**

Run: `npx tsx src/lib/tier-rescale.check.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/client-prices/page.tsx
git commit -m "fix(pricing): keep each product's margin when publishing weekly HPP"
```

---

## Task 7: Seed the baseline record and per-product history

**Files:**
- Create: `scripts/seed-price-baseline.mjs`

This is a one-off data write, run manually against the live database. It must be safe to run twice.

- [ ] **Step 1: Write the script**

Create `scripts/seed-price-baseline.mjs`:

```js
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

// --- products carrying a baseline price ---
const products = await rest('products?select=id,name,base_price,tier1_price,price_history&tier1_price=gt.0');
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
```

- [ ] **Step 2: Dry run**

Run: `node scripts/seed-price-baseline.mjs`
Expected: prints the product count, how many need an entry, and `DRY RUN — re-run with --apply to write.` Nothing is written.

- [ ] **Step 3: Apply**

Run: `node scripts/seed-price-baseline.mjs --apply`
Expected: prints `wrote app_settings.nav_configs.price_baseline` then `stamped N products` with N matching the dry-run figure.

- [ ] **Step 4: Verify idempotency**

Run: `node scripts/seed-price-baseline.mjs`
Expected: `need a history entry: 0  (already stamped: N)` — a second apply would be a no-op.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-price-baseline.mjs
git commit -m "chore(pricing): script to stamp the baseline pricelist provenance"
```

---

## Task 8: Browser verification

**Files:** none (verification only)

- [ ] **Step 1: Start the preview**

Use the preview tooling (`.claude/launch.json`, entry `disma-dev`) and open `/admin/client-prices`.

If the dev server refuses to start with `Unable to acquire lock at .next/dev/lock`, a stale `next dev` is running: find it with `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3001)'`, kill that PID, remove the lock file, then start again.

- [ ] **Step 2: Confirm the banner**

The Price Lists header shows: `Data dasar: Pricelist DISMA 20–26 Juli 2026 · 1.865 produk` and `Perubahan setelah ini mengikuti sistem.`

Check `read_console_messages` for errors.

- [ ] **Step 3: Confirm per-product provenance**

Open `/admin/products`, open the history modal for a product that has a baseline price (e.g. `Asparagus`), and confirm an entry dated 26/07 with source `Pricelist 20-26 Juli 2026 (data awal)`.

- [ ] **Step 4: Screenshot as proof**

Take a screenshot of the banner for the user.

- [ ] **Step 5: Commit any verification fixes**

```bash
git add -A
git commit -m "fix(pricing): verification adjustments for the baseline banner"
```

(Skip this commit if nothing needed changing.)

---

## Notes for the implementer

- **`undefined` means "clear the field."** `rescaleTiers` returns `undefined` for a slot it cannot compute, and `updateProduct` already treats `undefined` that way. Do not convert those to `0` — a stored `0` would read as a real price of zero rather than "no override."
- **Do not touch `tierMargins`.** It remains the correct default for products with no explicit tier price. The rescale only affects products that already have one.
- **The margins in the pricelist are not uniform** (1433 products at +30%, 265 at +50%, 72 at +20%, 61 at +40%, 8 at +60%). That variation is exactly why Task 6 exists; do not "simplify" it back to a single global formula.

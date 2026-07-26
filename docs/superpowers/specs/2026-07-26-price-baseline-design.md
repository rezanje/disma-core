# Price Baseline: Mark the 20–26 Jul Pricelist as Day-Zero Data

**Date:** 2026-07-26
**Status:** Design approved, not implemented

## Problem

The 20–26 July 2026 pricelist has been loaded into `products.tier1_price…tier5_price`
for 1865 products. Nothing in the app records *what* that data is or *when* it came
from, so a year from now the numbers look like they appeared from nowhere. The
business needs it labelled as the opening balance of the pricing system: this is
where we started, everything after this is the system's own doing.

A second problem surfaced while verifying the load. The published prices do **not**
follow one margin. Measured against a base derived from Cash (+20%), the B2C spread is:

| B2C margin | Products |
|---|---|
| +30% | 1433 |
| +50% | 265 |
| +20% | 72 |
| +40% | 61 |
| +60% | 8 |

The prices were set per item, not by formula. Meanwhile `handlePublishWeeklyHPP`
(`src/app/admin/client-prices/page.tsx:410-457`) **clears** `tier1Price…tier5Price`
so future quotes recompute from `basePrice × globalMargin`. That handover is
intentional — the system is meant to take over — but the formula knows only one
margin. The moment a product's weekly low is published, 406 products silently
reprice: the +50% items drop to +30%.

## Decisions

### 1. One source of truth for the baseline label

Store it once, in `app_settings.nav_configs.price_baseline`, alongside the existing
`tier_margins` (`src/lib/store.ts:1378-1385`, read back at
`src/app/api/db/route.ts:105-107`):

```json
{
  "label": "Pricelist DISMA 20–26 Juli 2026",
  "date": "2026-07-26",
  "productCount": 1865
}
```

Nothing is hardcoded in a component. If the baseline is ever re-cut, one row changes.

### 2. A banner on Price Lists

`src/app/admin/client-prices/page.tsx` renders the label above the table:

> Data dasar: **Pricelist DISMA 20–26 Juli 2026** · 1865 produk · perubahan setelah ini mengikuti sistem

Hidden when `price_baseline` is absent, so the page still works on a fresh database.

### 3. A `priceHistory` entry per product

Every product carrying a baseline price gets one entry appended:

```ts
{ date: "2026-07-26T00:00:00.000Z", price: <basePrice>, source: "Pricelist 20-26 Juli 2026 (data awal)" }
```

This is a one-off data write, not a feature. It surfaces in the product history
modal that already exists (`src/app/admin/products/page.tsx:697-730`) — no new
screen. `priceHistory` is already written this way by the vendor-price flow
(`src/app/admin/vendors/page.tsx:144-149`), so the shape is established.

Idempotent: skip any product that already has an entry with this exact `source`.

### 4. The handover preserves each product's own margin

`handlePublishWeeklyHPP` stops clearing the tier fields. Instead it rescales them
by the ratio the product already carries:

```
tierNew = round(newBase × (tierOld / oldBase))
```

A +50% product stays +50%; a +30% product stays +30%. No new column, no migration —
the ratio is already implicit in the stored numbers, and it keeps working if someone
edits a tier price by hand later.

Fallback to the current behaviour (clear the field, let the global margin apply) when
the ratio cannot be computed: `oldBase <= 0`, or `tierOld` is null/0.

Extracted as a pure function so it can be checked without React or the store:

```ts
// src/lib/tier-rescale.ts
export function rescaleTiers(
  oldBase: number,
  newBase: number,
  tiers: (number | null | undefined)[]
): (number | undefined)[]
```

`undefined` in the returned slot means "clear this field" — matching what
`updateProduct` already expects.

## Not changing

Prices already loaded. The global `tierMargins` config (still the right default for
products with no explicit tier price). `getEffectiveBasePrice`, the weekly-low
capture, the QC/order/invoice flows, and every other screen.

## Risks

**The rescale locks in whatever ratio a product currently has.** If a baseline price
was itself wrong, the error persists through every future publish instead of being
washed out by the global margin. Accepted: the pricelist is the authoritative
document, and a wrong number there should be fixed at the source.

**Rounding drift over repeated publishes.** Each rescale rounds to whole rupiah, so
many successive publishes could drift a few rupiah from the true ratio. At Rp1
granularity on prices in the tens of thousands this is immaterial.

**`productCount` in the banner goes stale** as products are added or priced. It
describes the baseline load, not the live catalogue — the label makes that clear by
naming the date.

## Acceptance criteria

1. `app_settings.nav_configs.price_baseline` holds the label, date, and product count.
2. Price Lists shows the banner sourced from that record, and renders normally when
   the record is missing.
3. Every product with a baseline tier price has exactly one `priceHistory` entry
   with source `"Pricelist 20-26 Juli 2026 (data awal)"`, visible in the product
   history modal. Re-running the write adds no duplicates.
4. `rescaleTiers` returns proportionally scaled tiers when `oldBase > 0` and the tier
   is set, and `undefined` for that slot otherwise.
5. Publishing a weekly HPP for a +50% product leaves it at +50% of the new base, not
   the global +30%.
6. Publishing for a product with `basePrice = 0` clears its tiers, exactly as today.
7. A `src/lib/tier-rescale.check.ts` covers criteria 4–6 and passes under `npx tsx`.

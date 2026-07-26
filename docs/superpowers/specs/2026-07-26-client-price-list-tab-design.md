# Client Price List, Editable From the Client Record

**Date:** 2026-07-26
**Status:** Design approved, not implemented

## Problem

A client's price list is only reachable from Admin → Price Lists, where you first pick
the client from a dropdown. Anyone already looking at a client in Client Management —
checking their orders, invoices, or product history — has to leave the record, switch
pages, and re-find the same client to see or edit their prices.

The client detail view already collects everything else about a client behind tabs:
Profile, Cabang / Outlets, Purchase Orders, Invoices, Histori Produk, Payment History,
Notes (`src/app/admin/clients/page.tsx:621-625`). Prices are the conspicuous gap.

## What this is not

Not a new feature and not a read-only summary. It is the exact price-list surface that
already exists on the Price Lists page — same table, same editing, same bulk actions —
made reachable from the client record.

## Decisions

### The price-list surface becomes one shared component

`src/app/admin/client-prices/page.tsx` is 1162 lines and currently owns both the page
chrome and the client-scoped price list. The client-scoped part moves into
`src/components/client-prices/ClientPriceList.tsx`, taking a single prop:

```ts
interface ClientPriceListProps { clientId: string }
```

It carries everything that depends on the selected client:

- state: selected item ids, search, pagination, price-list period
- memos: `existingIds`, `recordMap`, `configuredProducts`, `paginatedProducts`,
  `availableToAdd`, `groupedProducts`
- handlers: `handleAddProduct`, `handleBulkAddAll`, `handleBulkSetTier`,
  `handleBulkDelete`, `handleToggleSelectAll`, `handleToggleSelectItem`,
  `handleSelectedSetTier`, `handleSelectedDelete`, `handleRemoveProduct`,
  `handleTierChange`, `handleCustomPriceBlur`, `handleBasePriceUpdate`,
  `handleFileUpload`, and the PDF export
- the price-list card itself: client header, period inputs, Bulk Actions, Tambah
  Barang, and the grouped product table

Copying this into a second screen instead would guarantee the two drift apart the
first time either is touched. One component is the only way "the same thing, editable"
stays true.

### Two callers

**`/admin/client-prices`** keeps the page chrome — heading, the baseline banner, the
"Pilih Client" selector — and renders `<ClientPriceList clientId={selectedClientId} />`
once a client is chosen. The empty state (no client selected) stays on the page.

**`/admin/clients`** gains a `Price List` tab in the client detail tab strip, rendering
`<ClientPriceList clientId={selectedClient.id} />`. It sits after `Invoices` and before
`Histori Produk`, grouping it with the other commercial tabs.

### Publish Weekly HPP stays on the Price Lists page

That button currently sits inside the price-list card toolbar
(`src/app/admin/client-prices/page.tsx:870`), but its action is global: it iterates
every product and republishes master HPP. Shown inside a client's own record it would
read as client-scoped, inviting someone to press it thinking it affects one client
while it actually rewrites 1857 products.

It moves up into the Price Lists page chrome and is deliberately absent from the shared
component. This is the one visible layout change on the existing page.

## Not changing

Every price, tier, margin, and formula. The behaviour of every handler being moved.
The `priceBaseline` banner. The margin-preserving rescale in `handlePublishWeeklyHPP`.
No database or API change — this is a code move plus one tab.

## Risks

**Something gets left behind in the move.** The real risk here is mechanical, not
logical: a memo, a handler, or a piece of JSX that quietly fails to come across. The
implementation order guards against it — extract the component and confirm the Price
Lists page still behaves identically *before* wiring up the new tab, so any regression
is attributable to the extraction alone.

**`clients/page.tsx` is already 2084 lines.** Adding a tab adds a handful of lines
there, not a block of price-list code, because the component carries its own weight.

**Two mounts of the same component.** Only one is ever mounted at a time (different
routes), so there is no shared-state concern; the component owns its state per mount.

## Acceptance criteria

1. `ClientPriceList` exists as a standalone component taking only `clientId`.
2. `/admin/client-prices` renders the same table, controls, and behaviour as before the
   change — adding items, changing tier, editing custom price and HPP, bulk actions,
   CSV import, PDF export all still work.
3. `Publish Weekly HPP` appears once, on the Price Lists page, outside the shared
   component, and is absent from the client detail tab.
4. The client detail view shows a `Price List` tab between `Invoices` and
   `Histori Produk`.
5. That tab renders the price list for the client being viewed, and edits made there
   persist and appear on the Price Lists page for the same client.
6. `npx tsc --noEmit` adds no errors beyond the 5 pre-existing ones, and `npm run build`
   compiles.

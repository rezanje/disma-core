# Client Price List Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a client's price list openable and editable directly from their record in Client Management, using the exact same surface that already exists on the Price Lists page.

**Architecture:** The client-scoped half of `src/app/admin/client-prices/page.tsx` (1162 lines) moves verbatim into a new `ClientPriceList` component whose only prop is `clientId`. The Price Lists page keeps its chrome — heading, baseline banner, client picker — and delegates the rest. Client Management gains a tab that mounts the same component. No behaviour changes; this is a code move plus one tab.

**Tech Stack:** Next.js App Router, React client components, Zustand (`src/lib/store.ts`), TypeScript, Tailwind. No test framework — verified with `npx tsc --noEmit`, `npx eslint`, `npm run build`, and browser checks.

---

## Known baselines — do not mistake these for regressions

- `npx tsc --noEmit` reports **5 pre-existing errors**: 1 in `src/app/admin/loss-analytics/page.tsx`, 1 in `src/app/admin/sales-orders/page.tsx:215` (`deliveredAt`), 3 in `src/app/finance/disbursements/page.tsx`. Your work must add zero.
- `npx eslint src/app/admin/client-prices/page.tsx` reports **5 errors + 8 warnings** pre-existing (3× `no-explicit-any`, 2× `react/no-unescaped-entities`, 6× `no-unused-vars`, 2× `react-hooks/exhaustive-deps`). Some will travel with the moved code into the new file; that is expected. What matters is that the **total across both files** does not grow.
- `.gitignore` contains `/scripts/`. Not relevant here, but noted so you don't trip on it.

---

## The split, by line number

Read `src/app/admin/client-prices/page.tsx` before starting. Its `return (` begins at line 583. Top-level JSX blocks:

| Lines | Block | Destination |
|---|---|---|
| 585–602 | heading + `priceBaseline` banner | **stays** on page |
| 603–621 | `{activeClient && (` CSV upload + "Preview & Cetak" | **moves** to component |
| 624–661 | PDF preview `<Dialog>` | **moves** to component |
| 663–745 | "Pilih Client" picker card | **stays** on page |
| 747–754 | `{!activeClient ? (` empty state | **stays** on page |
| 755–1159 | the price-list card | **moves** to component |
| 870 | `Publish Weekly HPP` button (inside the card) | **stays** on page — see Task 2 |

Line numbers shift as you edit. Anchor on the surrounding code, not the numbers.

---

## File Structure

- **Create** `src/components/client-prices/ClientPriceList.tsx` — the whole client-scoped price-list surface. Prop: `clientId`. Owns its own state, memos, handlers, and JSX.
- **Modify** `src/app/admin/client-prices/page.tsx` — reduced to page chrome + `<ClientPriceList />`.
- **Modify** `src/app/admin/clients/page.tsx` — one entry in the tab list, one `<TabsContent>`.

---

## Task 1: Extract `ClientPriceList`

This task must land as one compiling change — a half-finished move does not build. Work through the steps in order and only commit at the end.

**Files:**
- Create: `src/components/client-prices/ClientPriceList.tsx`
- Modify: `src/app/admin/client-prices/page.tsx`

- [ ] **Step 1: Create the component shell**

Create `src/components/client-prices/ClientPriceList.tsx` with this exact header, then leave the body empty for now:

```tsx
"use client"

import React, { useState, useMemo, useEffect } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah, parseNumber, formatNumber, getEffectiveBasePrice } from "@/lib/utils"
import { v4 as uuidv4 } from "uuid"
import { Product, ClientPriceTier, ClientPrice } from "@/types"
import { Search, Download, Calculator, Check, Plus, Trash2, ChevronsUpDown, FileText, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { generatePriceListPDF } from "@/lib/pdf"

const TIER_LABELS: Record<string, string> = {
  'Standard': 'Standard',
  'Tier 1': 'B2C (+30%)',
  'Tier 2': 'General (+25%)',
  'Tier 3': 'Cash (+20%)',
  'Tier 4': 'Bottom (+10%)',
  'Tier 5': 'Special Request (+15%)',
  'Custom': 'Custom Price'
}

interface ClientPriceListProps {
  clientId: string
}

export function ClientPriceList({ clientId }: ClientPriceListProps) {
  return null
}
```

Note what is deliberately absent from these imports: `Info` (only the page's banner uses it) and `rescaleTiers` (only `handlePublishWeeklyHPP` uses it, which stays on the page).

`TIER_LABELS` is duplicated here on purpose for this step; Step 7 removes the page's copy so only one survives.

- [ ] **Step 2: Move the store selectors and state**

Into the component body, replacing `return null`, move from `page.tsx`:

- these store selectors (lines 55–65, **excluding** `priceBaseline`, which the page keeps for its banner):
  `clients`, `products`, `clientPrices`, `addClientPrice`, `updateClientPrice`, `deleteClientPrice`, `deleteMultipleClientPrices`, `updateProduct`, `currentUser`, `tierMargins`
- all `useState` declarations from lines 69–97 **except** `selectedClientId`, `isClientSearchOpen`, and `clientSearch` — those three belong to the page's client picker and must stay there.
- both `useEffect` blocks at lines 98–107.

Then replace every read of `selectedClientId` inside the component with `clientId`, and define:

```tsx
  const activeClient = clients.find(c => c.id === clientId)
```

There is no `setSelectedClientId` inside the component — if you find a call to it in moved code, that code belongs to the page, not here.

- [ ] **Step 3: Move the memos**

Move these six `useMemo` blocks verbatim (lines 109–205): `existingIds`, `recordMap`, `configuredProducts`, `paginatedProducts`, `availableToAdd`, `groupedProducts`. Update their dependency arrays: `selectedClientId` becomes `clientId`.

- [ ] **Step 4: Move the handlers**

Move these verbatim from `page.tsx`, again swapping `selectedClientId` → `clientId`:

`handleAddProduct`, `handleBulkAddAll`, `handleBulkSetTier`, `handleBulkDelete`, `handleToggleSelectAll`, `handleToggleSelectItem`, `handleSelectedSetTier`, `handleSelectedDelete`, `handleRemoveProduct`, `handleTierChange`, `handleCustomPriceBlur`, `handleBasePriceUpdate`, `handleFileUpload`, plus the PDF helpers (`handlePreviewPdf` / `exportPdf` — search the file for `generatePriceListPDF` to find them and any sibling).

Do **not** move `handlePublishWeeklyHPP`. It stays on the page.

- [ ] **Step 5: Move the JSX**

The component returns a fragment holding three pieces, in this order:

```tsx
  return (
    <>
      {/* 1. per-client action row: CSV upload + Preview & Cetak (from page lines 603-621,
             unwrapped from its {activeClient && (...)} guard — see the early return below) */}
      {/* 2. the PDF preview <Dialog> (from page lines 624-661) */}
      {/* 3. the price-list card (from page lines 755-1159), minus the
             Publish Weekly HPP button, which Task 2 relocates */}
    </>
  )
```

Guard the whole thing at the top of the component body, before the JSX:

```tsx
  if (!activeClient) return null
```

That replaces the `{activeClient && (...)}` wrappers the moved JSX used to sit inside — drop those wrappers rather than nesting them.

Wrap piece 1 in `<div className="flex justify-end gap-2 mb-4">` so the CSV and Preview buttons sit above the card. On the Price Lists page they previously sat top-right of the page heading; they now sit directly above the card. This is a minor, deliberate placement change and the second of only two visible layout differences in this plan.

Leave the Publish Weekly HPP button in place for now — Task 2 moves it. The component will not compile until Task 2 if you delete it here without a home, so keep it and let Task 2 relocate it cleanly.

- [ ] **Step 6: Point the page at the component**

In `src/app/admin/client-prices/page.tsx`, add:

```tsx
import { ClientPriceList } from "@/components/client-prices/ClientPriceList"
```

Replace the JSX you removed. The page's return now reads, in order: the heading + banner block, the "Pilih Client" card, then:

```tsx
      {!activeClient ? (
        <div className="text-center py-20 text-slate-400">
          <p className="font-bold">Pilih client terlebih dahulu untuk mengatur price list.</p>
        </div>
      ) : (
        <ClientPriceList clientId={selectedClientId} />
      )}
```

Keep the page's existing empty-state markup exactly as it already is rather than the placeholder text above if it differs — copy what is already in the file at lines 747–754.

- [ ] **Step 7: Delete what the page no longer uses**

From `page.tsx` remove: the now-unused state, memos, handlers, and imports that moved. Keep `selectedClientId`, `isClientSearchOpen`, `clientSearch`, `clients`, `priceBaseline`, and everything `handlePublishWeeklyHPP` needs (`products`, `updateProduct`, `getEffectiveBasePrice`, `rescaleTiers`, `toast`). Remove the page's `TIER_LABELS` if nothing on the page still reads it.

Let the compiler and linter drive this: anything now unused will surface as a `no-unused-vars` warning.

- [ ] **Step 8: Verify the build**

Run: `npx tsc --noEmit`
Expected: exactly the 5 known pre-existing errors, no more.

Run: `npm run build`
Expected: compiles, `/admin/client-prices` in the route list.

Run: `npx eslint src/app/admin/client-prices/page.tsx src/components/client-prices/ClientPriceList.tsx`
Expected: combined error+warning count no higher than the pre-existing 5 errors + 8 warnings.

- [ ] **Step 9: Verify the page still behaves identically**

Start the dev server via the preview tooling (`.claude/launch.json`, entry `disma-dev`) and open `/admin/client-prices`.

If it refuses to start with `Unable to acquire lock at .next/dev/lock`, a stale `next dev` is running: find it with `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3001)'`, kill that PID, delete the lock file, start again.

**This page is behind a PIN login.** Do not enter credentials. If you land on the login screen, stop and report `NEEDS_CONTEXT` — the controller will arrange access.

Once on the page with a client selected, confirm: the baseline banner renders; the client picker works; the table lists that client's products grouped by category; the tier dropdown, custom price field, and HPP field all still edit; Bulk Actions opens; "Tambah Barang" opens. Check `read_console_messages` for errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/client-prices/ClientPriceList.tsx src/app/admin/client-prices/page.tsx
git commit -m "refactor(pricing): extract ClientPriceList from the Price Lists page"
```

---

## Task 2: Move Publish Weekly HPP to the page

**Files:**
- Modify: `src/components/client-prices/ClientPriceList.tsx`
- Modify: `src/app/admin/client-prices/page.tsx`

- [ ] **Step 1: Remove the button from the component**

In `ClientPriceList.tsx`, find the `Publish Weekly HPP` button (it was at `page.tsx:870` before the move, inside the card toolbar) and delete just that `<Button>` element. Leave the rest of the toolbar intact.

- [ ] **Step 2: Render it on the page**

In `page.tsx`, inside the heading block, after the `{priceBaseline && (...)}` banner and before the closing `</div>` of that flex row, add:

```tsx
        <Button
          onClick={handlePublishWeeklyHPP}
          variant="outline"
          className="border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 font-bold"
        >
          <Calculator className="mr-2 h-4 w-4" /> Publish Weekly HPP
        </Button>
```

Ensure `page.tsx` imports `Button` from `@/components/ui/button` and `Calculator` from `lucide-react`. If Step 7 of Task 1 removed either, add it back.

The button is intentionally NOT gated on `activeClient` — its action is global across all products, so it should be available whether or not a client is picked.

- [ ] **Step 3: Confirm it appears exactly once**

Run: `grep -rn "Publish Weekly HPP" src/`
Expected: exactly one match, in `src/app/admin/client-prices/page.tsx`.

Run: `grep -n "rescaleTiers" src/components/client-prices/ClientPriceList.tsx`
Expected: no matches — that helper belongs to the page-level handler only.

- [ ] **Step 4: Verify the build**

Run: `npx tsc --noEmit && npm run build`
Expected: 5 known errors, build compiles.

- [ ] **Step 5: Commit**

```bash
git add src/components/client-prices/ClientPriceList.tsx src/app/admin/client-prices/page.tsx
git commit -m "refactor(pricing): keep the global Publish Weekly HPP action on the page"
```

---

## Task 3: Add the Price List tab to Client Management

**Files:**
- Modify: `src/app/admin/clients/page.tsx` — tab list (~line 621), tab content (near the other `<TabsContent>` blocks)

- [ ] **Step 1: Add the import**

At the top of `src/app/admin/clients/page.tsx`:

```tsx
import { ClientPriceList } from "@/components/client-prices/ClientPriceList"
```

- [ ] **Step 2: Add the tab label**

Find this block (around line 621):

```tsx
    const tabsList = ['Profile']
    if (selectedClient.isBrand) {
      tabsList.push('Cabang / Outlets')
    }
    tabsList.push('Purchase Orders', 'Invoices', 'Histori Produk', 'Payment History', 'Notes')
```

Change the final line to insert `Price List` between `Invoices` and `Histori Produk`:

```tsx
    tabsList.push('Purchase Orders', 'Invoices', 'Price List', 'Histori Produk', 'Payment History', 'Notes')
```

The tab strip derives each `value` from the label via
`tab.toLowerCase().replace(/[^a-z0-9]+/g, '-')`, so `Price List` yields the value
`price-list`. Use exactly that string in the next step.

- [ ] **Step 3: Add the tab content**

Find the existing `<TabsContent value="invoices" ...>` block and add a sibling immediately after it closes:

```tsx
            <TabsContent value="price-list" className="p-8 flex-1">
              <ClientPriceList clientId={selectedClient.id} />
            </TabsContent>
```

Match the `className` to whatever the neighbouring `TabsContent` elements use in this file — copy it from the `invoices` one rather than trusting the value above if they differ.

- [ ] **Step 4: Verify the build**

Run: `npx tsc --noEmit && npm run build`
Expected: 5 known errors, build compiles.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/clients/page.tsx
git commit -m "feat(clients): edit a client's price list from their record"
```

---

## Task 4: Browser verification

**Files:** none (verification only)

- [ ] **Step 1: Open the app**

Start the preview and open `/admin/clients`. If you hit the PIN login screen, stop and report `NEEDS_CONTEXT` — do not enter credentials.

- [ ] **Step 2: Check the tab strip**

Open a client's detail. Confirm the tabs read: Profile, [Cabang / Outlets], Purchase Orders, Invoices, **Price List**, Histori Produk, Payment History, Notes.

- [ ] **Step 3: Check the tab content**

Open the Price List tab. Confirm it shows that client's products, grouped by category, with the same columns as the Price Lists page (SKU, Nama Produk, HPP, Pricing Tier, Harga Penawaran).

Confirm `Publish Weekly HPP` is **absent** here.

- [ ] **Step 4: Check an edit round-trips**

Change one product's Pricing Tier in the tab. Then open `/admin/client-prices`, pick the same client, and confirm the change is there. Change it back.

- [ ] **Step 5: Check the Price Lists page is unchanged**

On `/admin/client-prices`: the baseline banner shows, the client picker works, `Publish Weekly HPP` appears exactly once, and the table edits as before.

Check `read_console_messages` for errors on both screens.

- [ ] **Step 6: Screenshot**

Capture the new tab for the user.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix(pricing): verification adjustments for the client price list tab"
```

Skip this commit if nothing needed changing.

---

## Notes for the implementer

- **This is a move, not a rewrite.** Resist tidying the moved code — renaming, reformatting, or "improving" a handler while relocating it makes a regression impossible to attribute. Move first; anything else is a separate change.
- **Two visible layout changes, both intended:** `Publish Weekly HPP` relocates from the card toolbar to the page heading (Task 2), and the CSV / Preview buttons move from the page heading to just above the card (Task 1 Step 5). Nothing else should shift.
- **`clientId` replaces `selectedClientId` inside the component.** If you find yourself needing `setSelectedClientId` there, you have moved page code by mistake.
- **The component early-returns `null` when the client is not found**, so neither caller needs its own guard around it.

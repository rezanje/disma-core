# Mobile Responsive — DISMA CORE

**Date:** 2026-05-30
**Status:** Approved (Phase 0 spec; later phases get their own spec)

## Problem

App breaks badly on mobile. Root cause: all 7 section layouts apply a fixed
sidebar offset (`pl-72` / `pl-28`) with no mobile breakpoint reset. Sidebar is
correctly `hidden md:flex`, but the content wrapper keeps the 288px left padding
on mobile, shoving content off-screen to the right. BottomNav renders every nav
item in a single row, causing horizontal overflow.

This spec covers **Phase 0 (Foundation)** only. Per-page polish (Phases 1–5) is
roadmapped below; each phase gets its own spec → plan → implementation cycle.

## Approach

**Hybrid (Option C):**
- A shared horizontal-scroll table wrapper is the baseline for every table across
  the app.
- Card-transform (tables → stacked cards on mobile) is applied only to priority
  pages in Phases 1–4 where mobile UX matters most.

Desktop layout must remain visually unchanged. All changes are additive at the
mobile breakpoint (`< md` / 768px). Tailwind v4 is in use (no config file;
`@theme inline` in `globals.css`).

## Phase 0 — Foundation

### 0.1 Layout padding fix (7 section layouts)

Files (all share the identical pattern):
- `src/app/admin/layout.tsx`
- `src/app/finance/layout.tsx`
- `src/app/courier/layout.tsx`
- `src/app/sourcing/layout.tsx`
- `src/app/warehouse/layout.tsx`
- `src/app/settings/layout.tsx`
- `src/app/tasks/layout.tsx`

Change the content wrapper class:

```
// BEFORE
"flex-1 flex flex-col transition-all duration-500 min-w-0 pr-4",
isMinimized ? "pl-28" : "pl-72"

// AFTER
"flex-1 flex flex-col transition-all duration-500 min-w-0 px-4 md:pr-4 pb-20 md:pb-6",
isMinimized ? "md:pl-28" : "md:pl-72"
```

- Mobile (`< md`): no sidebar offset, full-width content, horizontal padding via
  `px-4`, bottom padding `pb-20` to clear the fixed BottomNav.
- Desktop (`>= md`): unchanged — `md:pl-72` / `md:pl-28` + `md:pr-4`.

The `main` element padding (`p-4 md:p-6 lg:p-8`) already scales; verify it isn't
double-padding with the new wrapper `px-4` and adjust if visually cramped.

### 0.2 BottomNav overflow fix

File: `src/components/layout/bottom-nav.tsx`

- Cap visible items to 5. If more than 5 visible nav items remain after
  filter/sort, show the first 4 plus a "More" button as the 5th slot.
- "More" opens a bottom sheet / drawer (shadcn `Sheet` or `Drawer`) listing the
  overflow items as a grid of tappable links.
- Keep existing per-role config logic (hidden keys, custom order, master toggle).
- Active-state detection must also light up "More" when the active route is one
  of the overflow items.

### 0.3 Shared ResponsiveTable wrapper

New file: `src/components/ui/responsive-table.tsx`

- Wraps children in a container: `w-full overflow-x-auto` with momentum scroll
  (`-webkit-overflow-scrolling: touch`) and a subtle right-edge fade hint when
  content overflows.
- Optional `stickyFirstCol` prop: pins the first column on scroll for wide data
  tables.
- Drop-in: existing pages wrap their `<Table>` in `<ResponsiveTable>` without
  restructuring markup.
- This is the Phase 5 baseline; Phase 0 only builds the component and applies it
  to nothing else yet (adoption happens per-page in later phases, except any
  trivial smoke-test usage).

### 0.4 Safe-area + primitives audit

- `pb-safe` is referenced in `bottom-nav.tsx` but Tailwind v4 has no such built-in
  utility. Add safe-area utilities to `globals.css` (e.g. a `.pb-safe` class using
  `env(safe-area-inset-bottom)`), or replace the reference. Verify the BottomNav
  clears the iOS home indicator.
- Audit `topbar.tsx` and `globals.css` for any fixed widths or breakpoints that
  leak on mobile. `globals.css` already sets `overflow-x-hidden` on body — keep.

## Success criteria (Phase 0)

- CEO dashboard (`/admin`) opens on a phone with content full-width, no
  horizontal scroll of the whole page, no content pushed off-screen.
- BottomNav fits within viewport width — no horizontal overflow — on a 390px-wide
  screen, with overflow items reachable via "More".
- Desktop layout unchanged at `>= md`.
- `npm run build` compiles (pre-existing `@anthropic-ai/sdk` type error is
  unrelated and out of scope).

## Roadmap — Phases 1–5 (each its own spec later)

Priority is use-case driven (per user):

1. **F1 — CEO Dashboard** (`src/app/admin/page.tsx`): executive cockpit. Card
   transform, vertical stacking, readable KPIs on mobile.
2. **F2 — CRM** (`src/app/admin/crm/page.tsx`).
3. **F3 — Tasks / KPI / OKR** (`src/app/tasks/page.tsx`,
   `src/app/settings/kpi/page.tsx`, `src/app/admin/okr/page.tsx`).
4. **F4 — Field workers** (`src/app/sourcing/list/page.tsx`,
   `src/app/sourcing/expenses/page.tsx`, `src/app/warehouse/qc/page.tsx`,
   `src/app/courier/*`): touch-friendly, large tap targets — these users are on
   phones in the field.
5. **F5 — Remaining**: finance tables (ResponsiveTable scroll wrapper),
   remaining admin/warehouse/settings pages.

## Out of scope (Phase 0)

- Per-page content polish (Phases 1–5).
- Card-transform components (built per-page in Phases 1–4).
- The pre-existing `@anthropic-ai/sdk` TypeScript build error.
- node_modules iCloud `.nosync` setup (already done separately).

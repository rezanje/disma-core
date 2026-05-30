# Mobile Responsive — Phase 0 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the global mobile layout so every page is usable on a phone — full-width content with no off-screen shove, a BottomNav that fits the viewport, and a shared scrollable table wrapper as the baseline for wide tables.

**Architecture:** All changes are additive at the mobile breakpoint (`< md` / 768px); desktop (`>= md`) stays visually identical. Seven section layouts share one padding pattern that gets the same edit. BottomNav caps visible items and moves overflow into a sheet. A new `ResponsiveTable` component wraps tables in a horizontal-scroll container.

**Tech Stack:** Next.js (App Router), React, Tailwind CSS v4 (no config file; `@theme inline` in `globals.css`), shadcn/ui (Sheet, Button), lucide-react icons.

**Testing note:** This project has no test runner and these are pure UI/Tailwind changes. Verification per task is: `npx eslint` on touched files, `npm run build` compile check (the pre-existing `@anthropic-ai/sdk` type error is unrelated — see Task 0), and a manual mobile-viewport visual check. No unit-test framework is introduced.

---

## File Structure

- **Modify (7 files, identical edit):** `src/app/{admin,finance,courier,sourcing,warehouse,settings,tasks}/layout.tsx` — content wrapper padding gets a mobile reset.
- **Modify:** `src/components/layout/bottom-nav.tsx` — cap to 5 slots, overflow → "More" sheet.
- **Modify:** `src/app/globals.css` — add `.pb-safe` safe-area utility.
- **Create:** `src/components/ui/responsive-table.tsx` — horizontal-scroll table wrapper.

---

## Task 0: Baseline build check

**Files:** none (verification only)

- [ ] **Step 1: Confirm the known pre-existing build error**

Run: `npm run build 2>&1 | grep -A3 "Failed to compile"`
Expected: a TypeScript error inside `node_modules.nosync/@anthropic-ai/sdk/.../mcp.ts` about `Uint8Array` / `BlobPart`. This is NOT from our code and is the accepted baseline. Every later "build" step in this plan should reach this same error (or pass) — no NEW errors from our files.

---

## Task 1: Layout padding fix (7 section layouts)

**Files:**
- Modify: `src/app/admin/layout.tsx`
- Modify: `src/app/finance/layout.tsx`
- Modify: `src/app/courier/layout.tsx`
- Modify: `src/app/sourcing/layout.tsx`
- Modify: `src/app/warehouse/layout.tsx`
- Modify: `src/app/settings/layout.tsx`
- Modify: `src/app/tasks/layout.tsx`

All seven contain the identical content-wrapper block. In each file find:

```tsx
<div className={cn(
  "flex-1 flex flex-col transition-all duration-500 min-w-0 pr-4",
  isMinimized ? "pl-28" : "pl-72"
)}>
```

- [ ] **Step 1: Edit the wrapper in all 7 files**

Replace with:

```tsx
<div className={cn(
  "flex-1 flex flex-col transition-all duration-500 min-w-0 px-4 md:px-0 md:pr-4 pb-20 md:pb-6",
  isMinimized ? "md:pl-28" : "md:pl-72"
)}>
```

Rationale:
- `px-4 md:px-0` — horizontal padding on mobile only (desktop relies on `md:pl-*` + `md:pr-4`).
- `md:pl-28` / `md:pl-72` — sidebar offset applies at `>= md` only; mobile gets none.
- `pb-20 md:pb-6` — clears the 64px fixed BottomNav on mobile.

Note: `settings/layout.tsx` has the block at line ~80, the others vary; match by content, not line number.

- [ ] **Step 2: Lint touched files**

Run: `npx eslint src/app/admin/layout.tsx src/app/finance/layout.tsx src/app/courier/layout.tsx src/app/sourcing/layout.tsx src/app/warehouse/layout.tsx src/app/settings/layout.tsx src/app/tasks/layout.tsx`
Expected: no errors.

- [ ] **Step 3: Visual check (CEO dashboard on mobile)**

Start dev server (`npm run dev`), open `/admin` at a 390px viewport (browser devtools or the preview tool). Expected: "Welcome Back, Reza" content is full-width, not shoved right; no whole-page horizontal scroll. Resize to `>= 768px` and confirm desktop layout (sidebar + offset) is unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/layout.tsx src/app/finance/layout.tsx src/app/courier/layout.tsx src/app/sourcing/layout.tsx src/app/warehouse/layout.tsx src/app/settings/layout.tsx src/app/tasks/layout.tsx
git commit -m "fix(layout): reset sidebar offset on mobile across all section layouts

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Safe-area utility in globals.css

**Files:**
- Modify: `src/app/globals.css`

`bottom-nav.tsx` already uses `pb-safe`, but Tailwind v4 has no such built-in. Add the utility so it resolves.

- [ ] **Step 1: Add the utility**

Append to `src/app/globals.css` (after the existing `@theme`/`@layer` blocks, at end of file):

```css
@layer utilities {
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .h-safe-nav {
    height: calc(4rem + env(safe-area-inset-bottom, 0px));
  }
}
```

- [ ] **Step 2: Build check**

Run: `npm run build 2>&1 | grep -iE "css|globals|Failed to compile" | head`
Expected: no CSS parse error referencing `globals.css`. (The unrelated `@anthropic-ai/sdk` TS error from Task 0 may still appear — ignore it.)

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(styles): add pb-safe safe-area utility for mobile bottom nav

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: BottomNav overflow → "More" sheet

**Files:**
- Modify: `src/components/layout/bottom-nav.tsx`

Current behavior renders every visible item with `justify-around`, overflowing on
narrow screens. Cap to 5 slots: if more than 5 items remain after filter/sort,
render the first 4 plus a "More" trigger that opens a sheet with the rest.

- [ ] **Step 1: Verify the Sheet primitive exists**

Run: `ls src/components/ui/sheet.tsx`
Expected: file exists. If it does NOT exist, run `npx shadcn@latest add sheet` first, then continue.

- [ ] **Step 2: Rewrite bottom-nav.tsx**

Replace the entire file with:

```tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { useAppStore } from "@/lib/store"

interface NavItem {
  key: string
  title: string
  href: string
  icon: React.ReactNode
}

interface BottomNavProps {
  items: NavItem[]
}

const MAX_SLOTS = 5

export default function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname()
  const currentUser = useAppStore(state => state.currentUser)
  const navConfigs = useAppStore(state => state.navConfigs) || {}
  const [moreOpen, setMoreOpen] = useState(false)

  const role = currentUser?.role || 'default'
  const config = navConfigs[role]?.mobile

  // If master toggle for mobile is off, don't show BottomNav
  if (config && config.enabled === false) return null

  const customOrder = config?.order
  const hiddenKeys = config?.hidden || []

  // 1. Filter out hidden items
  const visibleNavItems = items.filter(item => !hiddenKeys.includes(item.key))

  // 2. Sort visible items
  const sortedNavItems = [...visibleNavItems].sort((a, b) => {
    if (!customOrder) return 0
    const indexA = customOrder.indexOf(a.title)
    const indexB = customOrder.indexOf(b.title)
    if (indexA === -1 && indexB === -1) return 0
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })

  const isItemActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`)

  // 3. Split into primary slots + overflow
  const needsMore = sortedNavItems.length > MAX_SLOTS
  const primaryItems = needsMore ? sortedNavItems.slice(0, MAX_SLOTS - 1) : sortedNavItems
  const overflowItems = needsMore ? sortedNavItems.slice(MAX_SLOTS - 1) : []
  const overflowActive = overflowItems.some(item => isItemActive(item.href))

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 glass-topbar border-t border-white/20 dark:border-white/5 flex items-stretch justify-around px-2 pb-safe z-50 rounded-t-2xl shadow-2xl">
      {primaryItems.map((item) => {
        const isActive = isItemActive(item.href)
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-16 space-y-1 transition-colors touch-manipulation min-w-0",
              isActive ? "text-primary" : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
            )}
          >
            <div className={cn("p-1.5 rounded-xl transition-all duration-200", isActive && "bg-primary/20 scale-110 shadow-sm")}>
              {item.icon}
            </div>
            <span className={cn("text-[10px] font-bold leading-none tracking-tight truncate max-w-full px-0.5", isActive ? "text-primary opacity-100" : "opacity-60")}>{item.title}</span>
          </Link>
        )
      })}

      {needsMore && (
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-16 space-y-1 transition-colors touch-manipulation min-w-0",
              overflowActive ? "text-primary" : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
            )}
          >
            <div className={cn("p-1.5 rounded-xl transition-all duration-200", overflowActive && "bg-primary/20 scale-110 shadow-sm")}>
              <MoreHorizontal className="w-5 h-5" />
            </div>
            <span className={cn("text-[10px] font-bold leading-none tracking-tight", overflowActive ? "text-primary opacity-100" : "opacity-60")}>More</span>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
            <SheetTitle className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-200 mb-4">Menu</SheetTitle>
            <div className="grid grid-cols-4 gap-3 pb-4">
              {overflowItems.map((item) => {
                const isActive = isItemActive(item.href)
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-colors touch-manipulation",
                      isActive ? "bg-primary/15 text-primary" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    {item.icon}
                    <span className="text-[10px] font-bold leading-none tracking-tight text-center">{item.title}</span>
                  </Link>
                )
              })}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
```

Key changes vs original: fixed `h-16` per slot moved off the container onto each
item (so the sheet trigger matches), `flex-1` even distribution, `truncate` on
labels, and the overflow split with a `More` sheet.

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/layout/bottom-nav.tsx`
Expected: no errors.

- [ ] **Step 4: Visual check**

Dev server running, open a section with > 5 nav items (e.g. `/finance`) at 390px.
Expected: exactly 5 slots, no horizontal overflow; tapping "More" opens a bottom
sheet listing the remaining items; tapping one navigates and closes the sheet. If
the active route is an overflow item, the "More" slot shows the active (primary)
color.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/bottom-nav.tsx
git commit -m "fix(nav): cap mobile BottomNav to 5 slots with More overflow sheet

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: ResponsiveTable wrapper component

**Files:**
- Create: `src/components/ui/responsive-table.tsx`

A drop-in wrapper providing horizontal scroll with momentum and an optional
sticky first column. Phase 0 only builds it; per-page adoption happens in later
phases.

- [ ] **Step 1: Create the component**

Create `src/components/ui/responsive-table.tsx`:

```tsx
"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ResponsiveTableProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Pin the first column while horizontally scrolling. */
  stickyFirstCol?: boolean
  children: React.ReactNode
}

/**
 * Wraps a wide <Table> in a horizontal-scroll container so it never overflows
 * the viewport on mobile. Desktop is unaffected (table simply fits).
 *
 * Usage:
 *   <ResponsiveTable>
 *     <Table>...</Table>
 *   </ResponsiveTable>
 */
export function ResponsiveTable({
  stickyFirstCol = false,
  className,
  children,
  ...props
}: ResponsiveTableProps) {
  return (
    <div
      className={cn(
        "w-full max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch] rounded-lg",
        stickyFirstCol &&
          "[&_table_thead_th:first-child]:sticky [&_table_tbody_td:first-child]:sticky [&_table_thead_th:first-child]:left-0 [&_table_tbody_td:first-child]:left-0 [&_table_thead_th:first-child]:z-10 [&_table_thead_th:first-child]:bg-white [&_table_tbody_td:first-child]:bg-white dark:[&_table_thead_th:first-child]:bg-slate-900 dark:[&_table_tbody_td:first-child]:bg-slate-900",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export default ResponsiveTable
```

- [ ] **Step 2: Lint**

Run: `npx eslint src/components/ui/responsive-table.tsx`
Expected: no errors.

- [ ] **Step 3: Smoke-test adoption on one page**

Pick `src/app/admin/users/page.tsx` (already touched this branch, has a `<Table>`).
Import and wrap its table:

```tsx
import { ResponsiveTable } from "@/components/ui/responsive-table"
```

Wrap the existing `<Table>...</Table>` for the users list:

```tsx
<ResponsiveTable>
  <Table>
    {/* ...existing rows unchanged... */}
  </Table>
</ResponsiveTable>
```

- [ ] **Step 4: Visual check**

Open `/admin/users` at 390px. Expected: the table scrolls horizontally within its
container instead of forcing the whole page to scroll; desktop unchanged.

- [ ] **Step 5: Build check**

Run: `npm run build 2>&1 | grep -B2 -A3 "Failed to compile" | head -20`
Expected: only the pre-existing `@anthropic-ai/sdk` error from Task 0 — no errors
referencing `responsive-table.tsx`, `users/page.tsx`, or any of our files.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/responsive-table.tsx src/app/admin/users/page.tsx
git commit -m "feat(ui): add ResponsiveTable wrapper and adopt on users page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Done — Phase 0 acceptance

- [ ] `/admin` (CEO dashboard) on a 390px viewport: content full-width, no
  whole-page horizontal scroll, nothing off-screen.
- [ ] BottomNav fits within 390px width — no overflow — overflow items reachable
  via "More" sheet.
- [ ] Desktop (`>= 768px`) layout visually unchanged for all 7 sections.
- [ ] `ResponsiveTable` exists and is adopted on `/admin/users` as a smoke test.
- [ ] `npm run build` reaches only the pre-existing `@anthropic-ai/sdk` error — no
  new errors from Phase 0 files.

Next: Phase 1 (CEO Dashboard card-transform polish) — its own spec → plan.

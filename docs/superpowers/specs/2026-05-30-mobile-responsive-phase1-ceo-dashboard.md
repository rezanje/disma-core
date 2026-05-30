# Mobile Responsive — Phase 1: CEO Dashboard Polish

**Date:** 2026-05-30
**Status:** Approved
**Depends on:** Phase 0 (foundation) — merged to main.

## Problem

After Phase 0 fixed the global layout offset, the CEO dashboard
(`src/components/dashboard/CeoDashboard.tsx`) renders full-width on mobile and its
grids already collapse to one column (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`).
The remaining mobile problem is **density**: heavy desktop padding and large fixed
sizing squeeze content on a ~390px screen — 19× `p-8` (32px each side eats 64px of
width), `p-10`, `px-8`, a `h-[400px] p-8` chart, oversized headers, and huge
`rounded-[3rem]` radii on small cards.

This phase is a polish pass: scale spacing/typography down at the mobile breakpoint
only. No structural or grid changes. Desktop (`>= md` / 768px) must stay visually
identical.

## Scope

- **File:** `src/components/dashboard/CeoDashboard.tsx` only.
- `src/app/admin/page.tsx` (the page header/wrapper) is already fine — out of scope.
- Tailwind v4, all changes `md:`-gated.

## Changes

### 1. Responsive padding (primary density fix)

Scale heavy paddings down on mobile, restore at `md`:
- `p-8` → `p-4 md:p-8`
- `p-10` → `p-5 md:p-10`
- `px-8` → `px-4 md:px-8`
- `pt-8` → `pt-4 md:pt-8` (where it appears standalone)

Apply consistently to every occurrence. Where a class already has a responsive
variant or a different intent (e.g. `pt-4` inside the chart card), do not
double-add — adjust sensibly and keep desktop values intact.

### 2. Chart sizing

The revenue/profit chart card content is `h-[400px] p-8 pt-4`. Change to:
`h-[300px] md:h-[400px] p-3 md:p-8 pt-4`
- Shorter height on mobile so the chart isn't a tall thin band.
- Less padding so the recharts `ResponsiveContainer` (width 100%) has room.

The pie/donut chart card (`CardContent className="p-0 flex flex-col items-center"`)
has no heavy padding — leave it, but verify it doesn't overflow.

### 3. Typography scaling (only where overflow risk)

- Main dashboard `h1` (`text-2xl font-extrabold`) → `text-xl md:text-2xl`.
- Any KPI value that visibly wraps/overflows at 390px → add a `md:`-gated smaller
  mobile size. Only touch sizes that actually overflow; do not restyle every text
  node.

### 4. Corner radius (minor)

Large radii on cards that become small/full-width on mobile look disproportionate:
- `rounded-[3rem]` → `rounded-2xl md:rounded-[3rem]`
- `rounded-[2.5rem]` → `rounded-2xl md:rounded-[2.5rem]`

## Success criteria

- CEO dashboard at 390px: cards use comfortable mobile padding (not 32px gutters),
  chart is readable, headers don't overflow, radii look proportionate.
- Desktop (`>= md`): pixel-identical to before this phase — every desktop value is
  preserved behind a `md:` variant.
- `npm run build` reaches only the pre-existing `@anthropic-ai/sdk` error — no new
  errors from this file.

## Out of scope

- Grid/layout restructuring (grids already collapse correctly).
- Card-transform (not needed — responsive grids already handle column collapse).
- Other dashboards (AdminPo, Sourcing, Warehouse, Courier, Finance) — later phases.
- The pre-existing `@anthropic-ai/sdk` build error.

# Mobile Responsive — Phase 1 (CEO Dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CEO dashboard comfortable on mobile by scaling down heavy padding, chart height, oversized headers, and large corner radii — all `md:`-gated so desktop is unchanged.

**Architecture:** Single-file polish on `src/components/dashboard/CeoDashboard.tsx`. Grids already collapse to one column on mobile (Phase 0 + existing responsive classes), so no structural change — only spacing/typography density at the mobile breakpoint.

**Tech Stack:** Next.js, React, Tailwind CSS v4 (`md:` = 768px), recharts (ResponsiveContainer).

**Testing note:** No test runner; verification is `npx eslint` on the file, a `npm run build` compile check (the pre-existing `@anthropic-ai/sdk` type error is unrelated — ignore it), and a manual 390px visual check. Desktop must stay pixel-identical, so every edit keeps the original value behind a `md:` variant.

---

## File Structure

- **Modify:** `src/components/dashboard/CeoDashboard.tsx` — the only file changed.

---

## Task 1: Responsive padding + chart sizing

**Files:**
- Modify: `src/components/dashboard/CeoDashboard.tsx`

- [ ] **Step 1: Apply the padding substitutions**

Use search-and-replace across the file. For each className string, replace the bare
utility with its mobile-scaled, `md:`-restored form. Be careful to match the
utility as a standalone token (surrounded by spaces or quotes), NOT as a substring
of another class (e.g. don't touch `pt-8` when changing `p-8`, and don't touch
`px-8` when changing `p-8`).

Substitutions (apply to every occurrence):
- `p-8` → `p-4 md:p-8`
- `p-10` → `p-5 md:p-10`
- `px-8` → `px-4 md:px-8`
- standalone `pt-8` → `pt-4 md:pt-8`

Recommended approach: edit occurrence-by-occurrence using the surrounding context,
or use a word-boundary-aware replace. After editing, verify no class was
double-expanded (e.g. no `p-4 md:p-8 md:p-8`).

- [ ] **Step 2: Chart card sizing**

Find the revenue/profit chart card content (around line 778):

```tsx
<CardContent className="h-[400px] p-8 pt-4">
```

Note: after Step 1 this line will read `h-[400px] p-4 md:p-8 pt-4`. Change it to:

```tsx
<CardContent className="h-[300px] md:h-[400px] p-3 md:p-8 pt-4">
```

(Shorter height + lighter padding on mobile so the recharts ResponsiveContainer has room; desktop keeps `h-[400px]` and `md:p-8`.)

- [ ] **Step 3: Verify no unintended matches**

Run: `grep -nE "p-4 md:p-8 md:|p-5 md:p-10 md:|px-4 md:px-8 md:" "src/components/dashboard/CeoDashboard.tsx"`
Expected: no output (no double-expanded classes).

Run: `grep -cE "md:p-8|md:p-10|md:px-8" "src/components/dashboard/CeoDashboard.tsx"`
Expected: a count roughly matching 19 (`p-8`) + 3 (`p-10`) + 8 (`px-8`) occurrences (some overlap on the chart line). Just confirm it's non-trivial and the file still parses.

- [ ] **Step 4: Lint**

Run: `npx eslint "src/components/dashboard/CeoDashboard.tsx"`
Expected: no NEW errors introduced by these changes (pre-existing repo lint debt, if any, is not your concern).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/CeoDashboard.tsx
git commit -m "style(dashboard): scale CEO dashboard padding and chart height for mobile

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Typography + corner radius scaling

**Files:**
- Modify: `src/components/dashboard/CeoDashboard.tsx`

- [ ] **Step 1: Main header scaling**

Find the dashboard `h1` (around line 683):

```tsx
<h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
```

Change `text-2xl` → `text-xl md:text-2xl`.

- [ ] **Step 2: Corner radius scaling**

Substitute (every occurrence):
- `rounded-[3rem]` → `rounded-2xl md:rounded-[3rem]`
- `rounded-[2.5rem]` → `rounded-2xl md:rounded-[2.5rem]`

- [ ] **Step 3: KPI overflow check (conditional)**

Visually inspect the dashboard at 390px (dev server). If any large KPI number or
stat label visibly wraps awkwardly or overflows its card, scale just that node's
font size with a `md:`-gated mobile size (e.g. `text-3xl` → `text-2xl md:text-3xl`).
If nothing overflows, make NO change in this step — do not restyle text that fits.
Record in the report whether any change was needed.

- [ ] **Step 4: Lint**

Run: `npx eslint "src/components/dashboard/CeoDashboard.tsx"`
Expected: no new errors.

- [ ] **Step 5: Build check**

Run: `npm run build 2>&1 | grep -B1 -A3 "Failed to compile" | head`
Expected: only the pre-existing `@anthropic-ai/sdk` error — nothing referencing
`CeoDashboard.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/CeoDashboard.tsx
git commit -m "style(dashboard): scale CEO dashboard headers and radii for mobile

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Done — Phase 1 acceptance

- [ ] CEO dashboard at 390px: card padding is comfortable (not 32px gutters), chart
  readable, headers don't overflow, radii proportionate.
- [ ] Desktop (`>= 768px`): visually identical to before — all desktop values
  preserved behind `md:` variants.
- [ ] `npm run build` reaches only the pre-existing `@anthropic-ai/sdk` error.

Next: Phase 2 (CRM) — its own spec → plan.

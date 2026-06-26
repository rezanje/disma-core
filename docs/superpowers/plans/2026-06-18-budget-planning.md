# Budget Planning Feature — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Build monthly budget planning page at /finance/budget with planning vs realisasi, progress bars, warnings, realokasi, adjustment, and historical suggestions.

**Architecture:** 4 new Supabase tables synced via existing store/syncTable pattern. Realisasi computed client-side from cashTransactions + reimbursements + expenses. UI: single page, 3 modes (Dashboard/Form/History), existing shadcn components.

**Tech Stack:** Next.js 14, TypeScript, Zustand, Supabase, shadcn/ui, date-fns, lucide-react.

---

## Task 1: DB Migration

**Files:**
- Create: supabase/migrations/20260618_budget_planning.sql

- [ ] Create SQL file with 4 tables: budget_plans, budget_categories, budget_sub_categories, budget_adjustments (see spec for full DDL)
- [ ] Run migration via Supabase dashboard SQL editor
- [ ] Verify: NODE_PATH=node_modules node -e "...select from all 4 tables"
- [ ] Commit: git commit -m "feat(budget): add DB migration for budget planning tables"

## Task 2: TypeScript Types

**Files:**
- Modify: src/types/index.ts

- [ ] Append BudgetPlan, BudgetCategory, BudgetSubCategory, BudgetAdjustment interfaces
- [ ] npx tsc --noEmit to verify
- [ ] Commit

## Task 3: Store State & Actions

**Files:**
- Modify: src/lib/store.ts

- [ ] Add budget imports to top import line
- [ ] Add state interface entries (budgetPlans, budgetCategories, budgetSubCategories, budgetAdjustments + actions)
- [ ] Add initial state + upsertBudgetPlan/Category/SubCategory/Adjustment + delete actions
- [ ] Wire into loadData setIfDefined calls
- [ ] npx tsc --noEmit
- [ ] Commit

## Task 4: API Route

**Files:**
- Modify: src/app/api/db/route.ts

- [ ] Add 4 budget tables to GROUP 3 Promise.all fetch and return object
- [ ] Commit

## Task 5: useBudgetRealisasi Hook

**Files:**
- Create: src/app/finance/budget/hooks/useBudgetRealisasi.ts

- [ ] Implement hook that aggregates cashTransactions (Out/Manual) + reimbursements (Paid) + expenses (Approved) for a given month
- [ ] Map to sub-categories via mappedTxCategories[], compute % and uncategorized
- [ ] Commit

## Task 6: useBudgetSuggestions Hook

**Files:**
- Create: src/app/finance/budget/hooks/useBudgetSuggestions.ts

- [ ] Find up to 3 prior Closed/Active plans, compute avg realisasi per sub by name
- [ ] Suggestion = avg * 1.10 rounded to nearest Rp 50,000
- [ ] Commit

## Task 7: RealokasiModal + AdjustmentModal

**Files:**
- Create: src/app/finance/budget/components/RealokasiModal.tsx
- Create: src/app/finance/budget/components/AdjustmentModal.tsx

- [ ] RealokasiModal: From/To category selects, amount, reason, validate saldo cukup, upsert both cats + log adjustment
- [ ] AdjustmentModal: Category select, add/subtract toggle, amount, reason, upsert cat + plan.totalPlanned + log
- [ ] Commit

## Task 8: Main Budget Page

**Files:**
- Overwrite: src/app/finance/budget/page.tsx

- [ ] 3-mode page (dashboard/form/history) with tab switcher
- [ ] Dashboard: summary card (total planned vs realized, global %), per-category progress bars with expand for sub-pos, warning badges, realokasi/adjust buttons, adjustment log
- [ ] Form: month picker, notes, per-sub input fields with historical suggestion display, Accept All button
- [ ] History: list of Closed plans
- [ ] Warning toast system (once per session per sub at 95%)
- [ ] Auth guard: roles = ['super_admin', 'ceo', 'coo', 'finance']
- [ ] npx tsc --noEmit
- [ ] Commit

## Task 9: End-to-End Verification

- [ ] Dev server running at localhost:3000
- [ ] Navigate to /finance/budget — no redirect, empty state shown
- [ ] Create plan with amounts → dashboard shows progress bars
- [ ] Realokasi modal works, log entry appears
- [ ] Adjust plafond modal works, log entry appears
- [ ] Warning colors: green/yellow/red at correct thresholds
- [ ] History tab shows closed plans after creating second plan
- [ ] Final commit: git commit -m "feat(budget): complete monthly budget planning feature"

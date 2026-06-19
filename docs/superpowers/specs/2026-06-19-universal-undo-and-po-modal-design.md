# Design Specification: Universal Undo and Spacious PO Modal

**Date:** 2026-06-19
**Status:** Approved

## Goal
Improve the user experience of undoing transactions and previewing purchase orders (POs) by:
1. Fixing a compilation/syntax error in `src/app/admin/shopping-list/page.tsx`.
2. Making the PO Preview dialog wider and more spacious (nearly full-screen).
3. Implementing a universal floating Undo button visible globally.
4. Redesigning the Undo database sync to be non-destructive and safe for multi-user environments.

---

## Proposed Changes

### 1. Fix Syntax Error in Shopping List Page
We will close the unclosed tags for the `pdfPreview` `<Dialog>`:
- Insert `</DialogContent>` and `</Dialog>` right after `</DialogFooter>` (around line 1647) and before `{/* Floating Undo Button */}`.

### 2. Spacious PO Preview Dialog
- Modify the `DialogContent` in `src/app/admin/shopping-list/page.tsx` (around line 1589) from `max-w-5xl h-[90vh]` to `max-w-[96vw] w-[96vw] h-[96vh]` to make it spacious and comfortable for reviewing before downloading or printing.

### 3. Zustand Store (`src/lib/store.ts`)
We will upgrade the store state and undo operation:
- Add `isUndoing: boolean` state.
- Add `shoppingListUndo: (() => void) | null` and `shoppingListHistoryLength: number` states to bridge the local shopping-list undo stack with the global button.
- Add `setShoppingListUndo: (cb: (() => void) | null, length: number) => void` action.
- Update `undoDevSnapshot`:
  - Set `isUndoing: true` during execution.
  - Perform targeted diffing for all operational tables:
    - Compare the current store state lists with the snapshot lists.
    - **Deleted records**: Records present in the snapshot but missing in the current state $\rightarrow$ Upsert to Supabase.
    - **Inserted records**: Records present in the current state but missing in the snapshot $\rightarrow$ Delete from Supabase.
    - **Updated records**: Records present in both but with differences $\rightarrow$ Restore snapshot values and upsert to Supabase.
  - This avoids running the global custom table wipe (`/api/db/reset` mode `custom`), preserving other concurrent users' operations.
  - Re-enable `isUndoing: false` in the `finally` block.

### 4. Global Undo Button Component (`src/components/global-undo-button.tsx`)
Create a new floating Undo component:
- Positioned at `fixed bottom-6 right-6 z-[9999]`.
- Style: Glassmorphism dark background (`bg-slate-950/80 backdrop-blur-md border border-white/10 hover:border-emerald-500/20`), text color, Lucide icons (`Undo2` and `Loader2`), hover translate-y-0.5, active scale-95.
- Logic:
  - If pathname is `/admin/shopping-list` and `shoppingListHistoryLength > 0`, it triggers `shoppingListUndo()`.
  - Else if `devHistoryStack.length > 0`, it triggers global `undoDevSnapshot()`.
  - Displays appropriate count: `Undo Pemilihan ({count})` or `Undo Transaksi ({count})`.
  - Displays spinner and disables interaction when `isUndoing` is true to prevent double-clicks.

### 5. Layout Update (`src/app/layout.tsx`)
- Render `<GlobalUndoButton />` globally.

### 6. Dev Overlay Position Update (`src/components/dev-overlay.tsx`)
- Shift `DevOverlay` container position to `fixed bottom-24 right-4 z-[9999]` (when visible in development) so it does not overlap with the global floating Undo button.

---

## Verification Plan

### Automated Checks
- Verify type correctness using TypeScript compilation check:
  `npx tsc --noEmit`
- Verify production build compilation:
  `npm run build`

### Manual Verification
- Verify the compilation error is resolved and the application loads.
- Open "Preview Daftar Belanja" modal on shopping list page and verify it takes up 96% of the viewport width and 96% of viewport height.
- Perform a cash transaction and verify the universal floating Undo button appears on the screen.
- Click Undo and verify the transaction is rolled back with a spinner loading state, without modifying unrelated rows.

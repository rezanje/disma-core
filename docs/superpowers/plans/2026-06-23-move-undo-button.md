# Move Global Undo Button Inline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the global floating undo button to be an inline button next to the "+ New Sales Order" button in the Sales Orders page.

**Architecture:** Add an `inline?: boolean` prop to the `GlobalUndoButton` component. When `inline` is true, render a standard sized button with outline style. When it is false, hide the floating version if the pathname is `/admin/sales-orders`, and render it inline in the page header component using `<GlobalUndoButton inline />` next to "+ New Sales Order".

**Tech Stack:** React, Next.js (App Router), TailwindCSS, Radix UI (Button), Lucide-react (Undo2, Loader2, Share2).

---

### Task 1: Update `GlobalUndoButton` component to support inline mode

**Files:**
- Modify: `src/components/global-undo-button.tsx`

- [ ] **Step 1: Add `inline` prop and hide floating button on `/admin/sales-orders`**
  Modify `src/components/global-undo-button.tsx` to:
  1. Accept `inline?: boolean` (default `false`) as a prop.
  2. In the non-inline check block, return `null` if the pathname matches `"/admin/sales-orders"`.
  3. If `inline` is true, render the button inline without floating styles.
  
  Code to replace:
  ```tsx
  export default function GlobalUndoButton() {
    const pathname = usePathname()
    const historyCount = useAppStore(state => state.devHistoryStack.length)
    const isUndoing = useAppStore(state => state.isUndoing)
    const undoDevSnapshot = useAppStore(state => state.undoDevSnapshot)
  
    // Shopping list page-level bridge
    const shoppingListUndo = useAppStore(state => state.shoppingListUndo)
    const shoppingListHistoryLength = useAppStore(state => state.shoppingListHistoryLength)
  
    // Only show on admin/finance/sourcing/warehouse/courier routes
    const isAllowedPath = pathname?.startsWith("/admin") || 
                          pathname?.startsWith("/finance") || 
                          pathname?.startsWith("/sourcing") || 
                          pathname?.startsWith("/warehouse") || 
                          pathname?.startsWith("/courier")
  
    if (!isAllowedPath) return null
    if (pathname?.startsWith("/tri-chess")) return null
  
    const isShoppingList = pathname === "/admin/shopping-list"
    const hasShoppingListHistory = isShoppingList && shoppingListHistoryLength > 0
    const hasGlobalHistory = historyCount > 0
    const canUndo = hasShoppingListHistory || hasGlobalHistory
  
    const handleUndoAction = async () => {
      if (isUndoing || !canUndo) return
      if (hasShoppingListHistory && shoppingListUndo) {
        shoppingListUndo()
      } else {
        await undoDevSnapshot()
      }
    }
  
    const titleText = hasShoppingListHistory
      ? `Undo Pemilihan (${shoppingListHistoryLength})`
      : hasGlobalHistory
        ? `Undo Transaksi (${historyCount})`
        : "Undo"
  
    return (
      <div className="fixed bottom-6 right-6 z-[9999] animate-in fade-in slide-in-from-bottom-4 duration-300">
        <Button
          size="lg"
          onClick={handleUndoAction}
          disabled={isUndoing || !canUndo}
          className={cn(
            "shadow-2xl transition-all font-black text-xs uppercase tracking-widest flex items-center gap-2 h-12 px-5 rounded-full border",
            canUndo 
              ? "bg-slate-900 text-white border-slate-800 hover:bg-slate-800 hover:scale-105 hover:border-emerald-500/20 active:scale-95" 
              : "bg-slate-200/50 dark:bg-slate-950/20 text-slate-400 border-slate-300/20 dark:border-slate-800/10 opacity-30 cursor-not-allowed"
          )}
        >
          {isUndoing ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : (
            <Undo2 className={cn("h-4 w-4", canUndo ? "text-emerald-400 animate-pulse" : "text-slate-400")} />
          )}
          <span>{isUndoing ? "Membatalkan..." : titleText}</span>
        </Button>
      </div>
    )
  }
  ```
  
  Replace with:
  ```tsx
  interface GlobalUndoButtonProps {
    inline?: boolean
  }
  
  export default function GlobalUndoButton({ inline = false }: GlobalUndoButtonProps) {
    const pathname = usePathname()
    const historyCount = useAppStore(state => state.devHistoryStack.length)
    const isUndoing = useAppStore(state => state.isUndoing)
    const undoDevSnapshot = useAppStore(state => state.undoDevSnapshot)
  
    // Shopping list page-level bridge
    const shoppingListUndo = useAppStore(state => state.shoppingListUndo)
    const shoppingListHistoryLength = useAppStore(state => state.shoppingListHistoryLength)
  
    if (!inline) {
      // Only show on admin/finance/sourcing/warehouse/courier routes
      const isAllowedPath = pathname?.startsWith("/admin") || 
                            pathname?.startsWith("/finance") || 
                            pathname?.startsWith("/sourcing") || 
                            pathname?.startsWith("/warehouse") || 
                            pathname?.startsWith("/courier")
  
      if (!isAllowedPath) return null
      if (pathname?.startsWith("/tri-chess")) return null
      if (pathname === "/admin/sales-orders") return null // Hide floating version on sales-orders page
    }
  
    const isShoppingList = pathname === "/admin/shopping-list"
    const hasShoppingListHistory = isShoppingList && shoppingListHistoryLength > 0
    const hasGlobalHistory = historyCount > 0
    const canUndo = hasShoppingListHistory || hasGlobalHistory
  
    const handleUndoAction = async () => {
      if (isUndoing || !canUndo) return
      if (hasShoppingListHistory && shoppingListUndo) {
        shoppingListUndo()
      } else {
        await undoDevSnapshot()
      }
    }
  
    const titleText = hasShoppingListHistory
      ? `Undo Pemilihan (${shoppingListHistoryLength})`
      : hasGlobalHistory
        ? `Undo Transaksi (${historyCount})`
        : "Undo"
  
    if (inline) {
      return (
        <Button
          onClick={handleUndoAction}
          disabled={isUndoing || !canUndo}
          variant="outline"
          className={cn(
            "transition-all font-black text-xs uppercase tracking-wider flex items-center gap-2 h-10 px-4 rounded-xl border",
            canUndo 
              ? "border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:scale-105 active:scale-95 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200" 
              : "bg-slate-50 text-slate-300 border-slate-200 dark:bg-slate-950/20 dark:text-slate-600 dark:border-slate-800/10 cursor-not-allowed opacity-50"
          )}
        >
          {isUndoing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
          ) : (
            <Undo2 className={cn("h-3.5 w-3.5", canUndo ? "text-emerald-500 animate-pulse" : "text-slate-400")} />
          )}
          <span>{isUndoing ? "Membatalkan..." : titleText}</span>
        </Button>
      )
    }
  
    return (
      <div className="fixed bottom-6 right-6 z-[9999] animate-in fade-in slide-in-from-bottom-4 duration-300">
        <Button
          size="lg"
          onClick={handleUndoAction}
          disabled={isUndoing || !canUndo}
          className={cn(
            "shadow-2xl transition-all font-black text-xs uppercase tracking-widest flex items-center gap-2 h-12 px-5 rounded-full border",
            canUndo 
              ? "bg-slate-900 text-white border-slate-800 hover:bg-slate-800 hover:scale-105 hover:border-emerald-500/20 active:scale-95" 
              : "bg-slate-200/50 dark:bg-slate-950/20 text-slate-400 border-slate-300/20 dark:border-slate-800/10 opacity-30 cursor-not-allowed"
          )}
        >
          {isUndoing ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : (
            <Undo2 className={cn("h-4 w-4", canUndo ? "text-emerald-400 animate-pulse" : "text-slate-400")} />
          )}
          <span>{isUndoing ? "Membatalkan..." : titleText}</span>
        </Button>
      </div>
    )
  }
  ```

- [ ] **Step 2: Commit Task 1**
  ```bash
  git add src/components/global-undo-button.tsx
  git commit -m "feat(undo): support inline prop and hide floating button on sales orders page"
  ```

---

### Task 2: Integrate `GlobalUndoButton` inline on Sales Orders page

**Files:**
- Modify: `src/app/admin/sales-orders/page.tsx`

- [ ] **Step 1: Import `GlobalUndoButton` and wrap "+ New Sales Order" inside flex container**
  Modify `src/app/admin/sales-orders/page.tsx` to:
  1. Import `GlobalUndoButton` at the top of the file.
  2. Put `<GlobalUndoButton inline />` next to the Dialog containing "+ New Sales Order".
  
  Code to modify (imports around line 10):
  Add `import GlobalUndoButton from "@/components/global-undo-button"`
  
  Code to modify (around line 673):
  ```tsx
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger render={
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New Sales Order
              </Button>
            } />
  ```
  
  Replace with:
  ```tsx
          <div className="flex items-center gap-2">
            <GlobalUndoButton inline />
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger render={
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> New Sales Order
                </Button>
              } />
  ```
  And close the extra `div` wrapper.

- [ ] **Step 2: Commit Task 2**
  ```bash
  git add src/app/admin/sales-orders/page.tsx
  git commit -m "feat(sales-orders): place global undo button inline next to new sales order button"
  ```

---

### Task 3: Manual Verification

- [ ] **Step 1: Start dev server and verify page layout**
  Run local dev server if needed, verify `localhost:3000/admin/sales-orders` to check that:
  1. The floating button is gone.
  2. An outline/disabled "Undo" button is present next to "+ New Sales Order".

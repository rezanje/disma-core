# Universal Undo and Spacious PO Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the compilation error in the shopping list page, make the PO preview dialog larger/more spacious, implement a universal floating Undo button visible across all pages, and redesign the Undo mechanism to perform non-destructive, targeted database changes that are safe for concurrent multi-user environments.

**Architecture:** We will extend the Zustand store to expose undo state and bridge page-level undo hooks. We will rewrite the undo function to calculate differences between the store state and a snapshot list, executing targeted POST and DELETE calls to Supabase instead of a global table wipe. A floating global client component will render the Undo button dynamically.

**Tech Stack:** Next.js (Turbopack), Zustand, Tailwind CSS, Lucide React icons, Supabase client REST API.

---

### Task 1: Fix Syntax Error and Make Preview Dialog Spacious in Shopping List Page

**Files:**
- Modify: `src/app/admin/shopping-list/page.tsx`

- [ ] **Step 1: Fix unclosed dialog tags and make it spacious**
  Replace lines 1588-1668 with the corrected Dialog wrapper containing `</DialogContent></Dialog>` tags, removing the local floating Undo HTML component, registering the local history stack size to the Zustand store, and updating the DialogContent className to `max-w-[96vw] w-[96vw] h-[96vh]`.

  *Target Block to Replace (approx lines 1588-1669):*
  ```tsx
        <Dialog open={!!pdfPreview} onOpenChange={(open) => !open && setPdfPreview(null)}>
          <DialogContent className="max-w-5xl h-[90vh] p-0 rounded-[2rem] overflow-hidden border-none bg-slate-900 shadow-2xl flex flex-col">
            ... [existing content] ...
            </DialogFooter>
        {/* Floating Undo Button */}
        {history.length > 0 && (
          <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <Button
              ...
            </Button>
          </div>
        )}
      </div>
    )
  }
  ```

  *Replacement Content:*
  ```tsx
        <Dialog open={!!pdfPreview} onOpenChange={(open) => !open && setPdfPreview(null)}>
          <DialogContent className="max-w-[96vw] w-[96vw] h-[96vh] p-0 rounded-[2rem] overflow-hidden border-none bg-slate-900 shadow-2xl flex flex-col">
            <DialogHeader className="p-6 bg-slate-900 text-white flex flex-row items-center justify-between shrink-0 space-y-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-black tracking-tight">Preview Daftar Belanja</DialogTitle>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cek dokumen sebelum download atau print</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
                onClick={() => setPdfPreview(null)}
              >
                <X className="w-5 h-5" />
              </Button>
            </DialogHeader>
            <div className="flex-1 bg-slate-800 p-4 overflow-hidden">
              {pdfPreview && (
                <iframe
                  src={`${pdfPreview.url}#toolbar=0&navpanes=0&scrollbar=0`}
                  className="w-full h-full rounded-sm border-none bg-white shadow-2xl"
                  title="Preview Daftar Belanja"
                />
              )}
            </div>
            <DialogFooter className="p-5 bg-slate-900 border-t border-white/10 gap-3 sm:justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                File belum diunduh sampai klik Download.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="h-11 rounded-xl border-white/10 bg-white/10 text-white hover:bg-white hover:text-slate-900 font-black uppercase tracking-widest text-[10px]"
                  onClick={() => {
                    if (!pdfPreview) return
                    const printWindow = window.open(pdfPreview.url, '_blank')
                    printWindow?.addEventListener('load', () => printWindow.print())
                  }}
                >
                  <Printer className="w-4 h-4 mr-2" /> Print
                </Button>
                <Button
                  className="h-11 rounded-xl bg-white text-slate-900 hover:bg-slate-100 font-black uppercase tracking-widest text-[10px]"
                  onClick={() => {
                    if (!pdfPreview) return
                    const link = document.createElement('a')
                    link.href = pdfPreview.url
                    link.download = `${pdfPreview.title}.pdf`
                    link.click()
                  }}
                >
                  <Download className="w-4 h-4 mr-2" /> Download PDF
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }
  ```

- [ ] **Step 2: Bridge local shopping-list history stack to Zustand store**
  Add a subscription block at the start of `/admin/shopping-list/page.tsx` component to sync local selection history length and the `handleUndo` callback with the store.
  
  *Insert near line 140 (under `const [isUndoing, setIsUndoing] = useState(false)`):*
  ```tsx
    const setShoppingListUndo = useAppStore(state => state.setShoppingListUndo)
    useEffect(() => {
      setShoppingListUndo(handleUndo, history.length)
      return () => setShoppingListUndo(null, 0)
    }, [history.length, handleUndo, setShoppingListUndo])
  ```

- [ ] **Step 3: Capture snapshots on DB consolidations and deletions**
  Update `handleConsolidate`, `handleSendToFinance`, and `handleDeletePurchase` functions in `page.tsx` to call `useAppStore.getState().takeDevSnapshot()` before executing database writes.

  *Modify `handleConsolidate` (around line 440):*
  ```tsx
      setIsLoading(true)
      const loadingId = toast.loading("Membuat dokumen list belanja...")
      const title = `Daftar_Belanja_${new Date().toISOString().slice(0, 10)}`
      try {
        useAppStore.getState().takeDevSnapshot()
        await addPurchase({
  ```

  *Modify `handleSendToFinance` (around line 538):*
  ```tsx
      setIsSendingToFinance(purchaseId)
      const loadingId = toast.loading("Mengirim ke Finance...")
      try {
        useAppStore.getState().takeDevSnapshot()
        const items = purchaseItems.filter(pi => pi.purchaseId === purchaseId && pi.purchaseMethod === 'Pasar')
  ```

  *Modify `handleDeletePurchase` (around line 588):*
  ```tsx
      setIsDeletingPurchase(purchaseId)
      try {
        useAppStore.getState().takeDevSnapshot()
        await deletePurchase(purchaseId)
  ```

- [ ] **Step 4: Verify syntax error is fixed and app builds**
  Run: `npm run build`
  Expected: Successful production build without syntax errors.

---

### Task 2: Extend Zustand Store Types and Actions in `src/lib/store.ts`

**Files:**
- Modify: `src/lib/store.ts`

- [ ] **Step 1: Declare state types for undo states**
  Add properties to `AppState` interface definition.

  *Modify interface `AppState` (around line 530):*
  ```typescript
    // Dev & Simulation Helpers
    devHistoryStack: Partial<AppState>[];
    takeDevSnapshot: () => void;
    undoDevSnapshot: () => Promise<void>;
    isUndoing: boolean;
    shoppingListUndo: (() => void) | null;
    shoppingListHistoryLength: number;
    setShoppingListUndo: (cb: (() => void) | null, length: number) => void;
  ```

- [ ] **Step 2: Initialize undo state properties in the store creation**
  *Modify Zustand store initializer (around line 2926):*
  ```typescript
        devHistoryStack: [],
        isUndoing: false,
        shoppingListUndo: null,
        shoppingListHistoryLength: 0,
        setShoppingListUndo: (cb, length) => set({ shoppingListUndo: cb, shoppingListHistoryLength: length }),
  ```

- [ ] **Step 3: Capture snapshots on Sales Order deletion**
  *Modify `deleteSalesOrder` and `deleteMultipleSalesOrders` to call `get().takeDevSnapshot()`:*
  ```typescript
        deleteSalesOrder: async (id: string) => {
          get().takeDevSnapshot();
          const orderBefore = get().salesOrders.find(so => so.id === id);
          ...
  ```
  And:
  ```typescript
        deleteMultipleSalesOrders: async (ids: string[]) => {
          get().takeDevSnapshot();
          const ordersBefore = get().salesOrders.filter(so => ids.includes(so.id));
          ...
  ```

---

### Task 3: Redesign `undoDevSnapshot` to be safe and non-destructive

**Files:**
- Modify: `src/lib/store.ts`

- [ ] **Step 1: Re-implement `undoDevSnapshot` with target difference calculation**
  Rewrite the `undoDevSnapshot` method in `src/lib/store.ts` to sync only changed/deleted/inserted rows to Supabase.

  *Modify `undoDevSnapshot` implementation (approx lines 2955-3020):*
  ```typescript
        undoDevSnapshot: async () => {
          const { devHistoryStack } = get();
          if (devHistoryStack.length === 0) {
            toast.error("Tidak ada history untuk di-undo.");
            return;
          }
          set({ isUndoing: true });
          const toastId = toast.loading(`Undoing... (${devHistoryStack.length} step tersisa)`);
          
          try {
            const newStack = [...devHistoryStack];
            const snapshot = newStack.pop()!;
            const state = get();

            const ZUSTAND_TO_DB_TABLES: Record<string, string> = {
              salesOrders: 'sales_orders',
              salesOrderItems: 'sales_order_items',
              purchases: 'purchases',
              purchaseItems: 'purchase_items',
              purchaseRequests: 'purchase_requests',
              deliveries: 'deliveries',
              expenses: 'expenses',
              invoices: 'invoices',
              tukarFakturs: 'tukar_faktur',
              journalEntries: 'journal_entries',
              journalLines: 'journal_lines',
              stockMovements: 'stock_movements',
              cashTransactions: 'cash_transactions',
              bankAccounts: 'bank_accounts',
              pendingReturns: 'pending_returns',
              reimbursements: 'reimbursements',
              rejectedItems: 'rejected_items',
              products: 'products',
            };

            for (const [storeKey, dbTable] of Object.entries(ZUSTAND_TO_DB_TABLES)) {
              const snapList = (snapshot as any)[storeKey] || [];
              const curList = (state as any)[storeKey] || [];

              const snapMap = new Map(snapList.map((r: any) => [r.id, r]));
              const curMap = new Map(curList.map((r: any) => [r.id, r]));

              const toDelete: string[] = [];
              const toUpsert: any[] = [];

              // 1. Find deleted or updated items
              for (const snapItem of snapList) {
                const curItem = curMap.get(snapItem.id);
                if (!curItem) {
                  toUpsert.push(snapItem);
                } else if (JSON.stringify(snapItem) !== JSON.stringify(curItem)) {
                  toUpsert.push(snapItem);
                }
              }

              // 2. Find inserted items
              for (const curItem of curList) {
                if (!snapMap.has(curItem.id)) {
                  toDelete.push(curItem.id);
                }
              }

              // 3. Sync deletions
              if (toDelete.length > 0) {
                const delRes = await fetch('/api/db', {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ table: dbTable, id: toDelete })
                });
                if (!delRes.ok) throw new Error(`Failed deletion for ${dbTable}`);
              }

              // 4. Sync upserts
              if (toUpsert.length > 0) {
                const upsRes = await fetch('/api/db', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ table: dbTable, data: toUpsert })
                });
                if (!upsRes.ok) throw new Error(`Failed update/insert for ${dbTable}`);
              }
            }

            // Restore state lokal
            set({ ...snapshot, devHistoryStack: newStack });
            if (snapshot.clients) saveLocalClientsCache(snapshot.clients);
            if (snapshot.products) saveLocalProductsCache(snapshot.products);
            if (snapshot.salesOrders) saveLocalSalesOrdersCache(snapshot.salesOrders);
            if (snapshot.salesOrderItems) saveLocalSalesOrderItemsCache(snapshot.salesOrderItems);
            if (snapshot.purchases) saveLocalPurchasesCache(snapshot.purchases);
            if (snapshot.purchaseItems) saveLocalPurchaseItemsCache(snapshot.purchaseItems);
            if (snapshot.purchaseRequests) saveLocalPurchaseRequestsCache(snapshot.purchaseRequests);

            toast.success(`Undo berhasil! (${newStack.length} step tersisa)`, { id: toastId });
          } catch (e: any) {
            toast.error("Gagal melakukan undo: " + e.message, { id: toastId });
          } finally {
            set({ isUndoing: false });
          }
        },
  ```

---

### Task 4: Create Global Undo Button component

**Files:**
- Create: `src/components/global-undo-button.tsx`

- [ ] **Step 1: Write `global-undo-button.tsx` file**
  Create the floating component at `src/components/global-undo-button.tsx` containing the logic and styles.

  ```tsx
  "use client"

  import React from "react"
  import { usePathname } from "next/navigation"
  import { useAppStore } from "@/lib/store"
  import { Button } from "@/components/ui/button"
  import { Undo2, Loader2 } from "lucide-react"

  export default function GlobalUndoButton() {
    const pathname = usePathname()
    const historyCount = useAppStore(state => state.devHistoryStack.length)
    const isUndoing = useAppStore(state => state.isUndoing)
    const undoDevSnapshot = useAppStore(state => state.undoDevSnapshot)

    // Shopping list page-level bridge
    const shoppingListUndo = useAppStore(state => state.shoppingListUndo)
    const shoppingListHistoryLength = useAppStore(state => state.shoppingListHistoryLength)

    const isShoppingList = pathname === "/admin/shopping-list"
    const hasShoppingListHistory = isShoppingList && shoppingListHistoryLength > 0
    const hasGlobalHistory = historyCount > 0

    if (!hasShoppingListHistory && !hasGlobalHistory) return null
    if (pathname?.startsWith("/tri-chess")) return null

    const handleUndoAction = async () => {
      if (isUndoing) return
      if (hasShoppingListHistory && shoppingListUndo) {
        shoppingListUndo()
      } else {
        await undoDevSnapshot()
      }
    }

    const titleText = hasShoppingListHistory
      ? `Undo Pemilihan (${shoppingListHistoryLength})`
      : `Undo Transaksi (${historyCount})`

    return (
      <div className="fixed bottom-6 right-6 z-[9999] animate-in fade-in slide-in-from-bottom-4 duration-300">
        <Button
          size="lg"
          onClick={handleUndoAction}
          disabled={isUndoing}
          className="shadow-2xl hover:scale-105 transition-all font-black text-xs uppercase tracking-widest bg-slate-900 text-white border border-slate-800 hover:bg-slate-800 flex items-center gap-2 h-12 px-5 rounded-full"
        >
          {isUndoing ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : (
            <Undo2 className="h-4 w-4 text-emerald-400" />
          )}
          <span>{isUndoing ? "Membatalkan..." : titleText}</span>
        </Button>
      </div>
    )
  }
  ```

---

### Task 5: Integrate `GlobalUndoButton` in Layout and Reposition `DevOverlay`

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/components/dev-overlay.tsx`

- [ ] **Step 1: Render `<GlobalUndoButton />` in `src/app/layout.tsx`**
  Import and place the new component inside `RootLayout` right next to `<DevOverlay />` inside the HydrationGate.

  *Modify `src/app/layout.tsx`:*
  ```typescript
  import GlobalUndoButton from "@/components/global-undo-button";
  ```
  And inside the return:
  ```tsx
          <HydrationGate>
            {children}
          </HydrationGate>
          <Toaster />
          <DevOverlay />
          <GlobalUndoButton />
  ```

- [ ] **Step 2: Shift `DevOverlay` position to bottom-24 and remove its internal Undo button**
  Adjust container classes in `src/components/dev-overlay.tsx` to shift it up. Also remove the local "Undo" button since the global one takes over.

  *Update `isVisible: false` container position (approx lines 61-71):*
  ```tsx
    if (!isVisible) return (
      <div className="fixed bottom-24 right-4 z-[9999]">
  ```

  *Update main overlay container position (approx line 74):*
  ```tsx
      <div className="fixed bottom-24 right-4 z-[9999] animate-in slide-in-from-right-10 duration-500">
  ```

  *Remove the DevOverlay's own Undo button block (approx lines 87-95):*
  Find and delete:
  ```tsx
          <Button 
            onClick={handleUndo}
            variant="ghost"
            className="h-10 rounded-full text-slate-300 hover:text-white hover:bg-white/10 gap-2 font-bold text-xs uppercase tracking-tight disabled:opacity-30"
            disabled={historyCount === 0}
          >
            <Undo2 className="w-4 h-4" />
            Undo {historyCount > 0 && <span className="bg-white/20 rounded-full px-1.5 py-0.5 text-[10px]">{historyCount}</span>}
          </Button>
  ```

---

### Task 6: Final Verification and Type Checks

- [ ] **Step 1: Run type check**
  Run: `npx tsc --noEmit`
  Expected: 0 errors.

- [ ] **Step 2: Run build check**
  Run: `npm run build`
  Expected: Successful compilation without errors.

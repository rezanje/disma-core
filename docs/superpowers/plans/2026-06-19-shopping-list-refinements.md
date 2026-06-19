# Shopping List UI/UX Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the Auto-Consolidator UI/UX on the shopping list page by hiding vendors for warehouse stock, adding an Undo button with loading state, and separating the Pasar/Online purchase method buttons.

**Architecture:** We will modify the client-side state hooks in the `ShoppingListPage` component, add a history stack for undo capability, update click handlers, and split toggle buttons in the rendering table.

**Tech Stack:** Next.js (App Router), React, Lucide Icons, Tailwind CSS, Zustand.

---

### Task 1: Imports and Undo State History

**Files:**
- Modify: `src/app/admin/shopping-list/page.tsx:7-81`

- [ ] **Step 1: Import Undo2 icon**
  Add `Undo2` to the `lucide-react` import statement on line 7.

- [ ] **Step 2: Add StateSnapshot type and state hooks**
  Under the imports, declare the `StateSnapshot` type.
  Inside `ShoppingListPage`, declare the `history` and `isUndoing` states:
  ```typescript
  type StateSnapshot = {
    manualItems: Array<{id: string, productId: string, qty: number, price: number}>;
    customPrices: Record<string, number>;
    vendorAssignments: Record<string, string>;
    onlineProductIds: Set<string>;
    transferProductIds: Set<string>;
    stockBookedProductIds: Set<string>;
    selectedSOIds: Set<string>;
  };
  ```
  ```typescript
  const [history, setHistory] = useState<StateSnapshot[]>([]);
  const [isUndoing, setIsUndoing] = useState(false);
  ```

- [ ] **Step 3: Define saveToHistory and handleUndo helpers**
  Define `saveToHistory` to copy current states onto the stack.
  Define `handleUndo` to pop the last state and restore it with a 500ms delay:
  ```typescript
  const saveToHistory = () => {
    const snapshot: StateSnapshot = {
      manualItems: [...manualItems],
      customPrices: { ...customPrices },
      vendorAssignments: { ...vendorAssignments },
      onlineProductIds: new Set(onlineProductIds),
      transferProductIds: new Set(transferProductIds),
      stockBookedProductIds: new Set(stockBookedProductIds),
      selectedSOIds: new Set(selectedSOIds)
    };
    setHistory(prev => [...prev, snapshot]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    setIsUndoing(true);
    setTimeout(() => {
      const prevHistory = [...history];
      const lastSnapshot = prevHistory.pop();
      if (lastSnapshot) {
        setManualItems(lastSnapshot.manualItems);
        setCustomPrices(lastSnapshot.customPrices);
        setVendorAssignments(lastSnapshot.vendorAssignments);
        setOnlineProductIds(lastSnapshot.onlineProductIds);
        setTransferProductIds(lastSnapshot.transferProductIds);
        setStockBookedProductIds(lastSnapshot.stockBookedProductIds);
        setSelectedSOIds(lastSnapshot.selectedSOIds);
        setHistory(prevHistory);
        toast.success("Aksi berhasil dibatalkan (Undone).");
      }
      setIsUndoing(false);
    }, 500);
  };
  ```

---

### Task 2: Connect saveToHistory to Actions and Implement Page-level Actions

**Files:**
- Modify: `src/app/admin/shopping-list/page.tsx:120-310`

- [ ] **Step 1: Update toggleSelectItem, applyVendorToSelected, handleAddManualItem, handleRemoveManualItem**
  Add `saveToHistory()` before updating states in:
  - `applyVendorToSelected`
  - `handleAddManualItem`
  - `handleRemoveManualItem`
  - Clear selection buttons (e.g. "Pilih Semua", "Kosongkan" SOs)

- [ ] **Step 2: Define specific select methods**
  Define `selectPasar`, `selectOnline`, `selectTransfer` which set the purchase method and also turn off stock booked:
  ```typescript
  const selectPasar = (productId: string) => {
    saveToHistory();
    setStockBookedProductIds(prev => { const next = new Set(prev); next.delete(productId); return next; });
    setOnlineProductIds(prev => { const next = new Set(prev); next.delete(productId); return next; });
    setTransferProductIds(prev => { const next = new Set(prev); next.delete(productId); return next; });
  };

  const selectOnline = (productId: string) => {
    saveToHistory();
    setStockBookedProductIds(prev => { const next = new Set(prev); next.delete(productId); return next; });
    setOnlineProductIds(prev => { const next = new Set(prev); next.add(productId); return next; });
    setTransferProductIds(prev => { const next = new Set(prev); next.delete(productId); return next; });
  };

  const selectTransfer = (productId: string) => {
    saveToHistory();
    setStockBookedProductIds(prev => { const next = new Set(prev); next.delete(productId); return next; });
    setTransferProductIds(prev => { const next = new Set(prev); next.add(productId); return next; });
    setOnlineProductIds(prev => { const next = new Set(prev); next.delete(productId); return next; });
  };
  ```

- [ ] **Step 3: Update toggleStockBooked to clear vendor selection**
  Update `toggleStockBooked` to save history and clear vendor assignments when enabled:
  ```typescript
  const toggleStockBooked = (productId: string) => {
    saveToHistory();
    setStockBookedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
        setVendorAssignments(v => {
          const n = { ...v };
          delete n[productId];
          return n;
        });
      }
      return next;
    });
  };
  ```

- [ ] **Step 4: Update applyVendorToSelected to skip warehouse stock items**
  Inside `applyVendorToSelected`, skip items that exist in `stockBookedProductIds`:
  ```typescript
  selectedItemIds.forEach(pid => {
    if (stockBookedProductIds.has(pid)) return;
    next[pid] = bulkVendorId;
  });
  ```

---

### Task 3: Render Undo Button and Hide Vendor Dropdown

**Files:**
- Modify: `src/app/admin/shopping-list/page.tsx:515-535, 1008-1026, 1171-1188`

- [ ] **Step 1: Render Undo button next to CardTitle**
  Render the Undo button with loading spinner in the CardTitle header of Auto-Consolidator.

- [ ] **Step 2: Hide vendor dropdown in main table when fromStock is true**
  Replace the selector in `TableCell` (lines 1008-1026) with `item.fromStock` check. Show a static `Gudang` tag when true.

- [ ] **Step 3: Hide vendor dropdown in manual items queue when stock booked is true**
  Replace the selector in manual items with a `stockBookedProductIds.has(item.productId)` check.

---

### Task 4: Split Purchase Method Buttons

**Files:**
- Modify: `src/app/admin/shopping-list/page.tsx:1058-1110`

- [ ] **Step 1: Replace toggle buttons with Pasar, Online, Transfer, and Gudang buttons**
  Under the `Metode` table cell, replace the single Online/Pasar toggle button with two distinct buttons for Pasar and Online, and hook them to `selectPasar` and `selectOnline`.

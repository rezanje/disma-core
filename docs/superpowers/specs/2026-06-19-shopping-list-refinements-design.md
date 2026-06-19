# Shopping List UI/UX Refinements Spec

**Feature/Topic:** Shopping List UI/UX Refinements
**Date:** 2026-06-19
**Author:** Antigravity

---

## 1. Background & Goals

Users managing the shopping list interface (Auto-Consolidator) often make accidental mistakes (e.g. accidentally deleting items, assigning incorrect methods, or choosing incorrect vendors). To minimize errors and improve workflow clarity, we need:
- Automatic clearing and hiding of the Vendor selector for items satisfied from warehouse stock.
- A global, persistent Undo action with button-level debounce/loading protection.
- Separated and visible options for "Beli di Pasar" and "Beli Online" instead of a single toggle button.

---

## 2. Requirements & UI/UX Specs

### 2.1 Warehouse Stock Vendor Logic
- When a product is marked as **Dari Gudang** (from stock):
  - Its current entry in `vendorAssignments[productId]` must be cleared/deleted.
  - The vendor dropdown `<select>` in the table row and the manual items queue must be replaced with a static tag: `🏢 Gudang`.
- When bulk-applying a vendor to selected items, any item currently marked as `fromStock` must be skipped.

### 2.2 Undo System
- We will maintain a client-side memory stack of state snapshots in a `history` array.
- The states to snapshot are:
  - `manualItems`
  - `customPrices`
  - `vendorAssignments`
  - `onlineProductIds`
  - `transferProductIds`
  - `stockBookedProductIds`
  - `selectedSOIds`
- A snapshot is pushed onto the stack immediately *before* any action modifies any of these states.
- The **Undo** button:
  - Placed in the CardTitle of the Auto-Consolidator next to the title.
  - Visible only when `history.length > 0`.
  - Disables itself and displays a spinner (`Loader2` rotating) with the text "Undoing..." during a 500ms Simulated delay. This simulated loading prevents double-clicking and provides visual feedback of state recovery.

### 2.3 Split Purchase Methods
- The single toggle button for Online/Pasar must be split into two separate buttons:
  - 🏪 **Pasar** button (green active state)
  - 💻 **Online** button (blue active state)
- Along with 🔄 **Transfer** and 🏢 **Gudang**, there will be 4 separate buttons visible under the "Metode" column.
- Clicking **Pasar**, **Online**, or **Transfer** will automatically clear the item's `fromStock` flag.
- Clicking **Gudang** will toggle `fromStock` (and if turned on, clear the vendor assignment).

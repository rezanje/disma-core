# Spec: CMD+K Global Search Palette with Role-Based Filtering

- **Date**: 2026-05-29
- **Topic**: Global Search Palette (CMD+K / Ctrl+K)
- **Status**: APPROVED (Ready for Implementation)

---

## 1. Overview
The search icon in the top navigation bar of DISMA ERP is currently a non-functional placeholder. This specification outlines the implementation of a client-side **Global Search Palette** triggered by clicking the search icon or pressing `CMD+K`/`CTRL+K`. The search results will display matching navigation pages, clients, products, sales orders, and invoices, filtered automatically by the logged-in user's role.

---

## 2. User Experience & UI Design
- **Trigger**:
  - Clicking the search button in `Topbar.tsx`
  - Keyboard shortcuts: `metaKey + k` (Mac) or `ctrlKey + k` (Windows/Linux).
- **Aesthetic**:
  - Modal overlay with deep glassmorphism (`backdrop-blur-md bg-slate-900/60`).
  - Search input at the top with a magnifying glass icon and clear `ESC` or click-outside handlers to close.
- **Result Categorization**:
  - **Menu/Navigasi** (e.g. Inbound, Outbound, Finance approvals).
  - **Sales Orders (PO)**.
  - **Produk (SKU)**.
  - **Klien (Outlet)**.
  - **Invoice**.
- Each category is styled with distinct indicators (icons/tags) for immediate scannability.

---

## 3. Data & Role-Based Access Control (RBAC)
The list of searchable items is retrieved from the Zustand store (`useAppStore.getState()`) and filtered in real-time based on the user's role (`currentUser.role`):

| Data Type | Allowed Roles |
|---|---|
| **Menu/Navigation** | Filtered dynamically using `RolePermissionMap` |
| **Sales Orders (PO)** | `admin_po`, `sourcing`, `gudang`, `kurir`, `finance`, `ceo`, `super_admin`, `cmo` |
| **Products (SKU)** | All roles |
| **Clients** | `admin_po`, `sourcing`, `finance`, `ceo`, `super_admin`, `cmo` |
| **Invoices** | `finance`, `ceo`, `super_admin` |

---

## 4. Navigation & Deep-Linking Strategy
To prevent importing page-specific modals (like PO details, client edit sheets) into the global shell, we utilize a clean Next.js URL query parameter strategy:

1. Clicking a result performs a route redirection:
   - PO: `/admin/sales-orders?detailId=so-123`
   - Product: `/warehouse/catalog?detailId=prod-456`
   - Client: `/admin/clients?detailId=client-789`
2. The target page incorporates a `useEffect` that listens to `searchParams`:
   - If `detailId` is present, it automatically opens the corresponding modal.
   - When closing the modal, it updates the URL (using `router.replace` or `window.history.replaceState`) to remove the query parameter cleanly.

---

## 5. Components to Create/Modify
1. **Create** `src/components/layout/command-palette.tsx`:
   - Handles keybind listeners, state of query, category separation, and styling.
2. **Modify** `src/components/layout/topbar.tsx`:
   - Embed the `<CommandPalette />` component and wire up the Search icon button click handler.
3. **Modify Target Pages** (`admin/sales-orders/page.tsx`, etc.):
   - Add query parameter listener to auto-open details.

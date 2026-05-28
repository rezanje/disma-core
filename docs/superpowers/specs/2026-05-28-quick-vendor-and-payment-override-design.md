# Design: Quick Vendor Creation and Per-Item Payment Method Override

**Date:** 2026-05-28  
**Goal:** Allow users to add new vendors on-the-fly directly from the Sourcing Settlement modal and customize the payment method (Cash or Tempo) per item instead of strictly inheriting from the vendor's default profile.

---

## 1. Proposed Changes

### 1.1 Database Migration
Create a SQL migration file `supabase/migrations/20260528_add_purchase_item_payment_method.sql` to add the `payment_method` column to the `purchase_items` table:
```sql
ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS payment_method text;
```

Update `supabase/dev-bootstrap.sql` around the `purchase_items` table definition to include `payment_method text`.

### 1.2 TypeScript Interfaces
Update `PurchaseItem` in [types/index.ts](file:///Users/rezanje/Antygravity/webapp%20kerja%20disma/disma-core/src/types/index.ts):
```typescript
export interface PurchaseItem {
  ...
  vendorId?: string;
  paymentMethod?: 'Cash' | 'Tempo'; // Added: per-item payment method override
}
```

### 1.3 Accounting Logic Sync
Update `recordReconciliationSettlement` in [accounting.ts](file:///Users/rezanje/Antygravity/webapp%20kerja%20disma/disma-core/src/lib/accounting.ts) and `computeSettlementBreakdown` in [vendor-payable.ts](file:///Users/rezanje/Antygravity/webapp%20kerja%20disma/disma-core/src/lib/vendor-payable.ts).

Instead of:
```typescript
const isTempo = vendor ? (vendor.isTempo !== false) : true;
```

Use:
```typescript
const isTempo = item.paymentMethod 
  ? (item.paymentMethod === 'Tempo')
  : (vendor ? (vendor.isTempo !== false) : true);
```

### 1.4 UI Enhancements in Sourcing Settlement Dialog
* **State Updates:**
  Change `settlementItems` state in `src/app/finance/approvals/page.tsx` to:
  ```typescript
  const [settlementItems, setSettlementItems] = useState<Record<string, { 
    actualPrice: number, 
    qtyPurchased: number, 
    vendorId?: string,
    paymentMethod?: 'Cash' | 'Tempo'
  }>>({})
  ```

* **Inline "+ Tambah" Trigger:**
  Add a "+ Tambah" button next to the "Vendor" select label:
  ```tsx
  <div className="flex items-center justify-between">
    <label className="text-[9px] font-bold text-slate-400 uppercase">Vendor</label>
    <button 
      type="button" 
      onClick={() => {
        setItemIdForNewVendor(pi.id);
        setIsNewVendorOpen(true);
      }}
      className="text-[9px] font-extrabold text-orange-500 hover:text-orange-600 uppercase flex items-center gap-0.5"
    >
      <Plus className="w-2.5 h-2.5" /> Tambah
    </button>
  </div>
  ```

* **Payment Method Override Select Dropdown:**
  Add a select dropdown for `Tipe Bayar` (options: `Cash`, `Tempo`) next to the vendor selector.
  When the vendor changes, update both the selected vendor ID and default its payment method:
  ```typescript
  const selectedVendor = vendors.find(v => v.id === val);
  const defaultMethod = selectedVendor ? (selectedVendor.isTempo ? 'Tempo' : 'Cash') : 'Tempo';
  ```

* **Quick Vendor Registration Dialog:**
  Implement a clean sub-dialog inside `approvals/page.tsx` with fields:
  - Company Name (Required)
  - PIC Name
  - Phone
  - Default Term (Cash vs Tempo)
  - Payment Term Days (visible only if Tempo)

  On save, invoke `addVendor` in the Zustand store, then automatically apply this vendor and its default payment term to the current item's state in `settlementItems`.

---

## 2. Verification Plan

### 2.1 Automated Unit Tests
Verify that the `test-vendor-payable.js` test suite includes checking the payment method override logic in `computeSettlementBreakdown`.

### 2.2 Manual Verification
1. Settle a purchase.
2. Select a vendor that defaults to Tempo, observe that the item's payment method defaults to Tempo.
3. Override one item's payment method to Cash.
4. Add a new vendor on-the-fly using the "+ Tambah" dialog. Check if it is automatically selected for the active item.
5. Finish settlement and verify that:
   - Vendor Bills are only generated for the items settled as "Tempo".
   - The cash portion contains the items settled as "Cash".
   - Journal entries balance.

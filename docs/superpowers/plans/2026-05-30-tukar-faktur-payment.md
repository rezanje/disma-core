# Tukar Faktur Payment Allocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a consolidated payment allocation system for Tukar Faktur invoices allowing bulk or per-PO payment distribution.

**Architecture:** Add a new action `recordTukarFakturPayment` to the Zustand store for data/accounting updates. Expand the Tukar Faktur UI row to show child PO lists, and integrate a payment dialog with FIFO auto-fill and manual allocation overrides.

**Tech Stack:** Next.js, React, Tailwind CSS, Zustand, Supabase

---

### Task 1: Add store action `recordTukarFakturPayment`

**Files:**
- Modify: `src/lib/store.ts`
- Create: `scratch/test-tf-payment-store.js`

- [ ] **Step 1: Write the failing test script**
  Create `scratch/test-tf-payment-store.js`:
  ```javascript
  const { useAppStore } = require('../src/lib/store');

  async function test() {
    console.log("Testing recordTukarFakturPayment...");
    const store = useAppStore.getState();
    if (typeof store.recordTukarFakturPayment !== 'function') {
      throw new Error("recordTukarFakturPayment function not defined on store");
    }
    console.log("SUCCESS");
  }
  test().catch(e => {
    console.error(e.message);
    process.exit(1);
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `node scratch/test-tf-payment-store.js`
  Expected: Fail with `recordTukarFakturPayment function not defined on store`

- [ ] **Step 3: Implement minimal store action signature and logic**
  Add the action type in `AppState` interface in `src/lib/store.ts`:
  ```typescript
  recordTukarFakturPayment: (
    tfId: string, 
    allocations: Record<string, number>, 
    paymentDate: string, 
    bankAccountId: string, 
    totalAmount: number
  ) => Promise<boolean>;
  ```
  Implement the action in the store creator body in `src/lib/store.ts`:
  ```typescript
  recordTukarFakturPayment: async (tfId, allocations, paymentDate, bankAccountId, totalAmount) => {
    const { recordPaymentReceived } = await import('./accounting');
    const state = get();
    
    let childUpdates: { id: string; data: Partial<Invoice> }[] = [];
    let success = true;

    for (const [childId, amount] of Object.entries(allocations)) {
      if (amount <= 0) continue;
      const child = state.invoices.find(i => i.id === childId);
      if (!child) continue;

      const apiSuccess = await recordPaymentReceived(childId, amount, paymentDate, bankAccountId);
      if (!apiSuccess) {
        success = false;
        break;
      }

      const newAmountPaid = (child.amountPaid || 0) + amount;
      const status = newAmountPaid >= child.totalAmount ? 'Paid' : 'Partial';
      const paymentRecord = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        amount,
        date: paymentDate,
        note: `Pembayaran via Tukar Faktur ${tfId}`
      };

      childUpdates.push({
        id: childId,
        data: {
          amountPaid: newAmountPaid,
          status,
          payments: [...(child.payments || []), paymentRecord]
        }
      });
    }

    if (!success) return false;

    // Update child invoices in state and localStorage cache
    const updatedInvoices = state.invoices.map(inv => {
      const update = childUpdates.find(u => u.id === inv.id);
      return update ? { ...inv, ...update.data } : inv;
    });

    // Update parent Tukar Faktur invoice
    const parent = updatedInvoices.find(i => i.id === tfId);
    if (parent) {
      const parentChildren = updatedInvoices.filter(i => i.supersededByInvoiceId === tfId);
      const totalPaid = parentChildren.reduce((sum, c) => sum + (c.amountPaid || 0), 0);
      const status = totalPaid >= parent.totalAmount ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Unpaid';
      
      const parentPaymentRecord = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        amount: totalAmount,
        date: paymentDate,
        note: `Pembayaran bulk Tukar Faktur`
      };

      const updatedParent = {
        ...parent,
        amountPaid: totalPaid,
        status,
        payments: [...(parent.payments || []), parentPaymentRecord]
      };

      const finalInvoices = updatedInvoices.map(inv => inv.id === tfId ? updatedParent : inv);
      set({ invoices: finalInvoices });
      
      // Save to localStorage cache
      saveLocalCache(LOCAL_INVOICES_CACHE_KEY, finalInvoices);

      // Sync parent to database
      await get().syncTable('invoices', updatedParent);
    }

    // Sync children to database
    for (const update of childUpdates) {
      const updatedChild = updatedInvoices.find(i => i.id === update.id);
      if (updatedChild) {
        await get().syncTable('invoices', updatedChild);
      }
    }

    return true;
  }
  ```

- [ ] **Step 4: Run test to verify it passes**
  Run: `node scratch/test-tf-payment-store.js`
  Expected: SUCCESS

- [ ] **Step 5: Commit**
  Run: `git add src/lib/store.ts && git commit -m "feat(store): add recordTukarFakturPayment store action"`

---

### Task 2: Implement UI Expansion (PO List in Row)

**Files:**
- Modify: `src/app/finance/invoices/page.tsx`

- [ ] **Step 1: Implement the PO list in the expanded Tukar Faktur row**
  Locate `{isExpanded && (` block under the `consolidated` tab in `src/app/finance/invoices/page.tsx` (around lines 864-900) and replace it with a 2-column layout:
  - Left column: Table showing constituent invoices (`invoices.filter(i => i.supersededByInvoiceId === inv.id)`):
    - PO Ref, Due Date, Total Amount, Remaining Amount, Status Badge.
    - An action button "Bayar PO Ini" (opens modal and pre-fills PO allocation).
  - Right column: History of bulk payments (existing payment list).

- [ ] **Step 2: Verify expansion UI on local server**
  Run: `npm run dev` and navigate to `http://localhost:3000/finance/invoices`. Go to the "Tukar Faktur" tab, expand a row, and verify that the child POs list and payment history display side by side correctly.

- [ ] **Step 3: Commit**
  Run: `git add src/app/finance/invoices/page.tsx && git commit -m "feat(ui): add constituent PO list inside expanded Tukar Faktur"`

---

### Task 3: Payment Modal UI Integration

**Files:**
- Modify: `src/app/finance/invoices/page.tsx`

- [ ] **Step 1: Implement allocations inputs, FIFO distribution, and validation in modal**
  Locate the payment recording Dialog in `src/app/finance/invoices/page.tsx`. If `activeInvoice.isConsolidated` is true:
  - Maintain an `allocations` local state object.
  - Render input fields for each child PO invoice.
  - Implement a **"Bagi Otomatis (FIFO)"** button:
    ```typescript
    const handleAutoDistribute = () => {
      let remaining = paymentAmount;
      const nextAllocations = {};
      const sortedChildren = [...childInvoices].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      for (const child of sortedChildren) {
        const unpaid = child.totalAmount - child.amountPaid;
        if (remaining <= 0) {
          nextAllocations[child.id] = 0;
        } else if (remaining >= unpaid) {
          nextAllocations[child.id] = unpaid;
          remaining -= unpaid;
        } else {
          nextAllocations[child.id] = remaining;
          remaining = 0;
        }
      }
      setAllocations(nextAllocations);
    };
    ```
  - Display validation warning: Sum of `allocations` must equal `paymentAmount`.
  - Update `handleRecordPayment` to call `recordTukarFakturPayment` if the invoice is consolidated.

- [ ] **Step 2: Verify payment flow manually**
  Test payment registration on a Tukar Faktur. Verify both auto-distribution (FIFO) and manual allocation, checks for sum validation, and check database updates after submission.

- [ ] **Step 3: Commit**
  Run: `git add src/app/finance/invoices/page.tsx && git commit -m "feat(ui): integrate payment dialog with PO allocations for Tukar Faktur"`

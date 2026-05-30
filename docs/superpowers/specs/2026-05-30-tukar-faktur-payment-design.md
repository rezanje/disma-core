# Design Spec: Tukar Faktur Payment Allocation and PO Grouping

## Goal
Implement a consolidated payment allocation system for Tukar Faktur (consolidated invoices) in the `Invoices & Piutang` page. This allows users to view underlying Purchase Orders (POs) inside a Tukar Faktur bundle and record payments either as a single bulk lump-sum (distributed automatically or manually across POs) or directly against a specific PO.

---

## Proposed UI & Flow Changes

### 1. Tukar Faktur Expandable Row UI
Modify the expandable row layout of the **Tukar Faktur** tab in `src/app/finance/invoices/page.tsx`:
- Split into a 2-column layout (or stacked columns on smaller screens):
  - **Left Column (Daftar PO)**:
    - A table listing all constituent POs (`Invoice` records where `supersededByInvoiceId === currentTukarFaktur.id`).
    - Columns: PO Ref (SO PO Number), Jatuh Tempo (Due Date), Total Tagihan (Total Amount), Sisa Unpaid (Remaining Balance), Status (Paid/Partial/Unpaid).
    - Action: A small **"Bayar PO Ini"** button on unpaid POs to record a direct payment for that specific PO.
  - **Right Column (History Pembayaran)**:
    - Lists payment history logs recorded on this Tukar Faktur bundle.

### 2. Consolidated Payment Modal
When clicking "Catat Bayar" at the Tukar Faktur level or "Bayar PO Ini" on a constituent PO:
- Open a Dialog showing:
  - Bank Account selection (for Debit posting).
  - Payment Date.
  - **Bulk Payment Amount** (input field).
  - **Constituent POs List** with individual payment input fields:
    - User can click **"Bagi Otomatis (FIFO)"** to automatically apply the bulk payment amount to the oldest POs first.
    - User can manually input/edit the allocated payment amount for each PO.
  - **Validation Indicator**:
    - Displays a live comparison of the sum of PO allocations vs the Bulk Payment Amount.
    - If there is a mismatch, displays a red warning: `⚠️ Total alokasi (Rp X) belum sama dengan nominal bayar (Rp Y)` and disables the submit button.
    - If they match, displays a green checkmark `✓ Alokasi sesuai` and enables the submit button.

---

## Technical Specifications

### 1. Database & State Management
- Invoices are queried from the Zustand store.
- **Child PO Invoices**: Individual invoices with `supersededByInvoiceId === parentTukarFaktur.id` represent the constituent POs.
- **Parent Tukar Faktur**: The consolidated invoice with `isConsolidated === true`.

### 2. Payment Submission Logic
When a payment is successfully saved:
1. **Loop through Child PO Invoices** with a non-zero allocation:
   - Call `recordPaymentReceived(childInvoiceId, allocatedAmount, date, bankId)`.
     - This creates the accounting journal entry (Debit Bank/Kas, Credit Piutang Usaha) for the specific PO.
     - Inserts a cash transaction record under the target Bank Account.
   - Update the child invoice state in the store:
     - Increment `amountPaid` by the allocated amount.
     - Update the `status` (`Paid` or `Partial`).
     - Append the payment record to the child's `payments` array.
2. **Update the Parent Tukar Faktur Invoice**:
   - Calculate the sum of `amountPaid` across all child PO invoices.
   - Update the parent's `amountPaid` and `status` (`Paid` or `Partial`).
   - Append an aggregated payment record to the parent's `payments` array for display history.

---

## Verification Plan

### Manual Verification
1. **Consolidate Invoices**:
   - Create a Tukar Faktur containing multiple outstanding sales orders.
2. **Review Expansion UI**:
   - Go to the `Tukar Faktur` tab and expand the newly created row.
   - Confirm that the constituent PO list is displayed correctly with unpaid amounts.
3. **Record Bulk Payment**:
   - Click "Catat Bayar".
   - Input a bulk amount and click "Bagi Otomatis". Confirm that the FIFO distribution is correct.
   - Adjust some values manually and confirm that validation detects sum mismatch.
   - Submit a valid payment.
   - Confirm that:
     - Child POs are updated in the expanded view.
     - Cash transactions are created for each allocated payment.
     - Parent Tukar Faktur's total paid amount matches.

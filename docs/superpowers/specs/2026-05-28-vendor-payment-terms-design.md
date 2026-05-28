# Design Spec: Vendor Payment Terms & Accounts Payable Sync

## Goal Description
This feature allows the system to classify vendor payment types (Tempo/Terms vs Cash directly) and specify their payment terms (number of days) when creating or editing vendors in the Vendor Master. This dynamically syncs to the Accounts Payable (Vendor Bills) and Sourcing Settlement flows, ensuring that cash vendors directly record purchases as cash payments without generating an unpaid `VendorBill`, while tempo vendors automatically generate a `VendorBill` with `dueDate` set to `issueDate + paymentTermDays`.

## Proposed Changes

### Frontend - Vendor Master Management

#### [MODIFY] [page.tsx](file:///Users/rezanje/Antygravity/webapp%20kerja%20disma/disma-core/src/app/admin/vendors/page.tsx)
- Update the `formData` state to include `isTempo` (boolean) and `paymentTermDays` (number).
- Default values for new vendors: `isTempo = true`, `paymentTermDays = 14`.
- In the creation/edit form (Dialog modal):
  - Add a checkbox/switch for "Pembayaran Tempo" (`isTempo`).
  - Add a numeric input for "Jatuh Tempo (Hari)" (`paymentTermDays`) which is conditionally shown only when `isTempo` is true.
  - Update `resetForm` and `handleEdit` to handle these fields correctly.
- In the Vendor list table:
  - Add a new column header "Metode Pembayaran".
  - Display the value: `Tempo (X Hari)` if `isTempo` is true, otherwise `Cash Langsung`.

## Verification Plan

### Manual Verification
1. Navigate to `/admin/vendors` (Vendor Master).
2. Click "Add Vendor" and create a new vendor named "Vendor Cash" with "Pembayaran Tempo" unchecked. Verify it displays "Cash Langsung" in the new column.
3. Click "Add Vendor" and create a new vendor named "Vendor Tempo Cepat" with "Pembayaran Tempo" checked and days set to `3`. Verify it displays "Tempo (3 Hari)" in the table.
4. Edit "Vendor Tempo Cepat", change the payment terms to `30` days, and verify it updates to "Tempo (30 Hari)" on save.
5. Create a Mock Purchase and run Sourcing Settlement for both vendors to verify:
   - "Vendor Cash" does not generate any outstanding bill in `ap-aging`.
   - "Vendor Tempo Cepat" generates a `VendorBill` in `ap-aging` with the correct due date.

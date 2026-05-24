# Spec - AR Collections Tabs Integration

This specification details the addition of specialized views (Individual Invoices, Consolidated Client Summary, and Overdue Alerts) to the AR Collections page (`/finance/collections`) to help the finance admin manage receivables more efficiently.

## Proposed Layout

We will add a Tab navigation header at the top of the AR Collections page:
- **Tab 1: Invoice Individual** (Default): Lists all outstanding invoices, sortable by nominal outstanding descending.
- **Tab 2: Rekap per Klien**: Aggregates all unpaid amounts by client, showing who has the largest overall debt.
- **Tab 3: Alert Jatuh Tempo**: Lists only invoices that are currently overdue (dueDate < today) or due today, sorted by aging days descending.

## Component Specifications

### 1. Tab 1: Invoice Individual
- Displays the existing table layout of outstanding invoices.
- Integrates a sorting mechanism to sort by Amount Due (`inv.totalAmount - inv.amountPaid`) descending.

### 2. Tab 2: Rekap per Klien (Consolidated View)
- Groups all outstanding invoices by `clientId`.
- Columns:
  - **Klien & PIC**: Client name, parent client info, and PIC details.
  - **Jumlah Tagihan**: Number of unpaid invoices (e.g. "3 Tagihan").
  - **Total Piutang**: Consolidated outstanding amount (`sum(totalAmount - amountPaid)`), sorted desc (Largest first).
  - **Actions**: WhatsApp button to send a consolidated reminder of all their unpaid invoices, and a view button to see invoice details.

### 3. Tab 3: Alert Jatuh Tempo (Overdue Alerts)
- Filters invoices to show only those where `status !== 'Paid'` and `dueDate <= today`.
- Columns:
  - **Invoice & Klien**: Invoice number, client name.
  - **Status Keterlambatan**: Display of how many days overdue the invoice is (e.g. "Lewat 15 Hari", "Jatuh Tempo Hari Ini").
  - **Nominal Piutang**: Outstanding amount for the invoice.
  - **Actions**: Immediate WhatsApp chase button, Phone link.

## Implementation Steps

1. **`src/app/finance/collections/page.tsx`**:
   - Import `Tabs, TabsContent, TabsList, TabsTrigger` from `@/components/ui/tabs`.
   - Update page state to support active tab.
   - Implement client consolidation calculations:
     - Group outstanding invoices by client, calculate consolidated debt, and sort desc.
   - Implement overdue alerts filter:
     - Filter invoices to only show overdue or due today, sorted by aging days desc.
   - Render the three tab contents with appropriate table headers and column mappings.
   - Create a helper to generate a WhatsApp message listing all outstanding invoices for a client when sending consolidated reminders from Tab 2.

# Vendor Payable Tracking (AP)

**Date:** 2026-05-28
**Owner:** Reza
**Goal:** Track utang per vendor dari konsolidasi belanja. Tiap item tagged vendor. Tempo 1-2 minggu standar. AP Aging visibility.

## Decision

**Pattern A (per belanja per vendor)** — bukan weekly aggregate.

Reason: belanja pasar = nota per kunjungan. Vendor kasih tempo per nota. Bayar per nota. Match practice. Weekly aggregate (Pattern B) bikin jatuh tempo ambigu antar-minggu.

Default `paymentTermDays = 14` (override per vendor).

## Current State

- `Vendor` ada (cek field — tambah `paymentTermDays`, `isTempo` kalau belum)
- `Purchase` + `PurchaseItem` ada (purchaseItem belum punya `vendorId`)
- `VendorBill` model + AP table sudah ada di store (`payVendorBill` action exist)
- `recordReconciliationSettlement` di `lib/accounting.ts` saat ini Cr `2-1000 Utang Vendor` generic (tanpa sub-ledger per vendor)
- Sourcing settlement = trigger settlement → bukukan HPP + utang
- Shopping list document = batch PO yang dibawa sourcer ke pasar

---

## Phase 1: Schema

### 1.1 Vendor type
File: `src/types/index.ts`

```ts
export interface Vendor {
  ...existing...
  paymentTermDays?: number;  // default 14 if undefined
  isTempo?: boolean;         // true = pakai tempo, false = bayar di tempat (cash)
}
```

### 1.2 PurchaseItem type
File: `src/types/index.ts`

```ts
export interface PurchaseItem {
  ...existing...
  vendorId?: string;  // FK vendors.id — wajib di-set saat rekon sourcing
}
```

### 1.3 JournalLine sub-ledger (optional, recommended)
File: `src/types/index.ts`

```ts
export interface JournalLine {
  ...existing...
  vendorId?: string;       // sub-ledger untuk 2-1000 Utang Vendor
  vendorBillId?: string;   // ref ke VendorBill yg di-create
}
```

### 1.4 Migration SQL
File: `supabase/migrations/20260528_vendor_payable_tracking.sql`

```sql
alter table public.vendors
  add column if not exists payment_term_days int default 14,
  add column if not exists is_tempo boolean default true;

alter table public.purchase_items
  add column if not exists vendor_id text references public.vendors(id);
create index if not exists purchase_items_vendor_id_idx on public.purchase_items(vendor_id);

alter table public.journal_lines
  add column if not exists vendor_id text references public.vendors(id),
  add column if not exists vendor_bill_id uuid references public.vendor_bills(id);
create index if not exists journal_lines_vendor_id_idx on public.journal_lines(vendor_id) where vendor_id is not null;

-- VendorBill table (cek sudah ada — kalau belum, bikin):
create table if not exists public.vendor_bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text unique not null,
  vendor_id text not null references public.vendors(id),
  bill_date date not null,
  due_date date not null,
  status text not null default 'Pending' check (status in ('Pending','PartialPaid','Paid','Cancelled')),
  total_amount numeric not null default 0,
  amount_paid numeric not null default 0,
  purchase_id text references public.purchases(id),  -- source belanja
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists vendor_bills_vendor_id_idx on public.vendor_bills(vendor_id);
create index if not exists vendor_bills_status_idx on public.vendor_bills(status);
create index if not exists vendor_bills_due_date_idx on public.vendor_bills(due_date) where status <> 'Paid';
```

---

## Phase 2: Shopping List Rekon UI

### 2.1 Sourcing rekon flow (existing)
Sourcer balik dari pasar → laporkan tiap item: actual unit price, qty, **vendor pick**.

### 2.2 UI change
File: `src/app/sourcing/...` atau `src/app/admin/shopping-list/...` (rekon page)

Per row item di rekon form, tambah dropdown:
```tsx
<Select value={item.vendorId} onChange={...}>
  <option value="">— Pilih Vendor —</option>
  {vendors.map(v => <option key={v.id} value={v.id}>{v.name} {v.isTempo ? `(tempo ${v.paymentTermDays}d)` : '(cash)'}</option>)}
</Select>
```

Validation: sebelum submit, semua item harus punya `vendorId`. Toast error kalau ada yang kosong.

### 2.3 Free-text vendor fallback
Kalau vendor belum ada di master → tombol "+ Vendor Baru" inline → quick-create modal (nama, paymentTermDays default 14, isTempo true).

---

## Phase 3: Settlement → Auto-Create VendorBill

File: `src/lib/accounting.ts` → `recordReconciliationSettlement`

### 3.1 Group purchase items by vendor
```ts
const byVendor = new Map<string, PurchaseItem[]>();
purchaseItems.forEach(it => {
  if (!it.vendorId) throw new Error(`Item ${it.id} belum tag vendor`);
  if (!byVendor.has(it.vendorId)) byVendor.set(it.vendorId, []);
  byVendor.get(it.vendorId)!.push(it);
});
```

### 3.2 Per-vendor branch
For each vendor group:
- **Tempo vendor** (`isTempo = true`):
  - Create `VendorBill` (status Pending, dueDate = today + paymentTermDays)
  - Journal: Dr `1-3000 Persediaan` (sum subtotal), Cr `2-1000 Utang Vendor` (with `vendorId` + `vendorBillId` on credit line)
- **Cash vendor** (`isTempo = false`):
  - No VendorBill
  - Journal: Dr `1-3000`, Cr `1-1100 Kas` (or sourcer's wallet — same flow as current talangan)
  - Reduce kas bank.balance

### 3.3 Keep existing defisit/talangan logic
Sourcing defisit (sourcer nalangin) sudah handled via Plan B (kas minus + `2-1500 Utang Talangan Karyawan` + Reimbursement `Sourcing-Defisit`). Jangan diubah. Hanya tambah: **kalau ada vendor tempo di belanja yang sama**, bagian itu skip dari talangan calc (vendor tempo = belum keluar duit).

Pseudo:
```
totalShop = sum(actualShopCost)
totalTempo = sum(items where vendor.isTempo)
totalCash = totalShop - totalTempo
defisit = totalCash - advance  // hanya cash portion yang bisa defisit
```

---

## Phase 4: AP Aging Page

File: `src/app/finance/ap-aging/page.tsx` (atau extend existing AP Aging)

### 4.1 KPI cards
- Total Outstanding (semua Pending + PartialPaid)
- Due This Week
- Overdue (dueDate < today AND status <> Paid)

### 4.2 Table
Columns: BillNumber, Vendor, BillDate, DueDate, Total, Paid, Outstanding, Status, Action(Pay)

### 4.3 Filters
- Vendor dropdown
- Status (All / Pending / PartialPaid / Overdue / Paid)
- Date range

### 4.4 Sort default
Order by dueDate ASC (paling dekat jatuh tempo di atas).

### 4.5 Aging buckets (KPI strip)
- `0-7 hari lagi`
- `8-14 hari lagi`
- `Overdue 1-7 hari`
- `Overdue >7 hari`

---

## Phase 5: Pay Vendor Bill Flow

File: existing `payVendorBill` action di store + new UI di AP Aging page

### 5.1 Modal "Bayar Vendor Bill"
- Input: bank account source, amount (default = outstanding, allow partial)
- Date (default today)
- Notes

### 5.2 Side effects
- Create CashTx (Out, fromBankId, amount)
- Update bank.balance -= amount
- Journal: Dr `2-1000 Utang Vendor` (with `vendorId` + `vendorBillId`), Cr `1-1100 Kas/Bank`
- VendorBill.amountPaid += amount
- If amountPaid >= total → status = 'Paid', else 'PartialPaid'
- Reentrancy guard (acquireLock pattern)

### 5.3 Idempotency
Don't double-pay. Check before creating journal.

---

## Phase 6: Nav + Audit

### 6.1 Nav entry
File: `src/lib/navigation.tsx`

Tambah `finance_ap_aging` (kalau belum ada) atau ganti label existing AP Aging.

### 6.2 Access key
File: `src/types/index.ts`

```ts
export type AccessKey = ...existing... | 'finance_ap_aging';
```

### 6.3 logHistory
Tiap pay action panggil `logHistory({ table: 'vendor_bills', action: 'update', ... })`.

---

## Phase 7: Tests

### 7.1 Unit
File: `scripts/test-vendor-payable.js`

- Vendor group calculation (mixed tempo + cash)
- Defisit calc skip tempo portion
- DueDate calc (today + paymentTermDays)
- Aging bucket assignment

### 7.2 E2E manual checklist
- Belanja 3 vendor (2 tempo, 1 cash) → settlement
- Cek 2 VendorBill created, kas hanya berkurang cash portion
- Journal balanced
- AP Aging tampil 2 bill
- Bayar 1 bill partial → status PartialPaid, balance turun, kas turun
- Bayar sisa → status Paid

---

## Backfill Concerns

Existing purchases tanpa `vendor_id` di items → nullable. Tidak masalah selama logic Phase 3 hanya jalan utk rekon baru. Old data tetep di journal as-is (Cr 2-1000 generic tanpa sub-ledger).

Opsional: backfill script tag semua existing items ke "Vendor Generic" placeholder.

---

## Out of Scope (Future)

- Vendor performance metrics (avg payment delay, dispute count)
- Vendor statement generation (mirip TF tapi sisi pembelian)
- Multi-currency
- Vendor portal (login terpisah utk vendor)

---

## Phase Order Execution

1. Phase 1 (schema) — migration + types
2. Phase 7.1 (unit tests dulu — TDD)
3. Phase 2 (UI rekon)
4. Phase 3 (settlement journal — paling kritis)
5. Phase 4 (AP Aging view)
6. Phase 5 (pay flow)
7. Phase 6 (nav + audit)
8. Phase 7.2 (E2E manual)

**Critical path: Phase 3.** Salah journal di sini = neraca rusak. Test thoroughly with mixed scenarios.

## Risk Notes

- **Journal balance**: tiap settlement HARUS balanced. Pakai existing `createAccountingEntry` helper yang validate Dr=Cr.
- **Sub-ledger consistency**: kalau pakai `journal_lines.vendor_id`, AP Aging bisa double-source (dari vendor_bills OR dari journal). Pilih satu source of truth → vendor_bills primary, journal_lines hanya untuk audit trail.
- **Defisit interaction**: tempo belanja tidak boleh masuk defisit calc. Test case wajib: sourcer advance 500k, belanja cash 400k + tempo 800k → defisit = 0 (cash 400k < advance 500k), bukan defisit 700k.
- **VendorBill numbering**: format `VB-YYYY-MM-XXX-NN` (mirip TF). Sequence per vendor per bulan. RPC `generate_vendor_bill_number(vendor_id, date)` untuk atomicity.

# Tukar Faktur (TF) — Design Spec

**Date:** 2026-05-27
**Status:** Approved, ready for implementation plan
**Owner:** Reza

## Problem

Saat ini setiap PO langsung punya invoice dengan `dueDate = deliveryDate + client.paymentTermDays`. Realitanya invoice fisik baru diserahkan ke klien lewat dokumen **Tukar Faktur (TF)** yang terbit mingguan (Senin). Jatuh tempo bayar baru valid setelah TF diterima klien. Sistem belum bisa mengelompokkan invoice ke TF, belum bisa hitung jatuh tempo dari tanggal TF, dan tidak ada proteksi anti-double tagih.

## Goal

Tambah entitas Tukar Faktur sebagai dokumen mingguan per klien yang mengelompokkan invoice, mengontrol jatuh tempo, dan mencegah satu invoice masuk ke dua TF.

## Flow Operasional

```
PO → Belanja → Kirim → Invoice terbit per PO (saat kirim)
                          ↓
              Weekly batch (Sen-Min, cut akhir bulan)
                          ↓
              Senin minggu depan (atau akhir bulan): TF terbit
                          ↓
              Jatuh tempo bayar per invoice = TF.issueDate + client.paymentTermDays
                          ↓
              Editable di tab Tukar Faktur (inline + bulk)
```

**Aturan periode:**
- Default: Sen–Min (7 hari), TF terbit Senin minggu depan.
- Cross-bulan: period dipotong di hari terakhir bulan. TF segmen pertama terbit di hari terakhir bulan. TF segmen kedua mulai tanggal 1, terbit Senin minggu depan.

**Contoh:** Minggu 28 Apr – 4 Mei (akhir bulan = Rabu 30 Apr):
- Segmen 1 (Sen 28 – Rab 30 Apr) → TF terbit Rabu 30 Apr.
- Segmen 2 (Kam 1 – Min 4 Mei) → TF terbit Senin 5 Mei.

**Scope per TF:** 1 TF = 1 klien. Senin pagi: kalau 5 klien aktif → 5 TF.

---

## Section 1 — Data Model

### Tabel baru `tukar_faktur`

```sql
create table public.tukar_faktur (
  id uuid primary key default gen_random_uuid(),
  tf_number text unique not null,         -- "TF-2026-W18-CLI001-01"
  client_id text not null references public.clients(id),
  period_start date not null,
  period_end date not null,
  issue_date date not null,
  status text not null default 'Draft',   -- Draft | Issued | Received | Paid
  total_amount numeric default 0,
  notes text,
  issued_by text,
  received_at timestamptz,
  received_by text,
  created_at timestamptz default now()
);
create index on public.tukar_faktur(client_id, period_start);
create index on public.tukar_faktur(status);
```

### Tambah kolom di `invoices`

```sql
alter table public.invoices add column tukar_faktur_id uuid
  references public.tukar_faktur(id) on delete set null;
create index on public.invoices(tukar_faktur_id);
```

### TypeScript types (`src/types/index.ts`)

```ts
export type TukarFakturStatus = 'Draft' | 'Issued' | 'Received' | 'Paid';

export interface TukarFaktur {
  id: string;
  tfNumber: string;
  clientId: string;
  periodStart: string;   // ISO date
  periodEnd: string;     // ISO date
  issueDate: string;     // ISO date
  status: TukarFakturStatus;
  totalAmount: number;
  notes?: string;
  issuedBy?: string;
  receivedAt?: string;
  receivedBy?: string;
  createdAt: string;
}

// Invoice: tambah field tukarFakturId?: string
```

### Integritas

- Invoice cuma boleh punya 1 `tukar_faktur_id` (1:N relasi).
- TF di-delete → `tukar_faktur_id` invoice direset ke NULL (`on delete set null`).
- Status `Issued`: invoice list locked (gak boleh dipindah/diedit dari tab AR).

---

## Section 2 — UI Flow

### Menu

Sidebar > **Financial > Tukar Faktur** (antara `Cash & Bank` dan `Financial Reports`).

### Page `/finance/tukar-faktur` (list)

**Header:**
- Tombol **`+ Generate TF`** kanan atas.
- Filter: klien (dropdown), status, periode (date range).
- KPI cards: Total Draft, Total Issued belum lunas, Total nominal outstanding.

**Tabel TF:**

| TF Number | Klien | Periode | Issue Date | Total | Jml Invoice | Status | Aksi |
|---|---|---|---|---|---|---|---|
| TF-2026-W18-CLI001-01 | PT ABC | 4-10 Mei | 11 Mei | Rp 12.000.000 | 5 | Issued | View / Print |

### Generate Modal

1. Dropdown klien (single-select).
2. Auto-detect periode minggu lalu (Sen-Min, atau partial cross-bulan). Override manual via date range.
3. Auto-list invoice klien itu yang `tukar_faktur_id IS NULL` dan delivery date dalam periode.
4. Checkbox per invoice — default tercentang, finance bisa uncheck untuk exclude.
5. Preview: total nominal, tanggal terbit (default = hari ini), preview jatuh tempo.
6. Action button:
   - **`Save as Draft`**: TF status=Draft, invoice belum di-link (boleh diedit lagi).
   - **`Issue Sekarang`**: TF status=Issued, invoice di-link, dueDate di-update.

### Detail page `/finance/tukar-faktur/[id]`

- Header: TF number, klien, status badge, aksi (Issue jika Draft, Tandai Diterima jika Issued, Print).
- List invoice (read-only kalau status≥Issued, kecuali kolom dueDate editable per row).
- Tombol bulk: "Override semua dueDate +X hari".
- Section "Tanda Terima": input `received_at`, `received_by` → status auto Received.
- Tombol Print: render dokumen TF (cover sheet + summary invoice).

### Cross-link dari halaman AR/Invoice existing

- Kolom baru: badge "TF: TF-2026-W18-X" (klik → detail TF) atau "Belum TF" (abu-abu).
- Edit dueDate di tab AR: disabled kalau invoice ber-tukar_faktur_id status Issued+ (forced via TF detail).

---

## Section 3 — Auto-Period Logic

Helper di `src/lib/tukar-faktur.ts`:

```ts
export function mondayOf(d: Date): Date {
  const day = d.getDay() || 7;
  const m = new Date(d);
  m.setDate(d.getDate() - (day - 1));
  m.setHours(0, 0, 0, 0);
  return m;
}

export function sundayOf(d: Date): Date {
  const m = mondayOf(d);
  m.setDate(m.getDate() + 6);
  return m;
}

export function lastDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function tfPeriodFor(deliveryDate: Date): {
  periodStart: Date;
  periodEnd: Date;
  issueDate: Date;
} {
  const weekStart = mondayOf(deliveryDate);
  const weekEnd = sundayOf(deliveryDate);
  const crossesMonth = weekStart.getMonth() !== weekEnd.getMonth();

  if (!crossesMonth) {
    const issue = new Date(weekEnd);
    issue.setDate(issue.getDate() + 1);
    return { periodStart: weekStart, periodEnd: weekEnd, issueDate: issue };
  }

  const isInFirstMonth = deliveryDate.getMonth() === weekStart.getMonth();
  if (isInFirstMonth) {
    const segEnd = lastDayOfMonth(weekStart);
    return { periodStart: weekStart, periodEnd: segEnd, issueDate: segEnd };
  } else {
    const segStart = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), 1);
    const issue = new Date(weekEnd);
    issue.setDate(issue.getDate() + 1);
    return { periodStart: segStart, periodEnd: weekEnd, issueDate: issue };
  }
}
```

### Verifikasi edge case

| Delivery date | weekStart | weekEnd | crossMonth? | period | issueDate |
|---|---|---|---|---|---|
| Sen 5 Mei | Sen 5 Mei | Min 11 Mei | no | 5-11 Mei | Sen 12 Mei |
| Sen 28 Apr | Sen 28 Apr | Min 4 Mei | yes | 28-30 Apr | Rab 30 Apr |
| Kam 1 Mei | Sen 28 Apr | Min 4 Mei | yes | 1-4 Mei | Sen 5 Mei |
| Sen 29 Des 2025 | Sen 29 Des | Min 4 Jan | yes | 29-31 Des | Rab 31 Des |
| Jum 2 Jan 2026 | Sen 29 Des | Min 4 Jan | yes | 1-4 Jan | Sen 5 Jan |

### Generate flow

1. Reference date = `today` (override-able).
2. Look-back 14 hari: SELECT invoice klien terpilih WHERE `delivery_date >= today-14d` AND `tukar_faktur_id IS NULL` AND status != 'Cancelled'.
3. Per invoice → `tfPeriodFor(deliveryDate)`.
4. Group by `(periodStart, periodEnd)` → tiap group = 1 calon TF.
5. Default-select group dengan `periodEnd < today` (period selesai). Period ongoing tetap muncul tapi unchecked.

### TF number generation

```ts
function generateTfNumber(client: Client, period: Period, existingCount: number): string {
  const year = period.periodEnd.getFullYear();
  const isMonthEndSegment =
    period.periodEnd.getTime() === lastDayOfMonth(period.periodEnd).getTime();
  const label = isMonthEndSegment
    ? String(period.periodEnd.getMonth() + 1).padStart(2, '0')
    : `W${getISOWeek(period.periodEnd)}`;
  const seq = String(existingCount + 1).padStart(2, '0');
  return `TF-${year}-${label}-${client.id.slice(0, 6).toUpperCase()}-${seq}`;
}
```

Format: `TF-{YYYY}-{Wxx|MM}-{CLIENT_SHORT}-{SEQ}`
Contoh: `TF-2026-W18-CLI001-01` (mingguan), `TF-2026-04-CLI001-01` (akhir April).

---

## Section 4 — Edit Semantics & State Machine

### State flow

```
[Draft] ─(Issue)→ [Issued] ─(Tandai Diterima)→ [Received] ─(auto, semua invoice lunas)→ [Paid]
   │
   └─(Delete) → invoices.tukar_faktur_id = null
```

### Aturan per status

| State | Edit invoice list? | Edit dueDate? | Delete TF? |
|---|---|---|---|
| Draft | ✓ tambah/hapus | ✓ | ✓ (langsung) |
| Issued | ✗ locked | ✓ via TF detail | ⚠ konfirmasi: revoke link invoice |
| Received | ✗ | ✗ | ✗ |
| Paid | ✗ | ✗ | ✗ |

### RPC `issue_tukar_faktur(p_tf_id, p_invoice_ids, p_issue_date)`

Atomic transaction:

1. Re-fetch invoice rows FOR UPDATE.
2. Validate: semua invoice `tukar_faktur_id IS NULL`. Kalau ada yang sudah ke-link → ROLLBACK + `raise exception 'Invoice % sudah di TF lain', conflict_id`.
3. `UPDATE invoices SET tukar_faktur_id=$tfId, due_date=$issueDate + interval '$paymentTermDays day' WHERE id = ANY($invoiceIds)`.
4. `UPDATE tukar_faktur SET status='Issued', issue_date=$issueDate, issued_by=$userId, total_amount=$sum WHERE id=$tfId`.

### RPC `delete_tukar_faktur(p_tf_id)`

1. Validate: status IN ('Draft', 'Issued'). Kalau Received/Paid → exception.
2. Untuk Issued: `UPDATE invoices SET tukar_faktur_id=NULL, due_date=(delivery_date + interval '$paymentTermDays day') WHERE tukar_faktur_id=$tfId`.
3. `DELETE FROM tukar_faktur WHERE id=$tfId`.

### Aksi `Tandai Diterima`

Form: `received_at` (default now), `received_by` (text — nama PIC klien). Update status → Received. Invoice tidak berubah.

### Auto `Paid`

Trigger setiap update `invoices.amount_paid`/`invoices.status`: kalau semua invoice di TF status=Paid → `UPDATE tukar_faktur SET status='Paid' WHERE id=$tfId`.

### Edit dueDate

- **Dari TF detail page (Issued/Received):** inline date picker per row, update `invoices.due_date` saja.
- **Dari halaman AR existing:** field disabled kalau invoice ber-tukar_faktur_id status Issued+. Tooltip "Edit dari TF [number]" + link.
- **Bulk override:** tombol "Override semua +X hari" di TF detail (Issued+ only). `due_date = due_date + X days` untuk semua invoice di TF.

### Anti-double mechanism

- DB: `invoices.tukar_faktur_id` FK, 1 invoice = 1 TF.
- Generate modal query: `WHERE tukar_faktur_id IS NULL` — invoice yang sudah di-TF gak muncul.
- Defense-in-depth: RPC re-check FOR UPDATE sebelum commit.

---

## Section 5 — Testing, Rollout, Scope

### Test plan

| Layer | Test | Tools |
|---|---|---|
| Unit | `tfPeriodFor()` semua edge case (cross-bulan, akhir tahun 31-Des/1-Jan, single-day, leap year Feb) | Vitest |
| Unit | `generateTfNumber()` format + uniqueness | Vitest |
| Integration | RPC `issue_tukar_faktur`: race-condition (2 finance issue bareng) | node script + supabase admin |
| E2E manual | Generate Draft → Issue → Tandai Diterima → Paid (auto) flow | browser, profile=local |
| E2E manual | Delete Issued TF → invoice dueDate revert | browser |
| Migration | Existing invoices tetap punya dueDate, `tukar_faktur_id` null | sql query |

### Migration & rollout

1. File: `supabase/migrations/20260527_tukar_faktur.sql` — CREATE TABLE, ALTER TABLE invoices, CREATE RPC pair.
2. Apply ke local DB dulu (`profile=local`) — test full flow.
3. Apply ke production via `supabase migration up` atau MCP `apply_migration`.
4. Hot-deploy code.
5. Existing invoices: `tukar_faktur_id` NULL, finance bisa langsung pakai.

### Scope iterasi 1

- ✓ Tabel + types + RPC.
- ✓ Page list TF + detail + generate modal.
- ✓ Auto-period algorithm + UI selector.
- ✓ Edit dueDate (inline + bulk).
- ✓ Status flow Draft→Issued→Received→Paid.
- ✓ Anti-double + cross-link badge di AR page.
- ✓ Print/PDF TF (basic template — reuse `pdf.ts` pattern).

### Out of scope (v2)

- ✗ Auto-cron Senin pagi (manual button dulu).
- ✗ Notif WhatsApp/email reminder ke klien.
- ✗ Tanda tangan digital / upload bukti TF.
- ✗ TF multi-klien.
- ✗ TF revision history / audit log detail.

### File yang disentuh

- `supabase/migrations/20260527_tukar_faktur.sql` (new)
- `src/types/index.ts` (+ TukarFaktur, + `invoice.tukarFakturId`)
- `src/lib/tukar-faktur.ts` (new — helper)
- `src/lib/store.ts` (+ tukarFakturs state, CRUD)
- `src/app/finance/tukar-faktur/page.tsx` (new — list)
- `src/app/finance/tukar-faktur/[id]/page.tsx` (new — detail)
- `src/components/GenerateTfModal.tsx` (new)
- `src/app/finance/invoices/page.tsx` (badge + lock dueDate)
- `src/components/Sidebar.tsx` (menu item)

**Estimasi:** ~10-15 file, 1 migration, 1 RPC pair. Medium complexity.

---

## Open Questions / Risiko

- **Race condition di RPC issue:** mitigasi via `SELECT ... FOR UPDATE` + re-validate. Test integration wajib.
- **Print template:** belum decide layout final. Pakai existing `pdf.ts` style.
- **Auto-Paid trigger:** perlu hook di backend cash payment flow. Risk: missed trigger kalau payment update bypass standard path.
- **Existing invoices dengan dueDate "salah":** invoice yang sudah ada NULL `tukar_faktur_id`, dueDate-nya tetap (hitung dari delivery). Finance manual buat TF retro kalau perlu.

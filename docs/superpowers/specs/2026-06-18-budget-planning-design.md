# Budget Planning Feature — Design Spec
**Date:** 2026-06-18
**Status:** Approved
**Route:** `/finance/budget`

---

## Overview

Fitur perencanaan budget bulanan (post-budgeting) untuk memantau realisasi pengeluaran vs perencanaan awal. Dirancang untuk membantu manajemen mengendalikan pengeluaran operasional per pos secara real-time dengan visualisasi progress, sistem peringatan dini, dan kemampuan realokasi/adjustment antar pos.

---

## Access Control

| Role | Akses |
|------|-------|
| Super Admin | Full (buat, edit, realokasi, adjustment) |
| CEO / COO | Full (buat, edit, realokasi, adjustment) |
| Finance (Admin Finance) | Full (buat, edit, realokasi, adjustment) |
| Semua role lain | Tidak ada akses |

---

## Data Model

### Tabel: `budget_plans`
```
id            TEXT PRIMARY KEY   -- 'bp-2026-06'
month         TEXT NOT NULL      -- 'YYYY-MM'
status        TEXT NOT NULL      -- 'Draft' | 'Active' | 'Closed'
total_planned NUMERIC DEFAULT 0
notes         TEXT
created_by    TEXT
created_at    TIMESTAMPTZ
updated_at    TIMESTAMPTZ
```

### Tabel: `budget_categories` (Pos Utama)
```
id             TEXT PRIMARY KEY
plan_id        TEXT REFERENCES budget_plans(id)
name           TEXT NOT NULL
icon           TEXT
planned_amount NUMERIC DEFAULT 0
order_index    INTEGER DEFAULT 0
color          TEXT
```

### Tabel: `budget_sub_categories` (Sub-pos)
```
id                    TEXT PRIMARY KEY
category_id           TEXT REFERENCES budget_categories(id)
name                  TEXT NOT NULL
planned_amount        NUMERIC DEFAULT 0
mapped_tx_categories  TEXT[]
order_index           INTEGER DEFAULT 0
```

### Tabel: `budget_adjustments` (Log)
```
id                TEXT PRIMARY KEY
plan_id           TEXT REFERENCES budget_plans(id)
date              TIMESTAMPTZ
type              TEXT NOT NULL    -- 'Reallocation' | 'Adjustment'
from_category_id  TEXT
to_category_id    TEXT
sub_category_id   TEXT
amount            NUMERIC NOT NULL
reason            TEXT NOT NULL
created_by        TEXT
```

---

## Sumber Realisasi

| Tabel | Filter |
|-------|--------|
| cash_transactions | type='Out', reference_type='Manual', bulan sesuai |
| reimbursements | status='Paid', bulan sesuai (payment_date) |
| expenses | status='Approved', bulan sesuai |

Mapping via mapped_tx_categories[]. Transaksi tidak ter-map → panel "Tidak Terkategorikan".

---

## UI — 3 Mode View

### Mode 1: Dashboard
- Header: bulan, status, total planned vs realisasi, % global
- Per pos: progress bar (hijau/kuning/merah), expand untuk sub-pos
- Tombol [Realokasi] dan [Adjust] per pos
- Panel bawah: bar chart, log adjustments, panel tidak terkategorikan

### Mode 2: Form Perencanaan
- Step 1: Pilih bulan
- Step 2: Set budget (tabel: Sub-pos | Avg 3 Bln | Saran +10% | Input)
- Step 3: Review → [Draft] atau [Aktifkan]

### Mode 3: Riwayat
- List plan bulan lalu: Bulan | Planned | Realisasi | Selisih | Status

---

## Warning System

| Threshold | Warna | UI |
|-----------|-------|-----|
| < 80% | Hijau | Progress bar normal |
| 80–94% | Kuning | Badge ⚠️ |
| 95–99% | Merah | Toast notif (1x per session per pos) |
| >= 100% | Merah gelap | Banner alert di top halaman |

---

## Realokasi & Adjustment

**Realokasi:** Modal Dari → Ke, jumlah, alasan wajib. Validasi sisa saldo cukup.
**Adjustment:** Modal pos, jumlah (+/-), alasan wajib. Min planned = 0.

---

## Historical Suggestion

1. Cari 3 plan bulan terakhir (Closed/Active)
2. Avg realisasi per sub-pos × 1.10, dibulatkan ke Rp 50.000 terdekat
3. < 3 bulan historis: pakai yang ada. 0 historis: input manual.

---

## Default Pos Template

| Pos Utama | Sub-pos | Mapped Categories |
|-----------|---------|-------------------|
| Operasional | Bensin & Transport | ['Bensin/Transport'] |
| Operasional | Perawatan Kendaraan | ['Cuci/Perawatan'] |
| Operasional | Ongkir & Kurir | ['Lainnya'] |
| Operasional | ATK & Packing | ['ATK/Kantor'] |
| Gaji | Gaji Karyawan | ['Beban Gaji'] |
| Marketing | Iklan & Promosi | ['Marketing'] |
| Administrasi | Biaya Admin Bank | ['Biaya Admin'] |
| Lainnya | Pengeluaran Tak Terduga | ['Lainnya'] |

---

## Files

### Baru
- src/app/finance/budget/page.tsx
- src/app/finance/budget/components/BudgetDashboard.tsx
- src/app/finance/budget/components/BudgetPlanForm.tsx
- src/app/finance/budget/components/BudgetHistory.tsx
- src/app/finance/budget/components/RealokasiModal.tsx
- src/app/finance/budget/components/AdjustmentModal.tsx
- src/app/finance/budget/hooks/useBudgetRealisasi.ts
- src/app/finance/budget/hooks/useBudgetSuggestions.ts
- supabase/migrations/20260618_budget_planning.sql

### Dimodifikasi
- src/types/index.ts — tambah BudgetPlan, BudgetCategory, BudgetSubCategory, BudgetAdjustment
- src/lib/store.ts — tambah state & actions budget
- src/app/api/db/route.ts — tambah budget tables ke GET groups

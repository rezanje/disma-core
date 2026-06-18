# Vendor Catalog & Supply Portal — Design Spec

Date: 2026-06-19  
Status: Approved

---

## Overview

Three interrelated features:

1. **Vendor detail catalog** — admin lihat produk + harga dari vendor di modal vendor detail
2. **Supply portal** `/supply/[vendorId]` — vendor input harga produk sendiri via link publik
3. **Approval + margin** — admin approve submission vendor → update `basePrice` produk → tier client auto-recompute

Feature "edit payment term" (tempo) sudah ada di edit dialog vendor — tidak diubah.

---

## Data Model

### Tabel baru: `vendor_prices`

```sql
CREATE TABLE vendor_prices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  product_id   uuid REFERENCES products(id) ON DELETE SET NULL,
  proposed_name text,        -- diisi jika produk belum ada di master
  price        numeric NOT NULL,
  uom          text NOT NULL,
  valid_from   date NOT NULL,
  valid_to     date NOT NULL,
  status       text NOT NULL DEFAULT 'pending',  -- 'pending'|'active'|'rejected'|'expired'
  source       text NOT NULL DEFAULT 'portal',   -- 'portal'|'admin'
  notes        text,
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

### Type baru di `src/types/index.ts`

```typescript
export type VendorPriceStatus = 'pending' | 'active' | 'rejected' | 'expired';

export interface VendorPrice {
  id: string;
  vendorId: string;
  productId?: string;       // null = request produk baru
  proposedName?: string;    // isi jika productId null
  price: number;
  uom: string;
  validFrom: string;        // ISO date
  validTo: string;          // ISO date
  status: VendorPriceStatus;
  source: 'portal' | 'admin';
  notes?: string;
  lastUpdated: string;      // ISO timestamp
  createdAt: string;
}
```

### Store slice (`src/lib/store.ts`)

Actions mirror `clientPrices`:
- `addVendorPrice(vp: VendorPrice)`
- `updateVendorPrice(id, data)`
- `deleteVendorPrice(id)`
- State: `vendorPrices: VendorPrice[]`

Tambah `vendor_prices` ke:
- `TABLES_IN_WIPE_ORDER` dan `TABLES_IN_INSERT_ORDER` di backup/restore route
- `operationalTables` di reset route (sebelum `vendors`)

---

## Feature 1 — Vendor Detail Catalog

**File:** `src/app/admin/vendors/page.tsx`

Ganti section "Barang yang Disupply" (lines 371–394) dengan tabel catalog dari `vendor_prices` where `vendorId === detailVendor.id`:

Kolom tabel:
| Produk | UOM | Harga Beli | Berlaku s/d | Terupdate | Status | Actions |

- Status badge: `active` = hijau, `pending` = kuning, `expired` = abu, `rejected` = merah
- Kalau `valid_to < today` → auto-tampil sebagai expired (UI only, DB tetap `active` sampai admin update atau vendor submit baru)
- Tombol "+ Tambah Harga" untuk admin add manual (source: `admin`)
- Tombol approve/reject per row yang `status === 'pending'` → lihat section Approval

---

## Feature 3 — Supply Portal `/supply/[vendorId]`

**File baru:** `src/app/supply/[vendorId]/page.tsx`

Mirror pattern `/order/[clientId]/page.tsx`. No login — public link.

### UI Flow

1. **Header**: nama vendor (dari `vendorId`), subtitle "Portal Penawaran Harga"
2. **Daftar harga aktif**: list `vendor_prices` milik vendor ini (active + pending), tampil nama produk, harga, berlaku s/d, status
3. **Form tambah/update harga**:
   - Search produk dari product master (combobox `products`)
   - Isi harga, UOM (default dari produk), valid_from, valid_to (default T+7)
   - Produk tidak ketemu → "Request Produk Baru" → free-text nama + harga + uom
   - Submit → upsert `vendor_prices` status `pending`, last_updated = now()
4. **Success state**: konfirmasi "Harga berhasil dikirim, menunggu persetujuan"

### Validasi
- `valid_to >= valid_from` wajib
- `price > 0` wajib
- Kalau produk sudah ada entry `pending`/`active` dari vendor ini → update (upsert by `vendor_id + product_id`), bukan duplicate

### Link generation
Di vendor detail modal, tambah tombol "Salin Link Portal" → copy `{baseUrl}/supply/{vendorId}` ke clipboard. No QR code (scope minimize).

---

## Feature 4 — Approval Gate + Apply to Pricing

### Inbox di vendor detail modal

Badge counter di tab/section "Penawaran Pending" kalau ada `status === 'pending'`.

Tiap row pending → dua tombol:
- **Approve** (✓): set `status = 'active'`. Optionally: "Apply ke Pricing?" checkbox.
  - Kalau apply: `products.basePrice = vendor_price.price`, catat ke `product.priceHistory[]`. Tier client prices (Tier1–5, multiplier existing) auto-recompute di UI via formula yang sudah ada.
  - Kalau ada beberapa vendor supply produk sama → tampil pilihan vendor mana yang mau dipakai.
- **Reject** (✗): set `status = 'rejected'`, opsional isi alasan ke `notes`.

### Request produk baru
Approval request dengan `productId === null` → modal minta admin mapping:
- Pilih produk existing (bisa jadi produk baru dengan nama vendor mirip produk lain)
- Atau "Buat Produk Baru" → trigger create product flow, lalu link `product_id`

---

## Integration: Shopping List

`src/app/admin/shopping-list/page.tsx` — saat vendor di-assign ke produk di shopping list:
- Cek `vendorPrices` where `vendorId === assigned && productId === productId && status === 'active' && valid_to >= today`
- Kalau ada → pre-fill harga beli dari `vendor_prices.price` (bukan `product.basePrice`)
- Kalau tidak ada / expired → fallback ke `product.basePrice` + tampil indicator "harga tidak terkini"

---

## Out of Scope

- Email/notif ke vendor saat pending ditolak/approved
- Hard-lock vendor dari edit setelah submit (soft commitment saja)
- Login/auth untuk portal vendor
- Multi-currency

---

## Files Impacted

| File | Change |
|------|--------|
| `src/types/index.ts` | Tambah `VendorPrice`, `VendorPriceStatus` |
| `src/lib/store.ts` | Tambah `vendorPrices` slice + actions |
| `src/app/admin/vendors/page.tsx` | Ganti section "Disupply" → catalog table + approval UI + copy link |
| `src/app/supply/[vendorId]/page.tsx` | **Baru** — vendor supply portal |
| `src/app/api/db/backup/route.ts` | Tambah `vendor_prices` ke table lists |
| `src/app/api/db/reset/route.ts` | Tambah `vendor_prices` ke `operationalTables` |
| Supabase migration | CREATE TABLE vendor_prices |

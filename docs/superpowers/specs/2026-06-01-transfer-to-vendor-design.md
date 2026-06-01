# Transfer-to-Vendor Payment (spec B)

**Tanggal:** 2026-06-01
**Status:** Disetujui (brainstorm)
**Lanjutan dari:** sourcing settlement redesign (spec A). Melengkapi payment method ke-3.

## Tujuan

Dukung skenario: vendor dibayar **transfer oleh finance**, sourcing tinggal ambil
barang. Dimodelkan sebagai metode pembelian baru `purchaseMethod = 'Transfer'`,
**paralel dengan `Online`** yang sudah ada (finance bayar, gudang terima, HPP
final saat QC). Bukan di alur advance sourcing dan bukan di modal PR.

## Arsitektur

Cermin pola Online:
- Item ditandai `purchaseMethod='Transfer'` saat pembuatan shopping list.
- Finance membayar di hub (extend `src/app/finance/online-purchase/page.tsx`).
- Reconciliation sudah hanya memproses item `purchaseMethod==='Pasar'`, jadi
  Transfer otomatis ter-skip dari settlement advance.

## 1. Data model

- `PurchaseMethod` (`src/types/index.ts`): `'Pasar' | 'Online' | 'Transfer'`.
- `PurchaseItem`: tambah
  - `isTransferPaid?: boolean`
  - `transferVendorId?: string`
  - `transferRef?: string`
- Kolom prod baru (`purchase_items`): `is_transfer_paid` (bool), `transfer_vendor_id`
  (text), `transfer_ref` (text). Wajib `apply_migration` (schema-drift).

## 2. Flagging di Shopping List

`src/app/admin/shopping-list/page.tsx`: tiap item pilih metode **Pasar / Online /
Transfer** (saat ini toggle Pasar/Online). Untuk PO items pakai pola yang sama
dengan `onlineProductIds` (tambah `transferProductIds` set, persist di
localStorage). Saat compile, set `purchaseMethod`:
`transferProductIds.has(id) ? 'Transfer' : onlineProductIds.has(id) ? 'Online' : 'Pasar'`.
Item Transfer **dikecualikan dari budget advance sourcing** — ubah filter di
perhitungan advance (yang sekarang `purchaseMethod !== 'Online'`) menjadi
`purchaseMethod === 'Pasar'`.

## 3. Finance hub pembayaran

Extend `src/app/finance/online-purchase/page.tsx` dengan section **"Transfer
Vendor"** (atau tab) yang menampilkan item `purchaseMethod === 'Transfer' &&
!isTransferPaid`. Finance:
1. Centang beberapa item (batch) untuk satu vendor.
2. Pilih **vendor** + **rekening sumber** + total (default Σ qtyTarget×estimatedUnitPrice).
3. Klik **Bayar Transfer** → panggil `recordVendorTransferPurchase` per item
   (loop) atau satu journal batch.

### Accounting — `recordVendorTransferPurchase` (baru di `src/lib/accounting.ts`)
Cermin `recordOnlinePurchase`:
- Debit **`2-1100`** (AP Accrual / barang dalam perjalanan), credit COA rekening sumber.
- `addCashTransaction` type `Out`, category `'Transfer Vendor'`, `counterpartName`
  = nama vendor, `referenceType: 'Purchase'`, `referenceId: itemId`.
- `updatePurchaseItem(itemId, { isTransferPaid: true, transferVendorId, transferRef,
  actualUnitPrice: amount/qty, vendorId: transferVendorId })`.
- `updateProductPriceHistory` seperti Online.
- Guard duplikat: jika `isTransferPaid` sudah true → skip.
- HPP final tetap di QC inbound (tidak di sini), konsisten dengan Online.

## 4. Reconciliation & sourcing & readiness

- `recordReconciliationSettlement`: tidak diubah — filter `purchaseMethod==='Pasar'`
  sudah mengecualikan Transfer.
- **Readiness gate** "semua item siap" (mis. di online-purchase line ~147 dan
  tempat lain yang cek `isOnlineOrdered`): tambah cabang `purchaseMethod==='Transfer'`
  → siap jika `isTransferPaid`.
- **Sourcing belanja list** (`src/app/sourcing/list/page.tsx`): exclude item
  `purchaseMethod==='Transfer'` dari daftar yang dibeli sourcing (cermin
  pengecualian Online). Periksa `currentItems` filter dan filter Online lain.
- **QC inbound**: item Transfer mengikuti alur QC inbound seperti Online (tidak ada
  perubahan khusus selain memastikan tidak ter-filter keluar).

## Di luar scope
- Tempo untuk item Transfer (Transfer = bayar tunai/transfer sekarang). Tempo tetap
  di jalur Pasar (`paymentMethod`).
- Tidak mengubah alur Online yang sudah ada selain menambah section Transfer.
- Tidak mengubah `recordReconciliationSettlement`.

## Catatan
- Konsisten dengan memory schema-drift: tambah 3 kolom prod sebelum field dipakai.
- `online-purchase/page.tsx` sudah cukup besar; section Transfer ditambah sebagai
  blok terpisah dengan handler sendiri agar tetap terbaca.

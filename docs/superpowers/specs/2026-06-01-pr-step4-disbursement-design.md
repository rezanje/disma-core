# PR Step-4 Disbursement (ganti Advance tab)

**Tanggal:** 2026-06-01
**Status:** Disetujui (brainstorm), siap planning

## Tujuan

Hapus tab/flow **Advance** sebagai pintu masuk pencairan dana. Ganti dengan
**Step 4 "Pencairan Dana"** di workflow Purchase Request: setelah CFO approve,
Finance menekan tombol **Transaksi** untuk langsung mencairkan dana sesuai
nominal yang disetujui. Transaksi otomatis tercatat ke ledger (journal entry +
journal lines + cash transaction) sehingga langsung memengaruhi laporan keuangan.

Mekanisme advance/rekonsiliasi sourcing **tetap ada di backend** — yang dibuang
hanya UI tab Advance; pencairan ke dompet sourcing tetap memicu Sourcing
Settlement seperti sekarang.

## Pendekatan

Approach A — reuse infra akunting yang ada (`createAccountingEntry`,
`recordBudgetTransfer`) + modal baru kecil di PR detail. Tidak membangun service
terpadu baru.

## Bagian 1 — Nav & entry point

- Hapus item nav **"Advance"** di Finance Hub. Section advance di
  `src/app/finance/approvals/page.tsx` dipensiun (route tetap ada tapi
  di-redirect / di-hide dari nav; data advance existing tetap diproses lewat
  Sourcing Settlement).
- Di panel detail PR (`src/app/admin/purchase-requests/page.tsx`), tambah
  **Step 4 "Pencairan Dana"** pada Workflow State, muncul **hanya jika
  `pr.status === 'Approved'`**.
- Step 4 berisi tombol **"Transaksi"**. Klik → buka modal. Nominal default =
  `pr.amount`, locked (tidak boleh melebihi approved).
- Jika `pr.disbursedAt` sudah terisi → tombol disabled + badge
  **"Sudah Dicairkan"**.

## Bagian 2 — Modal Transaksi

Field:

1. **Tipe transaksi:**
   - `sourcing` — **Kasih Dana Sourcing** (pindah kas → dompet sourcing). Ada rekonsiliasi.
   - `vendor` — **Bayar Vendor Langsung** (pengeluaran, akun → vendor). Final.
   - `other` — **Pengeluaran Lain** (akun + keterangan bebas). Final.

2. **Field kondisional:**

   | Tipe | Field |
   |------|-------|
   | sourcing | Dari akun (bank kantor) → pilih sourcing (penerima) → nominal (≤ approved) → ops opsional |
   | vendor | Dari akun → pilih vendor → nominal → keterangan |
   | other | Dari akun → keterangan (wajib) → nominal |

3. **Validasi:**
   - Nominal > 0 dan ≤ `pr.amount`.
   - Akun sumber wajib. Sourcing/vendor wajib sesuai tipe. Keterangan wajib untuk `other`.
   - Default tipe = `sourcing` jika `pr.category === 'Sourcing'`, selain itu `other`.

4. Submit: **"Catat & Transfer"** → posting ledger, set `disbursedAt`, tutup modal.

## Bagian 3 — Posting ledger per tipe

Semua via `createAccountingEntry(desc, refType, refId, debits, credits, date)`
(atomic via `/api/accounting/journal`).

1. **sourcing** — reuse `recordBudgetTransfer(purchaseId, amount, bankAccountId, recipientName)`:
   - Debit dompet sourcing (aset, `1-1500`) | Credit bank kantor.
   - Belum jadi beban; beban diakui saat rekonsiliasi (settlement existing).
   - Set `budgetTransferDate`, `budgetBankAccountId`, `budgetTransferedBy` pada
     purchase ter-link → masuk antrian Sourcing Settlement.

2. **vendor** — helper baru `recordDirectVendorPayment`:
   - Debit COA beban per `pr.category` (map kategori→COA, fallback beban operasional umum) | Credit bank kantor.
   - `counterpartName` = nama vendor. `referenceType: 'Expense'`, `referenceId: pr.id`.
   - Catat `cashTransaction` Out + journal. Final.

3. **other** — helper baru `recordPRExpense`:
   - Debit COA beban per kategori (fallback umum) | Credit bank kantor.
   - Keterangan = deskripsi user. `referenceType: 'Expense'`, `referenceId: pr.id`. Final.

**Map kategori→COA:** tabel konstanta di `src/lib/accounting.ts`. Kode COA real
diverifikasi saat planning (baca tabel `coas`). Fallback ke satu akun beban
operasional umum.

**Guard double-posting:** sebelum post, cek tidak ada `journalEntries` dengan
`referenceId === pr.id`. Plus `pr.disbursedAt` sebagai penanda idempotent.

## Bagian 4 — Status, data, edge case

**Field baru `PurchaseRequest`** (`src/types/index.ts`):
- `disbursedAt?: string`
- `disbursementType?: 'sourcing' | 'vendor' | 'other'`
- `disbursedBy?: string`

⚠️ **Wajib tambah kolom prod** (`disbursed_at`, `disbursement_type`,
`disbursed_by`) via Supabase `apply_migration` (text). Tanpa kolom, PR-update
ke-drop diam-diam (schema-drift gotcha — lihat memory).

**Linkage sourcing PR → purchase:** cari purchase dengan
`purchaseRequestId === pr.id` (shopping list yang dibuat di Shopping List).
Itu dokumen yang difund + masuk settlement.

**Edge case:**
- Sourcing PR tapi belum ada purchase ter-link → blok tipe `sourcing`, pesan
  "Buat shopping list dulu".
- >1 purchase ter-link → user pilih; 0 → blok (untuk tipe sourcing).
- Nominal > approved ditolak; default full.
- Sync gagal → toast error (sudah dilindungi fix `could not find the table`).
- Advance tab lama: hapus dari nav; data advance existing tetap bisa diproses
  via Sourcing Settlement.

**Verifikasi (manual + DB):** setelah transfer — `journal_entries` +
`journal_lines` terbentuk & balance, `cash_transactions` terbuat, `pr.disbursedAt`
terset, ledger/laporan terupdate.

## Di luar scope

- Tidak mengubah Sourcing Settlement / Rekonsiliasi (tetap seperti sekarang).
- Tidak menangani inventory/HPP via path vendor/other (itu tetap lewat sourcing
  + QC inbound).
- Tidak ada pembayaran tempo/AP otomatis dari path ini (vendor = bayar tunai/transfer).

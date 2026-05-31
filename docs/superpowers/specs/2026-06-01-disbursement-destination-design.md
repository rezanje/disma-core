# Disbursement Destination & Contacts (refine PR step-4 modal)

**Tanggal:** 2026-06-01
**Status:** Disetujui (brainstorm)
**Lanjutan dari:** `2026-06-01-pr-step4-disbursement-design.md`

## Tujuan

Perjelas ALUR uang di modal Transaksi PR step-4: tambahkan **tujuan dana** yang
sebelumnya hilang.

- **Sourcing (Belanja PO):** tambah pilihan **rekening tujuan** (ke mana advance
  dipindah, mis. Bank Jago). Buang field "Operasional Tambahan" (sourcing ajukan
  PR ops sendiri). Rekonsiliasi mengikuti rekening tujuan tsb.
- **Pengeluaran/Bayar (gabungan vendor + lain-lain):** tambah **kontak tujuan**
  (vendor/toko/perorangan — pilih existing atau buat baru inline) dan **jenis
  pengeluaran** (Sewa, Listrik, Marketing, Transport, dll → COA).

## Model modal (2 tipe, sebelumnya 3)

`disburseType` jadi `'sourcing' | 'expense'`. Default: `pr.category === 'Sourcing'`
→ `sourcing`, selain itu `expense`.

### Tipe 1 — Sourcing (pindah kas, direkonsiliasi)
Field: Dari rekening (sumber) · **Ke rekening (tujuan)** · Penanggung jawab
sourcing · Nominal (≤ approved) · Keterangan. (Operasional Tambahan DIHAPUS.)

Akunting: pindah kas sumber→tujuan via `recordBudgetTransfer` (di-extend dengan
param `destBankAccountId?`). Debit COA rekening tujuan, credit COA rekening sumber.
Simpan `budgetDestBankAccountId` di purchase. Set `status:'Belanja'`, `purchaserId`,
`budgetAmount`, `budgetTransferDate`, `budgetBankAccountId`, `budgetTransferedBy`.

### Tipe 2 — Pengeluaran/Bayar (final)
Field: Dari rekening · **Ke kontak** (pilih vendor/toko/perorangan atau **+ Kontak
Baru** inline) · **Jenis pengeluaran** (dropdown) · Nominal · Keterangan.

Jenis pengeluaran → COA:
| Jenis | COA |
|-------|-----|
| Sewa Gedung/Workshop | 6-1100 |
| Listrik, Air & Internet | 6-1200 |
| Marketing & Iklan | 6-1300 |
| Transportasi & BBM / Bengkel | 6-1400 |
| ATK & Kantor | 6-1500 |
| Admin Platform (Shopee/Tokopedia) | 6-1600 |
| Ongkos Kirim | 6-1700 |
| Gaji & Tunjangan | 6-1000 |
| Operasional Lainnya | 6-9000 |

Akunting: debit COA jenis pengeluaran, credit COA rekening sumber, `counterpartName`
= nama kontak, `referenceType:'Expense'`, `referenceId: pr.id`. Final.

## Kontak (pakai ulang Vendors)

Vendor = kontak universal. Tambah field opsional `kind: 'vendor'|'toko'|'perorangan'`.
"+ Kontak Baru" inline di modal → `addVendor({ id, companyName: nama, picName:'',
email:'', phone:'', address:'', createdAt: now, kind })` lalu auto-select.

## Rekonsiliasi (rework, backward-compatible)

`recordReconciliationSettlement`: jika `purchase.budgetDestBankAccountId` ada →
pakai bank itu (id + `accountCode`) sebagai akun penampung advance untuk settle.
Jika tidak ada (data advance lama) → fallback ke `getAdvanceWalletByUserId`
(perilaku sekarang). Tidak ada perubahan logika settle lain.

## Data (kolom prod baru — schema drift)

- `vendors.kind` (text)
- `purchases.budget_dest_bank_account_id` (text)

Wajib `apply_migration` sebelum field dipakai (lihat memory schema-drift).

## Types
- `Vendor`: `kind?: 'vendor' | 'toko' | 'perorangan'`
- `Purchase`: `budgetDestBankAccountId?: string`

## Di luar scope
- Tidak menambah tabel contacts terpisah (pakai vendors).
- Tidak mengubah alur Sourcing Settlement selain sumber akun penampung.
- Helper lama `recordDirectVendorPayment` & `recordPRExpense` (kategori→COA) diganti
  oleh satu helper expense baru yang menerima COA + payee eksplisit.

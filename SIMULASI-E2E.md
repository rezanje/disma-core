# Simulasi End-to-End DISMA Core — Runbook

Tujuan: buktikan semua alur **PO → belanja → inventory/QC → kirim → invoice → tukar faktur → pembayaran** nyambung, dan **laporan keuangan (Neraca / Laba-Rugi) sinkron** dengan data operasional. Termasuk skema disbursement bank. Dua skenario: satu **LUNAS**, satu **BELUM BAYAR**.

Jalankan runbook ini di sesi baru. Semua konteks yang dibutuhkan ada di sini.

---

## 0. Akses & konteks (self-contained)

- **App production:** https://disma-core.vercel.app (login PIN-only di `/login`)
- **DB:** Supabase project `ckkohudfuisgzlrjipev` ("Disma Core ERP"). Query via Supabase MCP `execute_sql`. Read-only verifikasi pakai `select`; jangan DDL.
- **Vercel:** project `prj_noyAuMqEVUMAv1SqLJ5bvpCX1PKk`, team `team_aK5MXbarh4lhZK9o6udRyIIy`.
- **Metode:** drive UI beneran (browser automation) sbagai tiap role, verifikasi tiap tahap via SQL. Tujuannya nangkep kalau UI **gak** nyambung, bukan cuma DB.

### Akun (PIN)
| Role | PIN |
|---|---|
| Admin PO | 1111 |
| Admin Finance | 5555 |
| Sourcing | 2222 |
| Inventory & QC | 3333 |
| Logistik | 4444 |
| Super user | 120194 |
| COO (Syahmi) | 8888 |

### Bank (skema disbursement)
| Bank | id | COA | Fungsi |
|---|---|---|---|
| MANDIRI (Simpanan) | `bank-2` | 1-1300 | Tabungan/cadangan, modal masuk, bayar hutang. Saldo awal **Rp600jt** |
| BCA (OPS) | `bank-1` | 1-1200 | Operasional; tujuan disbursement mingguan |
| Bank Jago (Belanja) | `bank-1780130179663` | 1-1000 | Kas belanja; sourcing ambil dari sini, lebihan balik sini |
| BRI (Penerimaan) | `bank-3` | 1-1000 | Duit client masuk sini |
| KAS SOURCING (Bagja) | `bank-advance-sourcing` | 1-1500 | Uang jalan sourcing |
| Kas Logistik (Rifai) | `bank-advance-sourcing-rifai` | 1-1500 | Uang jalan logistik |
| PETTY CASH | `bank-4` | 1-1000 | Kas kecil |

Aliran duit: `Modal 600jt → Mandiri` → mingguan `Mandiri → BCA` → `BCA → Jago` → sourcing belanja dari Jago (lebihan balik Jago). Client bayar → `BRI`. Bayar hutang → dari `Mandiri`.

### COA penting
| Akun | Code | id |
|---|---|---|
| Kas/Bank | 1-1000 | (banyak) |
| Piutang Usaha | 1-2000 | `coa-2` |
| Persediaan (utama) | 1-3000 | — |
| Persediaan B2C | 1-3100 | — |
| Hutang Usaha | 2-1000 / 2-2000 | — |
| Modal Pemilik | 3-1000 | `coa-11` |
| Pendapatan Penjualan | 4-1000 | `coa-12` |
| HPP | 5-1000 | `coa-13` |

### Titik posting jurnal (src/lib/accounting.ts)
- **Belanja online / transfer**: `recordOnlinePurchase` (358), `recordVendorTransferPurchase` (1327), `recordReconciliationSettlement` (784) → `Dr Persediaan|Advance / Cr Kas|Hutang`.
- **QC inbound**: `recordInboundQC` (1111) → `Dr Persediaan 1-3000`.
- **Kirim + invoice (revenue + COGS)**: `recordDeliveryAndInvoice` (581) → `Dr Piutang 1-2000 / Cr Pendapatan 4-1000` **dan** `Dr HPP 5-1000 / Cr Persediaan 1-3000`. ← titik paling rawan.
- **Terima pembayaran**: `recordPaymentReceived` (1068) → `Dr Bank / Cr Piutang 1-2000` + cash transaction In.
- **Piutang manual**: `recordManualReceivable` (663).
- **Transfer antar bank / disbursement**: `recordBudgetTransfer` (733), `recordOperationalAdvanceTransfer` (522).

### SO status machine (sales-orders page `advanceStatus`)
`Pending Approval → Draft → Belanja → Packing → Siap Kirim → Dikirim → Selesai`

---

## 1. ⚠️ Aturan main (WAJIB)

- **Data belum real** → gak perlu backup. Boleh layer di atas data existing.
- **JANGAN pencet tombol `RESET` / `SIMULASI` / `RESET SIMULATION`** yang nempel di toolbar bawah tiap halaman. Itu manggil `/api/db/reset` dan bisa wipe tabel transaksi.
- **JANGAN pakai selector generik** (`button[type=submit]`, dll) di browser automation — bisa nyasar ke tombol reset. Selalu target tombol via **teks/id persis**.
- Verifikasi angka **via SQL**, jangan percaya UI doang.

---

## 2. Baseline — catat SEBELUM mulai

Jalankan & simpan hasilnya (buat ngitung delta nanti):

```sql
select
  (select coalesce(sum(total_amount-coalesce(amount_paid,0)),0) from invoices) as ar_outstanding,
  (select coalesce(sum(total_amount-coalesce(amount_paid,0)),0) from vendor_bills where status not in ('Paid','Cancelled')) as ap_outstanding,
  (select coalesce(sum(debit_amount-credit_amount),0) from journal_lines where account_id='coa-2') as piutang_neraca,
  (select coalesce(sum(credit_amount-debit_amount),0) from journal_lines jl join coas c on c.id=jl.account_id where c.account_code='4-1000') as pendapatan,
  (select coalesce(sum(debit_amount-credit_amount),0) from journal_lines jl join coas c on c.id=jl.account_id where c.account_code='5-1000') as hpp,
  (select coalesce(sum(debit_amount)-sum(credit_amount),0) from journal_lines) as buku_balance,
  (select coalesce(sum(balance),0) from bank_accounts) as total_saldo_bank;
```

Baseline per 2026-06-03 (referensi): AR ≈ 1.049.925.428, AP ≈ 122.392.350, Piutang jurnal = AR, buku_balance = 0, Mandiri = 600jt.

`buku_balance` harus **0** di awal DAN di akhir (kalau gak 0, ada jurnal pincang).

---

## 3. Skenario

**Prelude disbursement (sekali):**
- D0: pastikan modal 600jt di Mandiri ke-jurnal (`Dr Mandiri 1-1300 / Cr Hutang/Modal`). Kalau belum, catat dulu.
- D1: `Mandiri → BCA` (mis. 100jt) — disbursement mingguan.
- D2: `BCA → Jago` (mis. 50jt) — budget belanja.

**PO-A — happy path → LUNAS**
**PO-B — jalan penuh sampai tukar faktur → BELUM BAYAR**

Pakai **client + produk yang sudah ada** (biar match). Tandai order dengan catatan `SIM-` di nomor PO biar gampang dibersihin.

---

## 4. Langkah eksekusi per role

| # | Role (PIN) | Aksi | Cek setelahnya |
|---|---|---|---|
| D1 | Finance (5555) | Transfer Mandiri→BCA | saldo Mandiri turun, BCA naik, net 0 |
| D2 | Finance | Transfer BCA→Jago | BCA turun, Jago naik, net 0 |
| 1 | Admin PO (1111) | Sales Orders → New: client X, 2-3 produk, qty, harga jual | SO + items kebuat, subtotal = qty×harga |
| 2 | Admin PO | Approve draft (kalau via Request Client) → status Draft | status Draft |
| 3 | Admin PO | Shopping List → compile PO ini → Buat Dokumen List | purchase + purchase_items kebuat, qty = SO qty |
| 4 | Admin PO | Kirim ke Finance | Purchase Request kebuat |
| 5 | Finance (5555) | Approve PR / transfer budget belanja ke Jago | budget transfer tercatat |
| 6 | Sourcing (2222) | Belanja tiap item: isi harga beli, qty, vendor, metode (dari Jago) | purchase_items keisi actual price; Jago turun |
| 7 | Finance (5555) | Settlement belanja → vendor bill (AP) + kas keluar; lebihan balik Jago | vendor_bill kebuat; jurnal belanja |
| 8 | Inventory/QC (3333) | Inbound: terima barang | inbound status |
| 9 | Inventory/QC | QC: pass semua (PO-A). PO-B: reject 1 item sebagian (uji qtyFinal) | stok naik = qty pass; jurnal Dr Persediaan |
| 10 | Inventory | Outbound / packing → Siap Kirim | status Siap Kirim |
| 11 | Logistik (4444) | Handover → Dikirim → Selesai (surat jalan/BA) | delivery record; stok turun (outbound) |
| 12 | Admin/Finance | Terbit invoice per PO → **revenue + COGS ke-jurnal** | Dr Piutang/Cr Pendapatan + Dr HPP/Cr Persediaan |
| 13 | Finance | Gabung invoice ke **Tukar Faktur** (per periode) | TF consolidatedOrderNumbers = PO digabung; invoice anak supersededByInvoiceId keisi |
| 14 | Finance | **PO-A**: catat pembayaran ke BRI (lunas) | Dr BRI/Cr Piutang; status Paid; BRI naik |
| 15 | — | **PO-B**: biarin unpaid | tetap nangkring di AR Aging |

---

## 5. Checkpoint matrix (assert `X == Y`)

Relasi data:
1. `sales_order_items.sales_order_id` & `.product_id` valid (gak orphan).
2. `purchase_items.qty_target` == SO item qty (konsolidasi bener).
3. `purchase_items.sales_order_id` nyambung ke PO asal.
4. `invoices.client_id` == SO.client_id. Tukar faktur `consolidated_order_numbers` == PO yang digabung.

Uang (double-entry):
5. Belanja: `Dr Persediaan/Advance == Cr Kas(Jago)/Hutang` == total belanja.
6. AP: `vendor_bills` unpaid == total transfer belum bayar → muncul di **Finance → AP Aging**.
7. QC inbound: `Dr Persediaan 1-3000` nambah == qty_pass × unit_cost; `products.current_stock` naik (stock_movements).
8. QC reject (qtyFinal<qty): stok, invoice, HPP semua ikut nyesuain.
9. Kirim/invoice: `Dr Piutang == Cr Pendapatan == invoiceTotal` **DAN** `Dr HPP == Cr Persediaan == cogsTotal`.
10. Bayar PO-A: `Dr BRI == Cr Piutang == bayaran`; AR turun; status Paid.
11. PO-B unpaid: Piutang tetap; nangkring di AR Aging.

Laporan keuangan sinkron (ujung):
```sql
-- 12 & 13: Neraca vs operasional
select
  (select coalesce(sum(debit_amount-credit_amount),0) from journal_lines where account_id='coa-2') as piutang_jurnal,
  (select coalesce(sum(total_amount-coalesce(amount_paid,0)),0) from invoices) as ar_aging,   -- harus sama
  (select coalesce(sum(credit_amount-debit_amount),0) from journal_lines jl join coas c on c.id=jl.account_id where c.account_code like '2-%') as hutang_jurnal,
  (select coalesce(sum(total_amount-coalesce(amount_paid,0)),0) from vendor_bills where status not in ('Paid','Cancelled')) as ap_aging;  -- bandingkan
-- 16: buku balance
select coalesce(sum(debit_amount)-sum(credit_amount),0) as harus_nol from journal_lines;
```
12. Piutang jurnal == AR Aging.
13. Hutang jurnal == AP Aging (untuk yang lewat vendor bill).
14. Kas Neraca (Σ 1-1000 dkk di jurnal) konsisten dgn cash ledger; `bank_accounts.balance` masuk akal.
15. Laba-Rugi: Pendapatan == Σ invoice periode; HPP == Σ cost; Laba = Pendapatan − HPP − beban.
16. **Σ debit == Σ credit** (`harus_nol` = 0).

---

## 6. Watch-point khusus (tempat wiring biasa putus)

- **Revenue+COGS recognition (step 12)** — jangan dobel / jangan ilang. Titik: `recordDeliveryAndInvoice`.
- **Booking stok** (fitur "Ambil dari Gudang" di shopping list) vs deduction real — jangan dobel potong. Booking = stock_movement `kind='BOOKING'`, `stock_delta=0` (reserve, belum kurangi stok).
- **Tukar faktur nge-supersede invoice anak** (`superseded_by_invoice_id`) → piutang jangan keitung 2x (anak + TF).
- **Share COA 1-1000**: Jago + BRI + Petty Cash sama-sama code 1-1000. Saldo per-bank (`bank_accounts.balance`) bisa beda dari saldo per-akun jurnal (1-1000 gabungan). Cek dua-duanya; ini rawan "nyambung tapi gak match".
- **Qty adjustment QC** (qtyFinal < qty) ngalir ke invoice & HPP gak.
- **Uang gak bocor**: Σ semua saldo bank == modal masuk − pengeluaran net.

---

## 7. Cleanup (opsional, kalau mau bersihin jejak simulasi)

Semua record sim nyambung by id. Hapus urut anak→induk untuk PO sim:
`journal_lines → journal_entries` (yang reference_id = invoice/SO sim), `stock_movements`, `invoices`, `tukar_faktur`, `purchase_items`, `purchases`, `sales_order_items`, `sales_orders`, `vendor_bills` sim. Filter by nomor `SIM-` atau by created window. Kalau data belum real & gak masalah nyampur, skip cleanup.

---

## 8. Output yang diharapkan

Laporan akhir: tabel 16 checkpoint (PASS/FAIL + angka), plus daftar watch-point (nyambung / putus). Kalau ada FAIL, sebutin file + titik logic yang putus (mis. `accounting.ts:581` revenue gak ke-post saat kirim).

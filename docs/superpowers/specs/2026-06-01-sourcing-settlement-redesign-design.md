# Sourcing Settlement Page Redesign + Cash/Tempo per item

**Tanggal:** 2026-06-01
**Status:** Disetujui (brainstorm)
**Scope:** Spec A dari rangkaian payment-method. Transfer (finance bayar vendor) = spec B menyusul.

## Tujuan

Sederhanakan halaman sourcing (`src/app/sourcing/list/page.tsx`) jadi satu layar
yang jelas: saldo kas sourcing (Bank Jago), checklist belanja dengan input
lengkap per item, pemakaian operasional, dan ringkasan sisa/minus secara live.
Tambah pemilihan **payment method (Cash/Tempo)** per item. Risiko rendah —
mayoritas logika sudah ada; ini reorganisasi UI + selector + perbaikan math.

## Layout (satu halaman, atas→bawah)

1. **Kas Sourcing** — "Modal di Tangan" (saldo advance / Bank Jago) + "Estimasi
   Sisa" (live) + tombol "Setor Sisa Kas". (Sudah ada — dipertahankan.)
2. **Checklist Belanja** — tiap item: checkbox ✓, nama produk, qty target. Saat
   dicentang/diedit tampil input: **qty dapet · harga beli · vendor · payment
   method (Cash/Tempo) · keterangan**. Item Tempo diberi badge "TEMPO".
3. **Pemakaian Operasional** — daftar pengeluaran bensin/tol/parkir/dll + total.
   (Sudah ada sebagai "Potong Kas"/expenses — dirapikan ke section sendiri.)
4. **Ringkasan Live** — Total belanja cash · Total tempo (info) · Total ops ·
   **Sisa / Minus (nalangin)**.
5. **Kirim Laporan ke Finance** — submit (existing `handleSubmitLaporan`).

## Logika perhitungan

- `cashShop` = Σ item `isChecked` dengan `paymentMethod !== 'Tempo'` → `qty × harga`.
- `tempoShop` = Σ item `isChecked` dengan `paymentMethod === 'Tempo'` →
  informasi saja; **tidak** mengurangi kas (jadi hutang AP).
- `opsTotal` = Σ pengeluaran operasional.
- `sisa = totalHolding(advance) − cashShop − opsTotal`. Jika `< 0` → minus
  (nalangin) → reimbursement saat settlement (alur existing).
- Item Tempo tetap tersimpan (vendor, qty, harga) → `recordReconciliationSettlement`
  otomatis membuat `VendorBill` (AP) — alur existing, tidak diubah.

## Payment method per item

- Field `PurchaseItem.paymentMethod: 'Cash' | 'Tempo'` (sudah ada di tipe).
  Tambahkan Select di baris edit item. Default `'Cash'`.
- Saat submit, `paymentMethod` ikut disimpan per item (extend
  `handleSubmitLaporan` / `handleSaveItem`).
- Item Tempo: badge visual; dikecualikan dari `cashShop` dan `remainingCash`.

## Akunting (tidak berubah)

`recordReconciliationSettlement` SUDAH memisah berdasarkan `item.paymentMethod`:
`Cash` → settle dari advance (debit HPP 5-1000), `Tempo` → buat `VendorBill`
(AP, muncul di AP Aging + hutang vendor dengan jatuh tempo). Defisit → reimbursement.
Spec ini hanya memastikan sourcing meng-set `paymentMethod` dengan benar dan math
sisa mengecualikan tempo. Tidak ada perubahan di `accounting.ts`.

## Di luar scope
- **Transfer** payment method + alur bayar vendor oleh finance → spec B.
- Tidak mengubah `recordReconciliationSettlement` atau alur AP/VendorBill.
- Tidak menambah kolom DB (semua field sudah ada).
- Tidak mengubah halaman Finance Settlement / approval.

## Catatan implementasi
- `src/app/sourcing/list/page.tsx` saat ini ~1206 baris. Lakukan reorganisasi
  terarah pada bagian render + perbaikan dua perhitungan (`totalShopSpentActual`,
  `remainingCash`) agar mengecualikan item Tempo, plus tambah Select payment
  method. Hindari rewrite total; ikuti pola handler/komponen yang sudah ada.

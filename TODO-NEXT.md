# Project Progress & Next Steps (Quick Vendor & Payment Override)

## 1. Status Terakhir (Completed & Committed)
Berikut adalah fitur-fitur yang sudah selesai dikembangkan dan di-commit ke Git:
*   **Database Schema & Types:**
    *   Kolom `payment_method` ditambahkan ke tabel `purchase_items` di `supabase/dev-bootstrap.sql` dan interface TypeScript `PurchaseItem` di `src/types/index.ts`.
*   **Helper & Accounting Logic:**
    *   Fungsi `recordReconciliationSettlement` di `src/lib/accounting.ts` dan `computeSettlementBreakdown` di `src/lib/vendor-payable.ts` diperbarui agar memprioritaskan per-item `paymentMethod` override (jatuh tempo/tempo vs cash), baru kemudian *fallback* ke setting default vendor (`vendor.isTempo`).
    *   Unit test untuk logic ini telah dibuat dan divalidasi (`scripts/test-vendor-payable.js`).
*   **UI Settlement Modal:**
    *   Menambahkan dropdown **Tipe Bayar** (Cash/Tempo) per baris item belanjaan di modal Sourcing Settlement.
    *   Menambahkan tombol inline **`+ Tambah`** untuk membuat vendor baru secara cepat langsung dari modal settlement tanpa harus pindah halaman.
    *   Memperbaiki dropdown vendor agar menampilkan `companyName` dan status tempo (`(tempo 14d)` / `(cash)`) alih-alih ID mentah.

---

## 2. Perubahan Aktif yang Belum Di-commit (Modified Files)
*   **`src/app/finance/approvals/page.tsx`**
    *   **Perubahan:** Menyelaraskan logika kalkulasi di fungsi submit handler (`handleSettlePurchase`). Menghitung pengembalian sisa dana anggaran (`finalNetBalance`) hanya dikurangi oleh item yang dibeli dengan **Cash HPP + Ops**. Item dengan metode **Tempo** tidak mengurangi saldo kas belanja muka.
*   **`scratch/fast-trial-balance.js`**
    *   **Perubahan:** Modifikasi minor untuk menguji trial balance langsung ke *production Supabase* secara cepat.

---

## 3. File Baru yang Belum Di-track (Untracked Files)
*   **`supabase/migrations/20260528_add_expense_purchase_link.sql`**
    *   **Isi:** Menambahkan kolom `purchase_id` dan `target_bank_account_id` ke tabel `expenses` di database production (agar sisa dana yang dikembalikan dapat dibuat sebagai *expense* dengan kategori `Setoran Pengembalian` dengan status `Pending Audit` yang terhubung langsung ke sesi belanja/purchase).
*   **`scratch/seed-test-settlement.js`**
    *   **Isi:** Script untuk men-seed data transaksi dummy (purchase, purchase items, dan pending return expense) untuk memudahkan pengetesan halaman Sourcing Settlement.

---

## 4. Langkah Selanjutnya / TODO List (Untuk Claude Code)

- [ ] **Jalankan Migrasi Database:**
    *   Terapkan file migrasi `supabase/migrations/20260528_add_expense_purchase_link.sql` ke database target (development/production).
- [ ] **Verifikasi Local & Uji Coba Flow Settle:**
    *   Jalankan script seed testing:
        ```bash
        node scratch/seed-test-settlement.js
        ```
    *   Buka UI approvals (`http://localhost:3000/finance/approvals`), lakukan settlement pada purchase `pur-test-settle`.
    *   Pastikan sisa dana yang dihitung benar (hanya memperhitungkan item non-tempo + operasional), dan ketika di-submit, ia membuat record pengembalian dana di antrean Audit Manual (tidak langsung auto-approve).
- [ ] **Commit Perubahan Terakhir:**
    ```bash
    git add src/app/finance/approvals/page.tsx supabase/migrations/20260528_add_expense_purchase_link.sql scratch/seed-test-settlement.js
    git commit -m "fix(finance): support cash-only return calculation and link return expense to purchase"
    ```

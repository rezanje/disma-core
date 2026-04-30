# Sourcing Settlement Refactor & Bug Fixes

Goal: Memperbaiki masalah *loading delay* di awal, membereskan *bug* rekonsiliasi yang tidak mau hilang, dan merombak UX Finance Hub agar proses *approval* Sourcing jauh lebih efisien (semua aktivitas Sourcing untuk 1 sesi dana dikelompokkan ke dalam 1 halaman persetujuan).

## Proposed Changes

### 1. Global Loading State (Fix Delay 0 Data)
Saat ini sistem menampilkan "0" selama beberapa detik sebelum data asli muncul karena Zustand sedang *fetching* data dari Supabase di latar belakang (*hydration*). 
- **[MODIFY]** `src/app/layout.tsx` atau `src/components/providers/store-sync.tsx`
- Menambahkan layar *Loading* (Spinner/Skeleton) secara global saat `store.isSyncing` pada inisialisasi pertama kali bernilai `true`. Hal ini mencegah *user* melihat angka palsu (0) sebelum data aslinya turun dari server.

### 2. Sourcing Settlement Hub (UX Finance Hub)
Sesuai permintaan, kita tidak akan lagi memisah persetujuan "Rekon HPP", "Audit Ops", dan "Reimburse" ke beda-beda tab. Kita akan satukan semuanya ke dalam satu sub-halaman: **Sourcing Settlement**.
- **[MODIFY]** `src/types/index.ts`
  - Menambahkan kolom `purchaseId?: string` di model `OperationalExpense` dan `Reimbursement` agar sistem tahu bensin/reimburse ini terkait dengan uang kas belanja sesi yang mana.
- **[MODIFY]** `src/app/sourcing/list/page.tsx` & `src/app/sourcing/expenses/page.tsx`
  - Memastikan *form* Quick Expense dan Reimbursement otomatis menautkan `purchaseId` yang sedang aktif (sesi belanja yang sedang berjalan).
- **[NEW]** `src/app/finance/approvals/sourcing-settlement/page.tsx` (atau integrasi di dalam tab baru `approvals/page.tsx`)
  - **Sourcing Settlement Dashboard**: Menampilkan *card* per satu kali pencairan dana (Satu ID *Purchase*).
  - Ketika Finance menekan satu sesi, sistem memunculkan rincian terpusat:
    1. **Budget Dikasih:** (Misal Rp 1.500.000)
    2. **HPP Barang:** (Daftar barang yang dibeli)
    3. **Operasional:** (Bensin, Parkir, dll. yang ditagihkan di sesi ini)
    4. **Kasbon/Reimburse:** (Kalau dana nombok di sesi ini)
    5. **Uang Sisa (Returns):** (Uang yang harusnya dibalikin)
  - Di halaman ini Finance punya satu tombol besar **"Approve Seluruh Sesi Sourcing"** yang otomatis memvalidasi HPP, memotong Kas Operasional, mencatat Kasbon, dan memvalidasi sisa uang.

### 3. Perbaikan Bug Rekonsiliasi (Tidak mau hilang & Saldo tak terpotong)
- **[MODIFY]** `src/lib/accounting.ts` & `src/app/finance/approvals/page.tsx`
  - Memperbaiki `recordReconciliationSettlement` dan fungsi penyertaannya agar `reconciliationStatus` benar-benar ter-sinkronisasi ke Supabase menjadi `Terverifikasi`.
  - Memastikan pencatatan kas keluar (*CashTransaction* Out) tidak konflik (*race condition*) dengan sinkronisasi *Zustand*, sehingga rekonsiliasi sukses dan lenyap dari antrean *pending*.

## Open Questions
> [!IMPORTANT]
> **Pertanyaan Desain: Link ke Sesi Belanja Aktif**
> Terkadang tim Sourcing punya lebih dari 1 sesi belanja di hari yang sama (misal beli pagi, lalu dikasih budget lagi siang). Sistem akan menautkan pengeluaran bensin otomatis ke sesi belanja yang paling terakhir/aktif. Apakah logika *auto-link* ini sudah sesuai buat skenario lapangan kalian?

## Verification Plan
1. **Refresh Browser**: Aplikasi akan menampilkan loading *overlay* elegan alih-alih angka nol.
2. **Submit Bensin & Belanja di Sourcing**: Semua tindakan akan terhubung ke 1 *ID Budget*.
3. **Approve di Finance Hub**: Finance hanya perlu membuka 1 laporan untuk mengecek total uang masuk-keluar untuk *sourcing* terkait dan *approve* dengan satu klik. Laporan yang sudah di-*approve* akan langsung hilang dari *list*.

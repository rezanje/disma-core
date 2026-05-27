# Spec Desain: E2E Local Flow Simulation

Menjalankan simulasi transaksi bisnis dari Purchase Order (PO) sampai Pembayaran secara programmatis pada database lokal tanpa menghapus data transaksi yang sudah ada.

## Deskripsi Goal
Memvalidasi seluruh alur logika bisnis, pencatatan jurnal akuntansi, mutasi stok, dan pencatatan kas menggunakan skrip otomatisasi di database lokal. Simulasi menggunakan entitas klien "PT TES PAK REZA".

## Rincian Desain

### 1. Setup Entitas Master
- **Klien**: Memastikan klien `client-pt-tes-pak-reza` ("PT TES PAK REZA") ada di database. Jika belum ada, skrip akan membuatnya.
- **Akun Bank**:
  - `bank-bca` (BCA) sebagai bank utama dengan saldo awal yang disesuaikan/ditambah jika diperlukan.
  - `bank-advance-sourcing` (Kas Sourcing Hilman) untuk belanja pasar.
- **Produk**: Memilih 2-3 produk acak dari database untuk digunakan sebagai item PO.

### 2. Alur Transaksi (Step-by-Step)
- **Fase 1: Pembuatan PO (Sales Order)**
  - Membuat 2 Sales Order dengan status `Pending Approval` untuk klien "PT TES PAK REZA".
  - Menggunakan nomor PO unik dengan prefix `PO-E2E-REZA-`.
- **Fase 2: Persetujuan & Pembuatan Purchase**
  - Mengubah status SO menjadi `Belanja`.
  - Membuat baris `purchases` dan `purchase_items` yang terhubung dengan produk di SO.
- **Fase 3: Pencairan Budget Sourcing**
  - Menghitung estimasi biaya belanja offline ditambah operasional spare (misal Rp50.000).
  - Melakukan transfer dana dari `bank-bca` ke `bank-advance-sourcing`.
  - Memposting jurnal Uang Muka (D Uang Muka Sourcing `1-1500` / C Bank BCA `1-1200`).
- **Fase 4: Settlement Belanja Offline**
  - Mencatat belanja aktual offline (misal 95% dari estimasi) dan operasional BBM/parkir.
  - Memposting jurnal HPP & Operasional (D HPP `5-1000`, D Beban Transportasi `6-1400` / C Uang Muka Sourcing `1-1500`).
  - Mengembalikan sisa uang muka ke `bank-bca` (D Bank BCA `1-1200` / C Uang Muka Sourcing `1-1500`).
- **Fase 5: QC & Penerimaan Barang**
  - Mengatur `qty_final` pada item SO. Mensimulasikan reject QC pada salah satu barang (mencatat `pending_returns`).
- **Fase 6: Pengiriman & Invoice Draft**
  - Membuat data `deliveries` dan `invoices` (Draft) dengan total nilai berdasarkan `qty_final`.
  - Mengubah status SO menjadi `Awaiting Audit`.
- **Fase 7: Audit Finance & Posting Jurnal AR**
  - Mengubah status SO & Delivery menjadi `Terkirim`.
  - Memposting jurnal piutang (D Piutang Usaha `1-2000` / C Pendapatan Penjualan `4-1000`).
- **Fase 8: Tukar Faktur (Konsolidasi)**
  - Menggabungkan 2 invoice tersebut ke dalam satu invoice konsolidasi (`is_consolidated = true`).
- **Fase 9: Penerimaan Pembayaran**
  - Mencatat pembayaran lunas untuk invoice konsolidasi ke `bank-bca` (D Bank BCA `1-1200` / C Piutang Usaha `1-2000`).
  - Memperbarui status invoice menjadi `Paid`.

### 3. Verifikasi & Audit Akhir
- Memeriksa apakah seluruh jurnal yang diposting oleh simulasi ini seimbang (Total Debit = Total Kredit).
- Memverifikasi persamaan dasar akuntansi tetap terjaga.
- Menampilkan status akhir saldo bank dan piutang khusus dari simulasi ini.

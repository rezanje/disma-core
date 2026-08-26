-- Dua kolom yang dipakai aplikasi tapi belum pernah ada di database.
--
-- 1. users.is_active
--    Kurir dan tim lapangan terdaftar sebagai nama yang bisa dipilih, bukan akun yang
--    bisa login. Penandanya `isActive: false`. Selama kolomnya tidak ada, setiap
--    penyimpanan data pengguna gagal dengan "Could not find the 'is_active' column"
--    dan diam-diam tidak tersimpan.
--
-- 2. Jam kejadian (occurred_at / qc_occurred_at)
--    Jam kerjanya tidak ketemu: sourcing 23:00-09:00, kurir dari 06:00, admin baru
--    masuk jam 10. Empat tahap — terima barang, QC, barang keluar, serah terima —
--    terjadi saat tidak ada orang kantor di tempat, lalu diketik siang harinya. Tanpa
--    kolom ini yang tersimpan adalah jam MENGETIK, dan tidak ada cara membedakan
--    barang yang datang jam 2 pagi dari yang datang jam 8 pagi.
--
--    Laporan hariannya sendiri sudah tidak bergantung pada ini — sejak Tutup Hari
--    memakai tanggal kirim (lihat src/lib/hari-operasi.ts), belanja malam dan kiriman
--    siangnya sudah jatuh di hari yang sama. Kolom ini untuk jejak audit: menjawab
--    "sebenarnya jam berapa" saat angkanya dipertanyakan berbulan-bulan kemudian.
--
-- Aman dijalankan berulang kali.

-- Pengguna: aktif kecuali dinyatakan sebaliknya, supaya baris lama tidak ikut terkunci.
alter table users add column if not exists is_active boolean not null default true;

-- Belanja: kapan tim sourcing benar-benar berada di pasar.
alter table purchases add column if not exists occurred_at text;

-- QC: kapan barangnya benar-benar diperiksa di gudang.
alter table purchase_items add column if not exists qc_occurred_at text;

-- Pengiriman: kapan barangnya benar-benar diserahkan ke kurir.
alter table deliveries add column if not exists occurred_at text;

# Hasil perbaikan dan verifikasi DISMA

Perubahan berada di checkout kode `/workspace/disma-core`. Tidak ada migrasi, transaksi uji, perubahan akses database online, push atau deploy ke production yang dilakukan selama perbaikan ini.

## Hasil pemeriksaan akhir

- Regresi offline: **68/68 berkas lulus**.
- Database baru terpisah: **46 migrasi, 17 fixture SQL, dan 4 pengujian bersamaan lulus** (67 kelompok pemeriksaan).
- Fixture mencakup alur kantor sampai lunas, retur pecahan sampai credit note/refund, TF yang habis dikoreksi, serta hari transaksi dalam WIB.
- **TypeScript, whitespace, dan build production lulus**. Build memakai kredensial dummy; pemeriksaan TypeScript aktif.

## Perubahan utama

| Area | Hasil |
|---|---|
| Pekerjaan kantor | Lima kelompok kerja Admin PO, tujuh Finance dan lima Super Admin; desktop, HP dan pencarian mengikuti akses yang sama. Tab menu gabungan mempertahankan konteks pekerjaan. |
| Akses | Sesi server yang dapat dicabut; hanya tiga peran kantor dapat login. PIN tidak dikirim sebagai direktori pengguna dan tidak disimpan dalam cache/riwayat browser. Nama petugas tetap dapat dipilih tanpa login. |
| Pesanan dan belanja | Reservasi, revisi pesanan, rencana, hasil belanja beserta biaya, order vendor/online dan verifikasi menggunakan transaksi server. Pesanan yang cukup dari stok dapat langsung masuk packing. |
| Barang | Penerimaan, QC parsial, alokasi, packing, keluar, serah terima, hasil kirim, retur dan opname mempunyai sumber serta identitas kejadian. |
| Dokumen | Qty, harga, biaya, identitas klien dan nilai pembulatan dibekukan per ronde. Invoice sebelum audit berstatus Draft. Bukti TF diterima divalidasi dan tidak dapat ditimpa sesudah diterima/lunas. |
| Uang | Cicilan dan pembayaran banyak invoice; pembayaran vendor, uang muka, refund/potong utang klaim, biaya, transfer dan talangan dicatat bersama kas, bank, alokasi dan jurnal. Admin PO tidak mendapat hak pengeluaran uang melalui QC. |
| Koreksi | Credit note, refund setelah lunas dan pembalikan pembayaran dari sumber. Baris sumber serta jurnal lama dipertahankan. |
| Pengawasan | Rekap per PO, laba dari GL, rekonsiliasi bank yang tersimpan dan larangan memakai ulang baris jurnal. |
| Pemeliharaan | Pemuatan data hanya membaca; kegagalan simpan dikembalikan ke pengguna. Cadangan lengkap dengan manifest dan restore satu transaksi. Reset production ditolak. |

## Bukti penerimaan

| Skenario | Bukti yang dijalankan |
|---|---|
| PO sampai lunas | `tests/e2e/office-lifecycle.sql`: kompilasi → rencana → kertas belanja → QC → packing → serah terima → hasil kirim → audit invoice → TF → Rp60.000 + Rp90.000. Belanja Rp100.000, pendapatan Rp150.000, laba kotor Rp50.000; kas bersih bertambah Rp50.000, stok/AR/GRIR tersisa nol. |
| Vendor tempo dan uang muka | `tests/finance/vendor-events.sql`, `tests/operations/goods-events.sql`: DP dialokasikan satu kali ke utang penerimaan; Transfer membayar sisanya, bukan seluruh nominal lagi. QC oleh Admin PO meninggalkan utang untuk Finance. |
| Qty pecahan dan harga total | Pemeriksaan purchasing untuk 0,25 kg dengan total Rp10.000 menjadi Rp40.000/kg; fixture barang menguji pembulatan nilai uang serta pembagian sen lintas PO/retur tanpa menggandakan nilai. |
| QC kurang/rusak dan parsial | Fixture barang menguji 6+4, keputusan nol, batas alokasi, retur, penggantian vendor dan kegagalan setiap tahap. |
| Pengiriman parsial/susulan | Qty packing membatasi barang keluar; snapshot invoice ronde pertama tetap sama setelah susulan dan perubahan master. |
| Penolakan dan retur terlambat | Retur biasa/terlambat, pengganti/pembatalan, QC kembali, klaim vendor, refund/potong utang dan credit note berasal dari sumber yang sama. |
| Cicilan/pembayaran gabungan | `client-receipts.sql`: cicilan, alokasi banyak invoice, konflik, kegagalan per tahap; pengujian bersamaan memakai rekening berbeda agar benar-benar menguji kunci invoice/utang. |
| Salah input/koreksi | `manual-commands.sql`, `reversals.sql`: credit note invoice dibayar sebagian/lunas, refund bertahap, pembalikan kas+jurnal+alokasi, batas nilai dan penolakan pembalikan ganda. |
| Simpan dua kali/putus koneksi | ID identik memeriksa hasil yang sudah dicatat; payload berbeda ditolak. Respons tidak lengkap atau lebih lama tidak boleh menimpa hasil lokal yang lebih baru. |
| Bukti dan peran | Fixture auth, TF evidence dan generic edit guards; API tanpa sesi/Origin valid ditolak, Finance dapat mengelola vendor, status akun nonaktif tetap nonaktif, perubahan langsung fakta final ditolak. |
| Biaya kertas | Form kantor memilih pelaksana dan penerima talangan terpisah, waktu kejadian, sumber, bukti asli; satu pending source tersimpan atomik, tanpa pecah saldo otomatis. |
| Cadangan/restore | Fixture maintenance menguji tabel hilang, manifest tidak lengkap, kegagalan insert setelah pengosongan, rollback penuh dan pencabutan sesi. Daftar mencakup 58 tabel bisnis. |

## Cakupan dan batas verifikasi

`npm test` menjalankan berkas regresi di proses terpisah dengan kredensial dummy dan koneksi jaringan aplikasi diblokir. Uji database membangun seluruh rantai migrasi di database baru dalam container khusus tanpa jaringan/port, menjalankan fixture rollback serta koneksi bersamaan, kemudian menghapus database uji tersebut. Build memakai konfigurasi dummy dan pemeriksaan TypeScript aktif; opsi lama yang mengabaikan error TypeScript dihapus.

Review independen memeriksa akses, transaksi, batas peran dan konsistensi alur. Temuan materialnya ditindaklanjuti dengan regresi, termasuk bypass pengeluaran uang dari QC, reservasi stok, perubahan parent pesanan saat kompilasi, bukti TF dan sumber biaya.

Belum ada pengujian interaksi browser atau UAT pada situs online. Dokumen historis tanpa rincian sumber tetap diberi keterangan. TF ringkasan lama dan transaksi lama yang belum dapat dipetakan ke sumber memerlukan rekonsiliasi dokumen; tidak dikonversi atau dihapus secara otomatis.

Urutan konfigurasi, pemeriksaan target dan penerapan migrasi ada di [audit-repair-rollout.md](audit-repair-rollout.md).

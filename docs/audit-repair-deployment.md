# Penerapan production DISMA — 16 Oktober 2026

Pengguna mengizinkan penyelesaian push dan deploy agar aplikasi dapat dicoba secara live. Versi aplikasi tersedia di **https://disma-core.vercel.app**. Gunakan alamat ini karena validasi Origin sesi mengikuti domain canonical tersebut. Refresh penuh dan login ulang menggunakan PIN kantor yang sudah ada; rollout tidak mengganti PIN.

## Versi dan urutan penerapan

- Perubahan aplikasi: `e1063300efa88d95e6906011bc496be0a574ee5e`.
- PR [#71](https://github.com/rezanje/disma-core/pull/71) digabungkan ke `main`: `f954f82c8ac10b688f3901cb69870d26807dcfc1`.
- Deployment production aplikasi: `dpl_2KsXor6ftQQU6g4RpMbKFru1Fhcj`, status `READY`, alias canonical telah aktif.
- Sembilan migrasi `20261016000001`–`20261016000009` diterapkan berurutan dalam satu transaksi dan tercatat dalam riwayat migrasi target.
- Konfigurasi production/preview menunjuk project Supabase yang telah diverifikasi; konfigurasi sesi server tersedia. Nilai rahasia tidak dicatat di repositori.

Sebelum penerapan, cadangan skema dan data 48 tabel public disimpan ke bucket privat `checkpoints` dengan nama objek baru. SHA-256 cadangan sebelum penerapan: `8a17d41ad519b0b682d09eae9f7c4c7db7eda8dfe37db34114a0da07a8d208b4`. Setelah migrasi, cadangan bisnis baru dengan manifest lengkap 58 tabel juga disimpan privat sebagai objek terpisah. Cadangan/checkpoint lama tidak ditimpa.

## Bukti pemeriksaan

Sebelum migrasi live, semua sembilan migrasi serta 17 fixture SQL lulus pada salinan skema live dalam database fixture terpisah tanpa jaringan. Regresi offline dijalankan ulang sebelum push: 68/68 berkas lulus. Bukti pemeriksaan implementasi lain ada di [audit-repair-verification.md](audit-repair-verification.md).

Seluruh **53 pemeriksaan HTTP/API live lulus**. Pemeriksaan pada domain canonical memverifikasi login, cookie HttpOnly/SameSite=Strict/Secure, pembacaan sesi, seluruh kelompok data termasuk harga klien, logout dan pencabutan sesi untuk Admin PO, Finance dan Super Admin. Akses tanpa sesi serta Origin asing ditolak. Pembatasan akses history, rekonsiliasi, vendor, koreksi dan pengeluaran uang mengikuti peran. Payload uang tidak valid ditolak sebelum pemanggilan RPC transaksi.

Data sebelum dan sesudah penerapan dibandingkan berdasarkan ID dan seluruh nilai kolom lama di 19 tabel transaksi/kas/bank. Tidak ditemukan perubahan. Jumlah utama tetap: 2 pesanan, 1 pembelian, 0 invoice, 0 utang vendor, 0 pengiriman, 9 jurnal, 18 baris jurnal, dan 10 transaksi kas. Saldo 7 kas/bank serta baris stok juga tetap sama. Hak eksekusi RPC keuangan/sesi/cadangan yang diperiksa tersedia untuk service role dan ditolak bagi anon/authenticated.

Tidak ada transaksi keuangan percobaan dibuat di production. Verifikasi live memakai login dan pembacaan data yang sudah ada, disertai penolakan permintaan yang tidak berhak/tidak valid. Baris sesi dan pembatas login teknis dapat bertambah; seluruh sesi pemeriksaan dicabut lewat logout.

## Batas verifikasi

Pemeriksaan live di atas melalui HTTP/API. Interaksi formulir browser, pencetakan dokumen, dan UAT alur transaksi penuh pada situs live belum dijalankan. Skenario transaksi lengkap diverifikasi melalui fixture terpisah, tanpa memasukkan transaksi percobaan ke pembukuan live. Pengguna dapat melanjutkan percobaan antarmuka dengan akun kantor yang sesuai.

Dokumen historis tanpa snapshot, TF ringkasan lama, dan transaksi lama yang belum mempunyai pemetaan sumber tetap mengikuti batas rekonsiliasi pada [audit-repair-rollout.md](audit-repair-rollout.md).

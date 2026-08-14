# Simulasi Peran

Instruksi untuk agen AI yang menguji aplikasi DISMA CORE, satu berkas per peran.
Dipakai untuk menemukan kesalahan dan bagian yang bolong sebelum aplikasi
dipakai dengan data sungguhan.

| Peran | Berkas | Yang dijaga |
|---|---|---|
| Admin PO | [admin-po.md](admin-po.md) | pesanan, rencana belanja, rute, tagihan |
| Finance | [finance.md](finance.md) | seluruh uang masuk dan keluar |
| Sourcing | [sourcing.md](sourcing.md) | uang tunai belanja di lapangan |
| Gudang | [gudang.md](gudang.md) | stok dan mutu barang |
| Kurir | [kurir.md](kurir.md) | serah terima ke klien |

## Sebelum menjalankan

**PIN sengaja tidak ditulis di berkas mana pun.** Repositori ini publik;
menuliskannya berarti menerbitkan kunci masuk aplikasi yang sedang berjalan.
Berikan PIN langsung ke agennya saat menjalankan simulasi.

**Data yang boleh dan tidak boleh disentuh.** Hanya `clients`, `products`, dan
`vendors` yang berisi data asli. Seluruh data transaksi — pesanan, pembelian,
tagihan, jurnal — adalah data percobaan dan bebas dibuat sebanyak-banyaknya.
Setiap berkas sudah memuat larangan menghapus ketiga data asli itu, dan larangan
menekan tombol merah "Bersihkan Data Transaksi".

## Cara membaca hasilnya

Tiap berkas meminta laporan dengan tingkat keparahan yang sudah ditakar:

- **Berat** — uang atau stok salah, data hilang, atau pekerjaan tidak bisa
  diselesaikan sama sekali.
- **Sedang** — bisa diselesaikan tapi dengan akal-akalan, atau jejaknya kabur.
- **Ringan** — mengganggu tapi tidak berbahaya.

Tiap berkas juga meminta agen menuliskan **apa yang tidak sempat diuji dan
kenapa**. Bagian itu sama pentingnya dengan daftar temuan — bagian yang tidak
teruji bukan berarti bagian yang aman.

## Urutan yang disarankan

Jalankan **Admin PO** lebih dulu. Peran itu yang menciptakan pesanan dan
dokumen belanja yang dibutuhkan peran lain untuk punya pekerjaan. Setelah itu
Sourcing dan Gudang, lalu Kurir, dan Finance terakhir — Finance memeriksa
akibat dari semua yang dikerjakan peran lain, jadi paling berguna dijalankan
saat sudah ada jejaknya.

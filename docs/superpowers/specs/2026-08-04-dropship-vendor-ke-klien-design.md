# Kiriman vendor langsung ke klien (drop-ship)

Tanggal: 2026-08-04
Status: disetujui untuk direncanakan

## Masalah

Sebagian barang tidak perlu mampir gudang: vendor mengantarnya langsung ke
klien. Sistem sekarang tidak punya jalur itu. Semua barang wajib melewati
sourcing (belanja) → inbound → QC → packing → kurir, dan titik QC adalah tempat
stok bertambah, utang/pembayaran ke vendor terbentuk, dan harga pokok dikunci.
Barang yang tidak pernah masuk gudang berarti tidak pernah melewati titik itu,
jadi hari ini tidak ada cara mencatatnya tanpa memalsukan langkah gudang.

## Keputusan bisnis yang sudah diambil

1. **Siapa yang memastikan barang sampai** — klien. Klien mengirim foto atau
   tanda terima, admin memasukkan jumlah yang benar-benar diterima.
2. **Cakupan** — per baris barang, bukan per order. Satu order klien boleh
   campur: sebagian diantar vendor, sisanya tetap dikirim dari gudang.
3. **Kalau kurang atau ditolak** — selisihnya masuk daftar belanja susulan yang
   sudah ada. Klien ditagih hanya yang diterima, vendor dibayar hanya yang
   diterima.
4. **Surat jalan** — dibuat oleh sistem kita, atas nama Disma, untuk dibawa
   vendor ke klien. Bukan surat jalan milik vendor.

## Rancangan

### 1. Memilih drop-ship

Shopping List sudah punya pilihan tempat ambil barang per baris: Pasar, Online,
Vendor. Tambahkan status keempat pada baris yang sama: **Vendor → Langsung ke
Klien**.

Batasan: hanya untuk baris yang terikat ke sebuah sales order. Baris stok manual
dan susulan tidak punya tujuan pengiriman, jadi pilihan ini tidak tersedia di
sana.

Pilihan ini ikut tersimpan di draft rencana belanja (tabel `shopping_draft`,
sudah ada), sehingga terlihat oleh Finance di halaman Purchase Request sebelum
dokumen belanja dibuat — sama seperti penunjukan vendor biasa.

### 2. Saat dokumen belanja dibuat

Baris drop-ship ikut tercatat sebagai item pembelian seperti baris Vendor biasa
(vendor, harga, qty, metode bayar), tetapi ditandai sebagai drop-ship.

Yang dilewati:
- tidak masuk daftar belanja sourcing;
- tidak masuk antrean inbound maupun QC gudang;
- tidak masuk antrean packing/outbound;
- tidak menambah maupun mengurangi stok gudang kapan pun.

Sisa baris pada order yang sama berjalan normal lewat gudang.

### 3. Surat jalan

Setelah dokumen belanja dibuat, tiap pasangan **vendor + klien** menghasilkan
satu surat jalan atas nama Disma yang hanya memuat baris drop-ship untuk
pasangan itu. Admin PO mengunduh atau mengirimkannya ke vendor, vendor
membawanya ke klien.

Catatan implementasi: `generateSuratJalan()` di `src/lib/pdf.ts` menggambar
seluruh isi sales order, jadi butuh cara membatasi daftar barangnya. Parameter
`adjustments` yang sudah ada di tanda tangan fungsi itu tidak pernah diteruskan
ke fungsi penggambar — perbaiki atau ganti dengan filter baris yang eksplisit
saat mengerjakan bagian ini.

### 4. Daftar pantauan dan konfirmasi

Layar baru berisi kiriman vendor yang belum tuntas: vendor, klien, barang,
jumlah, tanggal target, status. Untuk tiap kiriman admin mengisi jumlah yang
benar-benar diterima klien, dengan lampiran foto atau tanda terima.

Begitu dikonfirmasi, untuk baris tersebut:
- tagihan ke klien terbit sebesar barang yang diterima;
- kewajiban ke vendor tercatat sesuai metode bayarnya (tunai, transfer, atau
  tempo), sebesar barang yang diterima;
- harga pokok penjualan dicatat langsung, tanpa pernah melewati persediaan;
- tidak ada pergerakan stok sama sekali.

Titik ini menggantikan peran QC gudang untuk barang drop-ship.

Fakturnya terpisah dari faktur bagian gudang pada order yang sama, mengikuti cara
kerja backorder sekarang: satu putaran pengiriman, satu faktur. Menggabungkan
keduanya adalah pekerjaan Tukar Faktur, yang sudah menangani penggabungan.

### 5. Kekurangan

Selisih antara jumlah yang dipesan dan yang diterima klien masuk ke daftar
belanja susulan yang sudah ada, seperti barang tolakan dari QC. Order klien
tetap mencatat sisa yang belum terkirim, memakai mekanisme backorder yang sudah
berjalan.

## Yang tidak dikerjakan

- Notifikasi otomatis ke klien.
- Pelacakan posisi kendaraan vendor.
- Perhitungan ongkos kirim vendor terpisah — dianggap sudah termasuk harga
  barang, sama seperti pembelian vendor biasa.
- Penilaian ketepatan vendor drop-ship. Datanya terekam, laporannya menyusul
  kalau memang dibutuhkan.

## Yang perlu diperhatikan saat mengerjakan

- Pembukuan drop-ship harus memakai jalur yang sudah ada, bukan jalur baru.
  `finalizeSalesOrderDelivery()` di `src/lib/accounting.ts` sudah menerbitkan
  faktur, mencatat pendapatan dan harga pokok untuk satu putaran pengiriman; ia
  juga mengurangi stok, yang justru tidak boleh terjadi di sini. Pisahkan bagian
  stoknya alih-alih menulis ulang seluruh alurnya.
- Pembayaran ke vendor sekarang dipicu dari QC (`recordVendorTransferPurchase`
  untuk transfer, tagihan vendor untuk tempo). Konfirmasi drop-ship harus
  memicu yang sama, sekali saja, dan tahan terhadap penekanan tombol berulang.
- Satu order bisa punya dua pengiriman dalam satu putaran: satu dari vendor,
  satu dari gudang. Tabel `deliveries` menyimpan satu baris per pengiriman dan
  sudah menangani putaran ganda pada backorder; pastikan pengiriman vendor tidak
  menghalangi pengiriman gudang untuk order yang sama, dan sebaliknya.
- Order dianggap selesai hanya kalau kedua sisi sudah terkirim.

# Simulasi Peran: CEO / Super Admin

Instruksi untuk agen AI yang menguji aplikasi DISMA CORE sebagai CEO atau Super
Admin. Tujuannya menemukan **kesalahan dan bagian yang bolong**, bukan sekadar
membuktikan aplikasinya jalan.

> ## ⚠ BACA INI DULU
>
> Peran ini satu-satunya yang bisa menekan tombol penghancur data. Di halaman
> **Settings → Maintenance** ada tombol yang **menghapus seluruh isi database**,
> termasuk 205 klien, 2.098 produk, dan seluruh data vendor — dan itu **data
> asli yang tidak bisa diketik ulang**.
>
> **Yang HARAM ditekan:**
> - "Bersihkan Data Transaksi" (tombol merah melayang di pojok kanan bawah)
> - Reset seluruh database / wipe master
> - Hapus produk, hapus klien, hapus vendor secara massal
>
> **Yang boleh, tapi hanya dengan urutan di S3.** Jangan menyimpang dari urutan
> itu. Kalau ragu apakah sebuah tombol merusak, **jangan tekan** — catat saja
> namanya dan lanjut.

---

## 1. Siapa kamu

Kamu **Damar (CEO)** atau **Reza (Super Admin)**. Kamu melihat seluruh
perusahaan: pesanan, belanja, gudang, pengiriman, dan seluruh keuangan. Kamu
juga pemegang keputusan terakhir untuk pengeluaran dari rekening strategis, dan
satu-satunya yang bisa mengatur siapa boleh melihat apa.

**Alamat aplikasi:** `http://localhost:3000` (atau URL yang diberikan)
**PIN masuk:** `<MINTA KE PEMILIK — sengaja tidak ditulis di sini karena repo ini publik>`

Ada dua akun. **Super Admin melihat lebih banyak daripada CEO** — kalau sebuah
menu tidak ada di satu akun, coba akun satunya sebelum melaporkannya sebagai
bolong.

### Yang khusus milikmu

| Kemampuan | Di mana |
|---|---|
| Menyetujui pengeluaran dari rekening strategis | Purchase Requests, status "Approval CFO" |
| Mengatur izin tiap peran | User Management → Izin & Otoritas |
| Menyimpan dan mengembalikan cadangan database | Settings → Maintenance |
| Melihat jejak perubahan dan membatalkannya | Activity Log |
| Laporan keuangan lengkap | Financial Reports, Analisa Kerugian |

---

## 2. Aturan main

1. Patuhi kotak peringatan di atas.
2. **Sebelum menguji apa pun di Maintenance, simpan checkpoint lebih dulu.**
   Itu jaring pengamanmu.
3. Catat angka sebelum dan sesudah setiap tindakan yang menyentuh uang.
4. Kalau sesuatu tidak sesuai "Yang harus terjadi", catat lalu lanjut.

---

## 3. Skenario

### C1 — Menyetujui pengeluaran rekening strategis

**Langkah**
1. Masuk sebagai **Finance**, buka **Purchase Requests**, dan cairkan sebuah
   pengajuan dari rekening yang ditandai butuh persetujuan CFO.
2. Keluar, masuk lagi sebagai **CEO**.
3. Buka Purchase Requests, cari pengajuan berstatus **Approval CFO**.
4. Setujui satu, tolak satu lagi.

**Yang harus terjadi**
- Saat Finance mencairkan dari rekening strategis, **uangnya belum keluar** —
  pengajuannya berubah jadi menunggu CFO.
- Setelah kamu setujui, Finance bisa melanjutkan pencairan.
- Yang kamu tolak **tidak** menggerakkan uang sama sekali.
- Alasan persetujuan atau penolakan tersimpan dan bisa dibaca lagi.

**Periksa**
- Apakah Finance bisa mencairkan tanpa menunggu kamu? Kalau bisa, gerbangnya
  bocor.
- Coba setujui pengajuan yang sama dua kali.

---

### C2 — Seberapa jauh gerbang CFO menutup

Ini pemeriksaan paling penting di berkas ini. Tanda "butuh persetujuan CFO"
dipasang pada rekening, tapi belum tentu semua jalur keluar uang menghormatinya.

**Langkah**
Ambil satu rekening yang ditandai butuh persetujuan CFO, catat saldonya, lalu
coba keluarkan uang dari rekening itu lewat **empat jalur berbeda**:

1. Pencairan Purchase Request
2. Menu **Pencairan Dana**
3. **Membayar tagihan vendor** di AP Aging
4. **Transfer antar rekening** di Cash & Bank

**Yang harus terjadi**
- Keempatnya berhenti dan meminta persetujuan CFO lebih dulu.

**Periksa**
- **Dugaan kuat: hanya dua jalur pertama yang menghormati tanda itu.** Kalau
  membayar vendor atau transfer antar rekening bisa mengosongkan rekening
  strategis tanpa persetujuan siapa pun, tanda itu praktis tidak ada gunanya —
  siapa pun yang bisa membuat tagihan vendor bisa memindahkan uangnya lewat
  sana. Uji keempatnya dan laporkan **persis jalur mana yang lolos**.

---

### C3 — Cadangan dan pengembalian data

Urutannya penting. **Jangan menyimpang.**

**Langkah**
1. Buka **Settings → Maintenance**.
2. Tekan **Simpan Checkpoint**. Tunggu sampai selesai dan catat jumlah barisnya.
3. Catat: jumlah klien, jumlah produk, jumlah vendor, jumlah pesanan.
4. Buat satu perubahan kecil yang mudah dikenali — misalnya tambah satu klien
   bernama `SIM-UJI-CADANGAN`.
5. Tekan **Kembali ke Checkpoint**, ketik konfirmasinya.
6. Periksa apakah klien `SIM-UJI-CADANGAN` hilang dan semua angka di langkah 3
   kembali seperti semula.
7. Tekan **Batalkan restore terakhir**, dan periksa apakah kliennya muncul lagi.

**Yang harus terjadi**
- Checkpoint tersimpan dan tanggalnya terlihat di layar.
- Pengembalian mengembalikan **semua** angka, bukan sebagian.
- Pembatalan restore mengembalikan keadaan sebelum restore.

**Periksa**
- **Bandingkan jumlah baris sebelum dan sesudah.** Kalau ada tabel yang jumlahnya
  tidak kembali persis, itu temuan berat: pengembalian data yang tidak lengkap
  lebih berbahaya daripada tidak ada pengembalian sama sekali, karena orang
  mengira datanya sudah aman.
- Ada juga slot **"Cadangan sebelum penghapusan terakhir"**. Slot itu diisi
  otomatis tepat sebelum penghapusan data transaksi. Kalau ada, periksa
  tanggalnya masuk akal. **Jangan memicu penghapusan hanya untuk mengujinya.**

---

### C4 — Mengatur izin peran

Ini cara pemilik memperbaiki sendiri kalau ada peran yang tidak bisa membuka
menu yang dia butuhkan.

**Langkah**
1. Buka **User Management → Izin & Otoritas**.
2. Cabut satu izin dari peran Gudang, misalnya QC. Simpan.
3. Masuk sebagai Gudang, periksa menunya.
4. Kembalikan izinnya, periksa lagi.

**Yang harus terjadi**
- Menu benar-benar hilang dan muncul kembali mengikuti izin.
- Mencabut izin juga **menutup halamannya**, bukan sekadar menyembunyikan menu.

**Periksa**
- Setelah izin dicabut, coba buka alamat halamannya langsung. Masih bisa dibuka?
  Kalau bisa, izinnya hanya kosmetik.
- Apakah kamu bisa mencabut izinmu sendiri sampai terkunci di luar? Kalau bisa,
  laporkan — tidak ada jalan kembali selain lewat database.

---

### C5 — Jejak perubahan dan pembatalan

**Langkah**
1. Ubah sesuatu yang mudah dikenali, misalnya nama PIC sebuah klien.
2. Buka **Activity Log**, cari perubahan itu.
3. Batalkan perubahan itu lewat dialog rollback.

**Yang harus terjadi**
- Jejaknya mencatat siapa, kapan, dan **kolom apa saja** yang berubah.
- Pembatalan mengembalikan nilai lamanya.
- Pembatalan itu sendiri ikut tercatat sebagai kejadian baru.

**Periksa**
- Apakah daftar kolom yang berubah masuk akal? Kalau satu perubahan kecil
  dilaporkan mengubah belasan kolom, jejaknya tidak bisa dipercaya.
- Apakah ada tindakan penting yang **tidak** meninggalkan jejak sama sekali?
  Terutama yang menyentuh uang.

---

### C6 — Laporan keuangan

**Langkah**
1. Buka **Financial Reports**, lihat Laba Rugi dan Neraca.
2. Buka **Buku Besar** dan **Invoices**.

**Yang harus terjadi**
- Neraca seimbang: Aset = Kewajiban + Modal.
- Pendapatan di Laba Rugi cocok dengan jumlah seluruh tagihan yang terbit.
- Setiap jurnal seimbang antara debit dan kredit.

**Periksa**
- Kalau ada barang yang **HPP-nya ditebak** (Finance melihat peringatan kuning
  saat mengesahkan pengiriman), seberapa besar pengaruhnya ke laba? Angka laba
  yang salah tidak kelihatan salah di layar mana pun.
- Buka **Analisa Kerugian & Stok**. Apakah angkanya cocok dengan barang tolakan
  yang tercatat di gudang?

---

### C7 — Melihat pekerjaan semua orang

Hanya peran ini yang bisa melihat seluruh rantai dari ujung ke ujung.

**Langkah**
Ambil satu pesanan klien, telusuri dari awal sampai akhir: pesanan → rencana
belanja → belanja sourcing → terima gudang → rute → antar → tagihan → tukar
faktur.

**Yang harus terjadi**
- Angkanya konsisten di setiap tahap. Jumlah yang dipesan, dibeli, diterima
  gudang, dikirim, dan ditagih harus bisa dijelaskan hubungannya — kalau
  berbeda, harus ada catatan yang menjelaskan kenapa.

**Periksa — ini paling berharga**
- Cari tahap mana yang **kehilangan angka**. Contoh: dipesan 10, dibeli 10,
  diterima gudang 8, dikirim 8, tapi ditagih 10. Selisih seperti itu adalah
  temuan paling berat yang bisa kamu temukan, dan hanya kelihatan kalau
  ditelusuri utuh seperti ini.

---

## 4. Hal yang sudah diketahui — periksa dampaknya

1. **Tanda "butuh persetujuan CFO" kemungkinan hanya dihormati dua dari empat
   jalur keluar uang** (lihat C2).
2. **HPP bisa ditebak** kalau barang tidak punya catatan pembelian. Finance
   melihat peringatannya; kamu melihat akibatnya di laporan laba.
3. **Alamat dan telepon klien kosong** hampir di semua klien.
4. **Pengembalian data belum pernah dicoba sungguhan.** C3 adalah percobaan
   pertamanya — kerjakan dengan urutan yang tertulis.

---

## 5. Cara melaporkan temuan

Satu temuan satu blok. Untuk apa pun yang menyentuh uang atau data, **sertakan
angkanya**.

```
### [Berat / Sedang / Ringan] Judul singkat

**Di mana:** menu / layar / tombol
**Akun:** CEO atau Super Admin
**Langkahnya:** 1... 2... 3...
**Angka sebelum:** ...
**Angka sesudah:** ...
**Yang terjadi:** apa yang benar-benar muncul
**Yang seharusnya:** menurut dokumen ini, atau menurut akal sehat
**Dampak:** apa ruginya kalau ini dipakai sungguhan
```

Ukuran tingkat keparahan:

- **Berat** — uang keluar tanpa persetujuan, data hilang atau kembali tidak
  lengkap, izin tidak benar-benar menutup akses, atau angka hilang di tengah
  rantai.
- **Sedang** — jejaknya kabur, atau butuh akal-akalan.
- **Ringan** — mengganggu tapi tidak berbahaya.

Di akhir, tuliskan **apa yang tidak sempat kamu uji dan kenapa** — termasuk
tombol yang sengaja tidak kamu tekan karena berbahaya. Itu bukan kegagalan,
itu keputusan yang benar.

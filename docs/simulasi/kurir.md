# Simulasi Peran: Kurir

Instruksi untuk agen AI yang menguji aplikasi DISMA CORE sebagai Kurir.
Tujuannya menemukan **kesalahan dan bagian yang bolong**, bukan sekadar
membuktikan aplikasinya jalan.

Peran ini satu-satunya yang bertemu klien. Angka yang kamu isi saat serah terima
adalah angka yang ditagihkan — kalau salah, klien menerima tagihan yang tidak
sesuai barangnya.

**Peran ini dipakai dari HP.** Uji dengan ukuran layar ponsel, bukan layar
komputer. Tombol yang tidak bisa dipencet sambil menenteng belanjaan adalah
temuan yang sah.

---

## 1. Siapa kamu

Kamu **Rivai, Logistik**. Kamu mengambil barang dari gudang, mengantar ke klien,
minta tanda tangan, dan melaporkan apa yang benar-benar diterima. Kamu **tidak**
membeli, tidak menerima barang datang, dan tidak menagih.

**Alamat aplikasi:** `http://localhost:3000` (atau URL yang diberikan)
**PIN masuk:** `<MINTA KE PEMILIK — sengaja tidak ditulis di sini karena repo ini publik>`

### Menu yang terbuka untukmu

| Menu | Isinya |
|---|---|
| Dashboard Kurir | ringkasan |
| Pengiriman | daftar antaran hari ini |
| Serah Terima | ambil barang dari gudang |
| Riwayat | antaran yang sudah selesai |
| Biaya Operasional | bensin, parkir, tol |
| Tasks | tugas |

---

## 2. Aturan main

1. **JANGAN menekan tombol merah "Bersihkan Data Transaksi"**.
2. **Jangan menghapus klien, produk, atau vendor.**
3. Uji dengan lebar layar ponsel.
4. Kalau sesuatu tidak sesuai bagian "Yang harus terjadi", catat lalu lanjut.

---

## 3. Skenario

### K1 — Ambil barang dari gudang

**Langkah**
1. Buka **Serah Terima**. Lihat PO yang siap diambil.
2. Centang barangnya satu per satu, lalu selesaikan serah terima.

**Yang harus terjadi**
- Serah terima diterima, dan antaran itu pindah ke daftar **Pengiriman**-mu.
- Kalau PO itu **direncanakan untuk kurir lain**, muncul peringatan yang
  menyebut namanya — tapi kamu tetap boleh mengambilnya.

**Periksa**
- Coba selesaikan serah terima untuk PO yang belum dirilis gudang. Harus ditolak
  dengan pesan yang jelas menunjuk ke gudang, bukan diam-diam gagal.

---

### K2 — Daftar antaran

**Langkah**
1. Buka **Pengiriman**.

**Yang harus terjadi**
- Kamu **hanya melihat antaran yang ditugaskan untukmu**, dalam urutan yang
  disusun Admin PO.
- Antaran yang belum direncanakan siapa pun tetap terlihat oleh semua kurir —
  ini disengaja, supaya tidak ada antaran yang tidak terlihat siapa pun.

**Periksa**
- Kalau Admin PO menugaskan sebuah antaran ke kurir lain, apakah antaran itu
  benar-benar hilang dari daftarmu?
- Apakah urutannya sama dengan yang disusun Admin PO?

---

### K3 — Navigasi dan menyimpan lokasi klien

**Langkah**
1. Buka salah satu antaran.
2. Kalau lokasinya sudah tersimpan, tekan **Buka di Maps**.
3. Tekan **Simpan Titik Ini**, izinkan akses lokasi.
4. Ulangi di antaran lain, tapi **tolak** izin lokasinya.

**Yang harus terjadi**
- **Buka di Maps** membuka aplikasi peta di HP tepat di titik kliennya.
- **Simpan Titik Ini** menyimpan posisimu sekarang sebagai lokasi klien itu.
  Setelah tersimpan, tombol Buka di Maps muncul.
- Kalau izin ditolak, muncul pesan yang **menyebutkan sebabnya** dan cara
  mengaktifkannya — bukan diam saja seolah tombolnya rusak.
- Kalau klien punya catatan patokan, patokannya terlihat di layarmu.

**Periksa**
- Sebagian besar klien belum punya lokasi. Apakah tampilannya jelas menyatakan
  "belum tersimpan", atau malah terlihat seperti rusak?
- Kalau kamu menyimpan titik untuk klien yang sudah punya patokan dari Admin PO,
  apakah patokannya ikut terhapus? Seharusnya **tidak**.

---

### K4 — Mengantar dan serah terima ke klien

**Langkah**
1. Mulai perjalanan pada satu antaran.
2. Buka **Berita Acara**, ubah jumlah salah satu barang menjadi **lebih kecil**
   dari yang dibawa (klien menolak sebagian).
3. Minta tanda tangan kurir dan klien.
4. Buka juga **Surat Jalan**.
5. Selesaikan antarannya.

**Yang harus terjadi**
- **Berita Acara dan Surat Jalan menampilkan angka yang sama** — yaitu jumlah
  yang benar-benar diterima klien, bukan jumlah pesanan. Kalau keduanya berbeda,
  itu temuan berat: klien menandatangani dua dokumen yang saling bertentangan.
- Tanda tangan tersimpan dan ikut tercetak.
- Setelah selesai, antaran pindah ke **Riwayat**.
- Barang yang ditolak klien tercatat sebagai retur, tidak hilang begitu saja.

**Periksa**
- Isi jumlah diterima `0` untuk satu barang. Diterima sebagai jawaban sah?
- Isi jumlah **lebih besar** dari yang dibawa. Ditolak?
- Selesaikan antaran **tanpa** tanda tangan klien. Bisa? Kalau bisa, tidak ada
  bukti barang diterima, padahal tagihan tetap terbit.

---

### K5 — Biaya operasional

**Langkah**
1. Buka **Biaya Operasional**, tambahkan bensin dan parkir.

**Yang harus terjadi**
- Biayanya tercatat atas namamu dan bisa dilihat Finance.

**Periksa**
- Coba nominal `0` atau negatif.
- Apakah biaya ini tercampur ke harga barang? Seharusnya tidak.

---

### K6 — Antaran yang gagal

**Langkah**
1. Ambil satu antaran, lalu coba selesaikan dengan seluruh barang ditolak klien
   (jumlah diterima `0` untuk semua).

**Yang harus terjadi**
- Ada jalan untuk melaporkannya. Barangnya kembali sebagai retur.
- Tidak ada tagihan penuh yang terbit untuk barang yang tidak diterima.

**Periksa**
- Kalau tidak ada cara melaporkan antaran gagal sama sekali, itu **bolong** —
  catat. Di lapangan hal ini pasti terjadi: klien tutup, alamat salah, barang
  rusak di jalan.

---

## 4. Hal yang sudah diketahui — periksa dampaknya

1. **Lokasi klien masih kosong hampir semuanya.** Menyimpan titik lewat
   **Simpan Titik Ini** adalah cara utama mengisinya. Nilai seberapa enak
   dipakai sambil bekerja.
2. **Alamat tertulis klien kosong** di hampir semua klien. Periksa apa yang
   tercetak di surat jalan — apakah masih pantas diberikan ke klien?
3. **Antaran tanpa rencana terlihat semua kurir** — disengaja.

---

## 5. Cara melaporkan temuan

Satu temuan satu blok.

```
### [Berat / Sedang / Ringan] Judul singkat

**Di mana:** menu / layar / tombol
**Ukuran layar:** ponsel / komputer
**Langkahnya:** 1... 2... 3...
**Yang terjadi:** apa yang benar-benar muncul
**Yang seharusnya:** menurut dokumen ini, atau menurut akal sehat
**Dampak:** apa ruginya kalau ini dipakai sungguhan
```

Ukuran tingkat keparahan:

- **Berat** — angka di dokumen salah atau saling bertentangan, barang hilang
  tanpa jejak, atau antaran tidak bisa diselesaikan sama sekali.
- **Sedang** — bisa diselesaikan tapi dengan akal-akalan.
- **Ringan** — mengganggu tapi tidak berbahaya. Termasuk tombol yang terlalu
  kecil atau teks terpotong di layar HP.

Di akhir, tuliskan **apa yang tidak sempat kamu uji dan kenapa**.

# Simulasi Peran: Gudang

Instruksi untuk agen AI yang menguji aplikasi DISMA CORE sebagai Gudang.
Tujuannya menemukan **kesalahan dan bagian yang bolong**, bukan sekadar
membuktikan aplikasinya jalan.

Peran ini yang memutuskan barang mana masuk stok dan mana ditolak. Salah di
sini berarti stok di layar tidak sama dengan barang di rak, dan itu merembet ke
harga pokok, laporan laba, dan janji ke klien.

---

## 1. Siapa kamu

Kamu **Sandi, Inventory**. Kamu yang menerima barang datang, memeriksa mutunya,
memutuskan yang lolos dan yang ditolak, lalu menyiapkan barang keluar untuk
dikirim. Kamu **tidak** membeli, tidak mengantar, dan tidak menagih.

**Alamat aplikasi:** `http://localhost:3000` (atau URL yang diberikan)
**PIN masuk:** `<MINTA KE PEMILIK — sengaja tidak ditulis di sini karena repo ini publik>`

### Menu yang terbuka untukmu

| Menu | Isinya |
|---|---|
| Dashboard Gudang | ringkasan |
| Katalog Barang | daftar stok |
| Inbound | barang datang |
| QC | pemeriksaan mutu dan keputusan |
| Outbound | menyiapkan barang keluar |
| Reject Monitor | pantauan barang tolakan |
| Stock Opname | mencocokkan stok layar dengan stok rak |
| Tasks | tugas |

### Yang perlu kamu paham sebelum mulai

- Barang bisa datang dari tiga jalur: **belanja pasar** (setelah sourcing kirim
  laporan), **vendor** (vendor mengantar ke gudang), dan **online** (setelah
  Finance mengonfirmasi pesanannya).
- Barang berlabel **kiriman vendor langsung ke klien tidak akan pernah sampai
  padamu** — memang tidak lewat gudang. Kalau ada yang muncul di antreanmu,
  itu temuan.

---

## 2. Aturan main

1. **JANGAN menekan tombol merah "Bersihkan Data Transaksi"** di pojok kanan bawah.
2. **Jangan menghapus klien, produk, atau vendor.**
3. **Catat stok barang sebelum dan sesudah** setiap keputusan QC.
4. Kalau sesuatu tidak sesuai bagian "Yang harus terjadi", catat lalu lanjut.

---

## 3. Skenario

### G1 — Terima barang, semua lolos

**Langkah**
1. Buka **Inbound**, lihat barang yang menunggu.
2. Buka **QC**, catat stok barang itu sekarang.
3. Loloskan seluruh jumlahnya ke stok gudang.

**Yang harus terjadi**
- Stok bertambah persis sebanyak yang diloloskan.
- Barang itu hilang dari antrean QC.
- Kalau semua barang untuk sebuah PO sudah selesai, PO itu maju ke tahap packing.

**Periksa**
- Apakah stok bertambah **dua kali** kalau kamu memproses ulang barang yang sama?
- Apakah jumlah yang datang cocok dengan yang dilaporkan sourcing? Kalau berbeda,
  apakah ada tempat untuk menjelaskan selisihnya?

---

### G2 — Sebagian ditolak

**Langkah**
1. Pilih satu barang dengan jumlah datang misal 10.
2. Loloskan 7, tolak 3. Isi alasannya.
3. Coba ketiga tujuan penolakan satu per satu di barang berbeda:
   **Retur ke Supplier**, **Buang**, dan **Alihkan ke B2C**.

**Yang harus terjadi**
- Stok utama bertambah 7, bukan 10.
- **Retur ke Supplier** → muncul catatan retur vendor yang bisa ditagih ke vendornya.
- **Buang** → tercatat sebagai kerugian, bukan hilang begitu saja.
- **Alihkan ke B2C** → pindah ke stok B2C, bukan lenyap dari stok utama tanpa tujuan.
- Ketiganya muncul di **Reject Monitor**.

**Periksa**
- Jumlahkan: lolos + tolak harus sama dengan jumlah datang. Kalau sistem
  mengizinkan totalnya tidak cocok, apakah ada peringatan?
- Barang tolakan yang seharusnya dibeli ulang — apakah muncul di daftar susulan
  Admin PO? Kalau tidak, klien akan kekurangan barang tanpa ada yang tahu.
- Coba tolak semua (lolos 0). Apakah jalur ini tertangani?

---

### G3 — Barang vendor dengan pembayaran tempo

**Langkah**
1. Cari barang dari vendor yang metode bayarnya **Tempo**, proses QC-nya.

**Yang harus terjadi**
- Selain stok bertambah, muncul **utang ke vendor** yang bisa dilihat Finance di
  AP Aging.

**Periksa**
- Kalau barang vendor itu **tidak punya vendor** yang tercatat, apa yang terjadi?
  Utangnya tercatat ke siapa? Kalau diam saja, ada utang yang tidak akan pernah
  dibayar.

---

### G4 — Menyiapkan barang keluar

**Langkah**
1. Buka **Outbound**, catat stok barangnya.
2. Rilis satu PO yang statusnya siap.

**Yang harus terjadi**
- Stok berkurang sebanyak yang dikirim.
- Muncul misi pengiriman untuk kurir.
- Kalau Admin PO sudah merencanakan rutenya, misi itu **langsung membawa nama
  kurir yang direncanakan**, bukan kosong.

**Periksa**
- Rilis PO yang sama dua kali. Apakah stok berkurang dua kali?
- Rilis PO yang stoknya tidak cukup. Ditolak, atau stok jadi minus?

---

### G5 — Stok opname

**Langkah**
1. Cari menu untuk menghitung ulang stok fisik.

**Yang harus terjadi**
- Ada cara untuk mencocokkan stok di layar dengan stok di rak.

**Periksa**
- Menu **Stock Opname** dulu tidak diberikan ke peran Gudang sama sekali;
  izinnya baru ditambahkan. Pastikan sekarang benar-benar muncul dan bisa
  dibuka.
- Setelah menyesuaikan stok, apakah selisihnya tercatat sebagai penyesuaian yang
  bisa ditelusuri, atau angkanya berubah begitu saja tanpa jejak?

---

## 4. Hal yang sudah diketahui — periksa dampaknya

1. **Menu Stock Opname baru saja ditambahkan** ke peran Gudang — sebelumnya
   tidak ada peran mana pun yang bisa membukanya. Pastikan sudah muncul.
2. **Barang kiriman vendor langsung ke klien tidak lewat gudang** — disengaja.
   Pastikan tidak ada yang nyasar ke antreanmu, dan stok tidak ikut bergerak
   untuk barang itu.
3. **Barang yang diambil dari stok gudang untuk sebuah PO** hanya "dipesan",
   stoknya belum berkurang sampai benar-benar dikeluarkan. Periksa apakah barang
   yang sudah dipesan untuk satu PO masih bisa dijanjikan lagi ke PO lain.

---

## 5. Cara melaporkan temuan

Satu temuan satu blok. Untuk apa pun yang menyentuh stok, **sertakan angkanya**.

```
### [Berat / Sedang / Ringan] Judul singkat

**Di mana:** menu / layar / tombol
**Langkahnya:** 1... 2... 3...
**Stok sebelum:** ...
**Stok sesudah:** ...
**Yang terjadi:** apa yang benar-benar muncul
**Yang seharusnya:** menurut dokumen ini, atau menurut akal sehat
**Dampak:** apa ruginya kalau ini dipakai sungguhan
```

Ukuran tingkat keparahan:

- **Berat** — stok salah, barang hilang tanpa jejak, utang vendor tidak
  tercatat, atau pekerjaan tidak bisa diselesaikan sama sekali.
- **Sedang** — bisa diselesaikan tapi dengan akal-akalan, atau jejaknya kabur.
- **Ringan** — mengganggu tapi tidak berbahaya.

Di akhir, tuliskan **apa yang tidak sempat kamu uji dan kenapa**.

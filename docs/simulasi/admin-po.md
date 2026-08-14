# Simulasi Peran: Admin PO

Instruksi untuk agen AI yang menguji aplikasi DISMA CORE sebagai Admin PO.
Tujuannya menemukan **kesalahan dan bagian yang bolong**, bukan sekadar
membuktikan aplikasinya jalan.

---

## 1. Siapa kamu

Kamu **Bagus, Admin PO**. Kamu jembatan antara klien dan seluruh tim: kamu yang
menerima pesanan, merencanakan belanjanya, membagi rute pengiriman, dan menagih.
Kamu **tidak** belanja sendiri, tidak menerima barang di gudang, dan tidak
mencatat pembayaran masuk.

**Alamat aplikasi:** `http://localhost:3000` (atau URL yang diberikan)
**PIN masuk:** `<MINTA KE PEMILIK — sengaja tidak ditulis di sini karena repo ini publik>`

### Menu yang terbuka untukmu

| Menu | Isinya |
|---|---|
| Dashboard Admin | ringkasan |
| Sales orders (PO) | membuat pesanan klien |
| Shopping List | merencanakan belanja |
| Kiriman Vendor | kiriman vendor langsung ke klien |
| Rencana Rute | membagi pengiriman ke kurir |
| Client Management | data klien |
| Price Lists | harga per klien |
| Produk/SKU Master | data barang |
| Katalog Barang | stok gudang (lihat saja) |
| Tukar Faktur | menggabungkan invoice jadi tagihan |
| Invoices | memantau tagihan |
| Tasks | tugas |

Menu **Purchase Request tidak ada** untukmu, dan itu memang disengaja. Kalau
kamu menemukan alur yang memaksa Admin PO membuka Purchase Request, **itu
temuan** — catat.

---

## 2. Aturan main

1. **JANGAN menekan tombol merah "Bersihkan Data Transaksi"** di pojok kanan
   bawah. Tombol itu menghapus seluruh data transaksi. Kalau tanpa sengaja
   tertekan, hentikan simulasi dan laporkan.
2. **Jangan menghapus klien, produk, atau vendor.** Ketiganya data asli.
   Data transaksi (PO, invoice, jurnal) adalah data percobaan dan aman dibuat
   sebanyak-banyaknya.
3. Beri nama yang jelas pada data yang kamu buat, misal awali dengan `SIM-`,
   supaya mudah dibedakan.
4. Setiap kali sesuatu **tidak sesuai** bagian "Yang harus terjadi", jangan
   berhenti — catat, lalu lanjut ke skenario berikutnya. Satu kesalahan sering
   menyembunyikan yang lain di belakangnya.
5. Kalau sebuah langkah mustahil dilakukan karena tombolnya tidak ada, itu juga
   temuan. Catat sebagai **bolong**, bukan sebagai kegagalanmu.

---

## 3. Skenario

### S1 — Membuat pesanan klien

**Langkah**
1. Buka **Sales orders (PO)**, buat PO baru.
2. Pilih satu klien, isi tanggal target kirim **hari ini**.
3. Tambahkan 3 barang berbeda dengan jumlah masing-masing.
4. Simpan.

**Yang harus terjadi**
- Harga tiap barang terisi otomatis sesuai daftar harga klien tersebut.
- Subtotal dan total ikut terhitung.
- PO muncul di daftar dengan status awal.

**Periksa**
- Coba isi jumlah pecahan, misal `0,5`. Harus diterima — banyak barang dijual
  per kilo.
- Apakah harga yang muncul cocok dengan yang tertera di menu **Price Lists**
  untuk klien itu? Kalau beda, catat keduanya.

---

### S2 — Merencanakan belanja

**Langkah**
1. Buka **Shopping List**. PO dari S1 harus sudah muncul sendiri.
2. Untuk tiap baris barang, tentukan tempat belanja. Sebar sengaja:
   - baris 1 → **Pasar**
   - baris 2 → **Vendor**, pilih vendornya
   - baris 3 → **Ke Klien**, pilih vendornya
3. Atur metode bayar tiap baris.
4. Tekan **Generate Dokumen**.

**Yang harus terjadi**
- Jumlah yang muncul sudah dikurangi stok gudang yang ada — bukan jumlah pesanan mentah.
- Baris **Ke Klien** hanya bisa dipilih untuk barang yang menempel pada PO.
- Baris **Ke Klien** **menolak metode bayar Tunai**; hanya Transfer atau Tempo.
- Kalau baris **Ke Klien** belum dipilih vendornya, Generate **ditolak** dengan
  pesan yang jelas.
- Setelah Generate, dokumen belanja terbentuk.

**Periksa**
- Coba tekan **Ke Klien** pada baris barang stok manual (yang tidak menempel PO).
  Harus ditolak.
- Setelah Generate, apakah pilihan tempat belanja tadi hilang dari layar
  (tidak menempel ke putaran belanja berikutnya)?

---

### S3 — Kiriman vendor langsung ke klien

**Langkah**
1. Buka **Kiriman Vendor**. Baris yang tadi ditandai **Ke Klien** harus muncul.
2. Unduh **Surat Jalan**.
3. Tekan **Konfirmasi Diterima**. Isi jumlah diterima **lebih kecil** dari yang
   dipesan (misal dipesan 10, diterima 8). Unggah gambar apa saja sebagai bukti.
4. Simpan.

**Yang harus terjadi**
- Surat jalan **hanya memuat barang vendor itu**, bukan seluruh isi PO.
- Konfirmasi **ditolak kalau bukti belum diunggah**.
- Setelah dikonfirmasi:
  - tagihan klien terbit **sebesar 8**, bukan 10;
  - kekurangan 2 masuk daftar **belanja susulan** di Shopping List;
  - **tidak ada perubahan stok gudang sama sekali** — periksa di Katalog Barang;
  - baris Pasar dari S2 **masih** menunggu di antrean Sourcing;
  - status PO **belum** Selesai, karena sisi gudang belum terkirim.
- Tekan **Konfirmasi** sekali lagi → **tidak boleh** terbit tagihan kedua.

**Periksa**
- Coba isi jumlah diterima lebih besar dari yang dipesan. Harus ditolak.
- Coba isi jumlah diterima `0`. Harus diterima sebagai jawaban sah
  (klien menolak seluruhnya), bukan dianggap kosong.

---

### S4 — Merencanakan rute

**Langkah**
1. Buka **Rencana Rute**, pilih tanggal kirim yang sama dengan S1.
2. PO hari itu harus muncul. Karena lokasi klien kemungkinan besar masih kosong,
   sebagian besar akan berada di daftar **Belum Ada Lokasi**.
3. Tugaskan PO ke seorang kurir lewat daftar itu.
4. Pasang titik lokasi satu klien: tekan **Pasang Titik**, cari namanya, pilih
   hasilnya atau klik peta, isi patokan, simpan.
5. Klien tadi harus pindah ke peta. Klik pinnya, tugaskan ke kurir lain.
6. Geser urutan perhentian di kolom kurir.
7. Tekan **Simpan Rencana**, lalu muat ulang halaman.

**Yang harus terjadi**
- Klien tanpa lokasi **tetap bisa ditugaskan**, hanya tidak muncul di peta.
- Warna pin berubah mengikuti kurir yang ditugaskan.
- Jumlah titik di kepala kolom kurir cocok dengan isinya.
- Setelah muat ulang, pembagian **dan** urutannya tetap sama.
- Pencarian nama mengembalikan lokasi yang masuk akal di Indonesia.

**Periksa**
- Kalau tidak ada satu pun pengguna berperan kurir, apakah ada pesan yang jelas?
- Apakah tombol Simpan mati saat belum ada perubahan?
- Apa yang terjadi kalau tanggal dipilih ke hari yang tidak ada pengirimannya?

---

### S5 — Menagih lewat Tukar Faktur

**Prasyarat:** minimal satu invoice sudah terbit. Invoice terbit sendiri setelah
kurir menyelesaikan pengiriman, atau dari S3.

**Langkah**
1. Buka **Tukar Faktur**, tekan **Generate TF**.
2. Pilih klien yang punya invoice belum masuk TF.
3. Perhatikan pengelompokan periodenya.
4. Pilih **Simpan Draft** dulu. Buka detailnya.
5. Terbitkan (**Issue**).
6. Isi nama PIC klien, tandai **Diterima**.

**Yang harus terjadi**
- Invoice dikelompokkan per minggu Senin–Minggu. Minggu yang menyeberang bulan
  **dipecah dua**, tidak dicampur.
- Setelah **Issue**, jatuh tempo invoice dihitung ulang dari **tanggal terbit TF
  + tempo klien** — bukan dari tanggal invoice atau tanggal kirim. Ini yang
  paling penting diperiksa: buka menu **Invoices**, pastikan tanggal jatuh
  temponya berubah.
- Setelah **Diterima**, TF terkunci dan tidak bisa diubah lagi.
- Alur statusnya: Draft → Issued → Received → Paid.

**Periksa**
- Invoice yang PO-nya masih **Menunggu Audit** **tidak boleh** ikut terpilih.
- Invoice yang **sudah lebih tua dari 14 hari** tidak muncul di daftar pilihan.
  Kalau ada yang seperti itu, ia harus tampil di **kotak merah peringatan** di
  halaman Tukar Faktur. Kalau tidak muncul di kedua-duanya, itu temuan berat —
  artinya ada tagihan yang hilang tanpa jejak.
- Satu invoice tidak boleh masuk ke dua TF sekaligus.

---

### S6 — Merapikan data klien

**Langkah**
1. Buka **Client Management**, buat klien baru bernama `SIM-KLIEN-UJI`.
2. Buka klien itu, tekan **Hapus Klien**.
3. Sekarang buka klien lama yang sudah punya PO/tagihan. Perhatikan tombol
   Hapus Klien-nya.

**Yang harus terjadi**
- Klien baru yang belum punya transaksi **bisa** dihapus.
- Klien yang sudah punya PO, tagihan, atau tukar faktur → tombolnya **mati**,
  dan alasannya muncul saat kursor diarahkan ke sana (misal "sudah punya 3 PO").
- Konfirmasi hapus memakai kotak dialog aplikasi, bukan popup browser.

---

## 4. Hal yang sudah diketahui — periksa dampaknya

Ini bukan bug baru; ini kondisi yang sudah diketahui. Tugasmu menilai **seberapa
mengganggu** dalam praktik.

1. **Alamat dan telepon klien kosong** untuk hampir seluruh klien. Periksa apa
   yang tercetak di surat jalan dan invoice — apakah kolom alamatnya kosong
   melompong? Apakah masih layak diberikan ke klien?
2. **Purchase Request tidak ada di menu Admin PO** (disengaja). Pastikan alur
   Shopping List tetap bisa jalan tanpa itu.
3. **Lokasi klien masih kosong semua.** Pastikan Rencana Rute tetap berguna
   dalam kondisi ini.

---

## 5. Cara melaporkan temuan

Satu temuan satu blok. Jangan digabung.

```
### [Berat / Sedang / Ringan] Judul singkat

**Di mana:** menu / layar / tombol
**Langkahnya:** 1... 2... 3...
**Yang terjadi:** apa yang benar-benar muncul
**Yang seharusnya:** menurut dokumen ini, atau menurut akal sehat bisnis
**Dampak:** apa ruginya kalau ini dipakai sungguhan
```

Ukuran tingkat keparahan:

- **Berat** — uang salah, data hilang, atau pekerjaan tidak bisa diselesaikan
  sama sekali. Contoh: tagihan terbit dua kali, stok berubah padahal tidak
  seharusnya, tagihan tidak bisa dibuat.
- **Sedang** — bisa diselesaikan tapi dengan akal-akalan, atau memberi informasi
  yang menyesatkan.
- **Ringan** — mengganggu tapi tidak berbahaya. Salah tulis, tombol
  membingungkan, urutan aneh.

Di akhir, tuliskan juga **apa yang tidak sempat kamu uji dan kenapa**. Bagian
yang tidak teruji sama pentingnya dengan bagian yang gagal.

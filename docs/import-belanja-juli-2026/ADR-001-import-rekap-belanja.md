# ADR-001 — Import rekap belanja Juli 2026

**Status:** menunggu persetujuan pencocokan nama barang
**Tanggal:** 2026-07-28
**Sumber:** `historical belanja juli sampai 27.xlsx`, sheet `REKAP BELANJA`, 978 baris, 1–27 Juli 2026

## Konteks

Sistem belum punya satu pun catatan pembelian: tabel `purchases`, `purchase_items`,
`vendor_prices` kosong, dan seluruh tabel keuangan (`journal_entries`, `invoices`,
`expenses`, `vendor_bills`, `cash_transactions`) juga kosong. Master produk (2.064 SKU)
dan vendor (26) sudah ada, dan produk sudah punya slot `basePrice`, `priceHistory`,
`weeklyPriceRange`, serta `defaultVendorId` yang belum terisi.

Akibatnya: HPP tidak punya dasar historis, shopping list tidak bisa menyarankan vendor,
dan hutang ke supplier tidak tercatat di mana pun.

## Keputusan

### 1. Status pembayaran dibaca dari kombinasi tiga kolom

| Supplier | Payment | Tgl Bayar | Arti | Baris | Nilai |
|---|---|---|---|---|---|
| kosong | kosong | kosong | Cash di pasar oleh sourcing, vendor tidak tetap — **lunas** | 395 | Rp37.570.950 |
| ada | *…CASH* | kosong | Dibayar cash di lokasi — **lunas** | 250 | Rp46.103.500 |
| ada | TRANSFER | ada | **Lunas** | 253 | Rp256.098.285 |
| ada | TRANSFER | kosong | **HUTANG** | 77 | Rp36.098.250 |

Total belanja Juli: **Rp375.929.985** atas 976 baris. Sheet punya satu baris rekap di
bagian bawah (qty 10.788, nilai Rp375.929.985) yang tidak boleh ikut diimpor — baris itu
tidak punya nama barang maupun tanggal, dan importer membuangnya.

Dua baris tidak masuk pola dan ditangani manual:
- `TOKO MAMEN / BAGJA CASH / "RETUR 3 KG"` — Ketumbar Halus, Rp128.000. Kolom tanggal
  bayar dipakai untuk catatan retur, bukan tanggal.
- `BAKING LAND / PAK EREN CASH / 46223` — Skippy Peanut Butter, Rp59.000.

Keduanya diperlakukan **lunas**; yang retur ditandai di catatan pembelian.

### 2. HPP = harga tertinggi dalam satu minggu

Harga pasar fluktuatif, jadi HPP diambil dari **harga satuan tertinggi** dalam periode
mingguan, bukan rata-rata. Dasar penetapan harga jual.

- SKU yang dibeli pada 20–27 Juli: HPP dari minggu itu.
- 120 SKU yang tidak dibeli pada minggu terakhir: HPP dari **minggu terakhir SKU itu
  dibeli**. Konsekuensi: sebagian SKU membawa harga berumur 1–3 minggu.
- Seluruh riwayat mingguan tetap disimpan di `priceHistory`, jadi keputusan ini bisa
  dihitung ulang tanpa impor ulang.

### 3. Harga jual dihitung ulang dari HPP baru

Tier 1–5 dihitung ulang memakai ladder yang berlaku per kategori (`src/lib/tier-margins.ts`):
sayuran & buah +50/30/20/10/15, barang packaged +30/25/20/10/15. Harga di price list
client ikut berubah untuk SKU yang HPP-nya diperbarui.

Harga client bertier `Custom` (harga yang disepakati per client) **tidak** diubah.

### 4. Jurnal dibukukan apa adanya, termasuk kas negatif

Semua 978 baris dijurnal: Dr Persediaan Barang Dagang (1-3000), Cr Bank Jago (Belanja).
Hutang (77 baris) di-Cr ke Hutang Usaha, bukan ke bank.

Karena penjualan dan setoran Juli belum ada di buku, saldo Bank Jago (Belanja) akan
minus sekitar Rp340 juta setelah impor (Rp375,9jt belanja dikurangi Rp36,1jt yang masih
jadi hutang). Ini diterima sebagai kondisi sementara sampai
sisi pendapatan Juli ikut dimasukkan. Neraca dan laba rugi tidak bisa dipakai sampai
saat itu.

### 5. Stok bertambah sebesar qty yang dibeli

Seluruh qty masuk sebagai penambahan stok. Karena barang Juli sebagian besar sudah
terkirim ke client tanpa tercatat, stok hasil impor akan lebih tinggi dari fisik dan
perlu diluruskan lewat stock opname.

### 6. Vendor per SKU

Item yang punya supplier dipetakan ke `vendor_prices` (harga per vendor per periode)
dan `defaultVendorId` di master produk. Bila satu SKU dibeli dari beberapa vendor,
default diambil dari vendor **paling sering** dipakai; bila seri, yang terakhir membeli.

397 baris cash pasar tidak punya supplier, jadi SKU yang hanya muncul di baris tersebut
tidak mendapat saran vendor.

8 nama supplier belum ada di master dan akan dibuat: AA DADI, BAKING LAND, HIJRAHFOOD,
MW KENTANG, PAK IFAN, SBM, TOKO MAMEN, dan `ALFATIH FORZEN` yang merupakan salah ketik
dari `ALFATIH FROZEN` yang sudah ada (dipetakan, tidak dibuat baru).

### 7. Nama barang dicocokkan otomatis lalu disetujui manusia

Dari 306 nama di file: 162 cocok persis (setelah penyeragaman ejaan CABAI/CABE, tanda
baca, spasi), 61 kemiripan tinggi, 73 perlu diperiksa, 10 tidak punya padanan.

Impor tidak dijalankan sebelum daftar pencocokan disetujui.

## Risiko yang diterima

1. **Kas minus ~Rp340 juta** sampai penjualan Juli masuk (keputusan 4).
2. **Stok lebih tinggi dari fisik** sampai opname (keputusan 5).
3. **Harga jual berubah serentak** untuk SKU yang HPP-nya naik (keputusan 3).
4. **Salah pasang SKU** jika daftar pencocokan diloloskan tanpa dibaca (keputusan 7) —
   contoh nyata dari hasil otomatis: `BAWANG MERAH` → `Kacang Merah`, `LOBAK` → `Salak`,
   `GARAM BATA` → `Rambutan`.

## Sebelum eksekusi

Backup database via `/api/db/backup` dan simpan hasilnya, karena impor menyentuh
master produk, price list client, stok, dan jurnal sekaligus.

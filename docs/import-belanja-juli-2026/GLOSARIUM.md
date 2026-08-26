# Glosarium — istilah impor belanja & harga

Istilah yang muncul di file Excel, di kode, dan di percakapan sering beda kata untuk hal
yang sama. Kolom "dipakai di kode" adalah bentuk kanonik.

| Istilah | Arti | Dipakai di kode | Catatan |
|---|---|---|---|
| **HPP** | Harga pokok pembelian satu SKU — dasar hitung harga jual | `product.basePrice` | Di file Excel muncul sebagai `HARGA SATUAN`. Bukan HPP akuntansi (COGS akun 5-1000) |
| **Harga satuan** | Harga per unit di satu baris belanja | `purchaseItem.actualUnitPrice` | `HARGA TOTAL ÷ QUANTITY` |
| **Riwayat harga** | Daftar {tanggal, harga, sumber} per SKU | `product.priceHistory` | Sumber impor ini diisi `"import-juli-2026"` |
| **Rentang harga mingguan** | Harga terendah & tertinggi satu SKU dalam sepekan | `product.weeklyPriceRange` | Yang tertinggi jadi HPP |
| **Tier 1–5** | Lima level harga jual ke client | `clientPrice.tier` | Tier 1 B2C, 2 General, 3 Cash, 4 Bottom, 5 Special Request. **Tier 4 lebih murah dari Tier 5** |
| **Ladder** | Deret persentase margin per kategori | `MARGIN_LADDERS` di `src/lib/tier-margins.ts` | Sayur/buah +50/30/20/10/15; packaged +30/25/20/10/15 |
| **Supplier / Vendor** | Pihak tempat kita membeli | `Vendor.companyName` | File Excel pakai "SUPPLIER", kode pakai "vendor". Satu hal yang sama |
| **Vendor langganan** | Vendor default untuk satu SKU di shopping list | `product.defaultVendorId` | Yang dipakai buat nyaranin vendor saat bikin belanja |
| **Harga vendor** | Penawaran harga satu vendor untuk satu SKU pada periode tertentu | `VendorPrice` | Punya `validFrom`/`validTo`, jadi bisa banyak per SKU |
| **Cash pasar** | Belanja langsung oleh sourcing di pasar, vendor tidak tetap | supplier & payment kosong | 397 baris. Selalu lunas |
| **Cash di lokasi** | Dibayar tunai di tempat vendor | payment memuat `CASH` | 249 baris. Selalu lunas |
| **Tempo** | Beli sekarang bayar nanti | `Vendor.isTempo`, `paymentTermDays` | Sumber hutang |
| **Hutang (ke vendor)** | Kewajiban yang belum dibayar | akun `2-…` Hutang Usaha | Bukan "piutang" — piutang adalah tagihan **ke client** |
| **Piutang** | Tagihan ke client yang belum dibayar | akun `1-2000` | Arah berlawanan dari hutang. Jangan tertukar |
| **Lunas** | Sudah dibayar penuh | tanggal bayar terisi **atau** dibayar cash | Cash tidak selalu punya tanggal bayar di file |
| **Advance / Kas Sourcing** | Uang yang dipegang sourcing untuk belanja | rekening `KAS SOURCING (Bagja)` | Untuk impor ini semua belanja dibebankan ke `Bank Jago (Belanja)` sesuai keputusan ADR-001 |
| **Opname** | Hitung ulang stok fisik lalu samakan dengan sistem | halaman `/warehouse/opname` | Dibutuhkan setelah impor karena stok akan lebih tinggi dari fisik |
| **Retur** | Barang dikembalikan ke vendor | `pendingReturns`, `vendorReturns` | Satu baris di file memakai kolom tanggal bayar untuk mencatat retur 3 Kg |

## Ambiguitas yang sengaja diputuskan

- **"HPP"** dipakai untuk dua hal berbeda: harga beli master produk (`basePrice`) dan
  akun akuntansi Harga Pokok Penjualan (5-1000). Di dokumen ini "HPP" selalu berarti yang
  pertama; yang kedua selalu disebut "akun HPP".
- **"Harga tertinggi mingguan"** — minggu dihitung ISO (Senin–Minggu). Minggu terakhir
  data adalah 20–26 Juli plus 27 Juli yang masuk minggu berikutnya; keduanya digabung
  sebagai "minggu terakhir" karena datanya berhenti di 27 Juli.
- **"Belum bayar"** tidak sama dengan "tanggal bayar kosong". Lihat tabel keputusan 1 di
  ADR-001.

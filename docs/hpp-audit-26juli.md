# Audit HPP — 48 produk dijual di bawah modal

Per 26 Juli 2026. Data mentah: [hpp-audit-26juli.csv](hpp-audit-26juli.csv).

**Tidak ada perubahan yang ditulis ke database.** Dokumen ini laporan untuk dicocokkan dengan nota beli.

## Ringkas

Dari 1.857 produk yang punya harga jual, **48 produk harga jual terendahnya di bawah `base_price` (HPP)**. Untuk 11 di antaranya, harga B2C pun sudah di bawah modal.

Penyebabnya bukan harga jualnya. `products.tier1..5_price` sudah persis sama dengan pricelist terbit 20–26 Juli (1.856 produk identik, 0 selisih). Yang tertinggal adalah **`base_price`** — pada 28 dari 48 produk, angkanya masih persis sama dengan harga beli di workbook 29 Juni.

Pola terkuat: sayuran dan cabe. Harga pasar turun 25–30% sejak akhir Juni, pricelist ikut turun, HPP tidak.

## Dua ladder margin

Pricelist memakai dua struktur margin, bukan satu:

| Ladder | B2C | GEN | CASH | BOTTOM | SPECIALREQ | Untuk |
|---|---:|---:|---:|---:|---:|---|
| Fresh | +50% | +30% | +20% | +10% | +15% | sayur, buah |
| Packaged | +30% | +25% | +20% | +10% | +15% | dry goods, minuman, frozen |

Contoh rasio harga terhadap BOTTOM:

- Cabe Merah Keriting `57.000 / 50.000 / 46.000 / 42.000 / 44.000` → 1,36 / 1,19 / 1,10 / 1,00 / 1,05 → **Fresh**
- Red Bull @250Ml `585.000 / 563.000 / 540.000 / 495.000 / 518.000` → 1,18 / 1,14 / 1,09 / 1,00 / 1,05 → **Packaged**

Ini penting karena `TIER_LABELS` dan `activeTierMargins` di `src/components/client-prices/ClientPriceList.tsx` hanya memuat ladder Packaged. Untuk produk fresh, persentase yang tampil di UI meleset — angka rupiahnya tetap benar karena dibaca dari kolom `tierN_price`.

## HPP tersirat

Karena `purchase_items` kosong dan `weekly_price_range` tidak ada yang fresh, satu-satunya cara memperkirakan HPP saat ini adalah membalik perhitungannya dari harga jual terbit: `HPP ≈ min(tierN / marginN)`. Harga terbit dibulatkan ke atas ke ribuan terdekat, jadi hasilnya batas atas yang paling ketat.

**34 produk** — kelima tier-nya sepakat pada satu HPP (selisih ≤3%), jadi angka tersiratnya bisa dipercaya:

| Produk | HPP tercatat | HPP tersirat | Ladder | Turun |
|---|---:|---:|---|---:|
| Daun Mint | 50.000 | 25.000 | Fresh | −50% |
| Lipton Yellow Label Tea @100Pcs | 111.000 | 70.769 | Packaged | −36% |
| Celery Stick (Import) | 45.000 | 30.000 | Fresh | −33% |
| Jinten Hitam | 90.000 | 60.000 | Packaged | −33% |
| Cabe Rawit Merah | 68.000 | 48.000 | Fresh | −29% |
| Cabe Merah Besar Petik | 75.000 | 53.043 | Fresh | −29% |
| Cabe Merah Besar | 70.000 | 50.000 | Fresh | −29% |
| Paprika Hijau | 70.000 | 50.000 | Fresh | −29% |
| Cabe Merah Keriting | 53.000 | 38.000 | Fresh | −28% |
| Daun Bawang | 25.000 | 18.000 | Fresh | −28% |
| Cabe Merah Keriting Petik | 55.000 | 40.000 | Fresh | −27% |
| Cabe Rawit Merah Petik | 75.000 | 55.000 | Fresh | −27% |
| Sayap Ayam | 40.000 | 30.000 | Packaged | −25% |
| Bawang Merah Kupas | 53.000 | 40.000 | Fresh | −25% |
| Paha Ayam Pentung @1Kg | 50.000 | 38.182 | Packaged | −24% |
| Cabe Hijau Keriting | 45.000 | 35.000 | Fresh | −22% |
| Nanas Sunpride Honi | 32.000 | 25.000 | Fresh | −22% |
| Mili Leci @565GR | 44.000 | 35.000 | Packaged | −20% |
| Detergen Rinso @1.4KG | 42.000 | 33.600 | Packaged | −20% |
| Cabe Rawit Hijau Petik | 70.000 | 58.000 | Fresh | −17% |
| Baby Romain Lettuce | 30.000 | 25.000 | Fresh | −17% |
| Knorr Chicken @1KG | 113.333 | 95.000 | Packaged | −16% |
| Lemon Lokal California | 35.000 | 30.000 | Fresh | −14% |
| Stella Spray Parfum @400Ml | 39.200 | 33.600 | Packaged | −14% |
| Kewpie Cheese Mayo @1KG | 72.300 | 62.308 | Packaged | −14% |
| Rosemary Fresh | 300.000 | 260.000 | Fresh | −13% |
| Head Lettuce | 36.000 | 31.304 | Fresh | −13% |
| Kacang Merah | 40.000 | 35.000 | Packaged | −12% |
| Bawang Bombay Merah | 40.000 | 35.000 | Fresh | −12% |
| Max Creamer@500Gr | 48.408 | 42.609 | Packaged | −12% |
| Plastik Kantong Putih Ukuran 50 @500GR | 48.000 | 42.308 | Packaged | −12% |
| Red Bull Energy Drink @250Ml Isi 24Can | 510.000 | 450.000 | Packaged | −12% |
| Cabe Merah Kering Besar | 90.000 | 80.000 | Packaged | −11% |
| Kayu Manis | 100.000 | 90.000 | Packaged | −10% |

## 14 produk yang perlu dicek manual

Harga tier-nya tidak mengikuti ladder mana pun, jadi HPP tersiratnya tidak bisa dipercaya. Kemungkinan harganya di-set manual, atau ada salah ketik di pricelist.

| Produk | HPP tercatat | Harga terendah | Perkiraan HPP | Simpangan |
|---|---:|---:|---:|---:|
| Pete | 6.000 | 5.000 | 4.545 | ±15% |
| Tapas Sponge | 8.700 | 7.000 | 6.087 | ±10% |
| Lobak (Daikon) | 10.000 | 9.000 | 8.000 | ±9% |
| Plastik Pex Bawang 20/25 | 22.300 | 14.000 | 12.000 | ±6% |
| Plastik Kantong Hitam Ukuran 35 @500GR | 23.000 | 13.000 | 11.200 | ±6% |
| Struk Thermal 80X80 | 14.088 | 14.000 | 12.727 | ±5% |
| Kyuri | 20.000 | 15.000 | 13.043 | ±5% |
| Ajinomoto @250GR | 24.000 | 15.000 | 13.043 | ±5% |
| Pakcoy | 20.000 | 11.000 | 10.000 | ±4% |
| Tomat Hijau | 12.000 | 11.000 | 10.000 | ±4% |
| Kembang Kol | 25.000 | 17.000 | 15.000 | ±4% |
| Jambu Biji Merah | 20.000 | 17.000 | 15.000 | ±4% |
| Bun Burger Bernardi Isi 6Pcs | 24.150 | 16.000 | 14.167 | ±4% |
| Susu Evaporasi Carnation 380ML | 22.633 | 20.000 | 17.500 | ±4% |

## Kenapa ini perlu diputuskan manusia

`base_price` bukan angka tampilan. Dia dipakai sebagai **fallback COGS** di `src/lib/accounting.ts` (baris 651 dan 728) ketika sebuah item tidak punya `purchase_items` yang cocok — dan tabel `purchase_items` saat ini **kosong**, sehingga setiap posting COGS jatuh ke `base_price`. Menurunkan HPP 34 produk akan menaikkan laba kotor pada jurnal-jurnal berikutnya. Jurnal yang sudah terposting tidak berubah.

Angka "HPP tersirat" di atas juga hasil pembalikan dari harga jual, bukan dari nota beli. Kalau yang salah justru pricelist-nya (bukan HPP-nya), mengikuti angka ini malah memperburuk.

## Yang perlu dilakukan

1. Cocokkan kolom `HPP Tersirat` di CSV dengan nota beli terakhir untuk 34 produk itu.
2. Untuk 14 produk sisanya, tentukan HPP dan harga jual yang benar dari sumber aslinya.
3. Setelah HPP betul, pertimbangkan mengisi `purchase_items` supaya COGS tidak lagi bergantung pada `base_price`.

## Catatan lain

- 207 produk sama sekali belum punya harga tier.
- 189 item di PDF 20–26 Juli berharga `0` di kelima tier (Kikkoman, Fiesta, frozen, dll) — tidak dijual minggu itu, bukan gagal baca.
- Anomali di file sumber: `Diana Maraschino Cerries Large @4,25kg` — CASH 478.000 lebih murah dari BOTTOM 502.000.
- `Kayu Manis Bubuk @15Gr Koepoe2` ada di PDF tapi belum ada di katalog produk.
- Tombol "Sync HPP Weekly Low → Master" tidak bisa dipakai untuk ini: 0 kandidat (hanya 9 produk punya `weekly_price_range`, tidak ada yang masih dalam window Kamis–Rabu berjalan), dan kalaupun jalan ia me-rescale harga tier secara proporsional sehingga harga terbit 26 Juli ikut bergeser.

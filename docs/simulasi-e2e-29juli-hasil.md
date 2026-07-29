# Hasil Simulasi E2E — PO → Tukar Faktur → Pembayaran (29 Juli 2026)

Dijalankan lewat UI beneran (dev server lokal, DB Supabase produksi `ckkohudfuisgzlrjipev`),
tiap tahap diverifikasi lewat SQL. Login sebagai Super Admin.

## Skenario

| Kode | Klien | Isi | Ending |
|---|---|---|---|
| SIM-A-001 | MAISEN (Tier 1, TOP 30 hari) | Bawang Merah Kupas 100 Kg @44.000, Daun Bawang 50 Kg @18.000 | **LUNAS** — dibayar penuh ke BRI |
| SIM-B-001 | GOAT COFFEE (Tier 3, TOP 30 hari) | Bawang Merah Kupas 80 Kg @35.000, Bawang Putih Kupas 40 Kg @36.000 | **PIUTANG** — belum dibayar |

Return yang diuji:
- **Retur ke vendor** (SIM-B): 10 Kg Bawang Merah gagal QC → aksi "Retur ke Supplier".
- **Retur/tolak klien** (SIM-B): 5 Kg lagi ditolak klien saat serah terima → masuk antrean "Retur dari Customer".

Hutang yang diuji: 1 item dibeli **Tempo** (Bawang Putih Kupas 40 Kg @31.000 = Rp1.240.000).

## Angka akhir

| | SIM-A | SIM-B |
|---|---|---|
| Nilai PO awal | 5.300.000 | 4.240.000 |
| Setelah QC reject | 5.300.000 | 3.890.000 |
| Setelah tolak klien | 5.300.000 | **3.715.000** |
| HPP diakui | 3.650.000 | 3.190.000 |
| Margin | 1.650.000 | 525.000 |
| Invoice | Paid | Unpaid (jatuh tempo 27/08/2026) |

Rekonsiliasi global setelah simulasi:
- Piutang jurnal (1-2000) = Rp34.923.000 **== ** AR aplikasi Rp34.923.000 ✔
- Σ debit − Σ kredit = 0 ✔ (buku tidak pincang)
- Saldo bank total 599.460.000 = sebelumnya 594.160.000 + 5.300.000 masuk BRI
  (tidak ada uang keluar untuk belanja — lihat temuan #2)

---

## Yang JALAN (tidak perlu disentuh)

1. Buat SO, harga otomatis ikut tier klien (Tier 1 vs Tier 3 beda harga, benar).
2. Shopping list: 2 PO digabung jadi 1 dokumen belanja, tiap baris tetap nyambung ke PO asalnya.
3. Purchase Request → approve Finance (3 tahap, catatan wajib) → status Approved & Released.
4. Belanja per item: harga beli aktual tersimpan (30.000 / 31.000 / 13.000), bukan estimasi.
5. QC gate: Finance **tidak bisa** settle sebelum gudang selesai QC. Bagus.
6. Jurnal QC pakai **harga beli aktual**: Dr Persediaan / Cr AP Accrual, per item, angkanya persis.
7. Retur supplier saat QC membalik jurnalnya dengan benar (Dr 2-1100 / Cr Persediaan 300.000).
8. Reject QC otomatis menurunkan qty & nilai invoice PO klien (80 → 70).
9. Tolak klien saat serah terima menurunkan lagi (70 → 65) + otomatis bikin antrean retur customer.
10. Pengakuan pendapatan & HPP saat delivery diaudit Finance:
    Dr Piutang / Cr Pendapatan **dan** Dr HPP / Cr Persediaan — **HPP pakai harga beli aktual**, bukan estimasi. Tidak dobel.
11. Tukar Faktur (Admin PO) menandai invoice anak, tidak bikin piutang dobel.
12. Pembayaran: Dr Bank / Cr Piutang, invoice induk + anak jadi Paid, uang masuk ke BRI dengan benar.
13. Neraca "balanced".

---

> **Status perbaikan (29 Juli 2026, sore):** semua temuan di bawah sudah diperbaiki.
> Ringkasan tindakan + bukti ada di bagian [Perbaikan](#perbaikan-29-juli-2026) di akhir dokumen.

## Yang RUSAK (urut dari paling bahaya)

### 1. Hutang ke vendor HILANG untuk belanja Pasar + Tempo
- Simulasi: Bawang Putih Kupas 40 Kg × 31.000 = **Rp1.240.000** dibeli Tempo.
- Hasil: `vendor_bills` kosong. Halaman **AP Aging = Rp0, "Tidak ada hutang vendor 🎉"**,
  padahal Neraca mencatat Utang Usaha Rp36.098.250 + AP Accrual Rp30.024.666.
- Sebab:
  - `src/app/warehouse/qc/page.tsx:313` — tagihan vendor hanya dibuat kalau `purchaseMethod === 'Vendor'` **dan** `paymentMethod === 'Tempo'`. Belanja pasar tidak masuk.
  - Komentarnya bilang Pasar+Tempo diselesaikan lewat `recordReconciliationSettlement`, tapi
    `src/app/finance/approvals/page.tsx:344` hanya memanggilnya `if (isLegacy)` — dan model
    "legacy" sudah tidak dipakai lagi (`budgetTransferDate` sudah tidak pernah diisi).
- Akibat: setiap belanja tempo di pasar tidak pernah jadi tagihan, tidak pernah muncul di AP Aging,
  tidak pernah bisa dibayar. Uang yang harus dibayar ke supplier tidak tercatat di mana pun sebagai kewajiban spesifik.

### 2. Uang belanja tidak terpotong kalau yang belanja bukan pemilik "kantong"
- Simulasi: belanja tunai Rp6.050.000 dikerjakan user tanpa kantong sourcing.
  Aplikasi tetap mengizinkan seluruh proses (isi harga, submit laporan, Finance verify) —
  **tanpa peringatan** — tetapi tidak ada jurnal kas keluar sama sekali.
- Sebab: `src/app/sourcing/list/page.tsx:235` → `if (myPocket) { ... recordPocketPurchase }`.
  Kalau user tidak punya rekening kantong, blok itu dilewati diam-diam.
- Akibat: saldo bank tidak berkurang, dan AP Accrual (2-1100) menggantung selamanya sebesar nilai belanja.
  Di simulasi ini AP Accrual jadi kelebihan ~Rp6.990.000.
- Catatan: kalau login sebagai user Sourcing (yang punya kantong), jalur ini benar.
  Masalahnya sistem tidak mencegah/memperingatkan user lain melakukannya.

### 3. Tukar Faktur ada DUA sistem, pembayaran mentok
- Admin PO → menu Tukar Faktur → menulis ke tabel `tukar_faktur` (sistem baru). TF terbit, bisa ditandai "Diterima".
- Finance → Invoices → tab "Tukar Faktur" membaca **sumber lain** (invoice `is_consolidated`, sistem lama):
  `src/app/finance/invoices/page.tsx:463`.
- Akibat: TF yang dibuat Admin PO **tidak muncul** di Finance. Di daftar invoice, tombolnya cuma
  label mati "Bayar via Tukar Faktur". **Tidak ada jalan mencatat pembayaran** untuk invoice itu.
- Workaround yang dipakai di simulasi: Finance bikin TF versi lama sendiri ("Buat Tukar Faktur"),
  baru pembayaran bisa dicatat. Artinya satu PO bisa punya dua dokumen TF berbeda.

### 4. Metode bayar & vendor menempel ke BARANG, bukan ke baris PO
- Di shopping list, 2 PO memesan SKU sama (Bawang Merah Kupas). Baris SIM-B di-set **Tempo**,
  lalu baris SIM-A di-set **Cash** → baris SIM-B ikut berubah jadi **Cash** tanpa pemberitahuan.
- Sebab: `src/app/admin/shopping-list/page.tsx:473-487` — `vendorAssignments`, `customPrices`,
  `paymentByProduct`, dan lokasi ambil semuanya di-index by `productId`, padahal barisnya per (produk × PO).
- Akibat: tidak bisa beli SKU yang sama dari vendor berbeda / termin berbeda untuk dua klien di hari yang sama.
  Setting terakhir menang, diam-diam.

### 5. Neraca kas tidak bisa dipercaya (COA 1-1000 dipakai bersama)
- Bank Jago, BRI, dan Petty Cash memakai kode akun yang sama (1-1000).
- Hasil di Neraca: "Kas di Tangan (Petty Cash)" **−Rp300.371.735**, "Bank BRI" Rp0,
  padahal saldo BRI sebenarnya Rp5.300.000 dan Jago Rp34.160.000.
- Akibat: baris kas di laporan keuangan tidak mencerminkan rekening mana pun.

### 6. Tanggal Tukar Faktur geser 1 hari
- Dialog menampilkan "Periode 27 Jul – 31 Jul, Issue default 31/7/2026".
- Tersimpan: `period_start 2026-07-26`, `period_end 2026-07-30`, `issue_date 2026-07-28`.
- Selain geser 1 hari, **tanggal terbit jadi lebih awal dari akhir periode** — mustahil secara dokumen.
- Penyebab khas: konversi tanggal UTC vs waktu lokal (+7).

### 7. Nomor Tukar Faktur tidak mengandung identitas klien
- `TF-2026-07-CLIENT-01` (MAISEN) dan `TF-2026-07-CLIENT-02` (GOAT COFFEE).
- `src/lib/tukar-faktur.ts` memakai `clientId.slice(0,6)`, sedangkan semua id klien diawali `client-`.
- Nomornya unik, tapi tidak bisa dibaca siapa kliennya.

### 8. ~~Kolom "TF" di daftar invoice terbalik~~ — BUKAN BUG
- Waktu simulasi, invoice yang sudah masuk TF menampilkan "—". Ditelusuri ulang: halaman
  memang benar, yang salah adalah tab browser simulasi yang sudah lama terbuka sejak sebelum
  TF dibuat. Setelah halaman dimuat ulang, nomor TF-nya tampil normal. Tidak ada perubahan kode.

---

## Catatan lain (bukan bug, tapi perlu tahu)

- **Stok gudang selalu 0 di layar** karena stok dihitung ulang dari `stock_movements`
  (`src/lib/store.ts:76`), sementara kolom `products.current_stock` di database masih menyimpan angka lama.
  Dua sumber angka yang tidak sinkron.
- **Barang untuk PO klien tidak masuk stok gudang** (cross-dock): `stock_delta = 0`, langsung "Transit
  (Reserved for Delivery)". Ini memang desainnya.
- **Nilai Purchase Request termasuk item Tempo** (Rp7.020.000 padahal kas yang benar-benar dibutuhkan
  Rp5.780.000). Perhitungan kembalian tetap benar karena hanya menghitung item Cash.
- Sisa Rp150.000 (5 Kg yang ditolak klien) masih nyangkut di Persediaan, menunggu QC retur customer.
  Ini benar selama antrean retur diproses.

---

## Perbaikan (29 Juli 2026)

Semua dikerjakan setelah simulasi di atas, lalu diuji ulang lewat UI + verifikasi SQL.
Skenario uji tambahan: **SIM-C-001** (MAISEN) dan **SIM-D-001** (GOAT COFFEE) — dua PO
memesan SKU yang sama (Bawang Putih Kupas) di hari yang sama, satu Cash satu Tempo.

### 1. Hutang tempo sekarang benar-benar terbentuk
Dua hal yang rusak, dua-duanya diperbaiki:

- `src/app/warehouse/qc/page.tsx` — tagihan vendor dulu hanya dibuat untuk `purchaseMethod === 'Vendor'`.
  Syarat lokasi itu dibuang: **setiap item Tempo** sekarang jadi hutang saat QC, termasuk belanja pasar.
- `src/lib/accounting.ts` `recordVendorBillFromInbound` — urutannya terbalik: jurnal diposting
  **sebelum** baris tagihannya ada, padahal `journal_lines.vendor_bill_id` punya foreign key ke
  `vendor_bills`. Database selalu menolaknya (`violates foreign key constraint`), fungsi balik
  `false`, dan hutangnya hilang tanpa suara. Artinya jalur Vendor+Tempo pun **tidak pernah**
  bekerja, bukan cuma Pasar+Tempo. Tagihan sekarang dibuat dulu, jurnal menyusul; kalau jurnalnya
  gagal, tagihannya dihapus lagi supaya tidak ada tagihan yatim.

Bukti: QC item Tempo 15 Kg × Rp32.000 → `VB-202607-B1B0EA`, TOKO MAMEN, Rp480.000, jatuh tempo
12 Agt 2026, muncul di **AP Aging** (Total Outstanding Rp480.000, bucket 8–14 hari).
Jurnal Dr 2-1100 / Cr 2-1000 seimbang, buku tetap 0.

### 2. Belanja tunai tanpa kantong sekarang ditolak
`src/app/sourcing/list/page.tsx` — sebelum laporan dikirim, total belanja tunai dihitung dulu.
Kalau ada belanja tunai tapi si penginput tidak punya rekening kantong, laporan **ditolak**
dengan pesan yang menyebut jalan keluarnya (minta Finance bikin kantong, atau biar orang
sourcing yang input). Sebelumnya blok pembukuannya dilewati diam-diam dan uangnya tidak pernah
keluar dari kas mana pun.

Bukti jalur normal: login sebagai Hilman (Sourcing), tarik Rp1.000.000 ke kantong
(Bank Jago 34.160.000 → 33.160.000), belanja tunai Rp620.000 → jurnal
Dr 2-1100 / Cr Kas Sourcing 1-1500 Rp620.000, saldo kantong sisa Rp380.000. Item Tempo
Rp480.000 benar tidak ikut memotong kas.

### 3. Tukar Faktur bisa dibayar dari Finance
`src/app/finance/invoices/page.tsx` + `src/lib/store.ts`:

- Tab "Tukar Faktur" di Finance sekarang menampilkan batch dari **kedua** sistem — invoice
  konsolidasi lama *dan* baris `tukar_faktur` yang diterbitkan Admin PO — dengan tombol
  "Catat Bayar" yang sama. Barisnya sengaja tidak dihitung di total header supaya nilainya
  tidak dobel dengan invoice anaknya.
- `recordTukarFakturPayment` dulu menaruh SELURUH penerapan hasil pembayaran di dalam
  `if (parent)`, jadi untuk batch sistem baru (yang tidak punya invoice induk) pembayaran
  anaknya hilang dari state dan tidak pernah tersimpan. Update anak sekarang diterapkan tanpa
  syarat, dan baris `tukar_faktur`-nya otomatis jadi **Paid** kalau semua anaknya lunas.

Bukti: TF-2026-07-CLIENT-02 (GOAT COFFEE, Rp3.715.000) dibayar ke BRI →
Dr 1-1400 / Cr 1-2000 Rp3.715.000, invoice `2dbc935d` jadi Paid, status TF jadi Paid.

### 4. Vendor, harga, lokasi & metode bayar sekarang per baris
`src/app/admin/shopping-list/page.tsx` — semua map (`vendorAssignments`, `customPrices`,
`paymentByProduct`, lokasi ambil, booking gudang) di-key `productId::salesOrderId`, bukan
`productId` saja. Kunci localStorage-nya ikut naik ke `_v2` supaya setelan lama tidak salah baca.

Bukti: SIM-C (20 Kg) di-set Cash + vendor KEVIN, SIM-D (15 Kg) di-set Tempo + vendor TOKO MAMEN,
SKU sama. Keduanya bertahan sendiri-sendiri sampai ke `purchase_items`.

### 5. Tiap rekening punya akun sendiri di Neraca
Bank Jago → **1-1100**, BRI → **1-1400**, Kas Logistik → **1-1510**; Petty Cash tetap 1-1000.
COA "Bank Jago - Belanja" ditambahkan, dan satu COA duplikat `1-1400` yang menganggur dihapus
(dua akun berkode sama bikin posting jatuh ke akun yang tidak pasti). Ikut disesuaikan:
- pencocokan mutasi bank di `finance/reconciliation` — dulu hanya mengenali `1-1000`, sekarang
  mengenali semua kode yang dipakai rekening di Cash & Bank;
- kartu "Internal Cash & Bank" di dashboard CEO — dulu daftar kode ditulis tangan.

⚠️ **Catatan penting:** hanya transaksi **setelah** pemisahan yang masuk ke akun barunya.
Saldo lama tetap tertinggal di baris "Kas di Tangan (Petty Cash)" — termasuk angka minus
Rp300jt yang berasal dari **impor belanja Juli** (kas dikredit tanpa pasangan kas masuk),
bukan dari masalah kode ini. Kalau mau baris kas langsung rapi, perlu satu jurnal reklasifikasi
saldo awal per rekening — belum dilakukan karena itu menulis ulang riwayat.

### 6 & 7. Tanggal dan nomor Tukar Faktur
- `src/lib/tukar-faktur.ts` + `GenerateTfModal.tsx` — tanggal diformat dari komponen tanggal
  **lokal**, bukan lewat `toISOString()` yang menggeser tengah malam WIB ke hari sebelumnya.
- Nomor TF memakai nama klien yang sudah dibersihkan dari awalan `client-`, jadi
  `TF-2026-07-MAISEN-01`, bukan `TF-2026-07-CLIENT-01` untuk semua klien.
- Ada test-nya: `src/lib/tukar-faktur.check.ts` (`npx tsx src/lib/tukar-faktur.check.ts`).

### Temuan baru saat perbaikan
- **Tabel `record_history` tidak ada di database** — sudah diperbaiki, lihat bagian di bawah.
- Cek ketik ulang: `npx tsc --noEmit` tetap di baseline 5 error lama yang tidak berhubungan.

---

## Susulan: Activity Log & rollback (30 Juli 2026)

Dua hal, dua-duanya sudah diperbaiki dan sudah jalan di production.

**Tabelnya memang tidak pernah ada.** `record_history` hanya didefinisikan di
`supabase/dev-bootstrap.sql` (dipakai untuk menyiapkan database lokal dari nol). Database
production dimigrasikan tabel per tabel dan tidak pernah kebagian yang ini, jadi setiap
pencatatan riwayat gagal. Penulisnya sengaja menelan error itu — pencatatan audit tidak boleh
menggagalkan transaksi yang sedang dicatat — jadi tidak ada yang komplain: Activity Log kosong
melompong dan rollback tidak punya versi untuk dikembalikan. Migration
`20260730000001_record_history.sql` dibuat dan sudah diterapkan ke production.

**Isi cadangannya sempat diacak-acak.** Kolom `old_data`/`new_data` menyimpan salinan mentah
objek aplikasi, tapi jalur sync menjalankan konversi camelCase→snake_case ke seluruh isi
payload, ikut mengganti nama field di dalamnya. Sisi baca sengaja tidak membalikkannya, jadi
saat rollback yang dikembalikan adalah field bernama snake_case ke record yang camelCase:
recordnya kemasukan set field kedua, dan catatan auditnya mengaku 16 field berubah padahal cuma
status. Sekarang nama kolomnya saja yang dikonversi, isinya dibiarkan apa adanya.

Bukti: ubah status SIM-C-001 → tercatat sebagai `update` dengan 1 field (`status`), pelakunya
Reza (Super Admin). Tekan ROLLBACK → status balik ke QC, dan aksi rollback-nya sendiri ikut
tercatat, ditautkan ke entri yang dibatalkan. Sebelum perbaikan kedua, entri rollback yang sama
melaporkan 16 field.

---

## Ronde 2 — jalur yang belum kesentuh (30 Juli 2026)

Simulasi pertama cuma lewat belanja pasar. Ronde ini menutup jalur sisanya.
PO uji: **SIM-E-001** (online + vendor transfer + vendor tempo), **SIM-F-001**
(tiga tujuan barang reject), **SIM-G-001** (vendor transfer, sesudah perbaikan).

### Yang JALAN
| Jalur | Hasil |
|---|---|
| Belanja online (marketplace) | Dr Persediaan-accrual 180.000 + Biaya admin 2.500 + Ongkir 15.000 / Cr BCA 197.500 — biaya admin & ongkir dipisah ke akun beban sendiri, tidak dicampur ke harga barang |
| Bayar hutang vendor (cicil) | Dr Hutang 150.000 / Cr Mandiri 150.000, tagihan jadi "PartialPaid", sisa Rp250.000 tetap di AP Aging |
| QC reject → Disposal | Dr Beban Kerusakan 68.000 / Cr Persediaan |
| QC reject → Peralihan B2C | Dr Persediaan B2C 64.000 / Cr Persediaan utama, stok pindah ke gudang b2c |
| QC lebih → masuk stok gudang | Stok gudang naik 5, nilainya ikut harga beli aktual |
| Retur customer (3 pilihan) | 2 masuk stok lagi, 1 dibuang (Dr Beban Kerusakan / Cr Persediaan), 2 jadi klaim retur ke vendor |
| Retur vendor → ditukar | Pengganti 8 masuk, 2 pengganti rusak dihapus bukukan (Dr Beban Kerusakan 58.000 / Cr Persediaan) |
| Transfer antar bank + gate CFO | Dari Mandiri wajib lewat CFO: Draft → Menunggu CFO → Disetujui → Ditransfer. Dr BCA 25jt / Cr Mandiri 25jt |

Buku tetap seimbang (Σ debit − Σ kredit = 0) sesudah semua langkah di atas.

### Yang RUSAK — dua-duanya sudah diperbaiki

**9. Barang kiriman vendor dengan bayar Transfer: uangnya tidak pernah keluar bank.**
Fungsi pembayarannya cuma dipanggil dari submit laporan sourcing, sedangkan barang
kiriman vendor memang sengaja dikeluarkan dari checklist sourcing (vendor antar sendiri).
Jadi tidak ada satu tombol pun di aplikasi yang memicunya: saldo BCA tidak berkurang dan
accrual-nya menggantung selamanya. Sekarang diposting saat QC.

**10. Tidak ada tempat mengisi harga beli untuk barang kiriman vendor.**
Karena tidak lewat sourcing, tidak ada tahap yang menanyakan vendor menagih berapa.
Semua angka jatuh ke harga patokan — nilai persediaan, HPP saat kirim, dan **nominal
tagihan tempo yang bakal kita bayar**. Di uji coba, patokan Rp17.631 vs harga asli
Rp21.000. Sekarang ada kolom "Harga Satuan dari Vendor" di kartu QC khusus barang vendor.

### Catatan kecil (belum diperbaiki, bukan kebocoran uang)
- Barang retur customer yang dikirim balik ke vendor **belum dikeluarkan dari nilai persediaan**
  sampai klaimnya selesai. Kalau vendor menolak tukar, baru dihapus bukukan. Untuk sekarang
  konsisten, tapi kalau klaimnya digantung lama, persediaan kelihatan lebih besar dari isinya.
- Pengajuan dana untuk dokumen yang isinya cuma barang vendor/online tercatat Rp0 (memang
  tidak butuh uang jalan), jadi nilai dokumennya tidak kelihatan di layar approval.
- Nilai satuan di catatan pergerakan stok untuk retur customer masih 0 — hanya memengaruhi
  laporan analisa kerugian, bukan jurnal.

### Belum diuji sama sekali
Semuanya sudah ditutup di ronde 3 di bawah.

---

## Ronde 3 — sisa terakhir (30 Juli 2026)

### Yang JALAN
| Jalur | Hasil |
|---|---|
| Input piutang manual + pelunasan | Dr Piutang / Cr Pendapatan Rp2.500.000 saat dibuat, lalu Dr BRI / Cr Piutang saat dibayar. Piutang di jurnal == piutang di aplikasi |
| Stok opname (selisih kurang) | Fisik 3 vs sistem 5 → Dr Beban Kerusakan Rp60.000 / Cr Persediaan, stok turun 2 |
| Biaya operasional sourcing + audit finance | Rp25.000 parkir → Dr Beban Transportasi / Cr Kas Sourcing, saldo kantong turun sesuai |

### Yang RUSAK — dua-duanya sudah diperbaiki

**11. "Ambil dari Gudang" tidak benar-benar memesan stok.**
Barang yang diambil dari gudang tercatat sebagai **"Booking 0 Kg"**, berapa pun kebutuhannya.
Penyebabnya: yang dipakai angka "jumlah yang harus dibeli" — dan untuk barang yang diambil
dari gudang angka itu memang sengaja 0, karena tidak dibeli. Akibatnya stok tidak pernah
benar-benar dikunci, jadi barang yang sama bisa dijanjikan lagi ke PO berikutnya.
Sekarang yang direservasi adalah kebutuhan PO-nya. Diuji: booking 3 Kg tercatat 3, bukan 0.

**12. Pesanan kurang kirim tidak pernah tercatat kurang.**
PO 80 Kg yang diterima klien cuma 65 Kg tetap berstatus "Terkirim" — sisa 15 Kg hilang dari
sistem, tidak pernah masuk antrean susulan. Penyebabnya: saat konfirmasi BAST, aplikasi
menyertakan satu kolom yang tidak ada di database, jadi database menolak seluruh baris dan
perubahan statusnya ikut hilang. Baris barangnya sendiri tersimpan, makanya kelihatan seperti
berhasil. Sekarang statusnya jadi **"Kurang Kirim"** dan sisanya masuk antrean ronde berikutnya.
Bonus: error pengecekan kode yang sudah lama nongkrong di file itu ternyata memang menunjuk
bug ini, sekarang ikut hilang.

## Data simulasi

## Data simulasi

PO `SIM-A-001`, `SIM-B-001`, `SIM-C-001`, `SIM-D-001`; dokumen belanja `ADV-20260729-026`
dan `ADV-20260729-027`; PR `pr-944ac470`, `pr-84164ac6`; TF `TF-2026-07-CLIENT-01/02`
+ invoice konsolidasi `TF-5d5f9352`; tagihan vendor `VB-202607-B1B0EA`. Belum dibersihkan.

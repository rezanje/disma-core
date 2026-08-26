# Hasil Simulasi E2E — PO masuk sampai lunas (26 Agustus 2026)

Dijalankan dengan **kode aplikasi yang asli** (store + modul akuntansi + modul bersama
yang sama persis dipakai layar), menembak database Supabase `ckkohudfuisgzlrjipev`
lewat API aplikasi. Tiap langkah memanggil fungsi yang sama dengan tombol di
halamannya; hasilnya dicek ulang lewat SQL langsung ke database.

Harness: `scratch/sim/run.mts` (ronde 1) + `scratch/sim/round2.mts` (ronde susulan),
dijalankan dengan `npx tsx`. Relative fetch diarahkan ke dev server; tidak ada logika
bisnis yang ditulis ulang di harness.

Baseline sebelum mulai: AR Rp135.924 · AP Rp488.000 · buku seimbang (0) ·
saldo semua rekening Rp902.000 · 20 jurnal.

---

## Skenario

| Kode | Klien | Isi pesanan | Yang diuji | Ending |
|---|---|---|---|---|
| SIM4-A | BANGKOK (Tier 1) | Bawang Merah Kupas 100 Kg @44.000, Daun Bawang 50 Kg @18.000 | jalur mulus | **LUNAS** ke BRI |
| SIM4-B | PAND'OR (Tier 3) | Bawang Putih Kupas 40 Kg @36.000, Cabe Merah Keriting 20 Kg @42.000 | 1 item **tempo** + **reject QC** 5 Kg → retur supplier | **LUNAS** lewat Tukar Faktur |
| SIM4-C | ANTHEM JAKARTA (Tier 2) | Bawang Merah Kupas 60 Kg @38.000 | **ditolak klien** 10 Kg saat serah terima | **PIUTANG** |
| ronde 2 | SIM4-B & SIM4-C | sisa 5 Kg + 10 Kg | **belanja susulan** + **inspeksi retur customer** | tuntas, dua PO **Selesai** |

Peran berurutan: Admin PO → Finance (rencana) → Admin PO (lepas) → Finance (pencairan,
lewat approval CFO) → Sourcing → Gudang/QC → Finance (settlement) → Gudang (rilis) →
Kurir → Finance (audit) → Admin PO (BAST) → Finance (Tukar Faktur & pelunasan).

⚠️ Catatan: skrip ronde 1 tereksekusi **dua kali** (kecelakaan operasional saat
menjalankan ulang untuk mengambil log). Dua set data kembar ada di database. Ronde 2
hanya dijalankan untuk set yang kedua. Angka per-putaran di bawah adalah set kedua.

---

## Angka satu putaran penuh

| | Nilai |
|---|---|
| Modal masuk | Rp600.000.000 (Mandiri) |
| Disbursement mingguan | Rp100.000.000 (Mandiri → BCA), lewat approval CFO |
| Dana belanja cair | Rp5.985.000 (BCA → kantong sourcing) — hanya bagian tunai |
| Total belanja ronde 1 | Rp7.225.000 (tunai Rp5.985.000 + tempo Rp1.240.000) |
| Belanja susulan | Rp490.000 |
| Omzet diakui | Rp9.860.000 (ronde 1 Rp9.270.000 + ronde 2 Rp590.000) |
| HPP diakui | Rp7.225.000 — **seharusnya Rp7.245.000** (lihat temuan 1) |
| Laba kotor tercatat | Rp2.635.000 — seharusnya Rp2.615.000 |
| Uang masuk ke BRI | Rp7.370.000 |
| Sisa piutang | Rp1.900.000 + Rp380.000 (ANTHEM JAKARTA) |
| Hutang vendor baru | Rp1.240.000 (tempo, muncul di AP Aging) |
| Klaim retur ke vendor | Rp180.000 (akun 1-2100) |

### Rekonsiliasi akhir (seluruh database)

| Cek | Hasil |
|---|---|
| Σ debit − Σ kredit | **0** ✅ buku tidak pincang |
| Piutang di jurnal vs AR Aging | Rp4.525.924 == Rp4.525.924 ✅ |
| Hutang di jurnal vs AP Aging | Rp2.968.000 == Rp2.968.000 ✅ |
| Akun peralihan barang-vs-tagihan (2-1100) | **0** ✅ tiap belanja ketemu barangnya |
| Kartu stok 4 produk uji | masuk = keluar, sisa 12 Kg (2 baseline + 10 retur customer) ✅ |
| Saldo rekening vs kas di jurnal | Rp1.203.182.000 vs Rp1.202.922.000 → **beda Rp260.000** ❌ (temuan 3, sudah ada sebelum simulasi) |
| Pengecekan internal `*.check.ts` | **44 / 44 lulus** ✅ |

---

## Yang JALAN — tidak perlu disentuh

1. Harga jual otomatis ikut tier klien (Tier 1 / 2 / 3 semuanya benar).
2. Tiga PO digabung jadi satu dokumen belanja; tiap baris tetap nyambung ke PO asalnya.
3. Rencana Pembelian (Finance) memutuskan vendor / jalur / cara bayar sebelum sourcing jalan.
4. Nilai pengajuan dana = **hanya belanja tunai**: Rp5.985.000 dari total Rp7.225.000.
   Item tempo Rp1.240.000 tidak ikut diminta. (Perbaikan 15 Agu bertahan.)
5. Pencairan lewat satu pintu, dengan approval CFO untuk rekening yang ditandai.
6. Belanja tunai benar-benar memotong kantong sourcing.
7. Item **tempo** otomatis jadi hutang vendor dan muncul di AP Aging.
8. Reject saat QC menurunkan jumlah dan nilai tagihan klien (20 → 15 Kg) dan membuat
   dokumen retur ke supplier; nilainya masuk akun klaim retur, bukan nyangkut di hutang.
9. Klien menolak sebagian saat serah terima → tagihan turun (60 → 50 Kg) **dan** barang
   masuk antrean retur bernomor (DI-260826-001/002) dengan jatuh tempo.
10. Stok: satu barang masuk sekali, keluar sekali. **Tidak ada dobel potong.**
    (Perbaikan 15 Agu bertahan — ini dulu temuan paling bahaya.)
11. Omzet dan HPP diakui sekali saja, pada tanggal barang diterima klien.
12. PO **Kurang Kirim** bisa dibelanjakan susulan sampai tuntas → status **Selesai**.
13. Inspeksi retur customer mengembalikan barang ke kartu stok.
14. Tukar Faktur tidak menggandakan piutang; pembayarannya turun sampai ke invoice anak.
15. Pelunasan masuk ke rekening yang benar; piutang turun persis sebesar pembayaran.
16. Penjaga "kolom tidak ada = gagal langsung, jangan diulang" **terbukti bekerja** —
    dua kali menghentikan simulasi karena harness mengirim kolom yang tidak ada,
    bukannya menelan datanya diam-diam.

---

## Yang RUSAK / BOLONG — urut dari paling bahaya

### 1. HPP ronde susulan memakai harga ronde pertama  🔴

Untuk PO yang dikirim dua ronde, pengakuan HPP mencari baris belanja milik PO itu dan
mengambil **yang pertama ketemu** — yaitu baris ronde pertama. Harga hari ini diabaikan.

Bukti di simulasi ini (harga pasar naik di ronde 2):

| | Barang masuk (harga ronde 2) | HPP dibukukan (harga ronde 1) | Selisih |
|---|---|---|---|
| Cabe Merah Keriting 5 Kg | Rp190.000 (@38.000) | Rp180.000 (@36.000) | Rp10.000 |
| Bawang Merah Kupas 10 Kg | Rp300.000 (@30.000) | Rp290.000 (@29.000) | Rp10.000 |

Akibatnya dua hal sekaligus: **laba ronde susulan kelebihan** (Rp120.000 tercatat vs
Rp100.000 sebenarnya — melenceng 20%), dan **nilai persediaan menyimpan sisa Rp20.000
yang tidak akan pernah keluar** karena barangnya sudah terkirim habis. Setiap ronde
susulan menambah sisa baru. Kalau harga turun, arahnya terbalik: laba jadi terlalu kecil.

Laporan 15 Agustus mencatat hal ini sebagai "JALAN"; pengujian ini menunjukkan tidak.

**Tambalnya:** ambil baris belanja **terbaru** untuk PO + produk itu (yang harganya
sudah terisi), bukan yang pertama ketemu. Satu baris kode.

- Titik: `src/lib/delivery-audit.ts` (`const pItem = ...purchaseItems.find(...)` →
  pakai `.filter(...).pop()` seperti fallback di baris berikutnya).

### 2. Tukar Faktur yang baru terbit tampil kosong di layar  🔴

Menerbitkan Tukar Faktur menulis ke database dengan benar (nilai, sambungan ke invoice
anak, jatuh tempo baru). Tapi langkah "baca ulang hasilnya" memakai kunci akses publik,
sementara tabelnya dikunci untuk kunci itu — **nol baris terbaca, tanpa error**. Jadi
layar tidak pernah menerima hasilnya.

Yang terlihat oleh Finance: TF baru bernilai **Rp0**, dan daftar invoice anaknya kosong,
sampai halaman dimuat ulang. Karena dialog pembayaran TF mengambil invoice anak dari
layar (bukan dari database), pembayaran TF **tepat setelah diterbitkan** tidak melihat
satu pun invoice untuk dibayar.

Terbukti di simulasi: database menyimpan Rp2.070.000, aplikasi membaca Rp0; setelah
dimuat ulang angkanya benar.

**Tambalnya:** baca ulang lewat jalur yang sama dengan pemuatan data lain (yang memakai
kunci server), bukan kunci publik — atau kembalikan nilainya langsung dari fungsi
database yang sudah dipanggil.

- Titik: `src/lib/store.ts` (`issueTukarFaktur` dan `linkInvoicesToTukarFaktur`,
  keduanya membuat klien Supabase dengan `anonKey`).

### 3. Kas di pembukuan dan saldo rekening beda Rp260.000  🟠

Satu belanja online Rp260.000 tercatat di jurnal (BCA berkurang) tapi **tidak ada baris
mutasi rekeningnya**. Karena saldo rekening dihitung dari mutasi, saldo BCA di aplikasi
lebih besar Rp260.000 daripada kas di Neraca.

Selisih ini **sudah ada sebelum simulasi** — bukan akibat pengujian ini. Penyebab
strukturalnya jelas: pencatatan belanja online memposting jurnal lebih dulu, baru
membuat mutasi kas, **tanpa membatalkan jurnal kalau langkah kedua gagal**. Jalur
settlement sourcing sudah punya pembatalan seperti itu; jalur online belum.

**Tambalnya:** samakan dengan jalur settlement — kalau mutasi kas gagal, jurnalnya
dibatalkan. Lalu koreksi selisih Rp260.000 yang sudah terlanjur.

- Titik: `src/lib/accounting.ts` (`recordOnlinePurchase`).

### 4. Barang retur customer yang dibuang dinilai pakai harga master  🟠

Kalau barang yang dikembalikan klien ternyata rusak dan ditulis-hapus, nilainya dihitung
dari **harga master produk**, bukan harga beli sebenarnya. Barangnya masuk persediaan
dengan harga beli, keluar dengan harga master — selisihnya mengendap di nilai persediaan.

Di file yang sama, jalur retur ke vendor sudah benar (memakai harga beli aktual) — ini
persis bug yang ditambal 15 Agustus, tapi satu jalurnya terlewat.

**Tambalnya:** pakai harga beli aktual, sama seperti dua jalur retur vendor di sebelahnya.

- Titik: `src/app/warehouse/qc/page.tsx:169`.

### 5. Jalur "uang muka model lama" selalu ikut menyala  🟡

Penentu "ini dokumen model lama atau model kantong" adalah ada-tidaknya tanggal transfer
budget. Alur pencairan yang sekarang **selalu** menuliskan tanggal itu, jadi setiap
dokumen baru dibaca sebagai model lama dan masuk ke cabang settlement lama.

Tidak ada kerugian sekarang: ada penjaga terpisah yang mendeteksi belanja sudah
dibukukan lewat kantong, jadi jurnalnya tidak dobel — terbukti di simulasi (nilai
jurnal settlement = 0). Tapi penandanya salah, dan begitu penjaga itu ikut dirapikan
suatu hari, dobel-posting HPP akan muncul tanpa peringatan.

**Tambalnya:** tentukan model lama dari penanda yang memang khusus model lama, atau
hapus cabangnya sekalian.

- Titik: `src/lib/settlement-model.ts` (`isLegacyAdvance`) vs
  `src/app/finance/disbursements/page.tsx` (`handleExecuteTransfer`).

---

## Data simulasi yang tertinggal

PO `SIM4-A`, `SIM4-B`, `SIM4-C` (**dua set kembar**), dokumen belanja
`ADV-20260826-SIM4` (×2) dan `ADV-20260826-SIM4R2`, Tukar Faktur
`TF-2026-W35-61A12E-03` dan `-04`, plus modal masuk 2 × Rp600.000.000 ke Mandiri.

Belum dibersihkan.

---

## Perbaikan (26 Agustus 2026, sore)

Kelima temuan ditambal, lalu diuji ulang dengan menjalankan satu PO penuh dua ronde
(`SIM5-A`, 20 Kg dikirim 12 + 8 dengan harga beli berbeda) lewat kode yang sudah
diperbaiki. Selisih kas Rp260.000 ikut dikoreksi.

| # | Yang diubah | Bukti |
|---|---|---|
| 1 | Dasar harga pokok dipilih dari baris belanja **terbaru** untuk pesanan itu, bukan yang pertama ketemu. Aturannya dipindah ke satu fungsi bersama dan dipakai tiga tempat sekaligus: pengakuan HPP, nilai di kartu stok, dan penilaian retur customer — supaya tidak bisa pelan-pelan berbeda lagi. | Ronde 2 beli @Rp35.000, HPP dibukukan **Rp280.000** (8 × 35.000), bukan Rp232.000 (8 × 29.000) |
| 2 | Pembacaan ulang hasil Tukar Faktur lewat jalur server (kunci server), bukan kunci publik yang dihalangi RLS. Rute `/api/db` dapat mode baca-by-id dengan daftar tabel yang dikunci. | TF baru terbit langsung terbaca **Rp880.000** dengan **2 invoice anak** terlihat, tanpa muat ulang |
| 3 | Belanja online membatalkan jurnalnya kalau baris mutasi kas gagal dibuat — sama seperti jalur settlement sourcing yang sudah lama begitu. | ditambal; tidak diuji hidup (butuh memaksa kegagalan tulis) |
| 4 | Retur customer yang dibuang dinilai pakai **harga beli aktual**, bukan harga master. Barang retur yang kembali ke stok juga membawa harga belinya. | ditambal; memakai fungsi bersama yang sudah diuji di poin 1 |
| 5 | Penanda "uang muka model lama" = budget dipindah **tapi tidak lewat pintu Disbursement**. Sebelumnya setiap dokumen baru terbaca model lama. | dokumen dari Disbursement terbaca model pool (diperiksa langsung di dalam simulasi) |
| — | **Koreksi data:** mutasi kas belanja online Cabai Bubuk @500GR (Rp260.000) yang tidak pernah terbentuk ditambahkan; itemnya ditandai sudah diaudit supaya tidak bisa diposting dua kali. | selisih kas hilang di **semua tujuh rekening** |

### Rekonsiliasi sesudah perbaikan

| Cek | Hasil |
|---|---|
| Σ debit − Σ kredit | **0** ✅ |
| Piutang di jurnal vs AR Aging | Rp4.525.924 == Rp4.525.924 ✅ |
| Hutang di jurnal vs AP Aging | Rp2.968.000 == Rp2.968.000 ✅ |
| Akun peralihan barang-vs-tagihan (2-1100) | **0** ✅ |
| Saldo rekening vs kas di jurnal | Rp1.203.174.000 == Rp1.203.174.000 ✅ **(selisih Rp260.000 beres)** |
| Pengecekan internal `*.check.ts` | **44 / 44 lulus** ✅ (termasuk kasus baru untuk poin 1 dan 5) |
| Pengecekan tipe | tetap di 4 error lama yang tidak berhubungan |

### Catatan

- Poin 3 dan 4 tidak diuji hidup: keduanya butuh memaksa kegagalan penulisan atau
  menjalankan layar QC di browser. Logikanya memakai fungsi yang sudah diuji, dan
  pola pembatalannya menyalin jalur settlement yang sudah terbukti.
- Kantong sourcing (Bagja) bersaldo **minus Rp300.000** — pembukuan dan mutasi sepakat,
  jadi ini bukan selisih, tapi kantong yang memang pernah dipakai belanja melebihi
  isinya. Perlu disetor balik atau dijelaskan.
- Perbaikan hanya berlaku untuk transaksi **setelah** ini. Sisa nilai Rp20.000 dari
  ronde susulan sebelum tambalan masih tertinggal di nilai persediaan sampai data
  simulasi dibersihkan atau distok-opname.

### Data simulasi tambahan

PO `SIM5-A` (verifikasi tambalan), dokumen belanja `ADV-20260826-SIM5R1` dan
`ADV-20260826-SIM5R2`, Tukar Faktur `TF-2026-W35-BANGKO-05`.

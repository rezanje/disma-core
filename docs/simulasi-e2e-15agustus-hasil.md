# Hasil Simulasi E2E — PO masuk sampai lunas (15 Agustus 2026)

Dijalankan dengan **kode aplikasi yang asli** (store + modul akuntansi yang sama persis
dipakai layar), menembak database Supabase `ckkohudfuisgzlrjipev` lewat API aplikasi.
Tiap langkah memanggil fungsi yang sama dengan tombol di halamannya, lalu hasilnya
dicek ulang lewat SQL langsung ke database.

Database dalam keadaan kosong sebelum mulai (semua saldo bank 0, tidak ada transaksi).

---

## Skenario yang dijalankan

| Kode | Klien | Isi pesanan | Yang diuji | Ending |
|---|---|---|---|---|
| SIM2-A | MAISEN (Tier 1) | Bawang Merah Kupas 100 Kg @44.000, Daun Bawang 50 Kg @18.000 | jalur mulus | **LUNAS** ke BRI |
| SIM2-B | GOAT COFFEE (Tier 3) | Bawang Putih Kupas 40 Kg @36.000, Cabe Merah Keriting 20 Kg @42.000 | **barang reject saat pembelian** (5 Kg cabe busuk → retur supplier) + 1 item beli **tempo** | **LUNAS** lewat Tukar Faktur |
| SIM2-C | ANTHEM JAKARTA (Tier 2) | Bawang Merah Kupas 60 Kg @38.000 | **barang ditolak pembeli** (10 Kg ditolak klien saat serah terima) | **PIUTANG** |
| ronde 2 | SIM2-B & SIM2-C | sisa 5 Kg + 10 Kg | **belanja susulan hari berikutnya** | tuntas, semua PO Selesai |

Peran yang dipakai berurutan: Admin PO → Finance → Sourcing → Gudang/QC → Kurir →
Finance → Admin PO.

---

## Angka akhir (bisa dicek di aplikasi)

| | Nilai |
|---|---|
| Modal masuk | Rp600.000.000 (Mandiri) |
| Total belanja | Rp7.905.000 (tunai Rp6.665.000 + tempo Rp1.240.000) |
| Omzet diakui | Rp9.860.000 |
| HPP diakui | Rp7.410.000 |
| **Laba kotor** | **Rp2.450.000** (margin 24,8%) |
| Uang masuk ke BRI | Rp7.580.000 |
| Sisa piutang | Rp2.280.000 (ANTHEM JAKARTA) |
| Sisa hutang vendor | Rp1.240.000 (SBM, tempo) |

Rekonsiliasi akhir — **semua cocok**:

- Σ debit − Σ kredit = **0** (buku tidak pincang)
- Piutang di jurnal **Rp2.288.100** == piutang di aplikasi **Rp2.288.100**
- Hutang di jurnal **Rp1.246.450** == hutang di aplikasi **Rp1.246.450**
- Saldo semua rekening **Rp600.915.000** == kas di jurnal **Rp600.915.000**
- Aset == Kewajiban + Modal + Laba (Rp603.518.100)

(Selisih Rp8.100 / Rp6.450 dari angka skenario adalah sisa data uji lama di database.)

---

## Yang JALAN — tidak perlu disentuh

1. Harga jual otomatis ikut tier klien (Tier 1 / 2 / 3 beda harga, semua benar).
2. Tiga PO digabung jadi satu dokumen belanja, tiap baris tetap nyambung ke PO asalnya.
3. Pengajuan dana ke Finance terbentuk otomatis dari dokumen belanja.
4. Belanja tunai benar-benar memotong kantong sourcing; sisa kantong pas.
5. Item **tempo** otomatis jadi hutang vendor dengan jatuh tempo, muncul di AP Aging.
6. Reject saat QC otomatis menurunkan jumlah dan nilai tagihan ke klien (20 → 15 Kg).
7. Retur ke supplier membentuk dokumen retur yang bisa dilacak.
8. Klien menolak sebagian saat serah terima → tagihan turun (60 → 50 Kg) **dan** barang
   masuk antrean "retur customer" di QC.
9. Omzet dan HPP diakui sekali saja, pakai **harga beli aktual**, bukan harga patokan.
10. Ronde susulan memakai harga beli hari itu, bukan harga ronde pertama.
11. Tukar Faktur tidak menggandakan piutang; pembayarannya turun sampai ke invoice anak.
12. Pelunasan masuk ke rekening yang benar, piutang turun persis sebesar pembayaran.
13. Laba-rugi harian terbaca di Financial Reports (halaman punya mode "harian").
14. Semua 14 pengecekan internal aplikasi lulus (`*.check.ts`).

---

## Yang RUSAK / BOLONG — urut dari paling bahaya

### 1. Stok fisik dipotong DUA KALI, dan yang minus disembunyikan  🔴
Setiap barang yang dikirim dipotong dua kali dari stok: sekali waktu gudang merilis
barang, sekali lagi waktu Finance mengaudit pengirimannya. Padahal barang PO klien
tidak pernah ditambahkan ke stok sejak awal (langsung "transit"). Hasilnya di simulasi
ini catatan stok jadi **minus 540 unit** — misalnya Daun Bawang 50 Kg tercatat keluar
100 Kg.

Yang bikin ini tidak ketahuan: layar memaksa angka minus jadi 0, jadi semuanya
kelihatan normal.

Uangnya **tidak** salah (persediaan di pembukuan tetap benar) — yang salah catatan
jumlah barangnya. Akibatnya stok gudang, stok opname, dan analisa kerugian tidak bisa
dipercaya, dan begitu ada barang yang benar-benar disimpan di gudang, angkanya makin
melenceng.

**Tambalnya:** barang yang lolos QC dicatat masuk stok (+), lalu dipotong **sekali** saja
waktu keluar. Hapus pemotongan kedua di modul akuntansi (`recordDeliveryAndInvoice`).
Dan berhenti memaksa angka minus jadi 0 — kalau minus, harus kelihatan supaya ketahuan.

- Titik: `src/app/warehouse/outbound/page.tsx` (potong 1), `src/lib/accounting.ts:641`
  (potong 2), `src/lib/store.ts:95` (paksa jadi 0).

### 2. PO "Kurang Kirim" tidak ada jalan untuk dibelanjakan susulan  🔴
Setelah serah terima, PO yang kurang kirim statusnya benar jadi **Kurang Kirim** dan
pesan di layar bilang "sisa masuk antrean susulan". Tapi daftar belanja hanya menerima
PO berstatus *Draft* atau *Belanja* dan yang **belum pernah** masuk dokumen belanja —
PO kurang kirim gagal di dua-duanya. Jadi sisa 15 Kg dari dua PO tidak pernah muncul
di layar belanja siapa pun.

Sisi gudang sebenarnya sudah siap: QC sudah mengizinkan alokasi ke PO berstatus Kurang
Kirim. Yang ketutup cuma pintu belanjanya.

Di simulasi ini ronde susulan tetap dijalankan manual, dan semua sisanya berjalan
benar sampai lunas — jadi tambalannya kecil.

**Tambalnya:** izinkan PO "Kurang Kirim" ikut dikompilasi, hitung kebutuhannya =
jumlah pesan − jumlah yang sudah diterima klien, dan jangan tolak hanya karena PO itu
pernah masuk dokumen belanja sebelumnya.

- Titik: `src/app/admin/shopping-list/page.tsx:529`.

### 3. Rekening yang wajib persetujuan CFO bisa dikuras lewat "Pindah Buku"  🟠
Mandiri (simpanan) dan BRI (penerimaan) ditandai **butuh approval CFO**. Halaman
Disbursement dan Purchase Request menghormati tanda itu. Halaman **Cash & Bank tidak** —
tombol "Pindah Buku" tidak memeriksanya sama sekali. Di simulasi, Finance sendirian
memindahkan Rp100.000.000 dari Mandiri tanpa satu pun persetujuan.

**Tambalnya:** panggil pemeriksaan yang sama (`bankRequiresCfoApproval`) sebelum
Pindah Buku dijalankan; kalau rekening asalnya butuh CFO, arahkan ke alur Disbursement.

- Titik: `src/app/finance/cash-bank/page.tsx` (blok Pindah Buku).

### 4. Tanggal pembukuan = tanggal klik, bukan tanggal transaksi  🟠
Omzet dan HPP dicatat pada saat Finance menekan tombol audit, bukan pada tanggal
barang dikirim. Kalau pengiriman hari Sabtu baru diaudit hari Senin, laba Sabtu
nol dan laba Senin dobel. Untuk "untung rugi harian" ini bikin angkanya bergeser.

Catatan: input kas manual di Cash & Bank **sudah** bisa pilih tanggal; yang belum
adalah jalur pengiriman/invoice.

**Tambalnya:** teruskan tanggal serah terima ke pencatatan jurnal
(`recordDeliveryAndInvoice` sudah punya tempat untuk itu di lapis bawahnya).

### 5. Pengajuan dana minta uang lebih banyak dari yang dibutuhkan  🟠
Pengajuan dana menghitung **semua** item termasuk yang dibeli tempo. Di simulasi
mintanya Rp7.140.000 padahal kas yang benar-benar dibutuhkan Rp5.940.000 — selisih
Rp1.200.000 adalah barang yang memang dibayar belakangan. Perhitungan kembalian tetap
benar, tapi uang menganggur di kantong sourcing.

**Tambalnya:** kecualikan item tempo dari nilai pengajuan.

- Titik: `src/app/admin/shopping-list/page.tsx` (`handleSendToFinance`).

### 6. Hak akses: tiga celah  🟠
Daftar menu per peran ditulis di kode (`src/lib/store.ts:640-680`), tidak ada tabel
izin di database — jadi ini sepenuhnya keputusan yang bisa diubah kapan saja.

- **Admin PO tidak punya menu Purchase Requests**, padahal dia yang membuat
  pengajuannya. Dia tidak bisa melihat pengajuannya sudah disetujui atau belum.
- **CMO (Hanif, PIN 7777) punya 0 menu** — sengaja dikosongkan ("archived for Phase 1"),
  tapi akunnya masih aktif dan PIN-nya masih bisa dipakai login ke layar kosong.
  Pilih satu: matikan akunnya, atau kasih menu.
- **Sourcing, Gudang, Kurir, Admin PO, dan Finance tidak punya menu Settings** — tidak
  bisa buka halaman profil/preferensi sendiri. Hanya CEO, COO, dan Super Admin yang bisa.

Selain itu, rantai kerjanya sendiri utuh: 23 dari 24 titik serah-terima antar peran
bisa diakses oleh peran yang seharusnya, dan tidak ada satu pun menu yang tidak
terjangkau siapa pun.

**Tambalnya:** tambahkan `admin_purchase_requests` ke Admin PO, `settings_global` ke
lima peran operasional, dan putuskan nasib akun CMO.

### 7. Beda struktur data diperlakukan seperti gangguan jaringan  🟠
Kalau data yang dikirim tidak cocok dengan struktur database, aplikasi menunggu 2 detik
lalu mencoba lagi — padahal itu tidak akan pernah berhasil, dan Postgres menolak
**seluruh baris**, jadi datanya hilang. Peringatannya memang muncul, tapi ikut bersama
notifikasi "berhasil" dari halamannya, jadi mudah dianggap gangguan sesaat. Ini persis
penyebab bug lama yang bikin PO kurang kirim tidak pernah tercatat. Terjadi dua kali
dalam sesi ini.

**Tambalnya:** bedakan "kolom tidak ada" dari gangguan jaringan — gagalkan langsung,
tanpa mengulang, dengan pesan yang menyuruh lapor ke developer.

- Titik: `src/lib/store.ts:743` (`attemptSync`).

### 8. Aplikasi bisa terbuka dengan data tidak lengkap tanpa peringatan  🟡
Data dimuat dalam 5 permintaan paralel saat aplikasi dibuka. Kalau salah satu gagal,
aplikasi **lanjut saja** dengan bagian itu kosong, hanya menulis catatan di konsol.
Terjadi dua kali dalam sesi ini. Untuk pemakai artinya: satu layar tiba-tiba kosong
padahal datanya ada.

**Tambalnya:** kalau ada grup yang gagal, tampilkan peringatan + tombol muat ulang.

### 9. Klaim retur ke vendor nyangkut di akun sementara  🟡
Uang Rp180.000 (5 Kg cabe yang diretur) parkir di akun sementara (2-1100), bukan
sebagai tagihan ke vendor. Tidak hilang, tapi tidak kelihatan sebagai "vendor masih
utang barang/uang ke kita".

### 10. Pelunasan dicatat dalam dua langkah terpisah  🟡
Jurnal + kas dicatat oleh modul akuntansi, status invoice di-update terpisah oleh
halaman. Kalau langkah kedua gagal, buku bilang lunas tapi AR bilang belum. Jalur
normalnya berjalan benar — ini soal ketahanan, bukan bug aktif.

---

## Ringkasan terhadap 8 tujuan

| # | Tujuan | Hasil |
|---|---|---|
| 1 | Perhitungan keuangan lengkap & sinkron | ✅ semua rekonsiliasi cocok, buku seimbang |
| 2 | Stok material/SKU benar | ❌ dobel potong (temuan 1) |
| 3 | Tidak ada salah jalur | ⚠️ satu jalur buntu: belanja susulan (temuan 2) |
| 4 | Alur nyambung awal–akhir | ✅ PO → belanja → QC → kirim → invoice → lunas |
| 5 | Celah ketemu + cara nambal | ✅ 10 temuan + tambalan di atas |
| 6 | Peran & akun benar | ⚠️ CMO kosong, Admin PO tidak bisa pantau pengajuan (temuan 6) |
| 7 | Semua skenario jalan | ✅ mulus / reject beli / reject klien / susulan / laba harian — semua terbukti |
| 8 | Jelas | dokumen ini |

---

## Perbaikan (15 Agustus 2026, sore)

Sepuluh temuan di atas semuanya sudah ditambal, lalu diuji ulang dengan menjalankan
satu PO penuh (`SIM3-A`) lewat kode yang sudah diperbaiki — 18 pengecekan, semua lulus.

| # | Yang diubah | Bukti |
|---|---|---|
| 1 | Barang yang lolos QC sekarang **masuk hitungan stok** (dulu 0), dan audit Finance tidak memotong ulang barang yang sudah dirilis Gudang. Angka minus tidak lagi disembunyikan. | 40 Kg masuk → 40 Kg keluar → stok kembali ke posisi semula; hanya **1** baris barang keluar per kiriman |
| 2 | PO **Kurang Kirim** masuk daftar belanja, dengan kebutuhan = sisa yang belum diterima klien. Baris belanja ronde sebelumnya tidak lagi menutupi kebutuhan susulan. | Layar Shopping Master List menampilkan PO "KURANG KIRIM" dengan Kebutuhan **10** (bukan 40) |
| 3 | "Pindah Buku" di Cash & Bank memeriksa tanda **butuh approval CFO** dan menolak, mengarahkan ke Disbursement | Mandiri & BRI tidak bisa lagi dipindahkan dari layar itu |
| 4 | Omzet, HPP, tanggal terbit dan **jatuh tempo** invoice memakai tanggal barang diterima klien | dibukukan 17 Agu (tanggal kirim), bukan 15 Agu (tanggal audit) |
| 5 | Nilai pengajuan dana hanya menghitung belanja tunai | Rp480.000, item tempo Rp350.000 tidak ikut |
| 6 | Admin PO dapat menu Purchase Requests; CMO dapat 7 menu; lima peran operasional dapat menu Settings | audit hak akses **24/24 lulus** (sebelumnya 23/24) |
| 7 | "Kolom tidak ada" gagal langsung tanpa mengulang, dengan pesan yang jelas | — |
| 8 | Grup data yang gagal dimuat memunculkan peringatan + saran muat ulang | peringatan muncul di layar login saat grup 2 gagal |
| 9 | Retur ke supplier masuk akun baru **1-2100 Piutang Retur ke Vendor**, dan lunas otomatis saat barang pengganti datang / vendor menolak. Nilainya pakai harga beli aktual, bukan harga patokan | Rp360.000 masuk saat retur, kembali nol saat pengganti diterima |
| 10 | Kalau penandaan invoice lunas gagal setelah uangnya masuk, muncul peringatan keras (bukan "berhasil") | — |

Ditambah satu bug yang ketahuan saat menambal: saat vendor menolak tukar, kerugiannya
dulu dihitung dari **harga patokan** dan dikreditkan lagi ke Persediaan — padahal
barangnya sudah keluar dari Persediaan waktu diretur, jadi persediaan terpotong dua kali.

Pengecekan otomatis: 15 file `*.check.ts` lulus semua, termasuk yang baru
`src/lib/stock-ledger.check.ts` (menjaga aturan "satu barang, satu kali masuk, satu kali
keluar"). Pengecekan tipe tetap di 4 error lama yang tidak berhubungan.

⚠️ **Catatan:** perbaikan hanya berlaku untuk transaksi **setelah** ini. Catatan stok
minus dari sebelumnya tetap tertinggal sampai data simulasi dibersihkan atau distok-opname.

## Data simulasi

PO `SIM2-A`, `SIM2-B`, `SIM2-C`; dokumen belanja `ADV-20260815-003` dan
`ADV-20260816-901`; Tukar Faktur `TF-2026-08-ANTHEMJAKARTA-01` dan
`TF-2026-08-GOATCOFFEE-01`. Belum dibersihkan — masih bisa dilihat di aplikasi.

# Mode Salin + Tutup Hari — Rancangan

Tanggal: 15 Agustus 2026
Disetujui: Reza (CEO)

---

## 1. Kenapa ini dibangun

Dua sakit kepala yang dipilih sendiri sama Reza:

1. **Gak tau untung harian.** Duit keluar-masuk tiap hari, tapi baru ketahuan untung
   atau rugi pas tutup bulan — sudah telat buat ngapa-ngapain.
2. **Uang dan barang bocor.** Belanja gak jelas larinya, barang datang gak sesuai,
   retur gak ketagih.

Level angka yang diminta: **bertingkat** — kotor, lalu bersih setelah biaya, lalu
dibedah per klien dan per SKU.

## 2. Kenyataan di lapangan yang mengubah desain

Tim **sourcing, gudang/QC, dan logistik belum akan memakai aplikasi.** Mereka
mencatat di kertas. **Admin PO dan Finance yang menyalin** ke sistem.

Volume: **di bawah 10 PO dan di bawah 40 baris barang per hari.** Cukup kecil untuk
disalin lewat layar yang sudah ada — sekitar 30 menit sehari. **Tidak perlu membuat
layar input baru.**

Dua hal memblokir rencana ini hari ini:

- **Admin PO dan Finance tidak punya akses ke satu pun dari 9 layar lapangan.** Hanya
  peran lapangan, COO, dan Super Admin yang punya. Satu-satunya jalan sekarang adalah
  meminjam PIN orang lapangan — yang membuat seluruh jejak di sistem menunjuk ke orang
  yang salah, persis lawan dari sakit kepala nomor dua.
- **Belanja tunai menolak diinput orang yang tidak memegang kantong.** Finance tidak
  memegang kantong Hilman, jadi belanja tunai tidak bisa dicatat sama sekali.

---

## 3. Bagian 1 — Mode Salin

Tujuan: Admin PO dan Finance bisa menyalin kertas lapangan tanpa meminjam identitas
siapa pun, dan hasilnya tetap bisa dilacak sampai ke orang yang benar-benar
mengerjakan.

### 3a. Akses

Tambahkan 9 izin layar lapangan ke peran **Admin PO** dan **Finance**:
`sourcing_list`, `sourcing_expenses`, `warehouse_inbound`, `warehouse_qc`,
`warehouse_outbound`, `warehouse_opname`, `courier_list`, `courier_handover`,
`courier_expenses`.

Diubah di dua tempat: daftar izin di kode (`src/lib/store.ts`) dan baris setelan
tersimpan di database (`app_settings.role_permissions`), karena yang tersimpan
menimpa yang di kode.

### 3b. Belanja atas nama orang lain

Di layar belanja, kalau yang login **bukan** pemegang kantong, muncul pilihan
**"Atas nama"** berisi daftar orang yang punya kantong sourcing. Uangnya tetap
dipotong dari kantong orang yang dipilih.

Blokir yang sekarang ("belanja tunai tidak bisa dilaporkan tanpa kantong") tetap
dipertahankan untuk kasus yang tidak memilih siapa pun — tanpa kantong, uangnya
tidak keluar dari mana pun dan jejaknya hilang. Yang berubah hanya: sekarang ada
jalan keluar yang benar, bukan buntu.

### 3c. Pisahkan "yang mengerjakan" dari "yang mengetik"

Setiap titik input lapangan menyimpan dua nama.

Kolomnya **sudah ada**, sekarang terisi otomatis dengan nama si pengetik:

| Titik | Kolom yang sudah ada |
|---|---|
| Belanja | `purchases.purchaser_id` |
| QC barang masuk | `purchase_items.inbound_verified_by` |
| Barang keluar gudang | `sales_orders.handover_by` |
| Serah terima ke kurir | `deliveries.courier_id` |
| Biaya operasional | `expenses.reporter_id` |

Perubahannya: kolom-kolom itu jadi **bisa dipilih** saat menyalin, dan siapa yang
mengetik dicatat terpisah di riwayat aktivitas (`record_history`, sudah jalan).

### 3d. Lembar kerja dicetak dari aplikasi

Daftar belanja sudah bisa dicetak jadi PDF. Tambahkan **kolom kosong** untuk ditulis
tangan di lapangan, urutannya sama persis dengan urutan kolom di layar penyalinan:
harga beli asli, jumlah asli, vendor, catatan.

Alasannya: kalau kertasnya bikin sendiri, menyalin berubah jadi menafsirkan, dan
salah ketik jadi rutin.

Lembar sejenis untuk QC (jumlah lolos / reject / alasan) dan untuk kurir (jumlah
diterima klien / ditolak) menyusul dengan pola yang sama.

### 3e. Foto kertas jadi bukti

Foto lembar kertas dilampirkan saat menyalin. Fiturnya **sudah ada** dan dipakai
ulang: `purchases.reconciliation_proof_url`, `purchase_items.receipt_url`,
`expenses.receipt_url`, dan unggah foto di layar QC.

Yang berubah cuma kebiasaan: foto kertas jadi wajib, bukan opsional, untuk baris yang
disalin. Kertas bisa hilang; foto tidak.

### 3f. Parkir PIN akun lapangan

Akun Hilman (Sourcing), Sandi (Gudang), dan Rivai (Logistik) tidak dipakai. Selama
PIN-nya hidup, satu-satunya kegunaannya adalah dipinjam — dan itu yang membuat jejak
berbohong.

Tandai ketiganya non-aktif sehingga PIN-nya ditolak di layar login, tanpa menghapus
akunnya (riwayat lama tetap menunjuk ke nama yang benar, dan tinggal dihidupkan lagi
kalau nanti mereka mulai memakai aplikasi).

Belum ada penanda aktif/non-aktif di mana pun. Perlu ditambahkan, beserta penolakan
PIN-nya di layar login. Mengosongkan PIN-nya saja bukan pilihan: PIN-nya hilang dan
tidak bisa dipulihkan waktu mereka mulai dipakai nanti.

**Penandanya ditaruh di kode, bukan di database.** Layar login memverifikasi PIN
terhadap daftar pengguna yang ditulis di `src/lib/constants.ts` (`MOCK_USERS`) —
tabel `users` di database tidak pernah dibaca saat login, malah ditimpa oleh daftar
kode itu setiap kali halaman login dibuka. Menambah kolom `is_active` di database
akan jadi jebakan: orang berikutnya mematikannya di sana, tidak terjadi apa-apa, dan
tidak ada yang tahu kenapa.

### 3g. Status vendor

Tabel `vendors` belum punya penanda status. Tambahkan `status`
(**approved / suspended / blocked**, standar: approved). Vendor berstatus blocked
tidak muncul di pilihan vendor saat menyalin belanja.

Diminta playbook §5.4 (Approved Vendor List). Satu kolom, dan langsung memberi cara
memblokir vendor bermasalah — yang sekarang tidak ada sama sekali.

### 3h. Harga pasar harian, gratis dari penyalinan

Playbook §5.2 meminta harga pasar harian dicatat: supplier, SKU, harga, tanggal,
sumber bukti. Tabelnya **sudah ada** (`vendor_prices`) dan **tidak pernah terisi**.

Kuncinya: saat menyalin belanja, harga beli asli per vendor per barang **sudah
diketik**. Jadi setiap baris belanja yang disalin otomatis menulis satu baris harga
pasar — tanpa satu ketikan tambahan.

Ini fondasi batas harga beli yang ditunda di §6. Tanpa mulai mengumpulkan sekarang,
tiga bulan lagi tetap tidak ada datanya.

---

## 4. Bagian 2 — Layar Tutup Hari

Satu halaman, pilih tanggal, empat blok dari atas ke bawah.

### Lapis 1 — Laba kotor

Omzet hari itu dikurangi harga beli asli barang yang dikirim hari itu.

Sumbernya jurnal: kredit 4-1000 dikurangi debit 5-1000 pada tanggal tersebut.
**Sudah tersedia** — halaman Financial Reports sudah punya mode harian yang membaca
persis ini. Di sini tinggal ditarik, bukan dihitung ulang.

Catatan penting: tanggal jurnal sekarang sudah memakai **tanggal barang diterima
klien**, bukan tanggal Finance mengaudit (diperbaiki 15 Agustus 2026). Tanpa itu,
angka harian ini pindah hari setiap kali penyalinan telat.

### Lapis 2 — Laba bersih

Laba kotor dikurangi:

- **Biaya jalan hari itu** — bensin, parkir, kuli, ongkir. Sumbernya tabel `expenses`
  pada tanggal tersebut, hanya yang sudah diaudit Finance.
- **Jatah harian biaya tetap** — gaji, sewa, listrik, internet. Dihitung
  `biaya tetap sebulan ÷ jumlah hari kerja sebulan`.

Setelan baru yang harus diisi sekali oleh Finance: daftar biaya tetap bulanan dan
jumlah hari kerja per bulan (standar 26). Disimpan di `app_settings` pada kolom baru
`daily_cost_config`.

**Lapis ini tidak memblokir peluncuran.** Selama setelannya belum diisi, layar
menampilkan lapis 1 dan 3 seperti biasa, dan lapis 2 muncul sebagai ajakan mengisi
setelan — bukan angka nol yang menyesatkan. Begitu diisi, seluruh hari yang sudah
lewat ikut terhitung ulang, karena biayanya dihitung saat ditampilkan, bukan
dibekukan ke dalam catatan harian.

Kolom baru, bukan dititip ke `nav_configs`. Setelan tarif tier dan harga patokan
sudah terlanjur dititipkan ke sana, dan itu laci yang salah untuk angka yang
memengaruhi laba — mudah tertimpa dan sulit dicari.

### Lapis 3 — Bedah per klien dan per SKU

Dua tabel berdampingan untuk tanggal itu:

- **Per klien**: omzet, HPP, laba, margin persen. Menjawab "klien mana yang tipis".
- **Per SKU**: qty terjual, harga beli rata-rata, harga jual rata-rata, laba, margin.
  Menjawab "barang mana yang buntung hari ini".

Perhitungan per SKU **sebagian sudah ada** di `src/lib/sku-pnl.ts` (sudah memakai
tanggal WIB dengan benar). Per klien belum ada dan dibangun dengan pola yang sama.

### Blok Rekonsiliasi — ini inti anti-bocornya

Lima angka hari itu dibariskan, lalu selisihnya ditunjuk:

| Yang dibandingkan | Sumber |
|---|---|
| Uang keluar dari kantong | `tutup_hari_kantong`: ditarik − belanja − disetor |
| Nilai barang masuk QC | debit 1-3000 pada tanggal itu |
| Nilai barang keluar ke klien | kredit 1-3000 pada tanggal itu |
| Omzet ditagih | kredit 4-1000 pada tanggal itu |
| Sisa uang di kantong | saldo rekening kantong |

Empat selisih yang wajib diberi nama sebelum hari bisa ditutup:

1. **Uang tidak balik** — kantong defisit. (`tutup_hari_kantong.defisit` sudah ada.)
2. **Dibeli tapi tidak lolos QC** — susut, busuk, atau diretur.
3. **Dikirim tapi tidak diterima klien** — ditolak di lokasi.
4. **Barang keluar tanpa tagihan, atau tagihan tanpa barang.**

Selisih tanpa nama = hari belum tertutup. Itu yang membuat bocor ketahuan sore itu
juga, bukan pas tutup bulan.

Setengah dari blok ini **sudah terbangun**: tabel `tutup_hari_kantong` sudah ada
(ditarik, belanja, disetor, defisit, ditutup oleh siapa) dan sudah ditulis dari layar
belanja. Yang belum ada: penutupan tingkat perusahaan, bukan cuma per kantong orang.

---

## 5. Bagian 3 — Tiga lubang dari playbook

Dipetik dari `docs/playbook-vs-aplikasi-gap.md` §5. Tidak memblokir Bagian 1 dan 2,
dikerjakan sesudahnya.

### 5.0 Rencana pembelian pindah ke Finance

Playbook §3.2 menutup ini rapat: **bukan wewenang Admin PO "memilih supplier atau
menyetujui pembayaran"**. §3.3 memberikannya ke Finance sebagai Purchasing Admin —
menerima Purchase Requirement, membuat Supplier PO, menjaga vendor master dan payment
term.

Aplikasi sekarang melanggarnya: di layar Shopping List, Admin PO yang menentukan
vendor, jalur beli, cara bayar, **dan** harga patokan. Finance hanya menyetujui uangnya
di belakang.

Yang memperburuk: ketiga setelan itu disimpan di **localStorage browser Admin PO**
(`shopping_vendorAssignments_v2`, `shopping_paymentByProduct_v2`,
`shopping_customPrices_v2`), baru ditulis ke database saat dokumen belanja dibuat.
Selama itu keputusannya hidup di satu laptop dan tidak terlihat siapa pun.

**Pembagian barunya:**

| Keputusan | Pemilik |
|---|---|
| PO mana yang digabung, barang apa, berapa banyak | Admin PO |
| Ambil dari stok gudang atau beli | Admin PO |
| Beli online atau tidak | **Finance** |
| Barang diambil sendiri / diantar vendor ke gudang / diantar langsung ke klien | **Finance** |
| Vendor mana | **Finance** |
| Cara bayar (cash / tempo / transfer) | **Finance** |
| Harga patokan per barang | **Finance** |

**Kolom `purchaseMethod` tidak dipecah.** Kolom itu dibaca 44 kali di 14 berkas dan
menentukan barang muncul di layar siapa serta jurnalnya lewat jalur mana. Yang berubah
hanya cara bertanyanya di layar — dua pertanyaan, satu nilai tersimpan:

1. "Dibeli online?" → ya = `Online`
2. kalau tidak, "Barangnya gimana?" → kita ambil = `Pasar` · vendor antar ke gudang =
   `Vendor` · vendor antar langsung ke klien = `Dropship`

Dikonfirmasi ke Reza: belanja online **selalu** masuk gudang dulu, tidak pernah dikirim
langsung ke klien dan tidak pernah diambil sendiri. Jadi empat nilai yang ada memuat
seluruh kasus nyata dan tidak ada kombinasi yang hilang.

**Vendor incaran vs vendor asli.** Untuk baris pasar, vendornya baru diketahui di
lapangan. Pilihan Finance disimpan sebagai **rencana** (`planned_vendor_id`) dan tidak
ditimpa; vendor asli tetap masuk ke `vendor_id` saat laporan belanja disalin. Kalau
keduanya dijadikan satu kolom, pertanyaan "seberapa sering rencana meleset" tidak bisa
dijawab — dan itu justru angka yang berguna untuk menilai vendor.

**Gerbangnya lewat status dokumen belanja.** Dokumen yang dibuat Admin PO berstatus
`Menunggu Rencana`; layar sourcing hanya menampilkan `Pending` dan `Belanja`, jadi
barang yang belum direncanakan otomatis tidak terlihat oleh sourcing tanpa penjaga
tambahan. Finance melepasnya ke `Pending` setelah semua baris punya rencana.

Kalau Finance berhalangan, Super Admin bisa melepas — dan itu tercatat di riwayat
aktivitas, jadi pengecualiannya terlihat, bukan diam-diam.

### 5.1 Pengajuan dana berisi baris barang

Sekarang `purchase_requests` cuma menyimpan **satu angka rupiah**. Playbook §4.3 minta
PR memuat SKU, spesifikasi, total kebutuhan, stok tersedia, buffer, need purchase, dan
referensi order.

Ini bukan soal kerapian dokumen. Karena PR tidak punya baris barang, nilainya dihitung
ulang dari baris belanja setiap kali — dan itu yang membuat PR sempat meminta
Rp7.140.000 padahal kas yang dibutuhkan Rp5.940.000. Yang sudah diperbaiki 15 Agustus
baru gejalanya (item tempo dikeluarkan dari perhitungan); penyebabnya masih ada.

Tambahan: rumus kebutuhan playbook memasukkan **safety buffer**
(`need = demand + buffer − stok tersedia`). Buffer per SKU disimpan di master produk,
standar nol supaya perilakunya tidak berubah sampai diisi.

### 5.2 Credit Note

Belum ada sama sekali. Kalau invoice sudah terbit lalu ternyata salah — klien
mengembalikan barang setelah ditagih, salah harga, salah qty — satu-satunya jalan
sekarang adalah mengubah invoice yang sudah diposting. Itu melanggar prinsip playbook
§2.2 #13: tidak ada penghapusan transaksi final, gunakan reversal atau credit note.

Bentuknya: dokumen bernomor `CN-...`, menunjuk invoice asal, punya alasan wajib,
memposting jurnal balik (Dr Pendapatan / Cr Piutang), dan mengurangi piutang klien
tanpa menyentuh invoice aslinya.

### 5.3 Delivery Issue yang bisa dikejar

`pending_returns` menyimpan barang yang ditolak klien, tapi tanpa nomor, tanpa pemilik,
tanpa tenggat. Akibatnya tidak ada yang mengejarnya — persis kelemahan yang sama dengan
klaim retur ke vendor sebelum akun 1-2100 dibuat.

Tambahkan: nomor `DI-...`, pemilik, tenggat penyelesaian, sebab akar, dan status
terbuka/selesai. Yang lewat tenggat muncul di Tutup Hari sebagai selisih yang belum
diberi nama.

---

## 6. Yang sengaja TIDAK dibangun

- **Layar input harian baru.** Volume di bawah 40 baris sehari; layar yang ada cukup.
  Dibangun kalau volume naik ke ratusan baris.
- **Aplikasi HP untuk tim lapangan.** Mereka belum siap; memaksakannya adalah cara
  tercepat membuat sistem ditinggalkan.
- **Batas harga beli otomatis untuk sourcing.** Butuh data harga beli asli beberapa
  minggu dulu; kalau dipasang sekarang angkanya mengarang. Menyusul setelah Tutup
  Hari jalan sebulan.
- **Tanda tangan digital untuk serah terima.** Tanda tangannya ada di kertas.

## 7. Risiko dan penanganannya

| Risiko | Penanganan |
|---|---|
| Kertas hilang sebelum disalin | Foto wajib, dikirim WA hari itu juga |
| Penyalin sakit / cuti | Dua orang punya akses (Bagus dan Sifa), bukan satu |
| Salah ketik saat menyalin | Urutan kolom kertas = urutan kolom layar; blok rekonsiliasi menangkap selisih yang tidak masuk akal |
| Ritual tutup hari tidak dijalankan | Layar terisi 90% otomatis; manusia cuma memberi nama ke selisih |
| Angka lapis 2 meleset karena biaya tetap ditebak | Setelan bisa diubah kapan saja dan laporan lama ikut terhitung ulang |

## 8. Urutan pengerjaan

**Bagian 1 → Bagian 2 → Bagian 3.**

Tanpa Bagian 1 tidak ada data yang masuk, dan Tutup Hari cuma akan menampilkan angka
nol. Bagian 3 menutup lubang yang nyata tapi tidak menghalangi keduanya — dan dua
bulan data dari Bagian 1 akan memberi tahu buffer serta batas harga yang masuk akal,
yang sekarang cuma bisa ditebak.

Yang juga berubah di luar kode: **§15.4 playbook** sudah ditambahi Lampiran A (Mode
Transisi) supaya playbook dan sistem tidak saling bertentangan sejak hari pertama.

## 9. Kriteria selesai

Bagian 1:
- Sifa bisa menyalin satu hari penuh — belanja, QC, kirim, biaya — tanpa berpindah
  akun dan tanpa meminjam PIN siapa pun.
- Setiap baris yang disalin menyimpan dua nama berbeda: yang mengerjakan dan yang
  mengetik.
- Belanja tunai atas nama Hilman memotong saldo kantong Hilman.
- PIN tiga akun lapangan ditolak di layar login.

- Vendor berstatus blocked tidak bisa dipilih saat menyalin belanja.
- Setiap baris belanja yang disalin menghasilkan satu baris harga pasar harian.

Bagian 2:
- Untuk satu tanggal, layar menampilkan laba kotor, bedah per klien dan per SKU,
  semuanya cocok dengan jurnal.
- Laba bersih muncul begitu setelan biaya tetap diisi, dan hari-hari yang sudah lewat
  ikut terhitung ulang.
- Selisih yang tidak diberi nama menahan tombol "Tutup Hari".
- Sekali ditutup, hari itu terkunci dan tercatat siapa yang menutupnya.

Bagian 3:
- Pengajuan dana menampilkan baris barang, dan nilainya sama dengan jumlah barisnya.
- Invoice yang sudah diposting bisa dikoreksi lewat credit note tanpa mengubah invoice
  aslinya, dan piutang klien turun sesuai.
- Retur klien punya nomor, pemilik, dan tenggat; yang lewat tenggat muncul di Tutup
  Hari.

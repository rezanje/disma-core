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

Tabel `users` sekarang cuma punya empat kolom (`id, name, role, pin`) — belum ada
penanda aktif/non-aktif. Jadi butuh satu kolom baru `is_active` (standar: aktif) dan
layar login menolak PIN milik akun non-aktif. Mengosongkan PIN-nya saja bukan pilihan:
PIN-nya hilang dan tidak bisa dipulihkan waktu mereka mulai dipakai nanti.

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

## 5. Yang sengaja TIDAK dibangun

- **Layar input harian baru.** Volume di bawah 40 baris sehari; layar yang ada cukup.
  Dibangun kalau volume naik ke ratusan baris.
- **Aplikasi HP untuk tim lapangan.** Mereka belum siap; memaksakannya adalah cara
  tercepat membuat sistem ditinggalkan.
- **Batas harga beli otomatis untuk sourcing.** Butuh data harga beli asli beberapa
  minggu dulu; kalau dipasang sekarang angkanya mengarang. Menyusul setelah Tutup
  Hari jalan sebulan.
- **Tanda tangan digital untuk serah terima.** Tanda tangannya ada di kertas.

## 6. Risiko dan penanganannya

| Risiko | Penanganan |
|---|---|
| Kertas hilang sebelum disalin | Foto wajib, dikirim WA hari itu juga |
| Penyalin sakit / cuti | Dua orang punya akses (Bagus dan Sifa), bukan satu |
| Salah ketik saat menyalin | Urutan kolom kertas = urutan kolom layar; blok rekonsiliasi menangkap selisih yang tidak masuk akal |
| Ritual tutup hari tidak dijalankan | Layar terisi 90% otomatis; manusia cuma memberi nama ke selisih |
| Angka lapis 2 meleset karena biaya tetap ditebak | Setelan bisa diubah kapan saja dan laporan lama ikut terhitung ulang |

## 7. Urutan pengerjaan

**Bagian 1 dulu, Bagian 2 menyusul.** Tanpa Bagian 1 tidak ada data yang masuk, dan
Tutup Hari cuma akan menampilkan angka nol.

## 8. Kriteria selesai

Bagian 1:
- Sifa bisa menyalin satu hari penuh — belanja, QC, kirim, biaya — tanpa berpindah
  akun dan tanpa meminjam PIN siapa pun.
- Setiap baris yang disalin menyimpan dua nama berbeda: yang mengerjakan dan yang
  mengetik.
- Belanja tunai atas nama Hilman memotong saldo kantong Hilman.
- PIN tiga akun lapangan ditolak di layar login.

Bagian 2:
- Untuk satu tanggal, layar menampilkan laba kotor, laba bersih, bedah per klien dan
  per SKU, semuanya cocok dengan jurnal.
- Selisih yang tidak diberi nama menahan tombol "Tutup Hari".
- Sekali ditutup, hari itu terkunci dan tercatat siapa yang menutupnya.

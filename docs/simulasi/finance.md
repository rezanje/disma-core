# Simulasi Peran: Finance

Instruksi untuk agen AI yang menguji aplikasi DISMA CORE sebagai Finance.
Tujuannya menemukan **kesalahan dan bagian yang bolong**, bukan sekadar
membuktikan aplikasinya jalan.

Peran ini yang memegang uang. Kesalahan di sini berarti angka rupiah yang salah,
bukan sekadar tampilan yang kurang enak. Perlakukan setiap selisih sebagai
temuan berat sampai terbukti sebaliknya.

---

## 1. Siapa kamu

Kamu **Sifa, Admin Finance**. Kamu yang memeriksa laporan belanja, mencairkan
dana, mengesahkan pengiriman jadi tagihan, menerima pembayaran klien, dan
membayar vendor. Kamu **tidak** membuat pesanan, tidak belanja, dan tidak
mengantar.

**Alamat aplikasi:** `http://localhost:3000` (atau URL yang diberikan)
**PIN masuk:** `<MINTA KE PEMILIK — sengaja tidak ditulis di sini karena repo ini publik>`

### Menu yang terbuka untukmu

| Menu | Isinya |
|---|---|
| Dashboard Finance | ringkasan |
| Approvals | 4 tab: rekonsiliasi belanja, audit online, audit operasional, audit pengiriman |
| Pencairan Dana | mencairkan pengajuan |
| Kas & Bank | saldo, mutasi, transfer antar rekening |
| Invoices | menerima pembayaran klien |
| AR Aging | umur piutang |
| AP Aging | utang ke vendor + membayarnya |
| Rekonsiliasi | pencocokan |
| Reimbursement | penggantian talangan |
| Online Purchase | belanja online |
| Buku Besar | jurnal |
| Laporan | laporan keuangan |
| Budget | anggaran |
| Audit | jejak audit |
| Sourcing Monitor | pantau sesi belanja |
| Tukar Faktur | tagihan gabungan |
| Asset Audit, Dokumen, Price Lists, Tasks | pendukung |

---

## 2. Aturan main

1. **JANGAN menekan tombol merah "Bersihkan Data Transaksi"** di pojok kanan
   bawah. Tombol itu menghapus seluruh data transaksi.
2. **Jangan menghapus klien, produk, atau vendor.** Ketiganya data asli. Data
   transaksi adalah data percobaan dan aman dibuat sebanyak-banyaknya.
3. **Catat angka sebelum dan sesudah setiap tindakan yang menyentuh uang.**
   Saldo bank, total piutang, total utang. Tanpa angka sebelum, kamu tidak bisa
   membuktikan angka sesudah itu benar.
4. Kalau sesuatu tidak sesuai bagian "Yang harus terjadi", catat lalu lanjut.
   Jangan berhenti di temuan pertama.
5. Kalau sebuah langkah mustahil dilakukan karena menunya tidak ada, itu juga
   temuan — catat sebagai **bolong**.

---

## 3. Skenario

### F1 — Mengesahkan pengiriman jadi tagihan

Ini titik paling penting di seluruh aplikasi: di sinilah penjualan diakui.

**Langkah**
1. Buka **Approvals** → tab **Audit Pengiriman**.
2. Catat dulu: saldo persediaan, total piutang, dan stok salah satu barang yang
   terlibat.
3. Sahkan satu pengiriman.

**Yang harus terjadi**
- Invoice terbit untuk klien itu.
- Jurnal bertambah dua pasang:
  - Piutang bertambah, Pendapatan bertambah, **sebesar nilai jual**.
  - HPP bertambah, Persediaan berkurang, **sebesar nilai beli** — bukan nilai jual.
- Stok barang **berkurang** sebanyak yang dikirim.
- Status PO maju.

**Periksa**
- Sahkan **dua kali** pengiriman yang sama. Tagihan **tidak boleh** terbit dua kali.
- Apakah nilai HPP masuk akal dibanding harga belinya? Kalau barang itu tidak
  punya catatan pembelian, sistem memakai harga dasar produk sebagai pengganti —
  periksa apakah angkanya jauh meleset. Ini titik rawan yang sudah diketahui.
- Untuk pengiriman yang jumlahnya dikurangi kurir saat serah terima, apakah yang
  ditagih **jumlah yang diterima klien**, bukan jumlah pesanan?

---

### F2 — Rekonsiliasi laporan belanja sourcing

**Langkah**
1. Buka **Approvals** → tab **Rekonsiliasi**.
2. Catat saldo rekening sumber sebelum tindakan.
3. Proses satu laporan belanja: bandingkan anggaran, realisasi, dan kembalian.

**Yang harus terjadi**
- Selisih dihitung benar: anggaran − belanja − biaya operasional = kembalian.
- Kalau realisasi **melebihi** anggaran, itu menjadi selisih lebih, **bukan**
  utang ke karyawan.
- Saldo bank berubah persis sebesar uang yang benar-benar bergerak.

**Periksa**
- Coba proses laporan dengan kembalian **lebih besar** dari yang seharusnya.
  Apakah ditolak atau diterima diam-diam?
- Apakah barang yang dibeli lewat vendor atau kiriman langsung ke klien **ikut**
  terhitung di laporan belanja pasar? Seharusnya **tidak** — keduanya dibayar
  lewat jalur lain, dan menghitungnya dua kali berarti uang keluar dobel.

---

### F3 — Audit belanja online

**Langkah**
1. Buka **Approvals** → tab **Audit Online**, atau menu **Online Purchase**.
2. Konfirmasi satu pesanan online.

**Yang harus terjadi**
- Uang keluar dari rekening yang dipilih, tercatat di Kas & Bank.
- Barang masuk antrean gudang setelah dikonfirmasi, bukan sebelumnya.

**Periksa**
- Apakah barang online bisa masuk gudang tanpa dikonfirmasi Finance dulu?
  Kalau bisa, itu temuan berat — barang diterima tanpa ada bukti pembayaran.

---

### F4 — Pengajuan dana dan reimbursement

**Langkah**
1. Buka **Approvals** → tab **Audit Operasional**.
2. Setujui satu pengajuan, tolak satu yang lain.
3. Buka **Reimbursement**, bayar satu penggantian.

**Yang harus terjadi**
- Yang ditolak **tidak** menggerakkan uang sama sekali.
- Yang disetujui mengurangi saldo rekening sumber, dan tercatat sebagai beban
  dengan jenis yang sesuai.
- Alasan penolakan tersimpan dan bisa dibaca lagi.

**Periksa**
- Apakah bisa menyetujui pengajuan **tanpa mengisi catatan**? Kalau bisa, jejak
  auditnya kosong.
- Apakah pengajuan yang sudah diproses bisa diproses ulang?

---

### F5 — Pencairan dana

**Langkah**
1. Buka **Pencairan Dana**.
2. Cairkan satu pengajuan dari rekening biasa.
3. Ulangi dari rekening yang ditandai butuh persetujuan CFO.

**Yang harus terjadi**
- Pencairan dari rekening biasa langsung jalan.
- Pencairan dari rekening strategis **berhenti dan minta persetujuan CFO** lebih
  dulu. Kalau uangnya keluar tanpa persetujuan, itu temuan berat.
- Saldo berkurang persis sebesar yang dicairkan.

**Periksa**
- Coba cairkan lebih besar dari saldo yang ada. Ditolak atau saldonya jadi minus?
- Coba cairkan pengajuan yang sama dua kali.

---

### F6 — Menerima pembayaran klien

**Langkah**
1. Buka **AR Aging**, catat total piutang.
2. Buka **Invoices**, pilih tagihan yang belum lunas.
3. Catat pembayaran **sebagian** dulu, lalu sisanya.

**Yang harus terjadi**
- Bank bertambah, piutang berkurang, sebesar yang dibayar.
- Status berubah Belum Bayar → Sebagian → Lunas.
- Total di AR Aging ikut turun sesuai.

**Periksa**
- Coba catat pembayaran **melebihi** sisa tagihan. Ditolak, atau piutangnya jadi
  minus?
- Apakah tanggal jatuh tempo yang dipakai AR Aging sudah yang dihitung dari
  Tukar Faktur, bukan dari tanggal invoice? Ini yang menentukan tagihan itu
  dianggap telat atau belum.

---

### F7 — Membayar vendor

**Langkah**
1. Buka **AP Aging**, catat total utang.
2. Bayar satu tagihan vendor sebagian, lalu lunasi.

**Yang harus terjadi**
- Bank berkurang, utang vendor berkurang, sebesar yang dibayar.
- Status tagihan vendor berubah sesuai.

**Periksa**
- Apakah tagihan vendor dari barang **Tempo** muncul di sini secara otomatis
  setelah barangnya diterima? Kalau tidak muncul, ada utang yang tidak tercatat.
- Barang **kiriman vendor langsung ke klien** juga menimbulkan kewajiban. Periksa
  apakah muncul di AP Aging (kalau Tempo) atau sebagai uang keluar (kalau
  Transfer). Kalau tidak keduanya, vendor tidak akan pernah dibayar.

---

### F8 — Kas, bank, dan transfer

**Langkah**
1. Buka **Kas & Bank**, catat saldo semua rekening.
2. Transfer antar rekening biasa.
3. Ulangi dari rekening yang butuh persetujuan CFO.

**Yang harus terjadi**
- Total seluruh saldo **tidak berubah** setelah transfer antar rekening — hanya
  berpindah.
- Transfer keluar dari rekening strategis minta persetujuan CFO dulu.

**Periksa**
- Transfer dengan nominal `0` atau negatif — ditolak?
- Transfer ke rekening yang sama dengan sumbernya — ditolak?

---

### F9 — Buku besar dan laporan

**Langkah**
1. Buka **Buku Besar**, telusuri jurnal dari tindakan-tindakan di atas.
2. Buka **Laporan**, lihat Laba Rugi dan Neraca.

**Yang harus terjadi**
- **Setiap jurnal seimbang**: total debit = total kredit. Tidak ada satu pun
  yang timpang.
- Neraca seimbang: Aset = Kewajiban + Modal.
- Tiap tindakan di skenario sebelumnya punya jejak jurnalnya, tidak ada yang
  hilang.

**Periksa — ini bagian paling berharga**
- **Akun 2-1100 (penampung sementara utang barang)** seharusnya kembali nol
  untuk barang yang siklusnya sudah tuntas. Isinya bertambah saat barang
  diterima, dan hilang saat vendornya dibayar. Kalau ada saldo menggantung untuk
  barang yang sudah lama dibayar, catat nomor referensinya — artinya ada
  pembayaran yang tidak menutup kewajibannya.
- **Persediaan** tidak boleh ikut bergerak untuk barang **kiriman langsung ke
  klien** — barang itu tidak pernah masuk gudang. Biayanya harus langsung jadi
  HPP.
- Bandingkan **total pendapatan** di Laporan dengan **total invoice** yang
  terbit. Kalau beda, cari selisihnya di mana.

---

## 4. Hal yang sudah diketahui — periksa dampaknya

1. **Menu Purchase Request tidak bisa kamu buka sama sekali.** Halamannya punya
   tombol Setujui/Tolak khusus Finance, tapi peran Finance diblokir dua kali:
   tidak ada di daftar menunya, dan halamannya menolak peran ini. Praktisnya
   **hanya CEO atau Super Admin yang bisa menyetujui pengajuan dana belanja**.
   Coba buka `/admin/purchase-requests` langsung lewat alamat — laporkan apa yang
   terjadi. Kalau memang Finance yang seharusnya menyetujui, ini bolong besar.
2. **HPP memakai harga dasar produk sebagai pengganti** kalau barangnya tidak
   punya catatan pembelian. Nilai laba jadi ikut meleset. Periksa seberapa jauh.
3. **Alamat klien kosong** hampir di semua klien. Periksa apa yang tercetak di
   invoice.

---

## 5. Cara melaporkan temuan

Satu temuan satu blok. Jangan digabung. Untuk apa pun yang menyentuh uang,
**sertakan angkanya**.

```
### [Berat / Sedang / Ringan] Judul singkat

**Di mana:** menu / layar / tombol
**Langkahnya:** 1... 2... 3...
**Angka sebelum:** saldo / total piutang / total utang
**Angka sesudah:** ...
**Yang terjadi:** apa yang benar-benar muncul
**Yang seharusnya:** menurut dokumen ini, atau menurut akal sehat akuntansi
**Dampak:** berapa rupiah yang salah, dan siapa yang dirugikan
```

Ukuran tingkat keparahan:

- **Berat** — angka rupiah salah, uang keluar tanpa persetujuan, jurnal tidak
  seimbang, tagihan atau utang hilang, atau sesuatu terbit dua kali.
- **Sedang** — angkanya benar tapi jejaknya kabur, atau butuh akal-akalan.
- **Ringan** — mengganggu tapi tidak berbahaya.

Di akhir, tuliskan **apa yang tidak sempat kamu uji dan kenapa**. Bagian yang
tidak teruji sama pentingnya dengan bagian yang gagal.

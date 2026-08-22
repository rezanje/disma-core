# Satu Alur Belanja — Rancangan

Tanggal: 22 Agustus 2026
Status: **dibangun 22 Agustus 2026** — Reza menjawab "gas", ketiga keputusan diambil sesuai saran

---

## 1. Masalahnya

Satu kali belanja pasar sekarang melahirkan **lima catatan angka yang berbeda**, dan
kelimanya harus cocok satu sama lain tanpa ada yang mengawasi:

| # | Objek | Angkanya | Dibuat oleh | Layar |
|---|---|---|---|---|
| 1 | `purchases.budgetAmount` | rencana kebutuhan tunai | Admin PO (compile) → ditimpa Finance (lepas rencana) | Shopping List → Rencana Pembelian |
| 2 | `purchase_requests.amount` | pengajuan dana | Admin PO ("Kirim ke Finance") | Purchase Requests |
| 3 | `disbursement_requests.amount` | uang yang dipindah antar rekening | Finance | Disbursement |
| 4 | saldo kantong (BankAccount `sourcing_pocket`) | uang yang benar-benar dipegang | otomatis dari mutasi | Cash & Bank / Pantau Sourcing |
| 5 | `purchases.actualSpent` + `reconciliationStatus` | belanja sebenarnya + verifikasinya | Sourcing (salin) → Finance (verifikasi) | Sourcing → Finance Hub |

Kelimanya menggambarkan **satu kejadian yang sama**: uang keluar buat belanja hari itu.
Bahasa lapangan cuma punya empat kata untuk itu — *rencananya berapa, duitnya keluar,
belanjanya berapa, sisanya balik*.

Akibat yang sudah terbukti hari ini (22 Agu): PR terbit Rp0 selama berminggu-minggu dan
tidak ada yang sadar, karena angka #2 tidak pernah dibandingkan dengan angka #1.

## 2. Prinsipnya

**Satu dokumen belanja, satu angka, empat cap waktu.** Dokumen belanja (`purchases`)
yang sudah ada jadi satu-satunya objek. Yang berubah cuma keadaannya:

```
Menunggu Rencana → Direncanakan → Dicairkan → Dibelanjakan → Ditutup
```

- **Direncanakan** — Finance menentukan vendor/jalur/cara bayar. `cashNeeded()` keluar:
  itulah angkanya. Satu-satunya.
- **Dicairkan** — Finance memindahkan uang ke kantong orang yang belanja, dari layar yang
  sama. Jurnalnya tetap ditulis seperti sekarang (Dr kantong / Cr bank), tapi tidak ada
  dokumen kedua yang harus disetujui manusia.
- **Dibelanjakan** — laporan disalin, kantong terpotong sesuai belanja nyata.
- **Ditutup** — sisa disetor balik, selisih harus dijelaskan.

## 3. Yang dihapus, yang tetap

**Dihapus:** PR khusus belanja sourcing, dan langkah "Kirim ke Finance" yang
membuatnya. Perencanaan Finance sudah menjadi persetujuannya — menyetujui dua kali untuk
keputusan yang sama cuma menambah tempat untuk lupa.

**Tetap ada:**
- **PR umum** (kategori non-sourcing: bayar vendor, beli aset, biaya lain). Itu memang
  pengajuan dari orang lain ke Finance dan tidak punya dokumen induk.
- **Gerbang CFO per rekening** (`bankRequiresCfoApproval`). Persetujuan kedua tetap ada,
  tapi menempel di **rekening sumbernya** — jadi berlaku di momen uang benar-benar
  pindah, bukan sebagai ritual terpisah.
- **Catatan siapa merencanakan / siapa mencairkan** — pindah ke dokumen belanjanya
  (`plannedBy`, `disbursedBy`, `disbursedAt`), bukan hilang.
- **`disbursement_requests`** tetap ditulis sebagai jejak mutasi kas untuk buku besar,
  tapi tidak lagi jadi antrean yang harus dibuka manusia untuk belanja pasar.

## 4. Keputusan yang diambil

1. **PR sourcing dihapus.** Tombol "Kirim ke Finance" beserta pembuatan PR-nya
   dihilangkan. Dokumen yang sudah dibuat otomatis muncul di Rencana Pembelian.
   PR umum (bayar vendor, aset, biaya lain) tidak disentuh.
2. **Cair boleh beda dari rencana, wajib alasan.** Harga pasar bergerak; yang dipaksa
   cuma keterangannya, supaya selisihnya bisa ditanyakan dan bukan berubah diam-diam.
3. **Dokumen yang sedang jalan dibiarkan selesai dengan cara lama.** ADV-20260822-001
   sudah punya PR; layar Rencana Pembelian tetap memperbarui nilai PR lama saat rencana
   dilepas, jadi tidak ada yang menggantung di tengah.

## 5. Risiko

- **Menyentuh jalur uang.** Bukan perubahan tampilan. Harus disimulasikan penuh sebelum
  dipakai: rencana → cair → belanja → tutup hari → verifikasi, plus jalur tempo dan
  transfer yang tidak menarik uang tunai sama sekali.
- **Laporan lama.** Layar yang membaca `purchase_requests` untuk belanja sourcing harus
  ikut diperiksa satu per satu (`admin/purchase-requests`, dashboard, Rekonsiliasi).
- **Perubahan ini tidak bisa setengah.** Kalau PR sourcing masih dibuat sebagian, kita
  balik lagi ke dua sistem paralel — pola yang sudah dua kali merugikan aplikasi ini.

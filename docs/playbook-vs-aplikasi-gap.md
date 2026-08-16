# Playbook vs Aplikasi — Apa yang Sudah Ada, Separuh, dan Belum

Dibanding: `docs/playbook-operasional-supply-chain-fnb.md` (v1.0, 16 Agu 2026)
terhadap kondisi aplikasi per 15 Agustus 2026.

---

## 0. Benturan utama yang harus diputuskan dulu

Playbook menulis di §15.4: **Bu Syifa dilarang sistem melakukan actual receiving/QC**,
dan Bagja dilarang posting stock. Itu prinsip pemisahan tugas yang benar — orang yang
memilih supplier tidak boleh juga yang menerima barang dan mencatat hutangnya.

Tapi keputusan operasional yang baru diambil justru sebaliknya: **tim lapangan pakai
kertas, Admin PO dan Finance yang menyalin semuanya.** Artinya Sifa akan mengetik hasil
QC dan penerimaan barang — persis yang dilarang playbook.

Ini bukan berarti keputusannya salah. Playbook sendiri sudah mengantisipasi di §1.1:

> "Karena tim masih ramping, beberapa fungsi digabung. **Kontrol kompensasi diperlukan**
> agar orang yang memilih supplier, menerima barang, mencatat hutang, dan membayar
> tidak mengendalikan seluruh transaksi sendiri."

Kontrol kompensasinya sudah ada di rancangan Mode Salin, dan cocok persis:

| Risiko karena tugas digabung | Kontrol kompensasi |
|---|---|
| Jejak menunjuk pengetik, bukan pelaku | Dua nama per baris: **dikerjakan oleh** vs **diinput oleh** |
| Angka bisa dikarang saat menyalin | **Foto kertas wajib** dilampirkan |
| Selisih tenggelam | Blok rekonsiliasi Tutup Hari menahan penutupan sampai selisih diberi nama |
| Satu orang pegang semua | Dua penyalin (Bagus + Sifa), bukan satu |

**Yang perlu diputuskan:** playbook §15.4 harus ditulis ulang jadi "mode transisi" —
akui bahwa penyalinan dilakukan Admin PO/Finance, dan sebutkan empat kontrol di atas
sebagai gantinya. Kalau tidak, playbook dan sistem saling bertentangan sejak hari
pertama.

**Catatan nama:** playbook memakai Pak Eren, Bu Syifa, Bagja, Arik, Ivan/Rifay.
Aplikasi memakai Bagus (Admin PO), Sifa (Finance), Hilman (Sourcing), Sandi (Gudang),
Rivai (Kurir) — dan rekening kantongnya malah bernama "KAS SOURCING (Bagja)" padahal
pemiliknya Hilman. Samakan dulu, kalau tidak dua dokumen ini bicara soal orang yang
berbeda.

---

## 1. Yang playbook minta — SUDAH ADA di aplikasi

| Playbook | Di aplikasi |
|---|---|
| Sales Order + Order Line | `sales_orders` + `sales_order_items` |
| Demand aggregation lintas PO | Shopping list menggabungkan banyak PO jadi satu dokumen belanja |
| Satu Purchase Batch memenuhi banyak order | Sudah: tiap baris belanja tetap menunjuk PO asalnya |
| Purchase Batch | `purchases` (dokumen belanja / ADV) |
| Incoming QC pass/partial/reject | Layar QC, sudah termasuk 3 tujuan barang reject |
| Hanya qty QC pass jadi stock | Sudah — dan sejak 15 Agu, qty pass benar-benar masuk hitungan stok |
| Received for QC ≠ accepted | Sudah: barang masuk dulu, keputusan kualitas terpisah |
| Delivery Order + POD | `deliveries` + tanda tangan + berita acara |
| Driver catat fakta, tidak memutuskan credit | Sudah: kurir hanya mengoreksi qty, keputusan di Finance |
| Invoice mengikuti qty diterima klien | Sudah: qty ditolak klien otomatis menurunkan tagihan |
| Tukar faktur milik Finance | Sudah, termasuk pembayaran per PO |
| AR aging + collection | Ada, dua layar |
| AP aging + pembayaran vendor | Ada, termasuk cicilan |
| Cash/bank + rekonsiliasi | Ada, 7 rekening + mutasi |
| Accounting: jurnal, HPP, P&L | Ada, double-entry, sudah diuji seimbang |
| Audit log: pelaku, waktu, nilai lama/baru | `record_history`, sudah jalan + bisa rollback |
| Tidak ada penghapusan transaksi final | Sebagian: ada undo/rollback, tapi belum ada credit note |
| Customer return + Return QC | Ada, 3 tujuan (masuk stok / dibuang / klaim vendor) |
| Supplier claim | `vendor_returns`, sudah punya status dan penyelesaian |
| Vendor master + term + tempo | `vendors` + `payment_term_days` + `is_tempo` |

**Kesimpulan bagian ini: tulang punggung playbook sudah berdiri.** Alur PO → belanja →
QC → kirim → tagih → lunas sudah jalan dan angkanya sudah terbukti nyambung.

---

## 2. SEPARUH ADA — jalan, tapi belum sesuai playbook

| Playbook minta | Kondisi sekarang | Kurangnya |
|---|---|---|
| **Purchase Requirement berisi SKU, qty, stok tersedia, buffer, need purchase** | `purchase_requests` cuma menyimpan **nominal uang** | PR tidak punya baris barang. Ini juga akar masalah nilai PR kelebihan yang ketemu saat simulasi |
| **Safety buffer** dalam rumus kebutuhan | Tidak ada | Kebutuhan = pesanan − stok, tanpa cadangan |
| **Supplier PO per vendor** | Yang ada dokumen belanja per batch, bukan per vendor | Tidak ada dokumen yang bisa dikirim/ditagihkan ke satu vendor |
| **Goods Receipt sebagai dokumen** | Hanya kolom di baris belanja (`inbound_*`) | Tidak ada nomor GR, tidak bisa dicetak/diarsip |
| **QC Report sebagai dokumen** | Hasil QC tersebar di baris belanja + pergerakan stok | Tidak ada nomor QC, tidak ada lembar hasil |
| **Inventory Lot + FEFO/FIFO** | Ada kolom batch & kadaluarsa, tapi tidak dipakai untuk memilih | Barang tidak dipilih berdasarkan yang paling dekat kadaluarsa |
| **Stock Allocation sebagai record** | Ada sebagai pergerakan stok | Tidak bisa dilihat/diubah sebagai daftar alokasi |
| **Delivery Issue bernomor, ber-SLA, ada root cause** | `pending_returns` + `rejected_items` | Tidak ada nomor, pemilik, tenggat, atau sebab akar |
| **Waste record + approval** | Ada pencatatan reject + jurnal kerugian | Tidak ada ambang nilai yang wajib disetujui |
| **Market price capture harian** | Tabel `vendor_prices` **ada tapi kosong** dan `weekly_price_range` di produk hampir kosong | Harga pasar harian tidak pernah dicatat — ini fondasi buat batas harga beli nanti |
| **Approved Vendor List (status approved/suspended/blocked)** | `vendors` tidak punya kolom status | Vendor bermasalah tidak bisa diblokir sistem |
| **Order Bundle: satu layar berisi seluruh riwayat satu order** | Informasinya ada, tapi tersebar di 6+ layar | Untuk menjawab "PO ini kenapa", harus buka banyak halaman |

---

## 3. BELUM ADA sama sekali

| Playbook minta | Dampak kalau tetap tidak ada |
|---|---|
| **Credit Note** | Kalau invoice sudah terbit lalu ada koreksi, tidak ada cara benar membatalkannya selain mengubah/menghapus — melanggar prinsip playbook sendiri (§2.2 #13) |
| **Supplier score / performance history** | Vendor yang sering telat atau sering reject tidak terlihat |
| **KPI: OTIF, fill rate, yield, waste rate, defect rate** | Tidak ada ukuran kualitas layanan sama sekali |
| **Pick list, packing, final QC sebagai tahap terpisah** | Tahap gudang sekarang loncat dari QC langsung ke barang keluar |
| **Alert & work queue** (PO mendekati cut-off, POD hilang, TF lewat cut-off, margin abnormal) | Semua ketahuan kalau ada yang ingat memeriksa |
| **Ambang nominal yang butuh approval** | Playbook §1.2 menyebut ini belum ditetapkan manajemen — sistem juga belum punya tempatnya |
| **Dashboard: margin per order/klien/SKU, cash due 7/14/30 hari** | Sebagian dijawab rancangan Tutup Hari; cash due belum |

---

## 4. Yang aplikasi punya tapi playbook belum sebut

Ini bukan kekurangan playbook — cuma perlu dimasukkan supaya dokumen dan sistem cocok:

- **Kantong uang per orang** (tarik dari Bank Jago → belanja tunai → sisa disetor).
  Ini inti kontrol uang belanja pasar dan playbook belum membahasnya sama sekali.
- **Skema 7 rekening** dengan fungsi berbeda (simpanan, operasional, belanja,
  penerimaan) dan **gerbang persetujuan CFO** untuk rekening strategis.
- **Tier harga klien** (Tier 1–5) sebagai dasar harga jual otomatis.
- **Belanja dropship** — vendor kirim langsung ke klien, barang tidak lewat gudang.
- **Backorder / Kurang Kirim** — sisa pesanan masuk ronde belanja berikutnya.
- **Tutup hari kantong** per orang sourcing.

---

## 5. Rekomendasi: mana yang dikerjakan, mana yang ditahan

Konteksnya penting: **di bawah 10 PO dan 40 baris per hari, dua orang pemakai.**
Playbook ditulis untuk organisasi yang lebih besar. Memaksakan seluruhnya sekarang
akan membuat sistem tidak terpakai — dan sistem yang tidak dipakai nilainya nol.

### Kerjakan (menutup lubang nyata)

| # | Item | Kenapa sekarang |
|---|---|---|
| 1 | **Mode Salin + Tutup Hari** (rancangan yang sudah disetujui) | Tanpa ini tidak ada data yang masuk sama sekali |
| 2 | **PR berisi baris barang** (SKU, qty, stok, buffer, need) | Menutup akar masalah nilai pengajuan dana, dan syarat semua hitungan kebutuhan |
| 3 | **Credit Note** | Satu-satunya cara benar mengoreksi tagihan yang sudah terbit |
| 4 | **Status vendor** (approved / suspended / blocked) | Satu kolom, langsung bisa memblokir vendor bermasalah |
| 5 | **Catat harga pasar harian** (tabelnya sudah ada, tinggal dipakai) | Fondasi batas harga beli. Tanpa data ini, guardrail nanti mengarang |
| 6 | **Delivery Issue bernomor + pemilik + tenggat** | Retur klien sekarang tidak ada yang mengejar |

### Tahan dulu

| Item | Kenapa ditahan |
|---|---|
| Lot + FEFO/FIFO | Barang segar habis dalam sehari; umur lot belum jadi masalah |
| Pick list, packing, final QC terpisah | Menambah 3 tahap ketik untuk gudang yang tidak memakai aplikasi |
| Supplier score otomatis | Butuh riwayat beberapa bulan dulu |
| KPI OTIF / fill rate | Perlu baseline; playbook §1.2 sendiri bilang target belum ditetapkan |
| 17 status Sales Order | Sekarang 11 status sudah cukup; menambah status = menambah tempat nyangkut |
| Order Bundle satu layar | Nilainya besar tapi pekerjaannya besar. Setelah Tutup Hari jalan |
| Ambang approval nominal | Playbook §1.2: angkanya belum diputuskan manajemen. Putuskan dulu, baru dipasang |

---

## 6. Yang perlu keputusan lo (playbook §1.2 juga menyebutnya)

Angka-angka ini belum ditetapkan dan sistem tidak bisa menebaknya:

1. Batas nominal pengajuan dana yang wajib approval siapa.
2. Toleransi selisih harga pasar terhadap harga patokan — berapa persen sebelum ditolak.
3. Toleransi susut (shortage/yield) per jenis barang.
4. Berapa hari kerja sebulan, untuk membagi biaya tetap ke laba harian.
5. Daftar biaya tetap bulanan (gaji, sewa, listrik, internet) beserta nominalnya.
6. Jadwal cut-off tukar faktur per klien.

Nomor 4 dan 5 memblokir lapis "laba bersih" di Tutup Hari — tanpa itu cuma laba kotor
yang bisa ditampilkan.

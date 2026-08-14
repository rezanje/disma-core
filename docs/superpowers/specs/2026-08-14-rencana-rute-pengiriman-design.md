# Rencana rute pengiriman harian

Tanggal: 2026-08-14
Status: disetujui untuk direncanakan

## Masalah

Admin PO membagi tugas antar kurir setiap hari kirim, dan pembagian itu tidak
ada di sistem sama sekali. Hari ini `Delivery.courierId` baru terisi saat serah
terima di gudang, oleh siapa pun kurir yang kebetulan login — jadi kurirnya
memilih sendiri, bukan ditugaskan. Pembagian yang sebenarnya hidup di luar
aplikasi.

Yang paling menyulitkan Admin PO bukan mencatat pembagiannya, melainkan
**melihat sebaran klien** — tanpa gambaran siapa dekat siapa, pembagian jadi
tebakan.

## Kenyataan yang membatasi rancangan

Aplikasi tidak tahu lokasi klien mana pun. Dari 205 klien, **204 kolom
alamatnya kosong**; satu-satunya yang terisi adalah baris uji coba. Nomor
telepon juga kosong. Jadi tidak ada apa pun untuk dipetakan hari ini, dan
menebak koordinat dari teks alamat tidak mungkin karena teksnya tidak ada.

Keputusan pemilik: lokasi diisi sambil jalan, fiturnya disiapkan lebih dulu.
Konsekuensinya rancangan ini **harus tetap berguna saat sebagian besar klien
belum punya titik**, bukan menunggu data lengkap.

## Keputusan yang sudah diambil

1. **Peta gratis** — OpenStreetMap, bukan Google Maps. Tanpa akun berbayar,
   tanpa kunci API, tanpa kartu kredit. Pindah ke Google nanti tetap mungkin.
2. **Pengisian lokasi bertahap** — dua jalur pengisian disiapkan, tidak ada
   kerja borongan di awal.
3. **Urutan mampir diatur manual** — digeser sendiri. Tidak ada saran otomatis
   dan tidak ada perhitungan jalur jalan; keduanya ditolak sebagai berlebihan
   untuk sekarang.

## Rancangan

### 1. Lokasi klien

Tambahkan pada data klien: koordinat (lintang, bujur) dan satu catatan patokan
bebas — "gang sebelah Indomaret, pagar hijau". Patokan sering lebih berguna
daripada koordinat presisi di gang sempit.

Dua jalur pengisian, keduanya dibuat:

- **Kurir, dari lapangan.** Di layar pengiriman miliknya, tombol "Simpan Titik
  Ini" merekam GPS perangkat saat dia berada di lokasi. Ini sumber paling
  akurat karena diambil di depan pintu, dan tidak menambah pekerjaan siapa pun.
- **Admin PO, dari meja.** Di peta, cari klien berdasarkan nama lewat pencarian
  Nominatim (gratis, bagian dari OpenStreetMap), klik untuk memasang pin, geser
  bila meleset. Nama klien di basis data berbentuk merek dan cabang — "HOLYCOW
  BY CHEF AFIT - KEBON JERUK" — jadi pencarian nama lebih cepat daripada
  mengetik alamat.

Titik yang direkam kurir menimpa pin manual: yang berdiri di lokasi lebih tahu
daripada yang menebak dari peta.

### 2. Layar rencana rute (Admin PO)

Pilih tanggal kirim. Semua sales order dengan `targetDeliveryDate` hari itu
muncul.

- **Peta** menampilkan satu pin per klien, diwarnai menurut kurir yang
  ditugaskan; abu-abu berarti belum ditugaskan.
- **Panel kurir** di samping berisi satu kolom per kurir: daftar perhentiannya,
  berurutan, bisa digeser untuk menyusun ulang. Jumlah perhentian terlihat di
  kepala kolom sehingga beban yang timpang langsung ketahuan.
- **Menugaskan** dilakukan dengan mengklik pin atau baris, lalu memilih kurir.
  Satu klien bisa punya lebih dari satu PO di hari yang sama; keduanya jatuh ke
  kurir yang sama karena alamatnya satu.
- **Klien tanpa titik** muncul di daftar terpisah di bawah peta, tetap bisa
  ditugaskan dan diurutkan, hanya tidak tergambar. Ini yang membuat layar ini
  berguna sejak hari pertama.

Penugasan disimpan di sales order (`assignedCourierId`, `routeOrder`), bukan di
`Delivery`. Baris `Delivery` baru lahir saat gudang merilis barang, yang bisa
terjadi setelah Admin PO menyusun rencana — menyimpannya di sales order membuat
rencana tidak bergantung pada urutan itu.

### 3. Sisi kurir

Layar pengiriman kurir hanya menampilkan tugasnya sendiri, dalam urutan yang
disusun Admin PO. Sekarang setiap kurir melihat semua pengiriman.

Tiap perhentian punya tautan "Buka di Google Maps" yang melempar ke aplikasi
peta di ponselnya. Ini tautan biasa, bukan layanan berbayar — kurir tetap
memakai navigasi yang sudah dia kenal.

Serah terima di gudang tetap seperti sekarang, tetapi kurir yang mengambil
pengiriman bukan jatahnya mendapat peringatan lebih dulu.

## Yang tidak dikerjakan

- Penyusunan urutan otomatis dan perhitungan jalur jalan sebenarnya.
- Pelacakan posisi kurir secara langsung.
- Peta di dalam aplikasi untuk kurir — mereka memakai aplikasi peta ponsel.
- Pengisian alamat teks massal. Kolom alamat dibiarkan seperti adanya;
  koordinat dan patokan yang dipakai fitur ini.

## Yang perlu diperhatikan saat mengerjakan

- Peta memerlukan pustaka baru (Leaflet). Tidak ada pustaka peta di proyek ini
  dan peta interaktif bukan sesuatu yang masuk akal ditulis sendiri. Pilih yang
  ringan, muat hanya di sisi klien — komponen peta harus dimuat dinamis tanpa
  render di server, karena Leaflet menyentuh `window` saat diimpor.
- Perekaman GPS memerlukan izin lokasi dan koneksi aman. Produksi memakai HTTPS
  dan localhost dianggap aman, jadi keduanya sudah memenuhi syarat. Tangani
  penolakan izin dengan pesan yang jelas, bukan diam.
- Pencarian Nominatim memiliki batas satu permintaan per detik dan mewajibkan
  identitas pemanggil. Panggil dari sisi peladen agar batasnya terkendali, dan
  beri jeda pada ketikan pengguna.
- `Delivery` dibuat di gudang dengan `courierId: 'pending'`. Tempat itu harus
  mewarisi `assignedCourierId` dari sales order-nya.
- Serah terima menimpa `courierId` dengan pengguna yang sedang masuk. Perilaku
  itu dipertahankan — kenyataan di lapangan menang atas rencana — tetapi
  tampilkan peringatan bila berbeda dari yang direncanakan.

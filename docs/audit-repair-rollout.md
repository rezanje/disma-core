# Penerapan perbaikan DISMA — 16 Oktober 2026

Perbaikan mempertahankan aplikasi dan dokumen lama. Sembilan migrasi telah diterapkan dan aplikasi diaktifkan di production pada 16 Oktober 2026 setelah pengguna mengizinkan push dan deploy. Catatan penerapan dan batas verifikasi live ada di [audit-repair-deployment.md](audit-repair-deployment.md). Bukti uji transaksi berasal dari PostgreSQL terpisah tanpa jaringan dan tanpa port host.

## Cara kerja setelah penerapan

Admin PO mengelola pesanan, konsolidasi kebutuhan, dokumen lapangan, penerimaan/QC, packing dan hasil pengiriman. Finance mengelola rencana vendor, salinan pembelian/biaya, dana, utang, invoice, tukar faktur serta pembayaran. Super Admin mengelola pengguna, master, koreksi sumber, opname dan cadangan.

Nama pelaksana lapangan tetap dapat dipilih tanpa akun aplikasi. Salinan kertas mencatat waktu kejadian dan pelaksana; server mencatat siapa yang memasukkan dan kapan. Biaya talangan memilih penerima penggantian secara terpisah.

- Pembayaran klien dapat dicicil dan dialokasikan ke beberapa invoice. Identitas pembayaran tetap digunakan saat mencoba ulang setelah respons terputus.
- Barang vendor yang dipesan belum menjadi stok. Penerimaan, QC, alokasi, packing, keluar, penerimaan klien dan audit invoice mengikuti dokumen sumber.
- Rincian dan identitas klien pada dokumen baru dibekukan per ronde. Invoice yang belum diaudit berstatus Draft.
- Transfer vendor melalui QC oleh Admin PO meninggalkan sisa utang untuk Finance. Uang muka yang benar-benar sudah dibayar diperhitungkan dari sumbernya; pencatatan barang tidak memberikan hak pengeluaran kas kepada Admin PO.
- Retur memisahkan pemeriksaan barang, pengganti/pembatalan, koreksi invoice dan refund. Invoice yang telah dibayar dapat menimbulkan utang refund klien; penerimaan uang sebelumnya tetap tercatat.
- Koreksi pembayaran oleh Super Admin membuat transaksi pembalik, mempertahankan sumber, kas, jurnal dan riwayat. Menghapus satu baris pembayaran/jurnal tidak diperbolehkan.
- Rekonsiliasi bank menyimpan rekening koran dan pasangan jurnal di server. Satu baris jurnal tidak dapat dipakai dua kali.
- Laba resmi berasal dari jurnal yang diposting. Estimasi biaya tetap ditampilkan terpisah.

## Sebelum menerapkan

1. Tetapkan jendela penerapan dan hentikan pencatatan oleh pengguna.
2. Ambil cadangan database lengkap melalui fasilitas database yang berlaku, termasuk skema dan data. Simpan berkas bukti di tempat privat. Ekspor lama yang tidak memiliki manifest lengkap tidak dipakai untuk restore baru.
3. Jalankan pemeriksaan berikut pada target dengan akses administrator; keluaran tidak perlu memuat PIN:

```sql
-- Hasil yang diharapkan: 0 kelompok PIN kantor aktif yang sama.
select count(*) as duplicate_active_office_pins from (
 select pin from public.users
 where role in ('admin_po','finance','super_admin') and is_active=true
 group by pin having count(*)>1
) d;

-- Setiap kode akun yang digunakan transaksi harus memiliki tepat satu baris.
select account_code,count(*) from public.coas group by account_code having count(*)>1;

-- Setiap kas/bank harus menunjuk akun kas atau kantong yang tersedia.
select b.id,b.name from public.bank_accounts b
where b.account_code is null or b.account_code !~ '^1-1[0-9]{3}$'
 or (select count(*) from public.coas c where c.account_code=b.account_code)<>1;
```

Duplikasi PIN menghentikan migrasi005. Jangan mengganti identitas, PIN atau kode akun secara massal; selesaikan setiap konflik dengan pemilik akses dan bukti transaksi. Ganti PIN bawaan/diketahui sebelum mengaktifkan layanan.

## Konfigurasi dan urutan

- Siapkan `AUTH_SESSION_SECRET` privat minimal32byte dan `AUTH_APP_ORIGIN` yang sama persis dengan origin aplikasi. Petunjuk lengkap ada di [server-auth.md](server-auth.md).
- Pastikan profil Supabase menunjuk target yang benar; service-role key hanya tersedia di server.
- Sediakan bucket `checkpoints` **privat** untuk cadangan server. API menolak bucket publik dan tidak membuat bucket otomatis.
- Terapkan migrasi baru `20261016000001` sampai `20261016000009` berurutan, bersama kode aplikasi dalam jendela penerapan. Migrasi007 mendefinisikan daftar tabel yang juga mencakup008/009; fitur cadangan baru siap sesudah seluruh migrasi selesai.
- Jangan menjalankan ulang seluruh baseline skema pada database yang sudah berisi data. Rantai lengkap digunakan hanya untuk membangun database uji baru.
- Aktifkan versi aplikasi dan konfirmasikan pencatatan memakai API sesi baru. Browser dengan versi lama tidak boleh dipakai: API jurnal/kas mentah sudah dihentikan dan fungsi RPC publik dibatasi.
- Reset destruktif tetap ditolak pada production. Fitur reset fixture memerlukan konfigurasi khusus nonproduction dan konfirmasi eksplisit; bukan jalur koreksi transaksi.

## Verifikasi setelah penerapan

Gunakan akun pengujian dan database staging yang sesuai, lalu lakukan skenario penerimaan yang sama dengan fixture di `tests/`. Sebelum membuka transaksi sungguhan, periksa login ketiga peran, penolakan tanpa sesi/Origin asing, alur PO–lunas, cicilan, pembayaran vendor, retur/refund dan pencetakan ulang setelah perubahan master. Bandingkan kas, utang, piutang, stok serta jurnal. Kode lokal dan uji SQL tidak membuktikan interaksi browser atau keberhasilan di situs online.

Dokumen lama tanpa snapshot diberi keterangan bukti historis; sistem tidak menciptakan rincian seolah sudah diverifikasi. TF lama yang berupa invoice ringkasan dan invoice pengganti harus dipetakan ke sumber dan jurnalnya sebelum menerima pembayaran, untuk mencegah pencatatan ganda. Transaksi lama tanpa identitas kejadian yang dapat diverifikasi memerlukan rekonsiliasi dokumen sebelum pembalikan.

Jika penerapan gagal, pertahankan jendela pemeliharaan. Jangan mengaktifkan kembali aplikasi lama sementara RPC/aturan skema baru belum sesuai. Pulihkan database dan versi aplikasi sebagai satu pasangan dari cadangan yang telah diverifikasi; jangan menghapus jurnal atau riwayat untuk membuat layar terlihat cocok.

## Menjalankan pemeriksaan lokal

```bash
npm test
npx tsc --noEmit
npm run test:database
```

`test:database` hanya menerima container fixture bernama `disma-repair-tests-20261016` dengan `--network none` dan tanpa port host. Runner membuat database baru, menerapkan seluruh migrasi, menjalankan fixture rollback dan pengujian bersamaan, lalu menghapus database uji tersebut. Runner tidak membaca connection string aplikasi atau menghubungi Supabase yang terhubung.

Build diverifikasi dengan profil dan kredensial dummy. Pada lingkungan proxy ini unduhan font memerlukan `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1`; verifikasi TLS tetap aktif.

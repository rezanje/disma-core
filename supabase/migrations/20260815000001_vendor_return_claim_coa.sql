-- Akun untuk tagihan ke vendor atas barang yang diretur.
--
-- Sebelumnya retur ke supplier saat QC dibalik ke 2-1100 (Hutang Akrual). Nilainya
-- benar, tapi tempatnya salah: untuk belanja tunai uangnya sudah keluar, jadi yang
-- tersisa adalah tagihan KE vendor — bukan hutang KITA. Hasilnya saldo debit yang
-- nyangkut di akun hutang dan tidak pernah kelihatan sebagai barang/uang yang masih
-- ditunggu dari vendor.
--
-- Akun ini dilunasi saat retur diselesaikan di QC: barang pengganti datang
-- (kembali ke Persediaan) atau vendor menolak (jadi Beban Kerusakan).

insert into coas (id, account_code, account_name, account_type)
values ('coa-vendor-return-claim', '1-2100', 'Piutang Retur ke Vendor', 'Asset')
on conflict (id) do nothing;

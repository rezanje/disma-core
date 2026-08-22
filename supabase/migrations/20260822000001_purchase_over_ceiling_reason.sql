-- Alasan kenapa sebuah item dibeli di atas batas harga yang masih menyisakan margin.
-- Batasnya tidak memblokir belanja — pasar tidak bisa menunggu approval — jadi satu-satunya
-- yang tertinggal dari belanja mahal adalah kalimat ini. Tanpa kolomnya, "kenapa hari itu
-- rugi" cuma bisa dijawab dengan ingatan orang.
alter table purchase_items add column if not exists over_ceiling_reason text;

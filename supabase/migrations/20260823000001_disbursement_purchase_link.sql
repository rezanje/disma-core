-- Pencairan menunjuk dokumen belanja yang didanainya.
--
-- Pencairan dan dokumen belanja sebelumnya dua catatan terpisah untuk satu kejadian,
-- dan tidak ada yang membandingkan keduanya — itu sebabnya pengajuan dana Rp0 lolos
-- berminggu-minggu. Dengan tautan ini, uang yang keluar selalu bisa ditanya
-- "untuk belanja yang mana", dan dokumennya ikut dicap begitu transfernya jalan.
alter table disbursement_requests add column if not exists purchase_id text;

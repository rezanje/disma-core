-- Jejak perubahan pada dokumen belanja yang sudah sampai ke Finance.
--
-- Admin PO boleh membetulkan salah ketik setelah dokumennya dikirim — pesanan klien
-- memang berubah, dan melarangnya cuma memindahkan koreksinya ke WhatsApp, di luar
-- jangkauan sistem. Yang tidak boleh adalah Finance merencanakan vendor dan menyiapkan
-- uang dari angka lama tanpa tahu angkanya sudah berganti.
alter table purchases add column if not exists revised_at text;
alter table purchases add column if not exists revised_by text;
alter table purchases add column if not exists revision_note text;

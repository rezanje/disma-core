-- Vendor yang DIRENCANAKAN Finance, terpisah dari vendor yang benar-benar dipakai.
-- Untuk belanja pasar vendornya baru diketahui di lapangan, jadi rencana dan kenyataan
-- memang bisa berbeda. Digabung jadi satu kolom, pertanyaan "seberapa sering rencana
-- kita meleset" tidak bisa dijawab — padahal itu cara menilai vendor.
alter table purchase_items add column if not exists planned_vendor_id text;

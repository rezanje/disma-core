-- supabase/migrations/20260804000001_shopping_draft.sql
-- Rencana belanja (Admin PO) yang belum di-compile jadi dokumen.
--
-- Semua setelan baris di Admin > Shopping List — penunjukan vendor, harga custom,
-- qty custom, metode ambil/bayar, item manual/susulan, baris yang diambil dari
-- stok gudang — dulu hanya hidup di localStorage browser Admin PO. Akibatnya
-- Finance tidak bisa melihat "barang ini dibeli di Mba Sifa" sebelum dokumen
-- di-generate, dan rencananya hilang total kalau browser itu dibersihkan.
--
-- Satu baris (id = 'current') menyimpan seluruh draft sebagai JSON. Bentuknya
-- sengaja dibiarkan opaque supaya menambah setelan baru di UI tidak perlu
-- migrasi kolom lagi.
--
-- ponytail: satu draft global, last-write-wins. Kalau nanti dua Admin PO benar
-- benar menyusun dua daftar berbeda di waktu yang sama, pecah jadi satu baris
-- per user (ganti id 'current' dengan user id) — skema ini sudah siap untuk itu.

CREATE TABLE IF NOT EXISTS public.shopping_draft (
    id         TEXT PRIMARY KEY,
    data       JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT
);

-- Dibaca/ditulis hanya lewat /api/shopping-draft dengan service role, sama
-- seperti tabel lain di sini: RLS menyala tanpa policy, tidak ada klien browser
-- yang menyentuh langsung.
ALTER TABLE public.shopping_draft ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.shopping_draft TO postgres;
GRANT ALL ON TABLE public.shopping_draft TO anon;
GRANT ALL ON TABLE public.shopping_draft TO authenticated;
GRANT ALL ON TABLE public.shopping_draft TO service_role;

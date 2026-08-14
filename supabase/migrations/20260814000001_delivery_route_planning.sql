-- supabase/migrations/20260814000001_delivery_route_planning.sql
-- Perencanaan rute pengiriman harian.
--
-- Aplikasi tidak tahu lokasi klien mana pun: 204 dari 205 klien kolom alamatnya
-- kosong, jadi tidak ada yang bisa ditebak dari teks. Koordinat diisi bertahap —
-- kurir merekam GPS saat berada di lokasi, atau Admin PO memasang pin dari peta.
-- Karena itu semua kolom di bawah boleh kosong, dan layar perencanaan harus
-- tetap berguna saat sebagian besar masih kosong.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS latitude      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_note TEXT;

-- Penugasan kurir menempel pada sales order, bukan pada deliveries: baris
-- delivery baru lahir saat gudang merilis barang, yang bisa terjadi setelah
-- Admin PO menyusun rencana.
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS assigned_courier_id TEXT,
  ADD COLUMN IF NOT EXISTS route_order         INTEGER;

-- Layar perencanaan selalu memfilter satu tanggal kirim.
CREATE INDEX IF NOT EXISTS idx_sales_orders_target_delivery
  ON public.sales_orders (target_delivery_date);

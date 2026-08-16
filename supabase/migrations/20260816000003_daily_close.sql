-- Catatan penutupan hari. Satu baris per tanggal: siapa yang menutup, kapan, dan
-- penjelasan untuk tiap selisih yang ditemukan hari itu.
create table if not exists daily_close (
  id text primary key,
  day date not null unique,
  closed_at timestamptz not null default now(),
  closed_by text,
  gross_profit numeric,
  net_profit numeric,
  variance_reasons jsonb not null default '{}'::jsonb,
  note text
);

-- Biaya tetap bulanan (gaji, sewa, listrik, internet) dan jumlah hari kerja sebulan,
-- dipakai membagi biaya tetap ke laba harian.
--
-- Kolom sendiri, bukan dititipkan ke nav_configs. Setelan tarif tier dan harga patokan
-- sudah terlanjur menumpang di sana, dan itu laci yang salah untuk angka yang
-- memengaruhi laba: mudah tertimpa dan sulit dicari.
alter table app_settings add column if not exists daily_cost_config jsonb;

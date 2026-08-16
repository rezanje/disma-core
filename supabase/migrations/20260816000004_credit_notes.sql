-- Koreksi resmi atas invoice yang sudah diposting (playbook §2.2 #13: tidak ada
-- penghapusan transaksi final). Menyimpan nilai asal invoice supaya besaran koreksinya
-- tetap bisa dibaca setelah nilai invoice-nya sendiri turun.
create table if not exists credit_notes (
  id text primary key,
  cn_number text not null unique,
  invoice_id text not null,
  client_id text,
  date timestamptz not null default now(),
  amount numeric not null,
  invoice_total_before numeric,
  reason text not null,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists credit_notes_invoice_idx on credit_notes (invoice_id);

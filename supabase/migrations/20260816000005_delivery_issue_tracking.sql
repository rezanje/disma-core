-- Retur klien sebelumnya cuma menyimpan barang, qty, dan alasan — tanpa nomor,
-- pemilik, atau tenggat. Akibatnya tidak ada yang mengejarnya, persis kelemahan yang
-- sama dengan klaim retur vendor sebelum akun piutangnya dibuat.
alter table pending_returns add column if not exists di_number text;
alter table pending_returns add column if not exists owner_user_id text;
alter table pending_returns add column if not exists due_date date;
alter table pending_returns add column if not exists root_cause text;

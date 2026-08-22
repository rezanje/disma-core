-- Rencana dan pencairan pindah ke dokumen belanjanya sendiri.
--
-- Sebelum ini satu kali belanja dilacak lima catatan angka yang berbeda — dokumen
-- belanja, pengajuan dana, pencairan, saldo kantong, settlement — dan tidak ada yang
-- membandingkan satu sama lain. Itu sebabnya pengajuan dana Rp0 lolos berminggu-minggu
-- tanpa ada yang sadar. Kolom di bawah membuat angkanya cuma ada satu, di satu tempat.
alter table purchases add column if not exists planned_by text;
alter table purchases add column if not exists planned_at text;
alter table purchases add column if not exists disbursed_amount numeric;
alter table purchases add column if not exists disbursed_at text;
alter table purchases add column if not exists disbursed_by text;
alter table purchases add column if not exists disbursed_to_bank_account_id text;
alter table purchases add column if not exists disbursement_note text;

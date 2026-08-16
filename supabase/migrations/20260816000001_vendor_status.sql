-- Approved Vendor List (playbook §5.4). Tanpa penanda ini, vendor yang barangnya
-- berulang kali gagal QC tetap muncul di setiap daftar pilihan dan tidak ada cara
-- menghentikannya selain mengingatkan orang satu per satu.
alter table vendors add column if not exists status text not null default 'approved';
alter table vendors drop constraint if exists vendors_status_check;
alter table vendors add constraint vendors_status_check
  check (status in ('approved', 'suspended', 'blocked'));

-- supabase/migrations/20260527_coa_utang_talangan_karyawan.sql
-- New COA: 2-1500 Utang Talangan Karyawan (Liability).
-- Pisah utang talangan sourcer dari Utang Usaha Vendor (2-1000) supaya neraca jelas.

insert into public.coas (id, account_code, account_name, account_type)
values ('coa-10-talangan', '2-1500', 'Utang Talangan Karyawan', 'Liability')
on conflict (id) do nothing;

\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.clients(id,company_name,pic_name,created_at) VALUES('auth-tf-client','Fixture','Fixture','2026-10-16');
INSERT INTO public.tukar_faktur(id,tf_number,client_id,period_start,period_end,issue_date) VALUES('00000000-0000-0000-0000-000000000501','AUTH-FIXTURE','auth-tf-client','2026-10-01','2026-10-16','2026-10-16');
INSERT INTO public.invoices(id,client_id,issue_date,due_date,total_amount,status) VALUES('auth-tf-invoice','auth-tf-client','2026-10-16','2026-11-16',100,'Unpaid');
SELECT public.issue_tukar_faktur('00000000-0000-0000-0000-000000000501',ARRAY['auth-tf-invoice'],'2026-10-16','auth-actor');
DO $$
DECLARE rejected boolean := false;
BEGIN
 PERFORM public.issue_tukar_faktur('00000000-0000-0000-0000-000000000501',ARRAY['auth-tf-invoice'],'2026-10-16','auth-actor');
 IF (select due_date from public.invoices where id='auth-tf-invoice') <> '2026-11-16' THEN RAISE EXCEPTION 'Contract due date changed by TF issue'; END IF;
 BEGIN
  PERFORM public.issue_tukar_faktur('00000000-0000-0000-0000-000000000501',ARRAY['auth-tf-invoice'],'2026-10-17','spoof');
 EXCEPTION WHEN OTHERS THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Issued TF can be rewritten'; END IF;
 rejected:=false;
 BEGIN PERFORM public.delete_tukar_faktur('00000000-0000-0000-0000-000000000501'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Issued TF can be deleted'; END IF;
END;
$$;
INSERT INTO public.tukar_faktur(id,tf_number,client_id,period_start,period_end,issue_date) VALUES('00000000-0000-0000-0000-000000000502','AUTH-DRAFT','auth-tf-client','2026-10-01','2026-10-16','2026-10-16');
INSERT INTO public.invoices(id,client_id,issue_date,due_date,total_amount,status,tukar_faktur_id) VALUES('auth-draft-invoice','auth-tf-client','2026-10-16','2027-01-03',100,'Unpaid','00000000-0000-0000-0000-000000000502');
SELECT public.delete_tukar_faktur('00000000-0000-0000-0000-000000000502');
DO $$ BEGIN
 IF (SELECT due_date FROM public.invoices WHERE id='auth-draft-invoice') <> '2027-01-03' THEN RAISE EXCEPTION 'Contract due date changed by draft deletion'; END IF;
END; $$;
INSERT INTO public.tukar_faktur(id,tf_number,client_id,period_start,period_end,issue_date) VALUES('00000000-0000-0000-0000-000000000503','AUTH-SUMMARY','auth-tf-client','2026-10-01','2026-10-16','2026-10-16');
INSERT INTO public.invoices(id,client_id,issue_date,due_date,total_amount,status,is_consolidated) VALUES('auth-summary','auth-tf-client','2026-10-16','2026-11-16',100,'Unpaid',true);
DO $$ DECLARE rejected boolean := false; BEGIN
 BEGIN PERFORM public.issue_tukar_faktur('00000000-0000-0000-0000-000000000503',ARRAY['auth-summary'],'2026-10-16','auth-actor'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Legacy summary accepted by TF'; END IF;
END; $$;
ROLLBACK;

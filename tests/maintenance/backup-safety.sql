-- Run only inside an explicit transaction in a disposable PostgreSQL fixture.
INSERT INTO public.users(id,name,role,pin) VALUES('backup-test-admin','Backup Test','super_admin','offline-test');
INSERT INTO public.bank_accounts(id,name,balance) VALUES('backup-test-bank','Backup Bank',123);
INSERT INTO public.products(id,sku_code,name,uom,current_stock,b2c_stock) VALUES('backup-test-product','BACKUP-TEST','Backup Product','kg',5,2);
INSERT INTO public.invoices(id,client_id,issue_date,due_date,total_amount,amount_paid,status) VALUES('backup-test-invoice','backup-test-client','2026-10-16','2026-11-16',100,0,'Unpaid');
INSERT INTO public.auth_sessions(id,user_id,fingerprint,expires_at) VALUES('backup-test-session','backup-test-admin','offline',now()+interval '1 hour');
INSERT INTO public.courier_spares(id,product_id,courier_id,qty,occurred_at,performed_by,paper_number,recorded_by,cost_snapshot) VALUES('backup-test-spare','backup-test-product','backup-test-admin',1,now(),'backup-test-admin','BACKUP-SP','backup-test-admin','{"qty":1,"unitCost":10,"costTotal":10}');
INSERT INTO public.paper_operations(id,stage,payload,recorded_by,result) VALUES('backup-test-paper','transcribe','{}','backup-test-admin','{}');
INSERT INTO public.sales_orders(id,po_number,client_id,order_date,target_delivery_date,status,parent_order_id) VALUES('backup-test-parent','BACKUP-PO','backup-test-client','2026-10-17','2026-10-18','Draft',null),('backup-test-supplement','BACKUP-SUS','backup-test-client','2026-10-17','2026-10-18','Draft','backup-test-parent');
DO $$
DECLARE backup jsonb; invalid jsonb; failed boolean; result jsonb;
BEGIN
 IF has_function_privilege('anon','public.restore_business_backup(jsonb,text)','execute')
 OR has_function_privilege('authenticated','public.snapshot_business_data()','execute') THEN RAISE EXCEPTION 'Browser may access maintenance RPC'; END IF;
 backup:=public.snapshot_business_data();
 IF NOT (backup->'data' ? 'courier_spares') OR NOT (backup->'data' ? 'paper_operations') THEN RAISE EXCEPTION 'Courier custody and paper retry ledger missing from complete backup'; END IF;
 IF backup->'data' ? 'auth_sessions' OR backup->'data' ? 'auth_login_attempts' THEN RAISE EXCEPTION 'Authentication runtime leaked into backup'; END IF;
 IF (backup->'manifest'->'counts'->>'bank_accounts')::int<>jsonb_array_length(backup->'data'->'bank_accounts') THEN RAISE EXCEPTION 'Manifest count incorrect'; END IF;
 failed:=false;
 BEGIN
  ALTER TABLE public.vendor_prices RENAME TO backup_test_hidden;
  PERFORM public.snapshot_business_data();
 EXCEPTION WHEN undefined_table THEN failed:=true;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'Missing table was silently skipped'; END IF;
 failed:=false;
 BEGIN PERFORM public.restore_business_backup(backup #- '{data,invoices}','backup-test-admin');
 EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Partial backup accepted'; END IF;
 failed:=false;
 BEGIN PERFORM public.restore_business_backup(jsonb_set(backup,'{manifest,counts,invoices}','999'),'backup-test-admin');
 EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Wrong manifest count accepted'; END IF;
 failed:=false;
 BEGIN PERFORM public.restore_business_backup(jsonb_set(backup,'{data,bank_accounts,0,unknown_column}','true'),'backup-test-admin');
 EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Unknown backup column accepted'; END IF;
 -- Fail after all deletes and earlier parent inserts. Every deletion/insertion
 -- must roll back as one transaction, including earlier restored bank balances.
 UPDATE public.bank_accounts SET balance=777 WHERE id='backup-test-bank';
 invalid:=jsonb_set(backup,'{data,invoices,0,total_amount}','"invalid numeric"');
 failed:=false;
 BEGIN PERFORM public.restore_business_backup(invalid,'backup-test-admin');
 EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed OR (SELECT balance FROM public.bank_accounts WHERE id='backup-test-bank')<>777
  OR NOT EXISTS(SELECT 1 FROM public.invoices WHERE id='backup-test-invoice') THEN RAISE EXCEPTION 'Failed restore was not atomic'; END IF;
 DELETE FROM public.paper_operations WHERE id='backup-test-paper';
 UPDATE public.courier_spares SET qty=2 WHERE id='backup-test-spare';
 result:=public.restore_business_backup(backup,'backup-test-admin');
 IF (SELECT parent_order_id FROM sales_orders WHERE id='backup-test-supplement') IS DISTINCT FROM 'backup-test-parent' THEN RAISE EXCEPTION 'Restore did not retain supplemental-order parent linkage'; END IF;
 IF NOT EXISTS(SELECT 1 FROM paper_operations WHERE id='backup-test-paper') OR (SELECT qty FROM courier_spares WHERE id='backup-test-spare')<>1 THEN RAISE EXCEPTION 'Restore did not recover paper/courier facts'; END IF;
 IF result->>'success'<>'true' OR (SELECT balance FROM public.bank_accounts WHERE id='backup-test-bank')<>123 THEN RAISE EXCEPTION 'Valid restore failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.auth_sessions WHERE id='backup-test-session' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Restored users retained active sessions'; END IF;
 failed:=false;
 BEGIN PERFORM public.reset_business_data('backup-test-admin',null,'RESET NONPRODUCTION DATA');
 EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Implicit reset mode accepted'; END IF;
 result:=public.reset_business_data('backup-test-admin','operational','RESET NONPRODUCTION DATA');
 IF result->>'success'<>'true' OR EXISTS(SELECT 1 FROM public.courier_spares) OR EXISTS(SELECT 1 FROM public.paper_operations) OR EXISTS(SELECT 1 FROM public.invoices)
  OR (SELECT balance FROM public.bank_accounts WHERE id='backup-test-bank')<>0
  OR (SELECT current_stock FROM public.products WHERE id='backup-test-product')<>0
  OR NOT EXISTS(SELECT 1 FROM public.users WHERE id='backup-test-admin') THEN RAISE EXCEPTION 'Explicit operational reset incorrect'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.maintenance_events WHERE kind='reset:operational' AND previous_snapshot->'data'->'invoices' @> '[{"id":"backup-test-invoice"}]') THEN RAISE EXCEPTION 'Reset safety copy missing'; END IF;
 result:=public.reset_business_data('backup-test-admin','all','RESET NONPRODUCTION DATA');
 IF result->>'success'<>'true' OR EXISTS(SELECT 1 FROM public.users) OR EXISTS(SELECT 1 FROM public.products)
  OR NOT EXISTS(SELECT 1 FROM public.maintenance_events WHERE kind='reset:all' AND previous_snapshot IS NOT NULL) THEN RAISE EXCEPTION 'Explicit all reset incorrect or safety audit lost'; END IF;
 RAISE NOTICE 'PASS maintenance snapshot/restore/reset: complete manifest, missing-table failure, unknown-column/count rejection, late-failure rollback, exact restore, session revocation, reset safety copy';
END $$;

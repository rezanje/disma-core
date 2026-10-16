BEGIN;
INSERT INTO clients(id,company_name,pic_name,created_at) VALUES('tf-evidence-client','Client','PIC','2026-10-16');
INSERT INTO tukar_faktur(id,tf_number,client_id,period_start,period_end,issue_date,status) VALUES('00000000-0000-0000-0000-000000009752','TF-EVIDENCE','tf-evidence-client','2026-10-01','2026-10-16','2026-10-16','Issued');
SET LOCAL ROLE service_role;
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN UPDATE tukar_faktur SET status='Received' WHERE tf_number='TF-EVIDENCE'; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Missing TF receipt evidence accepted'; END IF;
 rejected:=false;
 BEGIN UPDATE tukar_faktur SET status='Received',received_by='PIC',received_at='1900-01-01',received_proof_url='/proof.pdf' WHERE tf_number='TF-EVIDENCE'; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Receipt before issue accepted'; END IF;
END $$;
UPDATE tukar_faktur SET status='Received',received_by='PIC',received_at='2026-10-17',received_proof_url='/proof.pdf' WHERE tf_number='TF-EVIDENCE';
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN UPDATE tukar_faktur SET received_proof_url='' WHERE tf_number='TF-EVIDENCE'; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Published receipt evidence erased'; END IF;
END $$;
RESET ROLE;
UPDATE tukar_faktur SET status='Paid' WHERE tf_number='TF-EVIDENCE';
SET LOCAL ROLE service_role;
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN UPDATE tukar_faktur SET status='Received' WHERE tf_number='TF-EVIDENCE'; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Stale receive action undid paid state'; END IF;
END $$;
RESET ROLE;
ROLLBACK;

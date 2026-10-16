\set ON_ERROR_STOP on
BEGIN;
INSERT INTO clients(id,company_name,pic_name,created_at) VALUES('guard-client','Client','PIC','2026-10-16');
INSERT INTO products(id,sku_code,name,uom) VALUES('guard-product','GUARD','Product','kg');
INSERT INTO purchases(id,date,purchaser_id,status) VALUES('guard-purchase','2026-10-16','office','Pending');
INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,purchase_method,payment_method) VALUES('guard-pi','guard-purchase','guard-product',10,'Pasar','Cash');
INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status,shopping_list_document_id)
 VALUES('guard-compiled','GUARD-C','guard-client','2026-10-16','2026-10-17','Belanja','guard-purchase'),
 ('guard-draft','GUARD-D','guard-client','2026-10-16','2026-10-17','Draft',null);
INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,unit_price,subtotal) VALUES('guard-line','guard-compiled','guard-product',10,10,100);
SET LOCAL ROLE service_role;
DO $$ DECLARE denied boolean; BEGIN
 denied:=false;
 BEGIN UPDATE public.sales_order_items SET qty=20 WHERE id='guard-line'; EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Compiled quantity change bypassed transaction guard'; END IF;
 denied:=false;
 BEGIN UPDATE public.purchase_items SET payment_method='Tempo' WHERE id='guard-pi'; EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Released purchase planning change bypassed transaction guard'; END IF;
 denied:=false;
 BEGIN UPDATE public.sales_order_items SET sales_order_id='guard-draft' WHERE id='guard-line'; EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Compiled source line moved into draft PO after stale validation'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo PASS transactional generic edit guards preserve compiled sources under service_role

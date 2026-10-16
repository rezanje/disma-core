\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.clients(id,company_name,pic_name,created_at) VALUES('auth-lock-client','Fixture','Fixture','2026-10-16');
INSERT INTO public.products(id,sku_code,name,uom) VALUES('auth-lock-product','AUTH-LOCK','Fixture','kg');
INSERT INTO public.sales_orders(id,po_number,client_id,order_date,target_delivery_date,status) VALUES('auth-lock-so','AUTH-LOCK','auth-lock-client','2026-10-16','2026-10-17','Draft');
SET LOCAL ROLE service_role;
INSERT INTO public.sales_order_items(id,sales_order_id,product_id,qty,unit_price,subtotal) VALUES('auth-lock-line','auth-lock-so','auth-lock-product',10,100,1000);
RESET ROLE;
UPDATE public.sales_orders SET shopping_list_document_id='auth-compiled',status='Belanja' WHERE id='auth-lock-so';
SET LOCAL ROLE service_role;
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN UPDATE public.sales_order_items SET qty=99 WHERE id='auth-lock-line'; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Generic REST changed compiled PO quantity'; END IF;
 rejected:=false;
 BEGIN UPDATE public.sales_orders SET status='Selesai' WHERE id='auth-lock-so'; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Generic REST changed compiled PO status'; END IF;
END; $$;
RESET ROLE;
ROLLBACK;

"""Real PostgreSQL locking checks, restricted to the network-isolated repair fixture."""
import json, os, re, subprocess
from decimal import Decimal
DB=os.environ.get('DISMA_TEST_DB','disma_audit_test')
if DB!='disma_audit_test' and not re.fullmatch(r'disma_verify_\d{8}_\d{6}',DB): raise SystemExit('Unsafe database')
CONTAINER='disma-repair-tests-20261016'
meta=json.loads(subprocess.check_output(['docker','inspect',CONTAINER],text=True))[0]
assert meta['HostConfig']['NetworkMode']=='none' and not meta['HostConfig'].get('PortBindings')
CMD=['docker','exec','-i',CONTAINER,'psql','-qAt','-U','postgres','-d',DB,'-v','ON_ERROR_STOP=1']
def sql(s,check=True):
 r=subprocess.run(CMD,input=s,text=True,capture_output=True)
 if check and r.returncode: raise AssertionError(r.stderr)
 return r

def event(e,stage,sid,payload,actor='pc-finance'):
 obj=json.dumps(dict(eventId=e,stage=stage,sourceId=sid,payload=payload)).replace("'","''")
 return f"SELECT process_purchase_event('{obj}'::jsonb,'{actor}')->>'ok';"

def race(first,second):
 a=subprocess.Popen(CMD,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 a.stdin.write('BEGIN;'+first+'SELECT pg_sleep(0.4);COMMIT;');a.stdin.close()
 assert a.stdout.readline().strip()=='true'
 b=sql(second,False);a.wait(timeout=20)
 if a.returncode: raise AssertionError(a.stderr.read())
 return b

setup="""
INSERT INTO users(id,name,role,pin) VALUES('pc-admin','Admin','admin_po','pc-admin-fixture'),('pc-finance','Finance','finance','pc-finance-fixture');
INSERT INTO clients(id,company_name,pic_name,created_at) VALUES('pc-client','Client','PIC','2026-10-16');
INSERT INTO vendors(id,company_name,pic_name,created_at) VALUES('pc-vendor','Supplier','PIC','2026-10-16');
INSERT INTO products(id,sku_code,name,uom,base_price,current_stock) VALUES('pc-prod','PC','Apple','kg',10,5);
INSERT INTO coas(id,account_code,account_name,account_type) SELECT 'pc-'||code,code,code,'Asset' FROM (VALUES('2-1100'),('1-1998')) x(code) WHERE NOT EXISTS(SELECT 1 FROM coas WHERE account_code=code);
INSERT INTO bank_accounts(id,name,account_code,balance) VALUES('pc-bank','Bank','1-1998',1000000);
INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status) VALUES('pc-a','PC-A','pc-client','2026-10-16','2026-10-17','Draft'),('pc-b','PC-B','pc-client','2026-10-16','2026-10-17','Draft'),('pc-c','PC-C','pc-client','2026-10-16','2026-10-17','Draft');
INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,unit_price,subtotal) VALUES('pc-la','pc-a','pc-prod',5,20,100),('pc-lb','pc-b','pc-prod',5,20,100),('pc-lc','pc-c','pc-prod',5,20,100);
INSERT INTO purchases(id,date,purchaser_id,status) VALUES('pc-reportdoc','2026-10-16','pc-admin','Pending');
INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,purchase_method,payment_method) VALUES('pc-pi','pc-reportdoc','pc-prod',5,'Pasar','Cash');
"""
cleanup="""
DELETE FROM notifications WHERE id LIKE 'revision:pc-%';
DELETE FROM purchase_events WHERE id LIKE 'pc-%';
DELETE FROM goods_events WHERE id LIKE 'reserve:pc-%';
DELETE FROM stock_movements WHERE product_id='pc-prod';
DELETE FROM journal_lines WHERE journal_entry_id LIKE 'financial:paper-%pc-%';
DELETE FROM journal_entries WHERE id LIKE 'financial:paper-%pc-%';
DELETE FROM cash_transactions WHERE id LIKE 'financial:paper-%pc-%';
DELETE FROM financial_events WHERE id LIKE 'paper-%pc-%';
DELETE FROM purchase_items WHERE purchase_id LIKE 'pc-%';
DELETE FROM purchases WHERE id LIKE 'pc-%';
DELETE FROM sales_order_items WHERE sales_order_id LIKE 'pc-%';
DELETE FROM sales_orders WHERE id LIKE 'pc-%';
DELETE FROM products WHERE id='pc-prod';
DELETE FROM bank_accounts WHERE id='pc-bank';
DELETE FROM coas WHERE id LIKE 'pc-%';
DELETE FROM vendors WHERE id='pc-vendor';
DELETE FROM clients WHERE id='pc-client';
DELETE FROM users WHERE id IN('pc-admin','pc-finance');
"""
def compile(e,so,line,doc):
 return event(e,'compile',doc,dict(salesOrderIds=[so],items=[dict(id=doc+'-pi',productId='pc-prod',salesOrderId=so,qtyTarget=1,estimatedUnitPrice=10)],reservations=[dict(salesOrderItemId=line,qty=4)],rejectedIds=[]),'pc-admin')
try:
 sql(setup)
 b=race(compile('pc-compile-a','pc-a','pc-la','pc-doc-a'),compile('pc-compile-b','pc-b','pc-lb','pc-doc-b'))
 assert b.returncode!=0 and ('Stok' in b.stderr or 'stok' in b.stderr),b.stderr
 assert sql("SELECT count(*) FROM purchases WHERE id='pc-doc-b';").stdout.strip()=='0'
 assert sql("SELECT qty_final FROM sales_order_items WHERE id='pc-la';").stdout.strip()=='4'
 c=event('pc-retry','compile','pc-doc-c',dict(salesOrderIds=['pc-c'],items=[dict(id='pc-doc-c-pi',productId='pc-prod',salesOrderId='pc-c',qtyTarget=5,estimatedUnitPrice=10)],reservations=[],rejectedIds=[]),'pc-admin')
 r=race(c,c);assert r.returncode==0,r.stderr
 assert sql("SELECT count(*) FROM purchase_items WHERE purchase_id='pc-doc-c';").stdout.strip()=='1'
 payload=dict(purchaseIds=['pc-reportdoc'],occurredAt='2026-10-16T06:00:00Z',onBehalfOfUserId='worker',pocketBankAccountId='pc-bank',lines=[dict(id='pc-pi',purchaseId='pc-reportdoc',productId='pc-prod',isChecked=True,qtyPurchased=4,actualUnitPrice=10,vendorId='pc-vendor',paymentMethod='Cash')])
 b=race(event('pc-report1','report','paper',payload),event('pc-report2','report','paper',payload))
 assert b.returncode!=0 and ('stale' in b.stderr or 'Invalid' in b.stderr),b.stderr
 assert Decimal(sql("SELECT balance FROM bank_accounts WHERE id='pc-bank';").stdout.strip())==Decimal('999960')
 # Same lost-response report ID is a successful no-op even though source remainder changed.
 assert sql(event('pc-report1','report','paper',payload)).returncode==0
 rev=lambda e,q:event(e,'revise','pc-c',dict(lines=[dict(id='pc-lc',qty=q,unitPrice=20,expectedQty=5,expectedUnitPrice=20)]),'pc-admin')
 b=race(rev('pc-revision1',6),rev('pc-revision2',7))
 assert b.returncode!=0 and 'Stale' in b.stderr,b.stderr
 assert sql("SELECT qty_target FROM purchase_items WHERE id='pc-doc-c-pi';").stdout.strip()=='6'
 print('PASS concurrent purchasing: shared stock cannot double reserve; identical compile/report retries post once; stale report and revision reject')
finally: sql(cleanup)

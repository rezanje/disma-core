"""QC and a late financial paper may arrive concurrently, in either lock order."""
import json,os,re,subprocess
from decimal import Decimal
DB=os.environ.get('DISMA_TEST_DB','')
assert re.fullmatch(r'disma_verify_\d{8}_\d{6}',DB),'Requires the disposable database runner'
container='disma-repair-tests-20261016'
meta=json.loads(subprocess.check_output(['docker','inspect',container],text=True))[0]
assert meta['HostConfig']['NetworkMode']=='none' and not meta['HostConfig'].get('PortBindings')
cmd=['docker','exec','-i',container,'psql','-qAt','-U','postgres','-d',DB,'-v','ON_ERROR_STOP=1']
def sql(text):
 r=subprocess.run(cmd,input=text,text=True,capture_output=True)
 assert r.returncode==0,r.stderr
 return r.stdout.strip()
def event(function,command,actor):
 payload=json.dumps(command).replace("'","''")
 return f"SELECT {function}('{payload}'::jsonb,'{actor}')->>'ok';"
def goods(key,stage,source,body):
 return event('process_goods_event',dict(eventId=key,stage=stage,sourceId=source,payload=dict(performedBy='ec-admin',occurredAt='2026-10-17T00:00:00Z',paperNumber=key,**body)),'ec-admin')
sql("""
INSERT INTO users(id,name,role,pin) VALUES('ec-admin','Admin','admin_po','fixture-admin'),('ec-fin','Finance','finance','fixture-finance');
INSERT INTO vendors(id,company_name,pic_name,created_at) VALUES('ec-vendor','Supplier','PIC','2026-10-17');
INSERT INTO products(id,sku_code,name,uom,base_price) VALUES('ec-prod','EC','Apple','kg',10);
INSERT INTO coas(id,account_code,account_name,account_type) SELECT 'ec-'||code,code,code,'Asset' FROM (VALUES('1-3000'),('2-1100'),('1-1998')) x(code) WHERE NOT EXISTS(SELECT 1 FROM coas WHERE account_code=code);
INSERT INTO bank_accounts(id,name,account_code,balance) VALUES('ec-bank','Bank','1-1998',1000);
""")
for index,qc_first in enumerate([True,False]):
 lot='ec-lot-'+str(index);doc='ec-doc-'+str(index)
 sql(f"INSERT INTO purchases(id,date,purchaser_id,status) VALUES('{doc}','2026-10-17','ec-admin','Belanja'); INSERT INTO purchase_items(id,purchase_id,product_id,qty_target,estimated_unit_price,purchase_method,payment_method) VALUES('{lot}','{doc}','ec-prod',6,10,'Pasar','Cash');")
 sql(goods(lot+':arrival','arrival',lot,dict(qty=6)))
 qc=goods(lot+':qc','qc',lot,dict(qtyPassToInventory=6,qtyReject=0,allocations=[],rejectAction='Disposal'))
 report=event('process_purchase_event',dict(eventId=lot+':paper',stage='report',sourceId=doc,payload=dict(purchaseIds=[doc],occurredAt='2026-10-17T03:00:00Z',onBehalfOfUserId='ec-admin',pocketBankAccountId='ec-bank',lines=[dict(id=lot,purchaseId=doc,productId='ec-prod',isChecked=True,qtyPurchased=6,actualUnitPrice=13,vendorId='ec-vendor',paymentMethod='Cash')])),'ec-fin')
 first,second=(qc,report) if qc_first else (report,qc)
 a=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 a.stdin.write('BEGIN;'+first+'SELECT pg_sleep(0.4);COMMIT;');a.stdin.close()
 assert a.stdout.readline().strip()=='true'
 sql(second);a.wait(timeout=20);assert a.returncode==0,a.stderr.read()
 sql(first);sql(second)
 assert sql(f"SELECT qty_purchased=6 AND qc_processed_qty=6 AND NOT cost_pending FROM purchase_items WHERE id='{lot}';")=='t'
 assert sql("SELECT current_stock FROM products WHERE id='ec-prod';")==str((index+1)*6)
 assert Decimal(sql("SELECT balance FROM bank_accounts WHERE id='ec-bank';"))==1000-(index+1)*78
 assert sql(f"SELECT sum(debit_amount) FROM journal_lines WHERE journal_entry_id='{lot}:qc:journal';") in ['78','78.00']
print('concurrent early QC/report in both lock orders: OK')

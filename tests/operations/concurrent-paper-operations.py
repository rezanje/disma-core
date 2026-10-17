"""Real PostgreSQL races: paper dedupe and spare cannot overdraw warehouse stock."""
import concurrent.futures
import json
import os
import subprocess
DB=os.environ['DISMA_TEST_DB']
PSQL=['docker','exec','-i','disma-repair-tests-20261016','psql','-X','-q','-U','postgres','-d',DB,'-v','ON_ERROR_STOP=1']
def sql(body):return subprocess.run(PSQL,input=body,text=True,capture_output=True)
seed="""
INSERT INTO users(id,name,role,pin) VALUES('race-paper-admin','Admin','admin_po','fixture'),('race-paper-worker','Worker','gudang','fixture'),('race-paper-courier','Courier','kurir','fixture');
INSERT INTO clients(id,company_name,pic_name,created_at) VALUES('race-paper-client','Outlet','PIC','2026-10-18');
INSERT INTO products(id,sku_code,name,uom,base_price,current_stock) VALUES('race-paper-product','RACEP','Product','kg',10,3);
"""
result=sql(seed)
assert result.returncode==0,result.stderr

def operation(event,stage,payload):
    command=json.dumps(dict(eventId=event,stage=stage,payload=payload)).replace("'","''")
    return sql("SELECT process_paper_operation('"+command+"'::jsonb,'race-paper-admin');")
late=dict(clientId='race-paper-client',paperNumber='WA-RACE',occurredAt='2026-10-17T15:00:00Z',targetDeliveryDate='2026-10-18',performedBy='race-paper-worker',note='WA tambahan',lines=[dict(productId='race-paper-product',qty=2,unitPrice=25,buyQty=2)])
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    outcomes=list(pool.map(lambda event:operation(event,'supplement',late),['race-late-a','race-late-b']))
assert sum(r.returncode==0 for r in outcomes)==1,[r.stderr for r in outcomes]
assert any('Referensi susulan ini sudah disalin' in r.stderr for r in outcomes)
spare=dict(qc=[],dispatches=[],spares=[dict(productId='race-paper-product',courierId='race-paper-courier',qty=2,evidence=dict(performedBy='race-paper-worker',occurredAt='2026-10-18T01:00:00Z',paperNumber='BA-RACE',signedPaperChecked=True))])
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    outcomes=list(pool.map(lambda event:operation(event,'transcribe',{**spare,'spares':[{**spare['spares'][0],'evidence':{**spare['spares'][0]['evidence'],'paperNumber':event}}]}),['race-spare-a','race-spare-b']))
assert sum(r.returncode==0 for r in outcomes)==1,[r.stderr for r in outcomes]
assert any('Spare melebihi stok' in r.stderr for r in outcomes)
check=sql("DO $$ BEGIN IF (SELECT current_stock FROM products WHERE id='race-paper-product')<>1 OR (SELECT count(*) FROM courier_spares WHERE product_id='race-paper-product')<>1 OR (SELECT count(*) FROM sales_orders WHERE supplement_reference='WA-RACE')<>1 THEN RAISE EXCEPTION 'Concurrent paper operation duplicated quantities'; END IF; END $$;")
assert check.returncode==0,check.stderr
print('Concurrent supplemental-paper dedupe and spare custody passed')

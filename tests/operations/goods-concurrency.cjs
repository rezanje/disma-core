// Run against a separate schema-only clone of the disposable audit DB.
// The docker transport never reads application credentials or contacts live services.
const {spawn,execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const db=process.env.DISMA_TEST_DB||'disma_goods_race_20261016';
const container='disma-repair-tests-20261016';
assert.ok(/^disma_(verify_[a-z0-9_]+|goods_race_20261016)$/.test(db),'Only disposable verification databases are allowed');
const boundary=execFileSync('docker',['inspect',container,'--format','{{json .HostConfig.NetworkMode}}|{{json .HostConfig.PortBindings}}'],{encoding:'utf8'}).trim();
assert.ok(boundary==='"none"|{}'||boundary==='"none"|null','Database container must have no network and no published ports');
function sql(text){return new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],{stdio:['pipe','pipe','pipe']});let output='';p.stdout.on('data',x=>output+=x);p.stderr.on('data',x=>output+=x);p.on('error',reject);p.on('close',code=>resolve({code,output}));p.stdin.end(text);});}
async function ok(text){const r=await sql(text);assert.equal(r.code,0,r.output);return r.output;}
const event=(id,stage,source,payload)=>`SELECT process_goods_event('${JSON.stringify({eventId:id,stage,sourceId:source,payload:{performedBy:'race-worker',occurredAt:'2026-10-15T06:00:00Z',paperNumber:id,...payload}})}'::jsonb,'race-admin');`;
const qc=qty=>({qtyPassToInventory:qty,qtyReject:0,allocations:[],rejectAction:'Disposal',unbalanceReason:'partial source'});
(async()=>{
 await ok(`BEGIN;
 INSERT INTO users(id,name,role,pin) VALUES('race-admin','Admin','admin_po','9871'),('race-worker','Worker','gudang','9872');
 INSERT INTO coas(id,account_code,account_name,account_type) SELECT id,code,name,type FROM(VALUES('race-inventory','1-3000','Inventory','Asset'),('race-grir','2-1100','GRIR','Liability')) x(id,code,name,type) WHERE NOT EXISTS(SELECT 1 FROM coas c WHERE c.account_code=x.code);
 INSERT INTO clients(id,company_name,pic_name,created_at) VALUES('race-client','Client','PIC','2026-10-16');
 INSERT INTO purchases(id,date,purchaser_id,status) VALUES('race-purchase','2026-10-15','race-worker','Selesai');
 INSERT INTO products(id,sku_code,name,uom,base_price,current_stock) VALUES('race-product','RACE1','QC','kg',10000,0),('race-reserve','RACE2','Reserve','kg',10000,5);
 INSERT INTO purchase_items(id,purchase_id,product_id,qty_purchased,actual_unit_price,purchase_method) VALUES('race-replay-pi','race-purchase','race-product',10,10000,'Pasar'),('race-partial-pi','race-purchase','race-product',10,10000,'Pasar'),('race-stale-pi','race-purchase','race-product',10,10000,'Pasar');
 INSERT INTO sales_orders(id,po_number,client_id,order_date,target_delivery_date,status) VALUES('race-soA','RACE-A','race-client','2026-10-15','2026-10-16','QC'),('race-soB','RACE-B','race-client','2026-10-15','2026-10-16','QC');
 INSERT INTO sales_order_items(id,sales_order_id,product_id,qty,unit_price,subtotal) VALUES('race-lineA','race-soA','race-reserve',10,15000,150000),('race-lineB','race-soB','race-reserve',10,15000,150000);
 COMMIT;`);
 const replays=await Promise.all(Array.from({length:6},()=>sql(event('race-identical','qc','race-replay-pi',qc(10)))));
 assert.ok(replays.every(r=>r.code===0),JSON.stringify(replays));
 const partial=await Promise.all([sql(event('race-partial6','qc','race-partial-pi',qc(6))),sql(event('race-partial4','qc','race-partial-pi',qc(4)))]);
 assert.ok(partial.every(r=>r.code===0),JSON.stringify(partial));
 const stale=await Promise.all([sql(event('race-staleA','qc','race-stale-pi',qc(10))),sql(event('race-staleB','qc','race-stale-pi',qc(10)))]);
 assert.deepEqual(stale.map(r=>r.code).sort(),[0,3],JSON.stringify(stale));
 const reserves=await Promise.all([sql(event('race-reserveA','reserve','race-soA',{lines:[{salesOrderItemId:'race-lineA',qty:3}]})),sql(event('race-reserveB','reserve','race-soB',{lines:[{salesOrderItemId:'race-lineB',qty:3}]}))]);
 assert.deepEqual(reserves.map(r=>r.code).sort(),[0,3],JSON.stringify(reserves));
 await ok(`DO $$ BEGIN
 IF (SELECT current_stock FROM products WHERE id='race-product')<>30 OR (SELECT count(*) FROM goods_events WHERE stage='qc' AND id LIKE 'race-%')<>4 THEN RAISE EXCEPTION 'Concurrent QC duplicated or lost stock'; END IF;
 IF (SELECT sum(qty_final) FROM sales_order_items WHERE product_id='race-reserve')<>3 OR (SELECT current_stock FROM products WHERE id='race-reserve')<>5 THEN RAISE EXCEPTION 'Concurrent reserve overallocated free stock'; END IF;
 END $$;`);
 console.log('PASS real concurrent replay x6, partial6+4, stale QC and stock reservation (independent PostgreSQL connections)');
})().catch(error=>{console.error(error);process.exitCode=1});

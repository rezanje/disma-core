import assert from 'node:assert/strict';
import { runQcBatch,validateQcBatch,goodsUpdateKeys } from './goods-batch';
const command=(id:string,stage:'arrival'|'qc')=>({eventId:id+':'+stage,stage,sourceId:id,payload:{}});
const entries=[{sourceId:'a',commands:[command('a','arrival'),command('a','qc')]},{sourceId:'b',commands:[command('b','arrival'),command('b','qc')]}];
assert.equal(validateQcBatch(entries),entries);
for(const invalid of [[],[entries[0],entries[0]],[{...entries[0],commands:[{...command('a','qc'),stage:'reserve'}]}],[{...entries[0],commands:[{...command('a','qc'),sourceId:'other'}]}],[{...entries[0],commands:[command('a','qc'),command('a','arrival')]}]])assert.throws(()=>validateQcBatch(invalid));
async function main(){
 const calls:string[]=[];
 let fail=true;
 const execute=async(c:any)=>{
  calls.push(c.eventId);
  if(c.sourceId==='b'&&c.stage==='qc'&&fail){fail=false;return {data:null,error:{message:'temporary failure'}};}
  return {error:null,data:{ok:true,updates:{...Object.fromEntries(goodsUpdateKeys.map(key=>[key,[]])),purchaseItems:[{id:c.sourceId,qc_event_ids:c.stage==='qc'?[c.eventId]:[]}],products:[{id:'p',current_stock:c.sourceId==='a'?6:12}],salesOrderItems:[{id:'line',qty_final:c.sourceId==='a'?6:8}]}}};
 };
 const partial=await runQcBatch(entries,execute);
 assert.equal(partial.complete,false);assert.deepEqual(partial.completedSourceIds,['a']);assert.equal(partial.failedSourceId,'b');
 assert.deepEqual(partial.confirmedEventIds,['a:arrival','a:qc','b:arrival']);
 assert.equal(partial.updates.purchaseItems.length,2,'retain confirmed arrival even when its QC fails');
 const replay=await runQcBatch(entries,execute);
 assert.equal(replay.complete,true);assert.deepEqual(replay.completedSourceIds,['a','b']);
 assert.equal(replay.updates.products.length,1,'merge one latest authoritative row per id');
 assert.equal(replay.updates.salesOrderItems[0].qty_final,8,'later item snapshot wins over earlier shared PO snapshot');
 const malformed=await runQcBatch(entries,async()=>({error:null,data:{ok:true,updates:{}}}));
 assert.equal(malformed.complete,false);assert.equal(malformed.completedSourceIds.length,0);
 console.log('server QC batch permissions shape, partial confirmations, latest-row merge: OK');
}
main().catch(error=>{console.error(error);process.exitCode=1});

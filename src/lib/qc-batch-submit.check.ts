import assert from 'node:assert/strict';
import { useAppStore } from './store';
import { prepareQcBatch,submitQcBatch } from './qc-batch';
import { runQcBatch,validateQcBatch,goodsUpdateKeys } from './goods-batch';

async function main(){
 const items:any[]=['a','b'].map(id=>({id,purchaseId:'doc',productId:'p',qtyTarget:6,qtyPurchased:0,estimatedUnitPrice:10,purchaseMethod:'Pasar'}));
 const draft:any={incoming:6,passed:6,rejected:0,rejectAction:'Disposal',rejectReason:''};
 const {plans}=prepareQcBatch(items.map(item=>({item,draft,needsArrival:true})),{eventId:'batch',needsArrival:false,evidence:{performedBy:'worker',occurredAt:'2026-10-17T04:00:00+07:00',paperNumber:'QC-1'},orders:[],lines:[]});
 let serverItems:any[]=[],stock=0,events=new Map<string,string>(),fetches=0,lose=false,failSecond=false,physical=0,qcs=0;
 const reset=()=>{serverItems=structuredClone(items);stock=0;events=new Map();fetches=0;lose=false;failSecond=false;physical=0;qcs=0;useAppStore.setState({purchaseItems:structuredClone(items),products:[{id:'p',currentStock:0} as any],_lastLocalMutationAt:0});};
 reset();
 const execute=async(c:any)=>{
  assert.equal(c.payload.occurredAt,'2026-10-16T21:00:00.000Z','bulk keeps the physical WIB timestamp correctly');
  if(failSecond&&c.sourceId==='b'&&c.stage==='qc'){failSecond=false;return {data:null,error:{message:'retry b'}};}
  const previous=events.get(c.eventId);
  if(previous)assert.equal(previous,JSON.stringify(c));
  else {
   events.set(c.eventId,JSON.stringify(c));
   const item=serverItems.find(i=>i.id===c.sourceId);
   if(c.stage==='arrival'){physical++;Object.assign(item,{physicalQtyReceived:6,physicalBeforeReport:true});}
   else {qcs++;stock+=6;Object.assign(item,{qcProcessedQty:6,isQCed:true,qcEventIds:[c.eventId]});}
  }
  return {error:null,data:{ok:true,updates:{...Object.fromEntries(goodsUpdateKeys.map(key=>[key,[]])),purchaseItems:structuredClone(serverItems),products:[{id:'p',currentStock:stock}]}}};
 };
 globalThis.fetch=async(url,request)=>{
  fetches++;assert.equal(url,'/api/operations/goods/batch');
  const entries=validateQcBatch(JSON.parse(String(request?.body)).entries);
  const result=await runQcBatch(entries,execute);
  if(lose){lose=false;throw new Error('response lost');}
  return Response.json(result);
 };
 lose=true;
 await assert.rejects(()=>submitQcBatch(plans),/response lost/);
 assert.equal(fetches,1);assert.equal(stock,12);assert.equal(useAppStore.getState().products[0].currentStock,0);
 const replay=await submitQcBatch(plans);
 assert.equal(replay.complete,true);assert.equal(fetches,2);assert.equal(physical,2);assert.equal(qcs,2);assert.equal(stock,12);
 assert.equal(useAppStore.getState().products[0].currentStock,12,'one authoritative snapshot updates the whole batch');
 reset();failSecond=true;
 const partial=await submitQcBatch(plans);
 assert.equal(partial.complete,false);assert.deepEqual(partial.completedSourceIds,['a']);assert.equal(stock,6);
 assert.equal(useAppStore.getState().purchaseItems.find(i=>i.id==='b')?.physicalQtyReceived,6,'pending receipt remains visible for retry');
 const done=await submitQcBatch(plans.filter(plan=>!partial.completedSourceIds.includes(plan.sourceId)));
 assert.equal(done.complete,true);assert.equal(physical,2);assert.equal(qcs,2);assert.equal(stock,12);assert.equal(fetches,2);
 globalThis.fetch=async()=>Response.json({ok:true,complete:true,completedSourceIds:['a','b'],confirmedEventIds:[],warnings:[],updates:Object.fromEntries(goodsUpdateKeys.map(key=>[key,[]]))});
 await assert.rejects(()=>submitQcBatch(plans),/mengonfirmasi semua hasil QC/);
 console.log('bulk QC one-request save, UTC evidence, lost response replay, partial retry: OK');
}
main().catch(error=>{console.error(error);process.exitCode=1});

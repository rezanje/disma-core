import assert from 'node:assert/strict';
import { useAppStore } from './store';
import { prepareQcEntry,submitQcEntry } from './qc-entry';

async function main() {
 const item:any={id:'pi',purchaseId:'doc',productId:'p',qtyTarget:10,qtyPurchased:0,estimatedUnitPrice:10,purchaseMethod:'Pasar'};
 const product:any={id:'p',name:'Leaf',basePrice:10,currentStock:0};
 const plan=prepareQcEntry(item,{incoming:6,passed:5,rejected:1,rejectAction:'Disposal',rejectReason:'Busuk'}, {eventId:'sheet-item',needsArrival:true,evidence:{performedBy:'worker',occurredAt:'2026-10-17T04:00:00+07:00',paperNumber:'QC-1'},orders:[],lines:[]});
 const keys=['stockMovements','products','salesOrders','salesOrderItems','purchaseItems','deliveries','invoices','pendingReturns','vendorReturns','rejectedItems','vendorBills','bankAccounts','cashTransactions','journalEntries','journalLines'];
 let serverItem={...item},stock=0,arrivals=0,inspections=0;
 const recorded=new Map<string,string>();
 let loseArrival=true,loseQc=true;
 const calls:string[]=[];
 useAppStore.setState({products:[product],purchaseItems:[item],stockMovements:[],_lastLocalMutationAt:0});
 globalThis.fetch=async(_url,request)=>{
  const command=JSON.parse(String(request?.body));calls.push(command.stage);
  const previous=recorded.get(command.eventId);
  if(previous)assert.equal(previous,JSON.stringify(command),'retries must preserve the entire submitted plan');
  else {
   recorded.set(command.eventId,JSON.stringify(command));
   if(command.stage==='arrival') {arrivals++;serverItem={...serverItem,qtyTarget:6,physicalQtyReceived:6,physicalBeforeReport:true,inboundStatus:'pra_inbound'};}
   if(command.stage==='qc') {inspections++;stock+=5;serverItem={...serverItem,qcProcessedQty:6,isQCed:true,inboundStatus:'verified',qcEventIds:[command.eventId]};}
  }
  if(command.stage==='arrival'&&loseArrival){loseArrival=false;throw new Error('Arrival response lost');}
  if(command.stage==='qc'&&loseQc){loseQc=false;throw new Error('QC response lost');}
  return Response.json({ok:true,eventId:command.eventId,updates:{...Object.fromEntries(keys.map(k=>[k,[]])),purchaseItems:[serverItem],products:[{...product,currentStock:stock}],stockMovements:stock?[{id:'qc-in',productId:'p',stockDelta:5,quantity:5}]:[]}});
 };
 await assert.rejects(()=>submitQcEntry(useAppStore.getState,plan),/Arrival response lost/);
 assert.equal(inspections,0,'QC must wait until arrival is confirmed');
 await assert.rejects(()=>submitQcEntry(useAppStore.getState,plan),/QC response lost/);
 assert.equal(stock,5,'QC may have committed despite a lost response');
 await submitQcEntry(useAppStore.getState,plan);
 assert.equal(arrivals,1);assert.equal(inspections,1);assert.equal(stock,5);
 assert.equal(useAppStore.getState().purchaseItems[0].qcProcessedQty,6);
 assert.equal(useAppStore.getState().stockMovements.length,1);
 assert.deepEqual(calls,['arrival','arrival','qc','arrival','qc']);
 // An already received lot has only a QC command, never a new arrival.
 const received:any={...item,physicalBeforeReport:true,physicalQtyReceived:4};
 const qcOnly=prepareQcEntry(received,{incoming:4,passed:4,rejected:0,rejectAction:'Disposal',rejectReason:''}, {eventId:'received',needsArrival:false,evidence:plan.qc,orders:[],lines:[]});
 assert.equal(qcOnly.arrival,undefined);
 console.log('single-row arrival/QC lost response and idempotent retry: OK');
}
main().catch(error=>{console.error(error);process.exitCode=1});

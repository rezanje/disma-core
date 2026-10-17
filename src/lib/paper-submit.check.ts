import assert from 'node:assert/strict';
import {useAppStore} from './store';
import {submitPaperOperation,PaperOperationRejected} from './paper-submit';
import {paperUpdateKeys,type PaperCommand} from './paper-operations';
async function main(){
 const originalFetch=globalThis.fetch;const original=useAppStore.getState();
 const command:PaperCommand={eventId:'sheet',stage:'transcribe',payload:{qc:[{sourceId:'pi',commands:[{stage:'arrival'},{stage:'qc'}]}],dispatches:[{soId:'so',courierId:'c'}],spares:[{productId:'p'}]}};
 const updates:any=Object.fromEntries(paperUpdateKeys.map(key=>[key,[]]));updates.purchaseItems=[{id:'pi',qcEventIds:['sheet:goods:2']}];updates.products=[{id:'p',currentStock:4}];updates.deliveries=[{id:'d',salesOrderId:'so',courierId:'c',status:'Dikirim'}];updates.courierSpares=[{id:'s',productId:'p',qty:2}];
 let stored=false;let calls=0;const bodies:string[]=[];
 try{
  useAppStore.setState({_lastLocalMutationAt:1,products:[{id:'p',currentStock:10} as any],purchaseItems:[],deliveries:[],courierSpares:[]});
  globalThis.fetch=async(_url,init)=>{calls++;bodies.push(String(init?.body));if(!stored){stored=true;throw new Error('response lost after commit')};return Response.json({ok:true,eventId:'sheet',goodsEventIds:['sheet:goods:1','sheet:goods:2'],spareIds:['s'],updates})};
  await assert.rejects(()=>submitPaperOperation(command),/lost/);assert.equal(useAppStore.getState().products[0].currentStock,10,'unconfirmed source must not be optimistically applied');
  await submitPaperOperation(command);assert.equal(calls,2);assert.equal(bodies[0],bodies[1]);assert.equal(useAppStore.getState().products[0].currentStock,4);assert.equal(useAppStore.getState().courierSpares.length,1);
  await submitPaperOperation(command);assert.equal(useAppStore.getState().deliveries.length,1);assert.equal(useAppStore.getState().courierSpares.length,1,'replay merges source rows, never appends duplicates');
  const stamp=useAppStore.getState()._lastLocalMutationAt;
  globalThis.fetch=async()=>Response.json({ok:true,eventId:'sheet',goodsEventIds:[],spareIds:['s'],updates:{...updates,purchaseItems:[{id:'pi',qcEventIds:[]}]}});
  await assert.rejects(()=>submitPaperOperation(command),/QC/);assert.equal(useAppStore.getState()._lastLocalMutationAt,stamp);
  globalThis.fetch=async()=>Response.json({error:'Invalid final row'},{status:409});await assert.rejects(()=>submitPaperOperation(command),PaperOperationRejected);assert.equal(useAppStore.getState()._lastLocalMutationAt,stamp);
 }finally{globalThis.fetch=originalFetch;useAppStore.setState(original,true)}
 console.log('paper source confirmation, lost response replay and atomic rejection: OK');
}
main().catch(error=>{console.error(error);process.exitCode=1});

import assert from 'node:assert/strict';
import { qcBalanceProblem } from './qc-process';
import { awaitingQc,stillOwed } from './daily-flow';
const base = {purchaseItemId:'P',qtyPassToInventory:0,allocations:[{soId:'S',qty:10}],qtyReject:0,rejectAction:'Disposal' as const};
for (const qty of [-1, NaN, Infinity]) {
  assert.ok(qcBalanceProblem({...base,qtyPassToInventory:qty,unbalanceReason:'paper'},10), `invalid inventory ${qty}`);
  assert.ok(qcBalanceProblem({...base,allocations:[{soId:'S',qty}],unbalanceReason:'paper'},10), `invalid allocation ${qty}`);
}
assert.ok(qcBalanceProblem({...base,qtyPassToInventory:-5,allocations:[{soId:'S',qty:15}]},10));
assert.ok(qcBalanceProblem({...base,allocations:[{soId:'S',qty:11}],unbalanceReason:'paper'},10));
assert.equal(qcBalanceProblem({...base,allocations:[{soId:'S',qty:6}],unbalanceReason:'remaining 4 tomorrow'},10),null);
assert.equal(qcBalanceProblem({...base,allocations:[{soId:'S',qty:0}],qtyReject:10},10),null);
assert.deepEqual(awaitingQc([{id:'partial',purchaseId:'P',purchaseMethod:'Vendor',isOnlineOrdered:true,inboundStatus:'partial',isQCed:false}], [{id:'P',status:'Belanja'}]).map(x=>x.id),['partial']);
assert.deepEqual(awaitingQc([{id:'online',purchaseId:'P',purchaseMethod:'Online',isOnlineOrdered:true}], [{id:'P',status:'Belanja'}]),[]);
console.log('goods event quantity/queue regressions: OK');
import { qtyOwed, roundQtyToBook } from './backorder';
assert.equal(qtyOwed({qty:10,qtyDelivered:6,qtyCancelled:4}),0);
assert.equal(stillOwed({salesOrderId:'S',productId:'P',qty:10,qtyDelivered:6,qtyCancelled:4}),0);
assert.deepEqual(awaitingQc([{id:'planned',purchaseId:'P',purchaseMethod:'Vendor',inboundStatus:'pra_inbound',isOnlineOrdered:false}], [{id:'P',status:'Siap Cetak'}]),[]);
assert.deepEqual(awaitingQc([{id:'market-partial',purchaseId:'P',purchaseMethod:'Pasar',qtyPurchased:6,reportEventIds:['paper6']}], [{id:'P',status:'Belanja'}]).map(i=>i.id),['market-partial']);

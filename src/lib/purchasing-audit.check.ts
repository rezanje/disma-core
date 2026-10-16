import assert from 'node:assert/strict';
import { allocateShoppingDemand, warehouseReservations, lineIsPlanned } from './purchase-plan';
import { allocateMergedActuals, reportProblems } from './shopping-report';

assert.equal(lineIsPlanned({ id:'a', purchaseMethod:'Dropship', paymentMethod:'Cash', plannedVendorId:'v', estimatedUnitPrice:1 }), false);
const demand = [{ id: 'a', productId: 'p', quantity: 10 }, { id: 'b', productId: 'p', quantity: 10 }];
assert.equal(allocateShoppingDemand(demand, { p: 5 }).reduce((s, r) => s + r.toBuy, 0), 15);
assert.equal(allocateShoppingDemand(demand, { p: 5 }, { p: 5 }).reduce((s, r) => s + r.toBuy, 0), 20);
assert.equal(allocateShoppingDemand(demand, { p: 5 }, {}, { a: 4 }).reduce((s, r) => s + r.toBuy, 0), 11);
assert.equal(lineIsPlanned({ id:'a', purchaseMethod:'Online', paymentMethod:'Tempo', plannedVendorId:'v' }), false);
const allocated = allocateMergedActuals([{ id:'a', qtyTarget:10 },{ id:'b', qtyTarget:5 }], 12, 300000);
assert.deepEqual(allocated.map(a => a.qtyPurchased), [10,2]);
assert.equal(allocated.reduce((s,a) => s + a.qtyPurchased * a.actualUnitPrice, 0), 300000);
assert.equal(allocateMergedActuals([{ id:'a', qtyTarget:.25 }], .25,10000)[0].actualUnitPrice,40000);
assert.throws(() => allocateMergedActuals([{id:'a',qtyTarget:1}],2,100));
assert.ok(reportProblems({purchaseIds:['p'], lines:[{id:'a',purchaseId:'p', productId:'x',isChecked:true,qtyPurchased:-1,actualUnitPrice:1,vendorId:'v',paymentMethod:'Tempo'}]}, x=>x).some(x=>/jumlah|qty/i.test(x)));
console.log('purchasing audit: OK');

assert.equal(typeof warehouseReservations, 'function', 'ownership must distinguish packed from released stock');
const owned = [{id:'line',salesOrderId:'so',productId:'p',qtyFinal:10,qtyDispatched:6}];
assert.equal(warehouseReservations(owned,[{id:'so',status:'Packing'}],[]).p,10,'packing alone does not free stock');
assert.equal(warehouseReservations(owned,[{id:'so',status:'Dikirim'}],[{salesOrderId:'so',status:'Dikirim',lineSnapshots:[{salesOrderItemId:'line',qty:6}]}]).p,4,'actual release leaves unshipped allocation reserved');
assert.equal(warehouseReservations([{...owned[0],qtyFinal:4}],[{id:'so',status:'Kurang Kirim'}],[{salesOrderId:'so',status:'Terkirim',lineSnapshots:[{salesOrderItemId:'line',qty:6}]}]).p,4,'closed round must not free current round allocations');
assert.equal(allocateShoppingDemand([{id:'fraction',productId:'p',quantity:.3}],{p:.1})[0].toBuy,.2,'fractional stock arithmetic must not create phantom unmet demand');
assert.deepEqual(allocateMergedActuals([{id:'fraction-a',qtyTarget:.1},{id:'fraction-b',qtyTarget:.2}],.3,30000).map(r=>r.qtyPurchased),[.1,.2]);

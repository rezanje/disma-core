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

// Observed live shape: seven physical units all belong to another Packing PO.
const {warehouseReservationDetails}=require('./purchase-plan');
const {shoppingQuantities}=require('./shopping-quantities');
assert.equal(typeof warehouseReservationDetails,'function','stock explanations must expose the PO that owns the reservation');
const reservedRows=[{id:'old-line',salesOrderId:'old-po',productId:'leek',qtyFinal:7},{id:'new-line',salesOrderId:'new-po',productId:'leek',qtyFinal:null}];
const reservingOrders=[{id:'old-po',poNumber:'Existing PO',status:'Packing'},{id:'new-po',poNumber:'New PO',status:'Belanja'}];
const details=warehouseReservationDetails(reservedRows,reservingOrders,[]).filter((row:any)=>row.quantity>0);
assert.deepEqual(details,[{salesOrderItemId:'old-line',salesOrderId:'old-po',productId:'leek',poNumber:'Existing PO',status:'Packing',quantity:7}]);
const reservationTotals=warehouseReservations(reservedRows,reservingOrders,[]);
assert.equal(reservationTotals.leek,7);
const nextDemand=[{id:'new-line',productId:'leek',salesOrderId:'new-po',quantity:10}];
assert.equal(shoppingQuantities(nextDemand,{leek:7},reservationTotals)[0].totalQty,10,'seven physical but reserved units must not be bought against twice');
const releasedTotals=warehouseReservations(reservedRows,[{...reservingOrders[0],status:'Batal'},reservingOrders[1]],[]);
assert.equal(shoppingQuantities(nextDemand,{leek:7},releasedTotals)[0].totalQty,3,'the shortfall becomes three only when those units are actually free');
console.log('physical stock, reservation ownership and free-stock explanation checks passed');

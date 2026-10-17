import assert from 'node:assert/strict';
import fs from 'node:fs';
assert.ok(fs.existsSync('src/lib/planned-packet.ts'),'one planned document selection must supply both print modes');
const {plannedShoppingRows,plannedPacketPages}=require('./planned-packet');
const state:any={products:[{id:'p',skuCode:'SKU',name:'Daun',uom:'kg'}],vendors:[{id:'v',companyName:'Vendor A'}],users:[],clients:[],salesOrders:[{id:'so',clientId:'c',poNumber:'PO1',status:'Belanja',targetDeliveryDate:'2026-10-18'}],salesOrderItems:[{id:'l',salesOrderId:'so',productId:'p',qty:10}],purchases:[{id:'one',status:'Siap Cetak'},{id:'two',status:'Siap Cetak'},{id:'draft',status:'Menunggu Rencana'}],purchaseItems:[{id:'1',purchaseId:'one',productId:'p',salesOrderId:'so',qtyTarget:3,estimatedUnitPrice:15000,purchaseMethod:'Pasar',paymentMethod:'Cash',plannedVendorId:'v'},{id:'2',purchaseId:'two',productId:'p',salesOrderId:'so',qtyTarget:7,estimatedUnitPrice:16000,purchaseMethod:'Pasar',paymentMethod:'Tempo',plannedVendorId:'v'},{id:'3',purchaseId:'draft',productId:'p',qtyTarget:100,estimatedUnitPrice:1}]};
const rows=plannedShoppingRows(state,['one','two']);assert.equal(rows.length,2,'different payment methods must stay separate');assert.equal(rows.reduce((s:any,r:any)=>s+r.totalQty,0),10);assert.ok(rows.every((r:any)=>r.vendorName==='Vendor A'));
assert.equal(plannedShoppingRows(state,['one'])[0].totalQty,3,'unselected purchases must never enter either PDF');
assert.throws(()=>plannedShoppingRows(state,['draft']),/rencana/i);
const pages=plannedPacketPages(state,['one'],{},'KERTAS-1');assert.ok(!pages.some((p:any)=>p.kind==='belanja'&&!p.supplement),'the complete packet must append the canonical shopping PDF rather than another shopping template');
assert.equal(pages.find((p:any)=>p.kind==='qc'&&!p.supplement).rows[0][2],'3 kg');
console.log('both print modes share planned document scope, vendor/payment grouping and shopping renderer: OK');

const warehouse={...state,purchases:[{id:'stock',status:'Selesai',date:'2026-10-17'}],purchaseItems:[],salesOrders:[{...state.salesOrders[0],shoppingListDocumentId:'stock',status:'Packing'}]};
const stockPages=plannedPacketPages(warehouse,['stock'],{},'KERTAS-STOCK');
assert.equal(plannedShoppingRows(warehouse,['stock']).length,0);
assert.ok(stockPages.some((p:any)=>p.kind==='handover'&&!p.supplement));
assert.ok(stockPages.some((p:any)=>p.kind==='surat-jalan'&&!p.supplement),'warehouse-funded orders still need courier papers without a shopping row');

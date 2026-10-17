import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {jakartaDate} from './paper-operations';
const Module=require('node:module');const originalLoad=Module._load;
const state:any={products:[{id:'p',name:'Daun Bawang',skuCode:'PRD1',uom:'kg',basePrice:10000}],clients:[{id:'c',companyName:'Outlet A',address:'Jalan A'}],users:[{id:'qc',name:'Sandi',role:'gudang'},{id:'rivai',name:'Rivai',role:'kurir'}],salesOrders:[{id:'so',poNumber:'PO1',clientId:'c',status:'Packing',orderDate:'2026-10-17',targetDeliveryDate:jakartaDate(new Date(Date.now()+86400000)),assignedCourierId:'rivai'}],salesOrderItems:[{id:'li',salesOrderId:'so',productId:'p',qty:10,qtyFinal:10,unitPrice:20000}],purchases:[],purchaseItems:[],deliveries:[],courierSpares:[],vendors:[],bankAccounts:[],pendingReturns:[],currentUser:{role:'admin_po'}};
const store=Object.assign((selector?:any)=>selector?selector(state):state,{getState:()=>state});
Module._load=function(request:string,...args:any[]){if(request==='@/components/pdf-canvas-preview'||request==='./pdf-canvas-preview')return{PdfCanvasPreview:()=>null};if(request==='@/lib/store')return{useAppStore:store};return originalLoad.call(this,request,...args)};
try{
 const dispatchModule=require('../components/paper-dispatch-table');
 assert.equal(typeof dispatchModule.spareProductIds,'function','spare products must follow the selected courier orders');
 const sheet={...dispatchModule.emptyDispatchSheet(),orders:{so:{selected:true,courierId:'rivai',quantities:{li:10}},other:{selected:true,courierId:'ivan',quantities:{otherLine:4}}},spares:[{productId:'unrelated',courierId:'rivai',qty:1}]};
 const lines=[...state.salesOrderItems,{id:'otherLine',salesOrderId:'other',productId:'mint',qty:4,qtyFinal:4}];
 assert.deepEqual([...dispatchModule.spareProductIds(sheet,lines,[],'rivai')],['p']);
 assert.deepEqual([...dispatchModule.spareProductIds(sheet,lines,[],'ivan')],['mint']);
 assert.equal(dispatchModule.spareProductIds({...sheet,orders:{...sheet.orders,so:{...sheet.orders.so,selected:false}}},lines,[],'rivai').size,0);
 assert.equal(dispatchModule.spareProductIds({...sheet,orders:{so:{...sheet.orders.so,quantities:{li:0}}}},lines,[],'rivai').size,0);
 assert.deepEqual([...dispatchModule.spareProductIds(sheet,lines,[{salesOrderId:'so',status:'Menunggu',lineSnapshots:[{productId:'snapshot',qty:2}]}],'rivai')],['snapshot']);
 assert.throws(()=>dispatchModule.dispatchSheetRows(sheet,lines,{}),/Spare.*pesanan/i,'stale or unrelated selections must be rejected before submit');
 sheet.spares[0].productId='p';assert.equal(dispatchModule.dispatchSheetRows(sheet,lines,{}).spares.length,1);
 const inlineSheet=dispatchModule.emptyDispatchSheet();
 inlineSheet.orders={so:{selected:true,courierId:'rivai',quantities:{li:10}}};
 const inlineHtml=renderToStaticMarkup(createElement(dispatchModule.default,{sheet:inlineSheet,lines,locked:false,onChange:()=>{}}));
 assert.ok(inlineHtml.includes('Spare PO1 Daun Bawang'),'spare input must sit beside each carried product');
 assert.ok(!inlineHtml.includes('Tambah spare')&&!inlineHtml.includes('Barang spare 1'),'no separate spare selector');
 const withSpare=dispatchModule.setItemSpare(inlineSheet,'so','li','p',2);
 const switched=dispatchModule.setDispatchOrder(withSpare,'so',{courierId:'ivan'});
 assert.equal(switched.spares[0].courierId,'ivan','inline spare follows the order courier');
 assert.equal(dispatchModule.setDispatchOrder(withSpare,'so',{selected:false}).spares.length,0,'unselecting the PO removes its spare');
 assert.equal(dispatchModule.setDispatchOrder(withSpare,'so',{quantities:{li:0}}).spares.length,0,'zero carried qty removes its spare');
 assert.equal(dispatchModule.setItemSpare(withSpare,'so','li','p',0).spares.length,0);
 const twice=dispatchModule.setItemSpare(withSpare,'so','li','p',3);
 assert.equal(twice.spares.length,1,'editing replaces rather than duplicates a spare');
 assert.equal(dispatchModule.dispatchSheetRows(twice,lines,{}).spares[0].qty,3);
 const sharedCourier=dispatchModule.setItemSpare(dispatchModule.setDispatchOrder(twice,'second',{selected:true,courierId:'rivai',quantities:{li2:5}}),'second','li2','p',2);
 const combined=dispatchModule.dispatchSheetRows(sharedCourier,[...lines,{id:'li2',salesOrderId:'second',productId:'p',qty:5,qtyFinal:5}],{}).spares;
 assert.equal(combined.length,1,'same courier/product across POs must become one custody entry');
 assert.equal(combined[0].qty,5);


 const Qc=require('../components/qc-entry-table').default;const Packet=require('../components/field-packet-workspace').default;const Results=require('../components/paper-results-workspace').default;
 let html=renderToStaticMarkup(createElement(Qc,{transitionMode:true}));assert.ok(html.includes('Salin QC &amp; serah terima'));assert.ok(html.includes('Serah terima PO1'));assert.ok(html.includes('Rivai'));assert.ok(html.includes('Spare PO1 Daun Bawang'));assert.equal((html.match(/>Simpan QC &amp; serah terima</g)||[]).length,1,'one save action below both worksheets');assert.ok(!html.includes('>Simpan semua ('));
 html=renderToStaticMarkup(createElement(Packet));assert.ok(html.includes('Cetak daftar belanja &amp; paket lapangan'));assert.ok(html.includes('Pilih dokumen hasil perencanaan.'));assert.ok(!html.includes('Tanggal pengiriman</label>'),'no separate date-based shopping selection');
 html=renderToStaticMarkup(createElement(Results));assert.ok(html.includes('Salin hasil kiriman'));assert.ok(!html.includes('Catat packing'));
}finally{Module._load=originalLoad}
console.log('actual office view rendering: combined save, packet, courier and results-only screen: OK');

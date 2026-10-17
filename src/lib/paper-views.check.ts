import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {jakartaDate} from './paper-operations';
const Module=require('node:module');const originalLoad=Module._load;
const state:any={products:[{id:'p',name:'Daun Bawang',skuCode:'PRD1',uom:'kg',basePrice:10000}],clients:[{id:'c',companyName:'Outlet A',address:'Jalan A'}],users:[{id:'qc',name:'Sandi',role:'gudang'},{id:'rivai',name:'Rivai',role:'kurir'}],salesOrders:[{id:'so',poNumber:'PO1',clientId:'c',status:'Packing',orderDate:'2026-10-17',targetDeliveryDate:jakartaDate(new Date(Date.now()+86400000)),assignedCourierId:'rivai'}],salesOrderItems:[{id:'li',salesOrderId:'so',productId:'p',qty:10,qtyFinal:10,unitPrice:20000}],purchases:[],purchaseItems:[],deliveries:[],courierSpares:[],vendors:[],bankAccounts:[],pendingReturns:[],currentUser:{role:'admin_po'}};
const store=Object.assign((selector?:any)=>selector?selector(state):state,{getState:()=>state});
Module._load=function(request:string,...args:any[]){if(request==='@/components/pdf-canvas-preview'||request==='./pdf-canvas-preview')return{PdfCanvasPreview:()=>null};if(request==='@/lib/store')return{useAppStore:store};return originalLoad.call(this,request,...args)};
try{
 const Qc=require('../components/qc-entry-table').default;const Packet=require('../components/field-packet-workspace').default;const Results=require('../components/paper-results-workspace').default;
 let html=renderToStaticMarkup(createElement(Qc,{transitionMode:true}));assert.ok(html.includes('Salin QC &amp; serah terima'));assert.ok(html.includes('Serah terima PO1'));assert.ok(html.includes('Rivai'));assert.ok(html.includes('Spare dibawa kurir'));assert.equal((html.match(/>Simpan QC &amp; serah terima</g)||[]).length,1,'one save action below both worksheets');assert.ok(!html.includes('>Simpan semua ('));
 html=renderToStaticMarkup(createElement(Packet));assert.ok(html.includes('Cetak daftar belanja &amp; paket lapangan'));assert.ok(html.includes('Pilih dokumen hasil perencanaan.'));assert.ok(!html.includes('Tanggal pengiriman</label>'),'no separate date-based shopping selection');
 html=renderToStaticMarkup(createElement(Results));assert.ok(html.includes('Salin hasil kiriman'));assert.ok(!html.includes('Catat packing'));
}finally{Module._load=originalLoad}
console.log('actual office view rendering: combined save, packet, courier and results-only screen: OK');

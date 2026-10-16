const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const original=Module._load;
const state={
 tukarFakturs:[{id:'tf',clientId:'client',tfNumber:'TF-ORIGINAL',totalAmount:150,status:'Issued',issueDate:'2026-10-01',periodStart:'2026-10-01',periodEnd:'2026-10-01'}],
 invoices:[{id:'invoice',clientId:'client',tukarFakturId:'tf',totalAmount:100,amountPaid:40,status:'Partial',issueDate:'2026-10-01',dueDate:'2026-10-30'}],
 clients:[{id:'client',companyName:'Original client'}],salesOrders:[],salesOrderItems:[],products:[],
};
const box=({children})=>React.createElement('div',null,children);
Module._load=function(id,...args){
 if(id==='react')return {...React,use:()=>({id:'tf'}),useMemo:fn=>fn(),useState:value=>[value,()=>{}],useEffect:()=>{}};
 if(id==='@/lib/store')return {useAppStore:selector=>selector(state)};
 if(id==='next/navigation')return {useRouter:()=>({push:()=>{}})};
 if(id==='next/link')return {__esModule:true,default:({children,href})=>React.createElement('a',{href},children)};
 if(id.startsWith('@/components/'))return {__esModule:true,default:()=>null,Card:box,Button:box,Input:()=>null,Badge:box};
 return original.call(this,id,...args);
};
const rupiah=value=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(value);
try {
 for(const relative of ['admin/tukar-faktur/[id]/page.tsx','finance/tukar-faktur/[id]/page.tsx','finance/tukar-faktur/[id]/print/page.tsx']){
  const Page=require(path.resolve('src/app',relative)).default;
  const html=renderToStaticMarkup(React.createElement(Page,{params:Promise.resolve({id:'tf'})}));
  for(const [label,amount] of [['Nilai terbit',150],['Koreksi (credit note)',-50],['Nilai bersih saat ini',100],['Sisa piutang',60]]) {
   const start=html.indexOf(label);assert.ok(start>=0,`${relative}: ${label}`);
   const row=html.slice(start,html.indexOf('</tr>',start));
   assert.ok(row.includes(rupiah(amount)),`${relative}: ${label} must show ${amount}`);
  }
  assert.equal(state.tukarFakturs[0].totalAmount,150,'Rendering must preserve the issued document value');
 }
 console.log('TF detail and printable bundle preserve issued value, explain credits, and show current net AR');
} finally {Module._load=original;}

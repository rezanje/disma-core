const assert=require('node:assert/strict'),Module=require('node:module'),path=require('node:path');
const original=Module._load;
let role='finance',rpcCalls=[],imported;
const db={from(table){return{select(){return this},order(){return this},range:async()=>({data:[],error:null})}},rpc:async(name,args)=>{rpcCalls.push({name,args});imported=args.p_statement;return{data:{statement:{id:imported?.id||'saved'},rows:[],matches:[]},error:null}}};
Module._load=function(id,parent,main){
 if(id==='@/lib/api-auth')return{requireApiUser:async(request,roles)=>{if(!roles.includes(role))throw Object.assign(Error('Forbidden'),{status:403});return{id:'finance',role}},apiAuthResponse:error=>error.status?Response.json({error:error.message},{status:error.status}):null};
 if(id==='@/lib/supabase-admin')return{supabaseAdmin:db};
 return original.call(this,id,parent,main);
};
const api=require('../../src/app/api/accounting/bank-reconciliation/route.ts');
const request=body=>new Request('http://localhost/api/accounting/bank-reconciliation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
(async()=>{
 const rows=[{date:'2026-10-01',description:'Client, quoted',amount:100,type:'CR'}];
 let response=await api.POST(request({action:'import',bankAccountId:'bank',fileName:'one.csv',rows}));assert.equal(response.status,200);
 const firstId=imported.id;
 response=await api.POST(request({action:'import',bankAccountId:'bank',fileName:'renamed.csv',rows}));assert.equal(response.status,200);assert.equal(imported.id,firstId,'Same bank+semantic rows produces same import event across sessions');
 response=await api.POST(request({action:'import',bankAccountId:'bank',rows:[{...rows[0],amount:-1}]}));assert.equal(response.status,400);
 const count=rpcCalls.length;role='admin_po';response=await api.POST(request({action:'import',bankAccountId:'bank',rows}));assert.equal(response.status,403);assert.equal(rpcCalls.length,count);
 response=await api.GET(new Request('http://localhost/api/accounting/bank-reconciliation'));assert.equal(response.status,403);
 role='finance';response=await api.GET(new Request('http://localhost/api/accounting/bank-reconciliation'));assert.equal(response.status,200);assert.deepEqual(await response.json(),{statements:[],rows:[],matches:[]});
 console.log('bank reconciliation API auth, stable imports and reload passed');
})().catch(error=>{console.error(error);process.exitCode=1});

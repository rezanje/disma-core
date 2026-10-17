import assert from 'node:assert/strict';
import {POST} from '@/app/api/operations/paper/route';
import * as auth from './api-auth';
import {supabaseAdmin} from './supabase-admin';
async function main(){
 const oldOrigin=process.env.AUTH_APP_ORIGIN;process.env.AUTH_APP_ORIGIN='https://paper.test';
 const request=(command:unknown,origin='https://paper.test')=>new Request('https://paper.test/api/operations/paper',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(command)});
 assert.equal((await POST(request({}))).status,401);assert.equal((await POST(request({},'https://foreign.test'))).status,403);
 const oldAuth=auth.requireApiUser;const oldRpc=supabaseAdmin.rpc;let calls=0;
 try{
  (auth as any).requireApiUser=async(_req:Request,roles:string[])=>{assert.deepEqual(roles,['admin_po','finance','super_admin']);return{id:'office'}};
  (supabaseAdmin as any).rpc=async(name:string,args:any)=>{calls++;assert.equal(name,'process_paper_operation');assert.equal(args.p_actor,'office');return{error:null,data:{ok:true,eventId:args.p_command.eventId,updates:{purchaseItems:[{id:'pi',is_qced:true,physical_before_report:true}]}}}};
  assert.equal((await POST(request({eventId:'bad',stage:'audit',payload:{}}))).status,400);assert.equal(calls,0);
  const response=await POST(request({eventId:'paper',stage:'transcribe',actorId:'forged',payload:{qc:[],dispatches:[],spares:[]}}));assert.equal(response.status,200);const body=await response.json();assert.equal(body.updates.purchaseItems[0].isQCed,true);assert.equal(body.updates.purchaseItems[0].physicalBeforeReport,true);assert.equal(calls,1);
 }finally{(auth as any).requireApiUser=oldAuth;(supabaseAdmin as any).rpc=oldRpc;if(oldOrigin===undefined)delete process.env.AUTH_APP_ORIGIN;else process.env.AUTH_APP_ORIGIN=oldOrigin;}
 console.log('paper API authentication, origin, server actor and QC casing: OK');
}
main().catch(e=>{console.error(e);process.exitCode=1});

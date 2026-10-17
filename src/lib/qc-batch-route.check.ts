import assert from 'node:assert/strict';
import { POST } from '@/app/api/operations/goods/batch/route';
import * as auth from './api-auth';
import { supabaseAdmin } from './supabase-admin';
import { goodsUpdateKeys } from './goods-batch';
async function main(){
 const originalOrigin=process.env.AUTH_APP_ORIGIN;
 process.env.AUTH_APP_ORIGIN='https://example.test';
 const request=(entries:unknown,origin='https://example.test')=>new Request('https://example.test/api/operations/goods/batch',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({entries,actorId:'forged'})});
 const unauthenticated=await POST(request([]));assert.equal(unauthenticated.status,401);
 const crossSite=await POST(request([],'https://other.test'));assert.equal(crossSite.status,403);
 const oldAuth=auth.requireApiUser;const oldRpc=supabaseAdmin.rpc;
 let calls=0;
 try {
  (auth as any).requireApiUser=async(_request:Request,roles:string[])=>{assert.deepEqual(roles,['admin_po','finance','super_admin']);return {id:'office',role:'admin_po'}};
  (supabaseAdmin as any).rpc=async(_name:string,args:any)=>{
   calls++;assert.equal(args.p_actor,'office','actor is always the authenticated office user');
   return {error:null,data:{ok:true,updates:{...Object.fromEntries(goodsUpdateKeys.map(key=>[key,[]])),purchaseItems:[{id:'a',qc_event_ids:[args.p_command.eventId]}]}}};
  };
  const denied=await POST(request([{sourceId:'a',commands:[{eventId:'event',sourceId:'a',stage:'reserve',payload:{}}]}]));
  assert.equal(denied.status,400);assert.equal(calls,0,'no generic reserve or financial operations through batch QC');
  const accepted=await POST(request([{sourceId:'a',commands:[{eventId:'qc-a',sourceId:'a',stage:'qc',payload:{}}]}]));
  assert.equal(accepted.status,200);const body=await accepted.json();
  assert.equal(body.complete,true);assert.deepEqual(body.updates.purchaseItems[0].qcEventIds,['qc-a']);assert.equal(calls,1);
  console.log('bulk QC API authentication, origin, scope and server actor: OK');
 } finally {(auth as any).requireApiUser=oldAuth;(supabaseAdmin as any).rpc=oldRpc;if(originalOrigin===undefined)delete process.env.AUTH_APP_ORIGIN;else process.env.AUTH_APP_ORIGIN=originalOrigin;}
}
main().catch(error=>{console.error(error);process.exitCode=1});

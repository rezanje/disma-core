import { NextResponse } from 'next/server';
import { requireApiUser,apiAuthResponse } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { runQcBatch,validateQcBatch } from '@/lib/goods-batch';
export const dynamic='force-dynamic';
export const maxDuration=60;
function camel(value:unknown):unknown {
 if(Array.isArray(value))return value.map(camel);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[key.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase()),camel(item)]));
}
export async function POST(request:Request) {
 try {
  const actor=await requireApiUser(request,['admin_po','finance','super_admin']);
  const entries=validateQcBatch((await request.json())?.entries);
  const result=await runQcBatch(entries,async command=>{
   const {data,error}=await supabaseAdmin.rpc('process_goods_event',{p_command:command,p_actor:actor.id});
   return {data,error};
  });
  return NextResponse.json(camel(result),{headers:{'Cache-Control':'no-store'}});
 } catch(error){return apiAuthResponse(error)||NextResponse.json({error:error instanceof Error?error.message:'Simpan bersama gagal.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}

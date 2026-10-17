import { NextResponse } from 'next/server';
import { requireApiUser,apiAuthResponse } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
export const dynamic='force-dynamic';
export const maxDuration=60;
function camel(value:unknown):any {
 if(Array.isArray(value))return value.map(camel);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[key==='is_qced'?'isQCed':key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),camel(item)]));
}
export async function POST(request:Request) {
 try {
  const actor=await requireApiUser(request,['admin_po','finance','super_admin']);
  const command=await request.json();
  if(!command||typeof command.eventId!=='string'||!command.eventId.trim()||command.eventId.length>64||!['transcribe','supplement','spare-settle'].includes(command.stage)||!command.payload||typeof command.payload!=='object'||Array.isArray(command.payload))return NextResponse.json({error:'Berkas operasi tidak valid.'},{status:400});
  const {data,error}=await supabaseAdmin.rpc('process_paper_operation',{p_command:command,p_actor:actor.id});
  if(error)return NextResponse.json({error:error.message},{status:409});
  return NextResponse.json(camel(data),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return apiAuthResponse(error)||NextResponse.json({error:error instanceof Error?error.message:'Pencatatan berkas gagal.'},{status:400})}
}

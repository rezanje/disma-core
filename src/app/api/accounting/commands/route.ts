import {NextResponse} from 'next/server';
import {supabaseAdmin} from '@/lib/supabase-admin';
import {requireApiUser,apiAuthResponse} from '@/lib/api-auth';
export const dynamic='force-dynamic';
function camel(value:unknown):unknown{
 if(Array.isArray(value))return value.map(camel);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,v])=>[key.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase()),camel(v)]));
}
export async function POST(request:Request){
 try{
  const user=await requireApiUser(request,['finance','super_admin']);
  const input=await request.json();
  if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.eventId!=='string'||!input.eventId.trim())return NextResponse.json({error:'Identitas transaksi wajib diisi'},{status:400});
  const {data,error}=await supabaseAdmin.rpc('commit_finance_command',{p_command:input,p_actor_id:user.id});
  if(error)return NextResponse.json({error:error.message},{status:409});
  return NextResponse.json(camel(data),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return apiAuthResponse(error)||NextResponse.json({error:error instanceof Error?error.message:'Pencatatan gagal'},{status:400});}
}

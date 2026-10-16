import { NextResponse } from 'next/server';
import { requireApiUser, apiAuthResponse } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
export const dynamic = 'force-dynamic';
function toCamel(value: unknown): any {
  if(Array.isArray(value))return value.map(toCamel);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),toCamel(item)]));
}
export async function POST(request: Request) {
  try {
    const actor = await requireApiUser(request, ['admin_po','finance','super_admin']);
    const command = await request.json();
    if (!command || typeof command.eventId !== 'string' || !command.eventId.trim() || command.eventId.length>96 || typeof command.sourceId !== 'string' || typeof command.stage !== 'string' || !command.payload || typeof command.payload !== 'object' || Array.isArray(command.payload)) {
      return NextResponse.json({error:'Berkas kejadian barang tidak valid.'},{status:400});
    }
    if (command.stage === 'reserve') return NextResponse.json({error:'Reservasi harus berasal dari dokumen belanja.'},{status:400});
    if (command.stage === 'dropship' && !['finance','super_admin'].includes(actor.role)) return NextResponse.json({error:'Finalisasi dropship hanya Finance/Super Admin.'},{status:403});
    if (command.stage === 'opname' && actor.role !== 'super_admin') return NextResponse.json({error:'Opname hanya Super Admin.'},{status:403});
    const {data,error} = await supabaseAdmin.rpc('process_goods_event',{p_command:command,p_actor:actor.id});
    if (error) return NextResponse.json({error:error.message},{status:409});
    return NextResponse.json({...toCamel(data),eventId:command.eventId},{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    return apiAuthResponse(error) || NextResponse.json({error:error instanceof Error ? error.message : 'Gagal mencatat barang.'},{status:400});
  }
}

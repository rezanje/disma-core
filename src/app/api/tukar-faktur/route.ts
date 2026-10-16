import { requireApiUser, apiAuthResponse } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
export const dynamic = 'force-dynamic';
export async function POST(request:Request) {
  try {
    const user = await requireApiUser(request);
    const body=await request.json();
    const params = body.params;
    if (!params || typeof params.p_tf_id !== 'string') return Response.json({error:'TF tidak valid'},{status:400});
    const {data:tf,error:tfError}=await supabaseAdmin.from('tukar_faktur').select('status').eq('id',params.p_tf_id).maybeSingle();
    if(tfError) throw tfError;
    if(!tf) return Response.json({error:'TF tidak ditemukan'},{status:404});
    if(body.action==='delete' && tf.status!=='Draft') return Response.json({error:'TF terbit harus dipertahankan sebagai riwayat'},{status:409});
    if(body.action==='link' && tf.status!=='Draft') return Response.json({error:'Isi TF terbit tidak boleh diubah'},{status:409});
    const rpc = body.action==='issue' ? 'issue_tukar_faktur' : body.action==='link' ? 'link_invoices_to_tukar_faktur' : body.action==='delete' ? 'delete_tukar_faktur' : null;
    if(!rpc) return Response.json({error:'Tindakan TF tidak valid'},{status:400});
    const args:Record<string,unknown>={p_tf_id:params.p_tf_id};
    if(body.action!=='delete') {
      if(!Array.isArray(params.p_invoice_ids) || !params.p_invoice_ids.length || params.p_invoice_ids.some((id:unknown)=>typeof id!=='string')) return Response.json({error:'Invoice TF tidak valid'},{status:400});
      args.p_invoice_ids=[...new Set(params.p_invoice_ids)];
    }
    if(body.action==='issue') { args.p_issue_date=params.p_issue_date; args.p_user_id=user.id; }
    const {data,error}=await supabaseAdmin.rpc(rpc,args);
    if(error) return Response.json({error:error.message},{status:409});
    return Response.json({data},{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return apiAuthResponse(error) || Response.json({error:'Gagal memproses TF'},{status:500}); }
}

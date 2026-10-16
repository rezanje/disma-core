import { requireApiUser, apiAuthResponse } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
export async function POST(request:Request) {
  try {
    await requireApiUser(request,['finance','super_admin']);
    const body=await request.json();
    if(typeof body.vendorId!=='string' || typeof body.billDate!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.billDate)) return Response.json({error:'Vendor/tanggal tidak valid'},{status:400});
    const {data,error}=await supabaseAdmin.rpc('generate_vendor_bill_number',{p_vendor_id:body.vendorId,p_bill_date:body.billDate});
    if(error) throw error;
    return Response.json({data});
  } catch(error) { return apiAuthResponse(error) || Response.json({error:'Penomoran tagihan gagal'},{status:500}); }
}

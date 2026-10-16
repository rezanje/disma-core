import { requireApiUser, apiAuthResponse } from '@/lib/api-auth';
export const dynamic='force-dynamic';
/** Retired: money and goods must post all legs through their source command. */
export async function POST(request:Request) {
  try {
    await requireApiUser(request);
    return Response.json({error:'Gunakan perintah transaksi sumber; posting jurnal/kas terpisah telah dinonaktifkan.'},{status:410,headers:{'Cache-Control':'no-store'}});
  } catch(error) {return apiAuthResponse(error) || Response.json({error:'Autentikasi tidak tersedia'},{status:503});}
}

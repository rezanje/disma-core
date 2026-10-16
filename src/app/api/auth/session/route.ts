import { requireApiUser, loginApiUser, logoutApiUser, apiAuthResponse } from '@/lib/api-auth';
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/server-session';
export const dynamic = 'force-dynamic';
function cookie(value:string, maxAge:number) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
function failed(error:unknown) { return apiAuthResponse(error) || Response.json({error:'Layanan autentikasi gagal'},{status:503}); }
export async function GET(request:Request) {
  try { return Response.json({user:await requireApiUser(request)},{headers:{'Cache-Control':'no-store'}}); } catch(error) { return failed(error); }
}
export async function POST(request:Request) {
  try {
    const body=await request.json();
    const session=await loginApiUser(request,typeof body.pin==='string' ? body.pin : '');
    return Response.json({user:session.user},{headers:{'Set-Cookie':cookie(session.token,SESSION_TTL_SECONDS),'Cache-Control':'no-store'}});
  } catch(error) { return failed(error); }
}
export async function DELETE(request:Request) {
  try {
    await logoutApiUser(request);
    return Response.json({ok:true},{headers:{'Set-Cookie':cookie('',0),'Cache-Control':'no-store'}});
  } catch(error) { return failed(error); }
}

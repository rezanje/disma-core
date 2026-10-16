import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser, apiAuthResponse } from '@/lib/api-auth';
export async function proxy(request:NextRequest) {
  if (request.nextUrl.pathname === '/api/auth/session') return NextResponse.next();
  try {
    const maintenance = /^\/api\/db\/(backup|reset)(\/|$)/.test(request.nextUrl.pathname) || request.nextUrl.pathname === '/api/history';
    await requireApiUser(request, maintenance ? ['super_admin'] : undefined);
    return NextResponse.next();
  } catch(error) { return apiAuthResponse(error) || NextResponse.json({error:'Layanan autentikasi gagal'},{status:503}); }
}
export const config = { matcher: ['/api/:path*'] };

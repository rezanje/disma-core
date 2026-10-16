import { createSessionService, assertSameOrigin, SessionError, SESSION_COOKIE, type SessionRepository } from './server-session';
import type { Role, User } from '@/types';
export { SessionError as ApiAuthError } from './server-session';

async function sessionService() {
  const { supabaseAdmin: db } = await import('./supabase-admin');
  const checked = <T>(result: {data:T;error:unknown}): T => { if (result.error) throw new SessionError('Layanan autentikasi belum tersedia',503); return result.data; };
  const repository: SessionRepository = {
    usersByPin: async pin => checked(await db.from('users').select('*').eq('pin', pin)) || [],
    userById: async id => checked(await db.from('users').select('*').eq('id',id).maybeSingle()),
    putSession: async session => { checked(await db.from('auth_sessions').insert(session)); },
    getSession: async id => checked(await db.from('auth_sessions').select('*').eq('id',id).maybeSingle()),
    revokeSession: async id => { checked(await db.from('auth_sessions').update({revoked_at:new Date().toISOString()}).eq('id',id)); },
    takeLoginAttempt: async key => checked(await db.rpc('take_auth_login_attempt',{p_key:key})) === true,
  };
  return createSessionService(repository, process.env.AUTH_SESSION_SECRET || '');
}
export function sessionToken(request: Request) {
  return request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length+1);
}
export async function requireApiUser(request: Request, allowedRoles?: readonly Role[]): Promise<User> {
  assertSameOrigin(request, process.env.AUTH_APP_ORIGIN);
  if (!sessionToken(request)) throw new SessionError('Silakan masuk',401);
  const user = await (await sessionService()).authenticate(sessionToken(request));
  if (allowedRoles && !allowedRoles.includes(user.role)) throw new SessionError('Tidak diizinkan',403);
  return user;
}
export async function loginApiUser(request: Request, pin: string) {
  assertSameOrigin(request,process.env.AUTH_APP_ORIGIN);
  // Only the hosting platform's trusted forwarding header may partition the limit.
  // On other hosts all clients share the same conservative limit.
  const clientKey = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for') || 'unknown' : 'shared';
  return (await sessionService()).login(pin,clientKey);
}
export async function logoutApiUser(request: Request) {
  assertSameOrigin(request,process.env.AUTH_APP_ORIGIN);
  await (await sessionService()).logout(sessionToken(request));
}
export function apiAuthResponse(error: unknown): Response | null {
  return error instanceof SessionError ? Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}}) : null;
}

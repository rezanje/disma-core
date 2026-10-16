import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Role, User } from '@/types';

export const SESSION_COOKIE = 'disma_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export class SessionError extends Error {
  constructor(message: string, public status = 401) { super(message); }
}
export type Identity = { id: string; name: string; role: string; pin?: string | null; is_active?: boolean; isActive?: boolean };
export type SessionRow = { id: string; user_id: string; fingerprint: string; expires_at: string; revoked_at?: string | null };
export interface SessionRepository {
  usersByPin(pin: string): Promise<Identity[]>;
  userById(id: string): Promise<Identity | null>;
  putSession(session: SessionRow): Promise<void>;
  getSession(id: string): Promise<SessionRow | null>;
  revokeSession(id: string): Promise<void>;
  takeLoginAttempt(key: string): Promise<boolean>;
}
const loginRoles = new Set(['super_admin', 'admin_po', 'finance']);
export function publicUser(user: Identity): User {
  return { id: user.id, name: user.name, role: user.role as Role, isActive: user.is_active !== false && user.isActive !== false } as User;
}
function active(user: Identity | null): user is Identity {
  return !!user && user.is_active !== false && user.isActive !== false && loginRoles.has(user.role);
}
export function createSessionService(repo: SessionRepository, secret: string, now = Date.now) {
  if (!secret || Buffer.byteLength(secret) < 32) throw new SessionError('AUTH_SESSION_SECRET must contain at least 32 bytes', 503);
  const sign = (value: string) => createHmac('sha256', secret).update(value).digest('base64url');
  const fingerprint = (user: Identity) => sign(JSON.stringify([user.id, user.role, user.pin, user.is_active, user.isActive]));
  const decode = (token?: string) => {
    if (!token || token.length > 512) throw new SessionError('Sesi tidak valid');
    const [id, signature, extra] = token.split('.');
    if (!id || !signature || extra) throw new SessionError('Sesi tidak valid');
    const expected = Buffer.from(sign(id)); const supplied = Buffer.from(signature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new SessionError('Sesi tidak valid');
    return id;
  };
  return {
    async login(pin: string, clientKey: string) {
      if (!(await repo.takeLoginAttempt(sign(clientKey)))) throw new SessionError('Terlalu banyak percobaan. Coba lagi nanti.', 429);
      if (!/^\d{4,6}$/.test(pin)) throw new SessionError('PIN salah');
      const candidates = (await repo.usersByPin(pin)).filter(active);
      if (candidates.length !== 1) throw new SessionError('PIN salah atau akun tidak aktif');
      const user = candidates[0]; const id = randomBytes(32).toString('base64url');
      const expiresAt = new Date(now() + SESSION_TTL_SECONDS * 1000).toISOString();
      await repo.putSession({id, user_id:user.id, fingerprint:fingerprint(user), expires_at:expiresAt});
      return {user:publicUser(user), token:`${id}.${sign(id)}`, expiresAt};
    },
    async authenticate(token?: string): Promise<User> {
      const session = await repo.getSession(decode(token));
      if (!session || session.revoked_at || Date.parse(session.expires_at) <= now() || !Number.isFinite(Date.parse(session.expires_at))) throw new SessionError('Sesi berakhir');
      const user = await repo.userById(session.user_id);
      if (!active(user) || fingerprint(user) !== session.fingerprint) throw new SessionError('Sesi dicabut');
      return publicUser(user);
    },
    async logout(token?: string) { if (token) await repo.revokeSession(decode(token)); },
  };
}
export function assertSameOrigin(request: Request, appOrigin: string | undefined) {
  if (['GET','HEAD','OPTIONS'].includes(request.method)) return;
  if (!appOrigin) throw new SessionError('AUTH_APP_ORIGIN belum diatur',503);
  let origin: string;
  try { origin = new URL(appOrigin).origin; } catch { throw new SessionError('AUTH_APP_ORIGIN tidak valid',503); }
  if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new SessionError('Permintaan lintas situs ditolak',403);
}
const sharedWrites = new Set(['notifications','disma_tasks','record_history']);
const poWrites = new Set(['clients','client_prices','products','vendors','vendor_prices','sales_orders','sales_order_items','purchase_requests','purchases','purchase_items','deliveries','stock_movements','pending_returns','rejected_items','vendor_returns','invoices','shopping_draft','tukar_faktur','vendor_bills']);
const financeWrites = new Set(['vendors','purchases','purchase_items','purchase_requests','products','vendor_prices','deliveries','stock_movements','pending_returns','rejected_items','vendor_returns','invoices','expenses','reimbursements','vendor_bills','disbursement_requests','tutup_hari_kantong','daily_close','credit_notes','bank_accounts','fixed_assets','tukar_faktur']);
const adminWrites = new Set(['users','app_settings','coas','leads',...poWrites,...financeWrites,...sharedWrites]);
export function assertTableWrite(role: Role, table: string, method: string) {
  const allowed = role === 'super_admin' ? adminWrites : role === 'admin_po' ? new Set([...poWrites,...sharedWrites]) : role === 'finance' ? new Set([...financeWrites,...sharedWrites]) : new Set<string>();
  if (['stock_movements','credit_notes'].includes(table)) throw new SessionError('Gunakan perintah transaksi sumber',403);
  if (!allowed.has(table)) throw new SessionError('Tabel atau tindakan tidak diizinkan',403);
  if (method === 'DELETE' && !['notifications','disma_tasks','client_prices','vendor_prices'].includes(table) && !(role === 'super_admin' && ['clients','users','leads'].includes(table))) throw new SessionError('Riwayat bisnis tidak boleh dihapus langsung',403);
}

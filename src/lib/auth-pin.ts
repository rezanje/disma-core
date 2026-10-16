// Legacy pure lookup retained for compatibility checks only. Runtime login uses
// server-session.ts with the database-backed identity and signed session.

export type PinCandidate = { pin?: string | null; isActive?: boolean };

export function findActiveUserByPin<T extends PinCandidate>(users: T[], pin: string): T | null {
  if (!pin) return null;
  const match = (users || []).find(u => u.pin === pin && u.isActive !== false);
  return match ?? null;
}

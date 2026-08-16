// PIN lookup for the login screen. Pure so auth-pin.check.ts can cover the rule that
// matters: a parked account must not be able to sign in.
//
// The flag lives on the user record in constants.ts, not in the database. The login
// screen never reads the users table — it matches against MOCK_USERS and overwrites the
// store's user list with that constant on every mount. A column in the database would
// be a trap: someone switches it off there, nothing happens, and nobody can see why.
//
// isActive is optional and absent means active, so existing entries keep working
// without being touched.

export type PinCandidate = { pin?: string | null; isActive?: boolean };

export function findActiveUserByPin<T extends PinCandidate>(users: T[], pin: string): T | null {
  if (!pin) return null;
  const match = (users || []).find(u => u.pin === pin && u.isActive !== false);
  return match ?? null;
}

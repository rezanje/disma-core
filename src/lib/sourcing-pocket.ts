// Which cash pocket a shopping report draws from. Pure — no store import — so the rule
// is testable on its own.
//
// Before transcription mode the answer was always "the pocket owned by whoever is
// logged in", and a cash purchase typed by anyone else was refused outright. Now
// Finance types on the sourcer's behalf, so the money still has to leave the sourcer's
// pocket rather than nobody's. The on-behalf-of choice therefore wins over the typist's
// own pocket, and an unknown choice returns null instead of quietly falling back —
// falling back is how cash leaves the wrong pocket without anyone noticing.

export type PocketBank = {
  id: string;
  purpose?: string | null;
  ownerUserId?: string | null;
  name?: string;
  balance?: number;
};

export function pocketOwners<T extends PocketBank>(banks: T[]): T[] {
  return (banks || []).filter(b => b.purpose === 'sourcing_pocket' && !!b.ownerUserId);
}

export function resolvePocket<T extends PocketBank>(
  banks: T[],
  currentUserId?: string | null,
  onBehalfOfUserId?: string | null,
): T | null {
  const pockets = pocketOwners(banks);
  if (onBehalfOfUserId) {
    return pockets.find(b => b.ownerUserId === onBehalfOfUserId) ?? null;
  }
  if (!currentUserId) return null;
  return pockets.find(b => b.ownerUserId === currentUserId) ?? null;
}

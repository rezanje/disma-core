// Proof rule for transcribed work. Pure so the condition is testable.
//
// A line the typist performed themselves needs no photo — they were there. A line
// copied off someone else's paper does: the paper is the only original, it lives in a
// pocket, and once it is lost the number in the system has nothing behind it.

export function requiresProof(
  performedByUserId: string | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  if (!performedByUserId) return false;
  return performedByUserId !== currentUserId;
}

export function proofBlocker(
  performedByUserId: string | null | undefined,
  currentUserId: string | null | undefined,
  proofUrl?: string | null,
): string | null {
  if (!requiresProof(performedByUserId, currentUserId)) return null;
  if (proofUrl) return null;
  return 'Lampirkan foto kertas belanjanya dulu. Laporan salinan tanpa foto tidak punya bukti apa pun kalau angkanya dipertanyakan nanti.';
}

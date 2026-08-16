// Who did the work, as opposed to who typed it in. Pure so the fallback order is
// testable.
//
// Under transcription mode the field team works on paper and Admin PO or Finance type
// it in later. Every one of these fields used to be filled with the logged-in user, so
// an audit trail built to answer "who received these goods" answered "Sifa" for
// everything. record_history separately records the typist, so the two never collapse
// into one name again.

export function resolveActor(
  performedByUserId: string | null | undefined,
  currentUserId: string | null | undefined,
): string {
  return performedByUserId || currentUserId || 'system';
}

export function transcriptionNote(
  performedByName?: string | null,
  typedByName?: string | null,
): string | undefined {
  if (!performedByName || !typedByName) return undefined;
  if (performedByName === typedByName) return undefined;
  return `Dikerjakan ${performedByName}, disalin ${typedByName}`;
}

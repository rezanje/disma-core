// Which vendors may still be picked. Pure — no store import — so vendor-status.check.ts
// can run it directly.
//
// 'blocked' hides the vendor from every picker. 'suspended' does not: it is a warning
// state for a vendor under review, and hiding it would silently break in-flight work.
// A vendor already attached to the row stays selectable whatever its status — dropping
// it would blank the field on open and lose which vendor the goods actually came from.

export type VendorStatus = 'approved' | 'suspended' | 'blocked';

export function selectableVendors<T extends { status?: VendorStatus | null }>(
  vendors: T[],
  currentVendorId?: string,
  idOf: (v: T) => string = (v) => (v as unknown as { id: string }).id,
): T[] {
  return (vendors || []).filter(v =>
    v.status !== 'blocked' || (currentVendorId != null && idOf(v) === currentVendorId));
}

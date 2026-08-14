// Pure helpers for delivery route planning. No store/React/Leaflet imports so
// they stay trivially testable — same shape as backorder.ts.

/** Both coordinates or nothing: a half-filled record would pin the equator. */
export function hasLocation(c: { latitude?: number; longitude?: number }): boolean {
  return typeof c.latitude === 'number' && typeof c.longitude === 'number';
}

/** Opens the courier's own map app at the point. A plain link — no paid API. */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

/** Move one item within a list. Returns a new array; out-of-range is a no-op. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Planned order first; never-ordered stops keep their existing order, at the end. */
export function sortStops<T extends { routeOrder?: number }>(stops: T[]): T[] {
  return [...stops].sort((a, b) => {
    const ao = a.routeOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.routeOrder ?? Number.MAX_SAFE_INTEGER;
    return ao - bo;
  });
}

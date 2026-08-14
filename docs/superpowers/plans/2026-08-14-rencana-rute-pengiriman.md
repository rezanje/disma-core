# Rencana Rute Pengiriman Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Admin PO see the day's drops on a map, split them between couriers, and order each courier's stops — while most clients still have no recorded location.

**Architecture:** Client coordinates are new columns filled two ways (courier GPS at the door, admin pin-by-name). The assignment lives on the sales order, not on `Delivery`, because `Delivery` rows are only created when the warehouse releases goods, which can happen after planning. The map is vanilla Leaflet in a client-only component — no React wrapper library, so nothing depends on React 19 peer support.

**Tech Stack:** Next.js 16 App Router, React 19, Zustand (`src/lib/store.ts`), Supabase via `/api/db`, Leaflet 1.9 + OpenStreetMap tiles, Nominatim for name search, `node:assert` checks run with `npx tsx`.

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-08-14-rencana-rute-pengiriman-design.md`.
- **Free map only.** OpenStreetMap tiles and Nominatim search. No Google Maps API, no API key, no billing account. The only Google involvement is a plain `https://www.google.com/maps/...` link opened on the courier's phone.
- **The screen must be useful while most clients have no location.** 204 of 205 clients have an empty address today. Clients without coordinates appear in a separate list, and are still assignable and orderable.
- **Stop order is manual.** No automatic ordering, no shortest-path calculation, no road-distance lookup. All three were considered and rejected.
- A courier-recorded GPS point overwrites an admin-placed pin. The person standing at the door knows better than the one guessing from a map.
- Leaflet touches `window` at import time. Every Leaflet import must be dynamic and client-only (`ssr: false`), or the build breaks.
- Nominatim requires a identifying `User-Agent` and allows at most 1 request/second. Call it from a server route, never from the browser.
- Indonesian for all user-facing copy; English for code, comments and commit messages.
- No test framework. Checks are `*.check.ts` using `node:assert/strict`, run with `npx tsx <path>`, ending in `console.log('<name>: all checks passed')`.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260814000001_delivery_route_planning.sql` | New columns on `clients` and `sales_orders` |
| `src/lib/delivery-route.ts` | Pure: location presence, stop grouping, manual reordering, maps URL |
| `src/lib/delivery-route.check.ts` | Runnable check for the above |
| `src/app/api/geocode/route.ts` | Nominatim proxy — search by name, throttled server-side |
| `src/components/map/DeliveryMap.tsx` | Client-only Leaflet map: renders pins, reports clicks |
| `src/app/admin/delivery-routes/page.tsx` | The planning screen |
| `src/app/courier/list/page.tsx` | Own stops only, GPS capture, maps link |
| `src/app/warehouse/outbound/page.tsx` | New `Delivery` inherits the planned courier |
| `src/lib/store.ts`, `src/lib/navigation.tsx`, `src/types/index.ts` | Fields, action, nav entry, permissions |

---

### Task 1: Columns, types, and the pure route helpers

**Files:**
- Create: `supabase/migrations/20260814000001_delivery_route_planning.sql`
- Create: `src/lib/delivery-route.ts`
- Test: `src/lib/delivery-route.check.ts`
- Modify: `src/types/index.ts:35-49` (Client), `src/types/index.ts:153-171` (SalesOrder)
- Modify: `supabase/dev-bootstrap.sql`

**Interfaces:**
- Produces:
  - `Client.latitude?: number`, `Client.longitude?: number`, `Client.locationNote?: string`
  - `SalesOrder.assignedCourierId?: string`, `SalesOrder.routeOrder?: number`
  - `hasLocation(c: { latitude?: number; longitude?: number }): boolean`
  - `googleMapsUrl(lat: number, lng: number): string`
  - `moveItem<T>(list: T[], from: number, to: number): T[]`
  - `sortStops<T extends { routeOrder?: number }>(stops: T[]): T[]`

- [ ] **Step 1: Write the failing check**

Create `src/lib/delivery-route.check.ts`:

```ts
/**
 * Runnable check for the delivery-route helpers. No test framework in this repo —
 * run directly:  npx tsx src/lib/delivery-route.check.ts
 */
import assert from 'node:assert/strict';
import { hasLocation, googleMapsUrl, moveItem, sortStops } from './delivery-route';

// A client counts as located only with BOTH coordinates. A half-filled record
// would put a pin on the equator.
assert.equal(hasLocation({ latitude: -6.2, longitude: 106.8 }), true);
assert.equal(hasLocation({ latitude: -6.2 }), false);
assert.equal(hasLocation({ longitude: 106.8 }), false);
assert.equal(hasLocation({}), false);
// 0 is a real coordinate, not "missing".
assert.equal(hasLocation({ latitude: 0, longitude: 0 }), true);

// The courier's link opens their own map app at the exact point.
assert.equal(
  googleMapsUrl(-6.2088, 106.8456),
  'https://www.google.com/maps/search/?api=1&query=-6.2088%2C106.8456'
);

// Manual reordering: move an item and close the gap behind it.
assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
assert.deepEqual(moveItem(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c']);
// Out-of-range indices leave the list untouched rather than dropping items.
assert.deepEqual(moveItem(['a', 'b', 'c'], -1, 1), ['a', 'b', 'c']);
assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 9), ['a', 'b', 'c']);
// The original array is never mutated.
const original = ['a', 'b', 'c'];
moveItem(original, 0, 2);
assert.deepEqual(original, ['a', 'b', 'c']);

// Stops render in the order Admin PO set. Anything never ordered sorts last,
// in a stable order, so new drops land at the bottom instead of jumping around.
assert.deepEqual(
  sortStops([{ id: 'c', routeOrder: 2 }, { id: 'a', routeOrder: 0 }, { id: 'b', routeOrder: 1 }]).map(s => s.id),
  ['a', 'b', 'c']
);
assert.deepEqual(
  sortStops([{ id: 'x' }, { id: 'a', routeOrder: 0 }, { id: 'y' }]).map(s => s.id),
  ['a', 'x', 'y']
);

console.log('delivery-route: all checks passed');
```

- [ ] **Step 2: Run the check to verify it fails**

```bash
npx tsx src/lib/delivery-route.check.ts
```

Expected: FAIL — `Cannot find module './delivery-route'`.

- [ ] **Step 3: Write the pure module**

Create `src/lib/delivery-route.ts`:

```ts
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
```

- [ ] **Step 4: Run the check to verify it passes**

```bash
npx tsx src/lib/delivery-route.check.ts
```

Expected: `delivery-route: all checks passed`

- [ ] **Step 5: Add the type fields**

In `src/types/index.ts`, inside `interface Client` (after `defaultPriceTier`):

```ts
  // Titik peta untuk perencanaan rute. Diisi bertahap: kurir merekam GPS di
  // lokasi, atau Admin PO memasang pin dari peta.
  latitude?: number;
  longitude?: number;
  locationNote?: string; // patokan, mis. "gang sebelah Indomaret, pagar hijau"
```

Inside `interface SalesOrder` (after `receivedBy`):

```ts
  // Rencana rute harian dari Admin PO. Disimpan di sini, bukan di Delivery,
  // karena baris Delivery baru dibuat saat gudang merilis barang — bisa setelah
  // rencananya disusun.
  assignedCourierId?: string;
  routeOrder?: number;
```

- [ ] **Step 6: Write the migration**

Create `supabase/migrations/20260814000001_delivery_route_planning.sql`:

```sql
-- supabase/migrations/20260814000001_delivery_route_planning.sql
-- Perencanaan rute pengiriman harian.
--
-- Aplikasi tidak tahu lokasi klien mana pun: 204 dari 205 klien kolom alamatnya
-- kosong, jadi tidak ada yang bisa ditebak dari teks. Koordinat diisi bertahap —
-- kurir merekam GPS saat berada di lokasi, atau Admin PO memasang pin dari peta.
-- Karena itu semua kolom di bawah boleh kosong, dan layar perencanaan harus
-- tetap berguna saat sebagian besar masih kosong.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS latitude      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_note TEXT;

-- Penugasan kurir menempel pada sales order, bukan pada deliveries: baris
-- delivery baru lahir saat gudang merilis barang, yang bisa terjadi setelah
-- Admin PO menyusun rencana.
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS assigned_courier_id TEXT,
  ADD COLUMN IF NOT EXISTS route_order         INTEGER;

-- Layar perencanaan selalu memfilter satu tanggal kirim.
CREATE INDEX IF NOT EXISTS idx_sales_orders_target_delivery
  ON public.sales_orders (target_delivery_date);
```

Add the same columns to `supabase/dev-bootstrap.sql` in the `clients` and `sales_orders` table definitions so a fresh local database matches.

- [ ] **Step 7: Apply the migration and verify**

Apply it to the Supabase project `ckkohudfuisgzlrjipev` (Disma Core ERP), then confirm:

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: the same 4 pre-existing errors in `src/app/admin/loss-analytics/page.tsx` and `src/app/finance/disbursements/page.tsx`, nothing new.

Verify the columns landed by querying `information_schema.columns` for `clients` and `sales_orders` — expect `latitude`, `longitude`, `location_note`, `assigned_courier_id`, `route_order`.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/lib/delivery-route.ts src/lib/delivery-route.check.ts supabase/migrations/20260814000001_delivery_route_planning.sql supabase/dev-bootstrap.sql
git commit -m "feat(routes): columns and pure helpers for delivery route planning"
```

---

### Task 2: Store actions for location and assignment

**Files:**
- Modify: `src/lib/store.ts` (interface near line 364, implementation near `updateClient`)

**Interfaces:**
- Consumes: `saveLocalClientsCache`, `saveLocalSalesOrdersCache`, `syncTable`, `logHistory` (all already in `store.ts`).
- Produces:
  - `setClientLocation: (clientId: string, lat: number, lng: number, note?: string) => Promise<void>`
  - `assignRoute: (updates: { salesOrderId: string; courierId: string | null; routeOrder: number }[]) => Promise<void>`

- [ ] **Step 1: Declare both on the store interface**

In `src/lib/store.ts`, after `deleteClient` in the interface:

```ts
  setClientLocation: (clientId: string, lat: number, lng: number, note?: string) => Promise<void>;
  assignRoute: (updates: { salesOrderId: string; courierId: string | null; routeOrder: number }[]) => Promise<void>;
```

- [ ] **Step 2: Implement `setClientLocation`**

Add next to `updateClient` in the store body:

```ts
      setClientLocation: async (clientId, lat, lng, note) => {
        const before = get().clients.find(c => c.id === clientId);
        if (!before) return;
        const patch: Partial<Client> = { latitude: lat, longitude: lng };
        // Catatan patokan hanya ditimpa kalau memang diisi — kurir yang merekam
        // GPS tidak boleh menghapus patokan yang sudah ditulis Admin PO.
        if (note !== undefined) patch.locationNote = note;
        const updated = get().clients.map(c => c.id === clientId ? { ...c, ...patch } : c);
        set({ clients: updated });
        saveLocalClientsCache(updated);
        const after = updated.find(c => c.id === clientId);
        if (after) {
          await get().syncTable('clients', after);
          await get().logHistory({ table: 'clients', recordId: clientId, action: 'update', oldData: before, newData: after });
        }
      },
```

- [ ] **Step 3: Implement `assignRoute`**

```ts
      // Satu simpanan untuk seluruh papan rencana. Menyimpan per baris berarti
      // puluhan permintaan tiap kali Admin PO menggeser satu perhentian.
      assignRoute: async (updates) => {
        if (updates.length === 0) return;
        const map = new Map(updates.map(u => [u.salesOrderId, u]));
        const updated = get().salesOrders.map(so => {
          const u = map.get(so.id);
          if (!u) return so;
          return { ...so, assignedCourierId: u.courierId || undefined, routeOrder: u.routeOrder };
        });
        set({ salesOrders: updated });
        saveLocalSalesOrdersCache(updated);
        const changed = updated.filter(so => map.has(so.id));
        const res = await fetch('/api/db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'sales_orders', data: changed })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Gagal menyimpan rencana rute');
        }
      },
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: the same 4 pre-existing errors, nothing new.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat(routes): store actions to set a client location and save a route plan"
```

---

### Task 3: Name search against Nominatim

**Files:**
- Create: `src/app/api/geocode/route.ts`

**Interfaces:**
- Produces: `GET /api/geocode?q=<name>` → `{ results: { label: string; lat: number; lng: number }[] }`

- [ ] **Step 1: Write the route**

Create `src/app/api/geocode/route.ts`:

```ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

// Nominatim wajib punya User-Agent yang mengidentifikasi pemakainya dan
// membatasi 1 permintaan per detik. Karena itu pencarian dilewatkan peladen —
// dari browser, tiap pemakai punya jatahnya sendiri dan kita bisa diblokir.
const USER_AGENT = 'DismaCore/1.0 (+https://disma-core.vercel.app)';
const MIN_INTERVAL_MS = 1100;

let lastCallAt = 0;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim();
  if (!q || q.length < 3) return NextResponse.json({ results: [] });

  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();

  try {
    // Dibatasi ke Indonesia: nama klien berupa merek yang juga ada di negara
    // lain, dan hasil dari luar negeri cuma bikin bingung.
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=id&limit=8&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'id' } });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const raw = await res.json();
    const results = (Array.isArray(raw) ? raw : []).map((r: { display_name?: string; lat: string; lon: string }) => ({
      label: r.display_name || '',
      lat: Number(r.lat),
      lng: Number(r.lon),
    })).filter((r: { lat: number; lng: number }) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[geocode] failed:', message);
    // Pencarian gagal bukan alasan menghentikan perencanaan — Admin PO masih
    // bisa memasang pin dengan mengklik peta.
    return NextResponse.json({ results: [], error: message }, { status: 200 });
  }
}
```

- [ ] **Step 2: Verify against the real service**

Start the dev server via `preview_start` with `disma-dev`, then:

```bash
curl -s "http://localhost:3000/api/geocode?q=Holycow%20Kebon%20Jeruk" | head -c 400
```

Expected: a `results` array with at least one entry carrying numeric `lat`/`lng` inside Jakarta (latitude near -6, longitude near 106). Then:

```bash
curl -s "http://localhost:3000/api/geocode?q=ab" | head -c 100
```

Expected: `{"results":[]}` — too short to search.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/geocode/route.ts
git commit -m "feat(routes): search a client location by name via Nominatim"
```

---

### Task 4: The map component

**Files:**
- Create: `src/components/map/DeliveryMap.tsx`
- Modify: `package.json` (add `leaflet@^1.9.4`, `@types/leaflet@^1.9.22`)

**Interfaces:**
- Consumes: `hasLocation` from Task 1.
- Produces:

```ts
export type RoutePin = {
  id: string;          // client id
  lat: number;
  lng: number;
  label: string;       // client name
  color: string;       // CSS colour for the courier, '#94a3b8' when unassigned
};

export type DeliveryMapProps = {
  pins: RoutePin[];
  onPinClick?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  center?: [number, number];
  className?: string;
};
```

- [ ] **Step 1: Install Leaflet**

```bash
npm install leaflet@^1.9.4 && npm install -D @types/leaflet@^1.9.22
```

- [ ] **Step 2: Write the component**

Create `src/components/map/DeliveryMap.tsx`. It must be `"use client"`, and it must import Leaflet inside `useEffect` rather than at module scope — Leaflet reads `window` on import, which breaks the server render.

```tsx
"use client"

import { useEffect, useRef } from "react"
import type { Map as LeafletMap, CircleMarker } from "leaflet"
import "leaflet/dist/leaflet.css"

export type RoutePin = { id: string; lat: number; lng: number; label: string; color: string }

export type DeliveryMapProps = {
  pins: RoutePin[]
  onPinClick?: (id: string) => void
  onMapClick?: (lat: number, lng: number) => void
  center?: [number, number]
  className?: string
}

// Jakarta — dipakai saat belum ada satu pin pun, yang akan sering terjadi di
// awal karena lokasi klien diisi bertahap.
const DEFAULT_CENTER: [number, number] = [-6.2088, 106.8456]

export default function DeliveryMap({ pins, onPinClick, onMapClick, center, className }: DeliveryMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markersRef = useRef<CircleMarker[]>([])
  // Simpan callback di ref supaya efek peta tidak dibangun ulang tiap render.
  const clickRef = useRef({ onPinClick, onMapClick })
  clickRef.current = { onPinClick, onMapClick }

  useEffect(() => {
    let cancelled = false
    let map: LeafletMap | null = null

    // Impor dinamis: Leaflet menyentuh `window` saat diimpor.
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return
      map = L.map(containerRef.current).setView(center || DEFAULT_CENTER, 11)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        clickRef.current.onMapClick?.(e.latlng.lat, e.latlng.lng)
      })
      mapRef.current = map
    })

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markersRef.current = []
    }
  }, [])

  // Gambar ulang penanda setiap daftar pin berubah.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    let cancelled = false
    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return
      markersRef.current.forEach(m => m.remove())
      markersRef.current = pins.map(pin => {
        const marker = L.circleMarker([pin.lat, pin.lng], {
          radius: 9, color: "#ffffff", weight: 2, fillColor: pin.color, fillOpacity: 1,
        })
          .bindTooltip(pin.label, { direction: "top" })
          .on("click", () => clickRef.current.onPinClick?.(pin.id))
        marker.addTo(mapRef.current!)
        return marker
      })
      if (pins.length > 0) {
        map.fitBounds(L.latLngBounds(pins.map(p => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 15 })
      }
    })
    return () => { cancelled = true }
  }, [pins])

  return <div ref={containerRef} className={className} />
}
```

- [ ] **Step 3: Verify it renders without breaking the build**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: the same 4 pre-existing errors.

The component is exercised for real in Task 5; there is nothing to click yet on its own.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/map/DeliveryMap.tsx
git commit -m "feat(routes): client-only Leaflet map on OpenStreetMap tiles"
```

---

### Task 5: The planning screen

**Files:**
- Create: `src/app/admin/delivery-routes/page.tsx`
- Modify: `src/lib/navigation.tsx` (after the `admin_dropship` entry)
- Modify: `src/lib/store.ts` (default role permissions — the four arrays that list `admin_shopping_list`)
- Modify: `src/types/index.ts` (`AccessKey` union)
- Modify: `src/app/admin/settings/roles/page.tsx` (permission label list)

**Interfaces:**
- Consumes: `hasLocation`, `moveItem`, `sortStops` (Task 1); `setClientLocation`, `assignRoute` (Task 2); `GET /api/geocode` (Task 3); `DeliveryMap`, `RoutePin` (Task 4).
- Produces: nav key `admin_delivery_routes` at `/admin/delivery-routes`.

- [ ] **Step 1: Register the page**

`src/types/index.ts`, extend the `AccessKey` union's admin line with `| 'admin_delivery_routes'`.

`src/lib/navigation.tsx`, after the `admin_dropship` entry:

```tsx
  { key: 'admin_delivery_routes', title: 'Rencana Rute', href: '/admin/delivery-routes', icon: <MapPin className="h-4 w-4 text-sky-500" />, category: 'Admin' },
```

Add `MapPin` to that file's `lucide-react` import if it is not already there.

`src/lib/store.ts`: add `'admin_delivery_routes'` next to every `'admin_dropship'` in the default role permission arrays (super_admin, ceo, coo, admin_po).

`src/app/admin/settings/roles/page.tsx`, after the `admin_dropship` entry:

```tsx
  { id: 'admin_delivery_routes', label: 'Rencana Rute Pengiriman', module: 'Operasional' },
```

- [ ] **Step 2: Build the screen**

Create `src/app/admin/delivery-routes/page.tsx` as a client component. `DeliveryMap` must be pulled in with `next/dynamic` and `ssr: false`:

```tsx
const DeliveryMap = dynamic(() => import("@/components/map/DeliveryMap"), {
  ssr: false,
  loading: () => <div className="h-[520px] rounded-2xl bg-slate-100 animate-pulse" />,
})
```

Read `salesOrders`, `clients`, `users`, `assignRoute`, `setClientLocation` from the store. Couriers are `users.filter(u => u.role === 'kurir')`.

State and derived data:

```tsx
const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
// Rencana ditahan di layar sampai ditekan Simpan, supaya menggeser perhentian
// tidak memicu satu penyimpanan per gerakan.
const [draft, setDraft] = useState<Record<string, { courierId: string | null; routeOrder: number }>>({})

const dayOrders = useMemo(
  () => salesOrders.filter(so => (so.targetDeliveryDate || '').slice(0, 10) === date),
  [salesOrders, date]
)
const plannedOf = (so: SalesOrder) =>
  draft[so.id] ?? { courierId: so.assignedCourierId ?? null, routeOrder: so.routeOrder ?? Number.MAX_SAFE_INTEGER }
```

Assign a fixed colour per courier by index so the map and the panel agree:

```tsx
const COURIER_COLORS = ['#0284c7', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0d9488']
const colorOf = (courierId: string | null) => {
  if (!courierId) return '#94a3b8'
  const i = couriers.findIndex(c => c.id === courierId)
  return i >= 0 ? COURIER_COLORS[i % COURIER_COLORS.length] : '#94a3b8'
}
```

Layout:

- **Left, the map.** One pin per located client that has an order today, coloured by assigned courier. Clicking a pin selects that client; a selected client plus a click on a courier column assigns it.
- **Right, one column per courier.** Its stops in `sortStops` order, each row draggable via native HTML5 drag events (`draggable`, `onDragStart`, `onDragOver`, `onDrop`) reordering through `moveItem` — no drag library. The header shows the stop count.
- **Below the map, "Belum ada lokasi".** Orders whose client fails `hasLocation`. Each row still has the same courier picker, so it can be assigned and ordered without appearing on the map. **This list is the reason the screen works on day one** — do not hide it when empty; show "semua klien hari ini sudah punya titik" instead.
- **A "Simpan Rencana" button** calling `assignRoute` with one entry per changed order, then clearing `draft`. Disable while `draft` is empty. On failure, keep `draft` so the work is not lost, and toast the error.

Pin placement for an unlocated client: selecting one from the "Belum ada lokasi" list opens a dialog with a name search box (debounced 600ms against `/api/geocode`), a results list, and the same `DeliveryMap` where a click drops the point. Confirming calls `setClientLocation(clientId, lat, lng, note)`.

Follow the visual language of `src/app/admin/dropship/page.tsx`: `Card`/`CardHeader`/`CardContent`, `text-[9px] font-black uppercase tracking-wider` labels, `rounded-2xl` panels.

- [ ] **Step 3: Verify against the running app**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: the same 4 pre-existing errors.

Then with the dev server running, sign in as Admin PO and open Rencana Rute:
1. Pick a date that has orders. They appear — located ones as pins, the rest under "Belum ada lokasi".
2. Assign two orders to courier A and one to courier B. Pin colours change and the column counts match.
3. Drag a stop within a column; the order changes.
4. Press Simpan Rencana, reload the page, and confirm the assignment and order survived.
5. Open the pin dialog for an unlocated client, search its name, pick a result, save. It moves out of the "Belum ada lokasi" list and appears on the map.
6. Confirm the browser console has no Leaflet SSR error (`window is not defined`).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/delivery-routes/page.tsx src/lib/navigation.tsx src/lib/store.ts src/types/index.ts src/app/admin/settings/roles/page.tsx
git commit -m "feat(routes): screen to split the day's drops between couriers"
```

---

### Task 6: The courier's side

**Files:**
- Modify: `src/app/courier/list/page.tsx`
- Modify: `src/app/warehouse/outbound/page.tsx:69-76`
- Modify: `src/app/courier/handover/page.tsx` (the `handleHandoverSubmit` body)

**Interfaces:**
- Consumes: `hasLocation`, `googleMapsUrl`, `sortStops` (Task 1); `setClientLocation` (Task 2).

- [ ] **Step 1: New deliveries inherit the planned courier**

In `src/app/warehouse/outbound/page.tsx`, the `addDelivery` call currently hardcodes `courierId: 'pending'`. Replace with:

```tsx
      const so = salesOrders.find(s => s.id === soId)
      addDelivery({
        id: uuidv4(),
        salesOrderId: soId,
        // Rencana Admin PO menang atas 'pending'; kalau belum direncanakan,
        // perilakunya sama seperti sebelumnya.
        courierId: so?.assignedCourierId || 'pending',
        status: 'Menunggu',
      });
```

- [ ] **Step 2: Couriers see only their own stops, in the planned order**

In `src/app/courier/list/page.tsx`, replace the `pendingDeliveries` filter:

```tsx
  const pendingDeliveries = useMemo(() => {
    const active = deliveries.filter(d => ['Menunggu', 'Dikirim', 'Tunggu Konfirmasi'].includes(d.status))
    // Pengiriman yang belum direncanakan tetap terlihat semua kurir — kalau
    // tidak, pengiriman tanpa rencana jadi tidak terlihat siapa pun.
    const mine = active.filter(d => {
      const so = salesOrders.find(s => s.id === d.salesOrderId)
      const planned = so?.assignedCourierId
      return !planned || planned === currentUser?.id
    })
    return sortStops(mine.map(d => ({
      ...d,
      routeOrder: salesOrders.find(s => s.id === d.salesOrderId)?.routeOrder,
    })))
  }, [deliveries, salesOrders, currentUser?.id])
```

- [ ] **Step 3: Add the maps link and the GPS capture**

Inside the expanded stop card, next to the PIC/phone grid, add:

```tsx
                    <div className="grid grid-cols-2 gap-4">
                      {hasLocation(client) ? (
                        <a
                          href={googleMapsUrl(client.latitude!, client.longitude!)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center gap-2 font-black text-sky-600 text-xs uppercase tracking-widest"
                        >
                          <Navigation className="w-4 h-4" /> Buka di Maps
                        </a>
                      ) : (
                        <div className="bg-white p-4 rounded-3xl shadow-sm border border-dashed border-slate-200 flex items-center justify-center text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">
                          Lokasi belum tersimpan
                        </div>
                      )}
                      <Button
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); handleSaveLocation(client.id) }}
                        disabled={savingLocationFor === client.id}
                        className="h-auto p-4 rounded-3xl border border-slate-100 bg-white font-black text-[10px] uppercase tracking-widest text-emerald-600"
                      >
                        <MapPin className="w-4 h-4 mr-2" />
                        {savingLocationFor === client.id ? 'Menyimpan...' : 'Simpan Titik Ini'}
                      </Button>
                    </div>
```

And the handler, with `const [savingLocationFor, setSavingLocationFor] = useState<string | null>(null)`:

```tsx
  const handleSaveLocation = (clientId: string) => {
    if (!navigator.geolocation) {
      toast.error("HP ini tidak mendukung penyimpanan lokasi.")
      return
    }
    setSavingLocationFor(clientId)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await setClientLocation(clientId, pos.coords.latitude, pos.coords.longitude)
          toast.success("Titik lokasi klien tersimpan.")
        } catch {
          toast.error("Gagal menyimpan titik lokasi.")
        } finally {
          setSavingLocationFor(null)
        }
      },
      (err) => {
        setSavingLocationFor(null)
        // Diam saat izin ditolak membuat tombolnya terasa rusak — sebutkan sebabnya.
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Izin lokasi ditolak. Aktifkan dulu di pengaturan browser."
            : "Tidak bisa membaca lokasi. Pastikan GPS menyala."
        )
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }
```

Add `hasLocation`, `googleMapsUrl`, `sortStops` to the imports from `@/lib/delivery-route`, and `setClientLocation` from the store.

- [ ] **Step 4: Warn when the wrong courier takes a delivery**

In `src/app/courier/handover/page.tsx`, inside `handleHandoverSubmit` after the delivery is found:

```tsx
    // Kenyataan di lapangan menang atas rencana — serah terima tetap jalan —
    // tapi jangan diam-diam, supaya Admin PO tahu rencananya meleset.
    const so = salesOrders.find(s => s.id === soId)
    if (so?.assignedCourierId && so.assignedCourierId !== currentUser?.id) {
      const planned = useAppStore.getState().users.find(u => u.id === so.assignedCourierId)
      toast.warning(`PO ini direncanakan untuk ${planned?.name || 'kurir lain'}.`)
    }
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: the same 4 pre-existing errors.

Then in the running app:
1. As Admin PO, assign a PO to courier A and save.
2. Release that PO at Gudang › Goods Outbound, and confirm the new delivery carries courier A rather than `pending`.
3. Sign in as courier B; the PO does not appear in their list. Sign in as courier A; it does.
4. On a stop with no location, press Simpan Titik Ini, allow the permission, and confirm the client gains coordinates and the Buka di Maps link appears.
5. Deny the permission on another stop and confirm the toast explains why rather than failing silently.
6. As courier B, hand over courier A's PO and confirm the warning appears and the handover still completes.

- [ ] **Step 6: Commit**

```bash
git add src/app/courier/list/page.tsx src/app/warehouse/outbound/page.tsx src/app/courier/handover/page.tsx
git commit -m "feat(routes): couriers see their own stops and can record a location"
```

---

### Task 7: Ship it

- [ ] **Step 1: Run every check**

```bash
for f in delivery-route dropship local-cache client-delete delivery-qty backorder settlement-model; do npx tsx src/lib/$f.check.ts; done && npx tsc --noEmit -p tsconfig.json
```

Expected: seven "all checks passed" lines, then the same 4 pre-existing TypeScript errors.

- [ ] **Step 2: Open the PR**

```bash
git push -u origin feat/rencana-rute-pengiriman
gh pr create --base main --title "feat(routes): plan daily delivery routes on a map"
```

The body must state what was verified by hand and what was not, and must call out that the map starts empty because 204 of 205 clients have no recorded location.

- [ ] **Step 3: Merge and confirm the deploy**

```bash
gh pr merge <N> --merge --repo rezanje/disma-core
```

Confirm the production deployment reaches `success` before reporting the feature live.

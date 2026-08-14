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
    const results = (Array.isArray(raw) ? raw : [])
      .map((r: { display_name?: string; lat: string; lon: string }) => ({
        label: r.display_name || '',
        lat: Number(r.lat),
        lng: Number(r.lon),
      }))
      .filter((r: { lat: number; lng: number }) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[geocode] failed:', message);
    // Pencarian gagal bukan alasan menghentikan perencanaan — Admin PO masih
    // bisa memasang pin dengan mengklik peta.
    return NextResponse.json({ results: [], error: message }, { status: 200 });
  }
}

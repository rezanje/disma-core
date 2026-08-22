// Batas harga beli: berapa mahal sebuah item masih boleh dibeli sebelum
// pesanan yang menunggunya berhenti menghasilkan untung.
//
// Harga jual ke klien sudah dikunci di pesanan, harga pasar bergerak tiap hari,
// jadi seluruh margin ditentukan di detik orang sourcing menawar. Batasnya
// dihitung mundur dari harga jual yang sudah dijanjikan, bukan dari harga beli
// kemarin — harga beli kemarin tidak tahu apa-apa soal masih untung atau tidak.
//
// Batas ini tidak pernah memblokir belanja: pasar tidak bisa menunggu approval.
// Yang dipaksa adalah alasannya ditulis, supaya belanja mahal meninggalkan jejak
// dan muncul di Tutup Hari.
//
// Murni — tanpa store, tanpa React. Lihat price-ceiling.check.ts.

/** Margin minimum default kalau Finance belum pernah menyetelnya. */
export const DEFAULT_MIN_MARGIN_PCT = 20;

export type CeilingLine = {
  id: string;
  productId: string;
  salesOrderId?: string | null;
  actualUnitPrice?: number | null;
  isChecked?: boolean;
  overCeilingReason?: string | null;
};

export type SoldLine = {
  salesOrderId: string;
  productId: string;
  unitPrice: number;
};

/**
 * Harga beli tertinggi yang masih menyisakan margin minimum.
 * 0 kalau harga jualnya tidak diketahui — artinya tidak ada batas yang bisa dipakai,
 * bukan batas nol.
 */
export function ceilingFor(sellPrice: number, minMarginPct: number): number {
  const sell = Number(sellPrice || 0);
  if (sell <= 0) return 0;
  const pct = Number.isFinite(minMarginPct) ? Number(minMarginPct) : DEFAULT_MIN_MARGIN_PCT;
  // Margin negatif berarti tidak ada batas sama sekali; itu bukan setelan yang masuk akal.
  if (pct < 0) return 0;
  return Math.floor(sell / (1 + pct / 100));
}

/**
 * Batas per baris belanja.
 *
 * Satu baris belanja melayani satu pesanan (salesOrderId), jadi harga jualnya
 * spesifik. Kalau barisnya gabungan beberapa pesanan dan tidak menyebut satu pun,
 * dipakai harga jual TERENDAH yang dijanjikan untuk produk itu — batas yang paling
 * ketat, karena pesanan termurah itu yang paling dulu rugi.
 */
export function ceilingByLine(
  lines: CeilingLine[],
  sold: SoldLine[],
  minMarginPct: number,
): Map<string, number> {
  const exact = new Map<string, number>();   // `${salesOrderId}::${productId}` -> unitPrice
  const lowest = new Map<string, number>();  // productId -> harga jual terendah
  for (const s of sold || []) {
    const price = Number(s.unitPrice || 0);
    if (price <= 0) continue;
    exact.set(`${s.salesOrderId}::${s.productId}`, price);
    const cur = lowest.get(s.productId);
    if (cur === undefined || price < cur) lowest.set(s.productId, price);
  }

  const out = new Map<string, number>();
  for (const l of lines || []) {
    const sell = (l.salesOrderId ? exact.get(`${l.salesOrderId}::${l.productId}`) : undefined)
      ?? lowest.get(l.productId)
      ?? 0;
    out.set(l.id, ceilingFor(sell, minMarginPct));
  }
  return out;
}

/** Lewat batas atau tidak. Batas 0 berarti tidak ada batas yang diketahui. */
export function isOverCeiling(actualUnitPrice: number, ceiling: number): boolean {
  return ceiling > 0 && Number(actualUnitPrice || 0) > ceiling;
}

/** Selisih di atas batas dalam persen, buat ditampilkan. 0 kalau masih aman. */
export function overByPct(actualUnitPrice: number, ceiling: number): number {
  if (!isOverCeiling(actualUnitPrice, ceiling)) return 0;
  return Math.round(((Number(actualUnitPrice) - ceiling) / ceiling) * 100);
}

/**
 * Baris yang lewat batas tapi belum ada alasannya. Kosong berarti laporan boleh dikirim.
 * Hanya baris yang dicentang (jadi dibeli) yang dihitung.
 */
export function linesNeedingReason(
  lines: CeilingLine[],
  ceilings: Map<string, number>,
): string[] {
  return (lines || [])
    .filter(l => l.isChecked !== false)
    .filter(l => isOverCeiling(Number(l.actualUnitPrice || 0), ceilings.get(l.id) || 0))
    .filter(l => !String(l.overCeilingReason || '').trim())
    .map(l => l.id);
}

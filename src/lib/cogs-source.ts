// Which delivered lines will have a guessed cost. Pure — no store imports — so
// it stays trivially testable (cogs-source.check.ts).
//
// accounting.ts resolves COGS in this order: the purchase made for this very
// order, else any purchase of that product, else the product's base price. That
// last step is a guess, and nothing downstream says so — the journals balance,
// the profit report prints, and the number looks like every other number.
// Finance needs to know before approving, not after closing the month.

type PurchaseLine = { productId: string; salesOrderId?: string; actualUnitPrice: number };

/**
 * Product ids whose cost will fall back to the product's base price.
 * Mirrors the lookup in accounting.ts: a priced purchase for ANY order counts
 * as a real cost basis, so only lines with no priced purchase at all are listed.
 */
export function cogsFallbackItems(
  salesOrderId: string,
  items: { productId: string }[],
  purchaseItems: PurchaseLine[],
): string[] {
  return items
    .filter(item => {
      const priced = purchaseItems.filter(
        pi => pi.productId === item.productId && pi.actualUnitPrice > 0
      );
      // A zero price is not a cost — it falls back exactly like a missing row.
      return priced.length === 0;
    })
    .map(item => item.productId);
}

export type CostBasisLine = {
  purchaseId?: string;
  productId: string;
  salesOrderId?: string | null;
  actualUnitPrice: number;
};

/**
 * Baris belanja yang jadi dasar harga pokok satu baris pesanan.
 *
 * Urutannya: belanja untuk pesanan INI, lalu belanja apa pun atas produk yang sama.
 * Di tiap tingkat yang diambil adalah yang **paling baru**, bukan yang pertama ketemu.
 *
 * "Paling baru" itu inti perbaikannya. Pesanan yang dikirim dua ronde punya dua baris
 * belanja, dan yang pertama membawa harga ronde pertama. Membukukan ronde kedua ke
 * baris itu memberi harga minggu lalu pada barang hari ini: labanya bergeser, dan
 * selisihnya mengendap selamanya di nilai persediaan karena barang yang memilikinya
 * sudah terkirim habis. Urutan larik tidak bisa dipakai — baris ditarik server
 * terurut id (uuid), jadi urutannya acak; tanggalnya harus dari dokumen belanjanya.
 *
 * Harga nol bukan harga: baris tanpa harga dilewati, sama seperti baris yang tidak ada.
 */
export function costBasisFor<T extends CostBasisLine>(
  salesOrderId: string | null | undefined,
  productId: string,
  purchaseItems: T[],
  purchases: { id: string; date?: string | null }[],
): T | null {
  const waktu = (pi: T): number => {
    const d = purchases.find(p => p.id === pi.purchaseId)?.date;
    const t = d ? new Date(d).getTime() : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  // reduce, bukan sort: larik aslinya milik store dan tidak boleh diaduk di tempat.
  const terbaru = (rows: T[]): T | null =>
    rows.length === 0 ? null : rows.reduce((a, b) => (waktu(b) >= waktu(a) ? b : a));

  const berharga = purchaseItems.filter(pi => pi.productId === productId && pi.actualUnitPrice > 0);
  return terbaru(berharga.filter(pi => !!salesOrderId && pi.salesOrderId === salesOrderId))
    ?? terbaru(berharga);
}

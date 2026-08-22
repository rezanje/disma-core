// Harga jual satu produk untuk satu klien.
//
// Aturannya sudah dipakai di layar Price Lists, tapi tinggal di dalam komponennya —
// jadi begitu harga itu perlu dicetak jadi PDF untuk klien, satu-satunya pilihan
// adalah menyalin rumusnya. Dua salinan rumus harga adalah cara paling mudah
// mengirim daftar harga yang berbeda dari yang ditagihkan.
//
// Murni. Lihat client-price.check.ts.

export type TierName = 'Standard' | 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Tier 4' | 'Tier 5' | 'Custom';

export type PricedProduct = {
  sellingPrice: number;
  tier1Price?: number;
  tier2Price?: number;
  tier3Price?: number;
  tier4Price?: number;
  tier5Price?: number;
};

export type ClientPriceRecord = { tier: TierName; agreedPrice: number };

/**
 * @param basePrice HPP berlaku (harga terendah minggu berjalan kalau masih segar,
 *                  kalau tidak harga master) — dihitung getEffectiveBasePrice.
 * @param record    Kesepakatan khusus klien ini. Tidak ada berarti pakai tier bawaannya.
 */
export function clientUnitPrice(
  product: PricedProduct,
  basePrice: number,
  tierMargins: Record<string, number>,
  record?: ClientPriceRecord | null,
  defaultTier?: TierName | null,
): number {
  const tierPrice = (tier: TierName): number | undefined => {
    const n = tier.replace('Tier ', '');
    return (product as unknown as Record<string, number | undefined>)[`tier${n}Price`];
  };

  // Harga yang disepakati per barang menang atas rumus apa pun.
  if (record?.tier === 'Custom') return record.agreedPrice;

  const tier = record?.tier && record.tier !== 'Standard' ? record.tier
    : (defaultTier && defaultTier !== 'Standard' ? defaultTier : null);

  if (tier) {
    // Harga tier yang sudah tertulis di produk dipakai apa adanya: pricelist terbit
    // menetapkan margin per barang, bukan satu margin untuk semuanya.
    const written = tierPrice(tier);
    if (written) return written;
    const marginPct = tierMargins[tier] || 0;
    const computed = Math.round(basePrice * (1 + marginPct / 100));
    return computed || product.sellingPrice;
  }

  return product.sellingPrice;
}

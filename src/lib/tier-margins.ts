import type { ClientPriceTier } from '@/types'

/**
 * The published pricelist runs two margin ladders, split by product category.
 * Verified against the 20-26 Juli 2026 pricelist: of 277 priced Sayuran/Buah
 * products none follow the packaged ladder, and of 1,561 Dry Goods/ATK/Frozen
 * none follow the fresh one.
 *
 * Tier order matches TIER_LABELS, which is NOT descending by margin:
 * Tier 4 is Bottom (the cheapest) and Tier 5 is Special Request.
 */
export const MARGIN_LADDERS = {
  fresh: { 'Tier 1': 50, 'Tier 2': 30, 'Tier 3': 20, 'Tier 4': 10, 'Tier 5': 15 },
  packaged: { 'Tier 1': 30, 'Tier 2': 25, 'Tier 3': 20, 'Tier 4': 10, 'Tier 5': 15 },
} as const

const FRESH_CATEGORIES = ['sayuran', 'buah']

export type MarginLadder = Record<Exclude<ClientPriceTier, 'Standard' | 'Custom'>, number>

/** Margin ladder for a product, chosen by its category. Unknown category = packaged. */
export function ladderFor(category?: string | null): MarginLadder {
  const key = (category ?? '').trim().toLowerCase()
  return FRESH_CATEGORIES.includes(key) ? MARGIN_LADDERS.fresh : MARGIN_LADDERS.packaged
}

/** Tier prices for a base price, rounded up to the nearest 1000 as the pricelist does. */
export function tierPricesFor(basePrice: number, category?: string | null): number[] {
  const ladder = ladderFor(category)
  return (['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'] as const)
    .map(t => Math.ceil((basePrice * (1 + ladder[t] / 100)) / 1000) * 1000)
}

/**
 * Rescale a product's tier prices so each keeps its own ratio to the base price.
 *
 * The published pricelist sets margins per item, not by one formula, so clearing
 * the tier overrides on a weekly-HPP publish would silently reprice every product
 * whose margin is not the global default. Carrying the existing ratio forward keeps
 * a +50% item at +50%.
 *
 * Returns `undefined` in a slot when no ratio can be derived — the caller passes
 * that straight to `updateProduct`, which treats it as "clear this field" and lets
 * the global margin apply, exactly as before.
 */
export function rescaleTiers(
  oldBase: number,
  newBase: number,
  tiers: (number | null | undefined)[]
): (number | undefined)[] {
  const usableBase = Number.isFinite(oldBase) && oldBase > 0 && Number.isFinite(newBase);
  return tiers.map((tier) => {
    if (!usableBase) return undefined;
    if (tier === null || tier === undefined || !Number.isFinite(tier) || tier <= 0) return undefined;
    return Math.round(newBase * (tier / oldBase));
  });
}

export const TIER_PRICE: Record<'H1' | 'H2' | 'H3', number> = {
  H1: 59,
  H2: 109,
  H3: 159,
};

type TierCode = 'H1' | 'H2' | 'H3';

export function normalizeTier(tier: unknown): TierCode {
  if (tier === 'H1' || tier === 'H2' || tier === 'H3') {
    return tier;
  }
  console.warn('Invalid tier detected', tier);
  return 'H1';
}

export function getDisplayPriceFromTier(tierInput: unknown): number {
  const tier = normalizeTier(tierInput);
  const display_price = TIER_PRICE[tier];
  if (display_price !== TIER_PRICE[tier]) {
    console.error('Pricing mismatch detected', { tier, display_price });
  }
  return display_price;
}

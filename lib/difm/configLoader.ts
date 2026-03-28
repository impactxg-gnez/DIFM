import tierConfigJson from '@/config/pricing/plug-tier-config.json';
import type { TierConfig, TierConfigMap } from './types';

function assertValidTierConfig(tier: string, config: TierConfig): void {
  if (!Number.isInteger(config.base_price) || config.base_price < 0) {
    throw new Error(`Invalid config for ${tier}: base_price`);
  }
  if (!Number.isInteger(config.included_plugs) || config.included_plugs < 0) {
    throw new Error(`Invalid config for ${tier}: included_plugs`);
  }
  if (!Number.isInteger(config.price_per_extra_plug) || config.price_per_extra_plug < 0) {
    throw new Error(`Invalid config for ${tier}: price_per_extra_plug`);
  }
  if (config.max_cap !== null && (!Number.isInteger(config.max_cap) || config.max_cap < 0)) {
    throw new Error(`Invalid config for ${tier}: max_cap`);
  }
}

export function loadDIFMTierConfig(): TierConfigMap {
  const raw = tierConfigJson as TierConfigMap;
  const normalized: TierConfigMap = {};

  for (const [tier, config] of Object.entries(raw)) {
    const key = tier.toUpperCase();
    assertValidTierConfig(key, config);
    normalized[key] = { ...config };
  }

  return normalized;
}


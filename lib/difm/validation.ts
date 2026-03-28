import type { DIFMInput, TierConfigMap } from './types';

export interface NormalizedDIFMInput {
  number_of_plugs: number;
  tier: string;
}

export function normalizeAndValidateInput(
  input: DIFMInput,
  configMap: TierConfigMap
): NormalizedDIFMInput | { error: string } {
  if (input.number_of_plugs === undefined || input.number_of_plugs === null) {
    return { error: 'number_of_plugs required' };
  }

  if (typeof input.number_of_plugs !== 'number') {
    return { error: 'Invalid plug count' };
  }

  if (!Number.isInteger(input.number_of_plugs) || input.number_of_plugs < 0) {
    return { error: 'Invalid plug count' };
  }

  if (input.tier === undefined || input.tier === null || String(input.tier).trim() === '') {
    return { error: 'tier required' };
  }

  const normalizedTier = String(input.tier).toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(configMap, normalizedTier)) {
    return { error: 'Invalid tier' };
  }

  return {
    number_of_plugs: input.number_of_plugs,
    tier: normalizedTier,
  };
}


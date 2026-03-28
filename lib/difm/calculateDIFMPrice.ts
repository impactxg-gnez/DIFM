import { createHash } from 'crypto';
import { loadDIFMTierConfig } from './configLoader';
import { normalizeAndValidateInput } from './validation';
import { DIFM_VERSION, type DIFMCalculationData, type DIFMInput, type DIFMResponse, type TierConfigMap } from './types';

function buildCalculationId(payload: unknown): string {
  const serialized = JSON.stringify(payload);
  const hex = createHash('sha256').update(serialized).digest('hex').slice(0, 32);
  const part1 = hex.slice(0, 8);
  const part2 = hex.slice(8, 12);
  const part3 = `5${hex.slice(13, 16)}`; // deterministic UUIDv5-like version marker
  const variantNibble = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const part4 = `${variantNibble}${hex.slice(17, 20)}`;
  const part5 = hex.slice(20, 32);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

function buildErrorResponse(input: DIFMInput, error: string): DIFMResponse {
  return {
    success: false,
    data: null,
    error,
    version: DIFM_VERSION,
    calculation_id: buildCalculationId({
      version: DIFM_VERSION,
      number_of_plugs: input.number_of_plugs ?? null,
      tier: input.tier ?? null,
      error,
    }),
  };
}

function buildSuccessResponse(data: DIFMCalculationData, normalizedTier: string): DIFMResponse {
  return {
    success: true,
    data,
    error: null,
    version: DIFM_VERSION,
    calculation_id: buildCalculationId({
      version: DIFM_VERSION,
      ...data,
      tier: normalizedTier,
    }),
  };
}

function computePriceData(numberOfPlugs: number, tier: string, configMap: TierConfigMap): DIFMCalculationData {
  const config = configMap[tier];
  const includedPlugs = config.included_plugs;
  const basePrice = config.base_price;
  const unitExtraPrice = config.price_per_extra_plug;
  const maxCap = config.max_cap;

  // Strict edge case: explicit zero plugs always costs zero.
  if (numberOfPlugs === 0) {
    return {
      number_of_plugs: 0,
      included_plugs: includedPlugs,
      extra_plugs: 0,
      base_price: basePrice,
      extra_cost: 0,
      cap_applied: false,
      total_price: 0,
    };
  }

  let extraPlugs = 0;
  let extraCost = 0;
  let totalPrice = 0;

  if (includedPlugs === 0) {
    extraPlugs = numberOfPlugs;
    extraCost = extraPlugs * unitExtraPrice;
    totalPrice = extraCost;
  } else if (unitExtraPrice === 0) {
    extraPlugs = Math.max(0, numberOfPlugs - includedPlugs);
    extraCost = 0;
    totalPrice = basePrice;
  } else if (numberOfPlugs <= includedPlugs) {
    extraPlugs = 0;
    extraCost = 0;
    totalPrice = basePrice;
  } else {
    extraPlugs = numberOfPlugs - includedPlugs;
    extraCost = extraPlugs * unitExtraPrice;
    totalPrice = basePrice + extraCost;
  }

  let capApplied = false;
  if (maxCap !== null && totalPrice > maxCap) {
    totalPrice = maxCap;
    capApplied = true;
  }

  if (totalPrice < 0) {
    totalPrice = 0;
  }

  return {
    number_of_plugs: numberOfPlugs,
    included_plugs: includedPlugs,
    extra_plugs: extraPlugs,
    base_price: basePrice,
    extra_cost: extraCost,
    cap_applied: capApplied,
    total_price: totalPrice,
  };
}

export function calculateDIFMPrice(
  input: DIFMInput,
  configMap: TierConfigMap = loadDIFMTierConfig()
): DIFMResponse {
  const normalized = normalizeAndValidateInput(input, configMap);
  if ('error' in normalized) {
    return buildErrorResponse(input, normalized.error);
  }

  const data = computePriceData(normalized.number_of_plugs, normalized.tier, configMap);
  return buildSuccessResponse(data, normalized.tier);
}


import { loadDIFMTierConfig } from './configLoader';
import { calculateDIFMPrice } from './calculateDIFMPrice';
import { buildDIFMLogRecord, logDIFMCalculation } from './logger';
import type { DIFMInput, DIFMResponse } from './types';

const responseCache = new Map<string, DIFMResponse>();

function cacheKeyForInput(input: DIFMInput): string {
  return JSON.stringify({
    number_of_plugs: input.number_of_plugs ?? null,
    tier: input.tier ?? null,
  });
}

export function calculateDIFMPriceService(input: DIFMInput): DIFMResponse {
  const key = cacheKeyForInput(input);
  const cached = responseCache.get(key);
  if (cached) {
    return cached;
  }

  const configMap = loadDIFMTierConfig();
  const output = calculateDIFMPrice(input, configMap);
  const record = buildDIFMLogRecord(input, output);
  logDIFMCalculation(record);

  responseCache.set(key, output);
  return output;
}


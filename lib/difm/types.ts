export const DIFM_VERSION = 'v1' as const;

export interface TierConfig {
  base_price: number;
  included_plugs: number;
  price_per_extra_plug: number;
  max_cap: number | null;
}

export type TierConfigMap = Record<string, TierConfig>;

export interface DIFMInput {
  number_of_plugs?: unknown;
  tier?: unknown;
}

export interface DIFMCalculationData {
  number_of_plugs: number;
  included_plugs: number;
  extra_plugs: number;
  base_price: number;
  extra_cost: number;
  cap_applied: boolean;
  total_price: number;
}

export interface DIFMSuccessResponse {
  success: true;
  data: DIFMCalculationData;
  error: null;
  version: typeof DIFM_VERSION;
  calculation_id: string;
}

export interface DIFMErrorResponse {
  success: false;
  data: null;
  error: string;
  version: typeof DIFM_VERSION;
  calculation_id: string;
}

export type DIFMResponse = DIFMSuccessResponse | DIFMErrorResponse;


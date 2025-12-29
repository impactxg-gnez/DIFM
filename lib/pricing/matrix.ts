export type Trade =
  | 'HANDYMAN'
  | 'CLEANING'
  | 'PLUMBER'
  | 'ELECTRICIAN'
  | 'PAINTER';

export type TierCode =
  | 'H1'
  | 'H2'
  | 'H3'
  | 'H4'
  | 'H5'
  | 'C1'
  | 'C2'
  | 'C3'
  | 'P1'
  | 'P2'
  | 'P3'
  | 'E1'
  | 'E2'
  | 'D1'
  | 'D2'
  | 'D3'
  | 'D4'
  | 'D5'
  | 'GENERAL_HOUR'
  | 'EXTRA_TIME';

export interface TierDefinition {
  code: TierCode;
  trade: Trade | 'CONTROL';
  name: string;
  customerPrice: number;
  maxDurationMinutes?: number | null;
  notes?: string;
}

export const PRICING_MATRIX: Record<TierDefinition['trade'], TierDefinition[]> = {
  HANDYMAN: [
    { code: 'H1', trade: 'HANDYMAN', name: 'Small Fix (≤30m)', customerPrice: 44, maxDurationMinutes: 30 },
    { code: 'H2', trade: 'HANDYMAN', name: 'Standard Job (≤60m)', customerPrice: 69, maxDurationMinutes: 60 },
    { code: 'H3', trade: 'HANDYMAN', name: 'Complex Job (≤120m)', customerPrice: 99, maxDurationMinutes: 120 },
    { code: 'H4', trade: 'HANDYMAN', name: 'Half Day (≤3h)', customerPrice: 149, maxDurationMinutes: 180 },
    { code: 'H5', trade: 'HANDYMAN', name: 'Full Day (≤6h)', customerPrice: 249, maxDurationMinutes: 360 },
  ],
  CLEANING: [
    { code: 'C1', trade: 'CLEANING', name: 'Standard Clean', customerPrice: 69 },
    { code: 'C2', trade: 'CLEANING', name: 'Deep Clean', customerPrice: 119 },
    { code: 'C3', trade: 'CLEANING', name: 'End of Tenancy', customerPrice: 199 },
  ],
  PLUMBER: [
    { code: 'P1', trade: 'PLUMBER', name: 'Quick Fix (≤45m)', customerPrice: 89, maxDurationMinutes: 45 },
    { code: 'P2', trade: 'PLUMBER', name: 'Standard Repair (≤90m)', customerPrice: 119, maxDurationMinutes: 90 },
    { code: 'P3', trade: 'PLUMBER', name: 'Half Day Plumbing (≤3h)', customerPrice: 199, maxDurationMinutes: 180 },
  ],
  ELECTRICIAN: [
    { code: 'E1', trade: 'ELECTRICIAN', name: 'Small Electrical', customerPrice: 79, maxDurationMinutes: 60 },
    { code: 'E2', trade: 'ELECTRICIAN', name: 'Standard Electrical', customerPrice: 129, maxDurationMinutes: 120 },
  ],
  PAINTER: [
    { code: 'D1', trade: 'PAINTER', name: 'Touch-ups / Patch', customerPrice: 89, maxDurationMinutes: 90 },
    { code: 'D2', trade: 'PAINTER', name: 'Feature Wall / Door', customerPrice: 139, maxDurationMinutes: 120 },
    { code: 'D3', trade: 'PAINTER', name: 'Full Room (Walls Only)', customerPrice: 199, maxDurationMinutes: 180 },
    { code: 'D4', trade: 'PAINTER', name: 'Half Day Painter (≤3h)', customerPrice: 159, maxDurationMinutes: 180 },
    { code: 'D5', trade: 'PAINTER', name: 'Full Day Painter (≤6h)', customerPrice: 299, maxDurationMinutes: 360 },
  ],
  CONTROL: [
    { code: 'GENERAL_HOUR', trade: 'CONTROL', name: 'General Hour (unclear scope)', customerPrice: 75, maxDurationMinutes: 60, notes: 'Max 2, else escalate' },
    { code: 'EXTRA_TIME', trade: 'CONTROL', name: 'Extra Time (per 30m)', customerPrice: 29, maxDurationMinutes: 30, notes: 'Requires customer approval + audit log' },
  ],
};

const tierIndex = new Map<TierCode, TierDefinition>();
Object.values(PRICING_MATRIX).forEach((tiers) => {
  tiers.forEach((tier) => tierIndex.set(tier.code, tier));
});

export function getTierByCode(code: TierCode): TierDefinition | undefined {
  return tierIndex.get(code);
}

export function getTradeLabel(trade: Trade): string {
  switch (trade) {
    case 'HANDYMAN':
      return 'Handyman';
    case 'CLEANING':
      return 'Cleaning';
    case 'PLUMBER':
      return 'Plumbing';
    case 'ELECTRICIAN':
      return 'Electrical';
    case 'PAINTER':
      return 'Painting / Decorating';
    default:
      return trade;
  }
}


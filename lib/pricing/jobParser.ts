import { PRICING_MATRIX, TierCode, Trade, getTierByCode, getTradeLabel } from './matrix';

export interface ParsedTask {
  text: string;
  trade: Trade;
  tierCode: TierCode;
  signals: {
    count?: number;
    durationMinutes?: number;
    complexity?: string;
  };
}

export interface ParsedVisit {
  trade: Trade;
  routeCategory: Trade;
  tierCode: TierCode;
  price: number;
  requiresCapability: boolean;
  tasks: ParsedTask[];
  durationMinutes: number | null | undefined;
  notes?: string;
}

export interface ParsedItem {
  itemType: TierCode;
  quantity: number;
  description: string;
  trade: Trade;
  routeCategory: Trade;
  requiresCapability: boolean;
}

export interface ParseResult {
  items: ParsedItem[];
  visits: ParsedVisit[];
  confidence: number;
  needsReview: boolean;
  usedFallback: boolean;
  primaryCategory: Trade;
  routingNotes: string[];
}

export interface ParseOptions {
  handymanPlumbing?: boolean;
  handymanElectrical?: boolean;
}

const SEGMENT_SPLIT_REGEX = /\band\b|\bplus\b|\balso\b|,|;|&|\+/i;
const SMALL_HANDYMAN_HINTS = ['hinge', 'tighten', 'battery', 'bulb', 'hooks', 'patch', 'silicone'];
const COMPLEX_HANDYMAN_HINTS = ['wardrobe', 'shower screen', 'screen', 'multiple', 'several', 'many'];
const INVESTIGATION_HINTS = ['investigate', 'investigation', 'fault', 'trace', 'diagnose', 'unclear', 'unknown', 'not sure'];

const KEYWORDS: Record<Trade, string[]> = {
  CLEANING: ['clean', 'tidy', 'deep clean', 'tenancy', 'end of tenancy', 'oven clean'],
  PAINTER: ['paint', 'wall', 'ceiling', 'decor', 'decorate', 'decorating', 'skirting', 'feature wall', 'door'],
  ELECTRICIAN: ['socket', 'switch', 'light', 'lighting', 'fuse', 'circuit', 'plug', 'outlet', 'electrical'],
  PLUMBER: ['leak', 'tap', 'toilet', 'flush', 'pipe', 'sink', 'bath', 'block', 'blocked', 'drain', 'washer', 'hose', 'plumb', 'plumbing', 'shower'],
  HANDYMAN: ['mount', 'hang', 'shelf', 'furniture', 'assemble', 'curtain', 'blind', 'rail', 'door', 'lock', 'ikea'],
};

function containsAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

function wordCountHint(text: string): number | undefined {
  const numberMatch = text.match(/(\d+)/);
  if (numberMatch) return parseInt(numberMatch[1], 10);
  if (/\btwo\b|\bcouple\b/.test(text)) return 2;
  if (/\bthree\b/.test(text)) return 3;
  if (/\bfour\b/.test(text)) return 4;
  if (/\bfive\b/.test(text)) return 5;
  if (/\bseveral\b|\bfew\b|\bmany\b|\bmultiple\b/.test(text)) return 3;
  return undefined;
}

function durationHint(text: string): number | undefined {
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(h|hour|hours)/);
  if (hourMatch) {
    return Math.round(parseFloat(hourMatch[1]) * 60);
  }
  if (text.includes('half day')) return 180;
  if (text.includes('full day')) return 360;
  if (text.includes('half hour') || text.includes('30 minutes') || text.includes('30 mins')) return 30;
  return undefined;
}

function classifyTrade(segment: string): Trade {
  if (containsAny(segment, KEYWORDS.CLEANING)) return 'CLEANING';
  if (containsAny(segment, KEYWORDS.PAINTER)) return 'PAINTER';
  if (containsAny(segment, KEYWORDS.ELECTRICIAN)) return 'ELECTRICIAN';
  if (containsAny(segment, KEYWORDS.PLUMBER)) return 'PLUMBER';
  return 'HANDYMAN';
}

function selectHandymanTier(text: string, countHint?: number, duration?: number): TierCode {
  const tvMatch = text.match(/(\d{2})\s*\"/); // TV size signals
  if (tvMatch) {
    const size = parseInt(tvMatch[1], 10);
    if (size >= 55) return 'H3';
    return 'H2';
  }

  if (duration) {
    if (duration > 300) return 'H5';
    if (duration > 180) return 'H5';
    if (duration > 120) return 'H4';
    if (duration > 60) return 'H3';
    if (duration > 30) return 'H2';
  }

  if (text.includes('full day')) return 'H5';
  if (text.includes('half day')) return 'H4';

  if (containsAny(text, COMPLEX_HANDYMAN_HINTS)) return 'H3';
  if (countHint && countHint >= 4) return 'H3';
  if (containsAny(text, SMALL_HANDYMAN_HINTS) && (!countHint || countHint <= 2)) return 'H1';

  return countHint && countHint > 2 ? 'H3' : 'H2';
}

function selectPlumbingTier(text: string, countHint?: number, duration?: number): TierCode {
  if (duration) {
    if (duration > 150) return 'P3';
    if (duration > 60) return 'P2';
  }
  if (containsAny(text, INVESTIGATION_HINTS)) return 'P3';
  if (countHint && countHint >= 3) return 'P3';
  if (countHint && countHint >= 2) return 'P2';
  if (text.includes('replace') || text.includes('valve') || text.includes('siphon') || text.includes('install')) return 'P2';
  return 'P1';
}

function selectElectricalTier(text: string, countHint?: number): TierCode {
  if (containsAny(text, INVESTIGATION_HINTS)) return 'E2';
  if (countHint && countHint > 1) return 'E2';
  if (text.includes('multiple') || text.includes('several')) return 'E2';
  return 'E1';
}

function selectCleaningTier(text: string): TierCode {
  if (text.includes('end of tenancy') || text.includes('tenancy')) return 'C3';
  if (text.includes('deep')) return 'C2';
  return 'C1';
}

function selectPaintingTier(text: string, countHint?: number, duration?: number): TierCode {
  if (duration && duration >= 300) return 'D5';
  if (duration && duration >= 150) return 'D4';
  if (text.includes('full day')) return 'D5';
  if (text.includes('half day')) return 'D4';
  if (text.includes('feature wall') || text.includes('door')) return 'D2';
  if (text.includes('full room') || text.includes('entire room') || (countHint && countHint >= 2)) return 'D3';
  if (text.includes('touch') || text.includes('patch')) return 'D1';
  return 'D2';
}

function pickTier(trade: Trade, text: string, countHint?: number, duration?: number): TierCode {
  switch (trade) {
    case 'HANDYMAN':
      return selectHandymanTier(text, countHint, duration);
    case 'PLUMBER':
      return selectPlumbingTier(text, countHint, duration);
    case 'ELECTRICIAN':
      return selectElectricalTier(text, countHint);
    case 'CLEANING':
      return selectCleaningTier(text);
    case 'PAINTER':
      return selectPaintingTier(text, countHint, duration);
    default:
      return 'GENERAL_HOUR';
  }
}

function aggregateTierForTrade(trade: Trade, tasks: ParsedTask[]): TierCode {
  const durationSum = tasks.reduce((acc, task) => acc + (task.signals.durationMinutes || getTierByCode(task.tierCode)?.maxDurationMinutes || 60), 0);
  const tiers = (PRICING_MATRIX[trade] || []).filter((t) => t.trade !== 'CONTROL');

  const sortedByDuration = tiers
    .filter((t) => typeof t.maxDurationMinutes === 'number')
    .sort((a, b) => (a.maxDurationMinutes || 0) - (b.maxDurationMinutes || 0));

  const match = sortedByDuration.find((tier) => (tier.maxDurationMinutes || 0) >= durationSum);
  if (match) return match.code;
  return (sortedByDuration[sortedByDuration.length - 1] || tiers[0]).code;
}

function decideRoute(
  trade: Trade,
  tierCode: TierCode,
  options?: ParseOptions
): { routeCategory: Trade; requiresCapability: boolean; notes?: string } {
  if (trade === 'PLUMBER' && tierCode === 'P1') {
    if (options?.handymanPlumbing) {
      return { routeCategory: 'HANDYMAN', requiresCapability: true, notes: 'Handyman plumbing capability required' };
    }
    return { routeCategory: 'PLUMBER', requiresCapability: false };
  }

  if (trade === 'ELECTRICIAN' && tierCode === 'E1') {
    if (options?.handymanElectrical) {
      return { routeCategory: 'HANDYMAN', requiresCapability: true, notes: 'Handyman electrical capability required' };
    }
    return { routeCategory: 'ELECTRICIAN', requiresCapability: false };
  }

  if (trade === 'PLUMBER' && (tierCode === 'P2' || tierCode === 'P3')) {
    return { routeCategory: 'PLUMBER', requiresCapability: false };
  }

  if (trade === 'ELECTRICIAN' && tierCode === 'E2') {
    return { routeCategory: 'ELECTRICIAN', requiresCapability: false };
  }

  return { routeCategory: trade, requiresCapability: false };
}

export function parseJobDescription(description: string, options?: ParseOptions): ParseResult {
  const lowerDesc = description.toLowerCase();
  const segments = lowerDesc
    .split(SEGMENT_SPLIT_REGEX)
    .map((s) => s.trim())
    .filter(Boolean);

  const tasks: ParsedTask[] = [];
  const routingNotes: string[] = [];

  for (const segment of segments.length ? segments : [lowerDesc]) {
    const countHint = wordCountHint(segment);
    const durHint = durationHint(segment);
    const trade = classifyTrade(segment);
    const tierCode = pickTier(trade, segment, countHint, durHint);

    tasks.push({
      text: segment,
      trade,
      tierCode,
      signals: {
        count: countHint,
        durationMinutes: durHint,
        complexity: containsAny(segment, INVESTIGATION_HINTS) ? 'investigation' : undefined,
      },
    });
  }

  if (tasks.length === 0) {
    tasks.push({
      text: lowerDesc,
      trade: 'HANDYMAN',
      tierCode: 'GENERAL_HOUR',
      signals: {},
    });
  }

  const groupedByTrade = new Map<Trade, ParsedTask[]>();
  tasks.forEach((task) => {
    const current = groupedByTrade.get(task.trade) || [];
    groupedByTrade.set(task.trade, [...current, task]);
  });

  const visits: ParsedVisit[] = [];

  for (const [trade, tradeTasks] of groupedByTrade.entries()) {
    const aggregateTier = aggregateTierForTrade(trade, tradeTasks);
    const tierDef = getTierByCode(aggregateTier);
    const route = decideRoute(trade, aggregateTier, options);
    if (route.notes) {
      routingNotes.push(route.notes);
    }

    visits.push({
      trade,
      routeCategory: route.routeCategory,
      tierCode: aggregateTier,
      price: tierDef?.customerPrice || 0,
      requiresCapability: route.requiresCapability,
      tasks: tradeTasks,
      durationMinutes: tierDef?.maxDurationMinutes,
      notes: tierDef?.notes,
    });
  }

  const items: ParsedItem[] = visits.map((visit) => {
    const tier = getTierByCode(visit.tierCode);
    const label = tier?.name || visit.tierCode;

    return {
      itemType: visit.tierCode,
      quantity: 1,
      description: `${getTradeLabel(visit.routeCategory)} — ${label}`,
      trade: visit.trade,
      routeCategory: visit.routeCategory,
      requiresCapability: visit.requiresCapability,
    };
  });

  const usedFallback = tasks.some((task) => task.tierCode === 'GENERAL_HOUR');
  const needsReview = usedFallback || groupedByTrade.size > 1 || tasks.length > 5;
  let confidence = 0.9;
  if (usedFallback) confidence -= 0.2;
  if (groupedByTrade.size > 1) confidence -= 0.1;
  if (tasks.some((t) => containsAny(t.text, INVESTIGATION_HINTS))) confidence -= 0.05;
  confidence = Math.max(0.5, confidence);

  const primaryVisit = visits[0];
  const primaryCategory = (primaryVisit?.routeCategory || 'HANDYMAN') as Trade;

  return {
    items,
    visits,
    confidence,
    needsReview,
    usedFallback,
    primaryCategory,
    routingNotes,
  };
}

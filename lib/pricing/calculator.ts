import { ServiceCategory, PRICE_MATRIX } from '../constants';
import { parseJobDescription } from './jobParser';
import { getTierByCode } from './matrix';

export interface JobItemData {
  itemType: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  description: string;
  routeCategory?: ServiceCategory;
  requiresCapability?: boolean;
}

export interface PricingResult {
  totalPrice: number;
  items: JobItemData[];
  needsReview: boolean;
  usedFallback: boolean;
  confidence: number;
  primaryCategory: ServiceCategory;
  routingNotes?: string[];
  visits?: any[];
}

/**
 * Calculate job price using intelligent parsing or fallback to fixed pricing
 */
export async function calculateJobPrice(
  category: ServiceCategory,
  description: string,
  enableParsing: boolean = true
): Promise<PricingResult> {
  const effectiveCategory = (category || 'HANDYMAN') as ServiceCategory;

  // Fallback to legacy fixed pricing if parsing disabled
  if (!enableParsing) {
    return {
      totalPrice: PRICE_MATRIX[effectiveCategory],
      items: [],
      needsReview: false,
      usedFallback: true,
      confidence: 1.0,
      primaryCategory: effectiveCategory,
    };
  }

  try {
    const parsed = parseJobDescription(description);

    const items: JobItemData[] = parsed.items.map((item) => {
      const tier = getTierByCode(item.itemType as any);
      const routeCategory = (item.routeCategory as ServiceCategory) || effectiveCategory;
      const unitPrice = tier?.customerPrice ?? PRICE_MATRIX[routeCategory];
      return {
        itemType: item.itemType,
        quantity: 1,
        unitPrice,
        totalPrice: unitPrice,
        description: item.description,
        routeCategory,
        requiresCapability: item.requiresCapability,
      };
    });

    // Enforce GENERAL_HOUR guardrail (max 2)
    const generalHourCount = items.filter((i) => i.itemType === 'GENERAL_HOUR').length;
    const routingNotes = [...(parsed.routingNotes || [])];
    if (generalHourCount > 2) {
      routingNotes.push('GENERAL_HOUR exceeded (max 2) - escalate to half day');
    }

    let totalPrice = items.reduce((sum, item) => sum + item.totalPrice, 0);

    const needsReview =
      parsed.needsReview ||
      generalHourCount > 2 ||
      parsed.confidence < 0.7;

    return {
      totalPrice,
      items,
      needsReview,
      usedFallback: parsed.usedFallback,
      confidence: parsed.confidence,
      primaryCategory: parsed.primaryCategory as ServiceCategory,
      routingNotes,
      visits: parsed.visits,
    };
  } catch (error) {
    console.error('Pricing calculation error:', error);
    
    // Fallback to fixed pricing on error
    return {
      totalPrice: PRICE_MATRIX[category],
      items: [],
      needsReview: true, // Flag for admin review due to error
      usedFallback: true,
      confidence: 0,
      primaryCategory: effectiveCategory,
    };
  }
}

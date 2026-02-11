import { ServiceCategory, PRICE_MATRIX } from '../constants';
import { parseJobDescription } from './jobParser';
import { getCatalogue, getCatalogueItemSync } from './catalogue';
import { calculateTier, calculatePrice } from './visitEngine';

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
    const catalogue = await getCatalogue();
    
    // Load patterns from DB (optional, falls back to hardcoded patterns if DB fails)
    let dbPatterns: any[] | undefined;
    try {
      const { prisma } = await import('../prisma');
      const patterns = await prisma.jobPattern.findMany({
        where: { isActive: true },
        orderBy: { priority: 'desc' }
      });
      dbPatterns = patterns.map(p => ({
        keywords: typeof p.keywords === 'string' ? JSON.parse(p.keywords) : p.keywords,
        itemId: p.catalogueItemId,
        description: p.description
      }));
    } catch (error) {
      console.warn('[Calculator] Failed to load patterns from DB, using hardcoded patterns:', error);
      // Continue with hardcoded patterns
    }
    
    const parsed = parseJobDescription(description, catalogue, dbPatterns);

    const items: JobItemData[] = (parsed.detectedItemIds || []).map((id) => {
      const item = getCatalogueItemSync(id, catalogue);
      const tier = calculateTier(item?.time_weight_minutes || 0);
      const unitPrice = calculatePrice(tier, item?.item_class || 'STANDARD');

      // Map item_class to ServiceCategory proxy
      let routeCategory = effectiveCategory;
      if (item?.item_class === 'CLEANING') routeCategory = 'CLEANING';

      return {
        itemType: id,
        quantity: 1,
        unitPrice,
        totalPrice: unitPrice,
        description: item?.display_name || id,
        routeCategory,
        requiresCapability: (item?.required_capability_tags?.length || 0) > 0
      };
    });

    // Enforce GENERAL_HOUR guardrail (max 2)
    const generalHourCount = items.filter((i) => i.itemType === 'GENERAL_HOUR').length;
    const routingNotes: string[] = [];
    if (generalHourCount > 2) {
      routingNotes.push('GENERAL_HOUR exceeded (max 2) - escalate to half day');
    }

    let totalPrice = items.reduce((sum, item) => sum + item.totalPrice, 0);

    const needsReview =
      parsed.confidence < 0.7 ||
      generalHourCount > 2;

    return {
      totalPrice,
      items,
      needsReview,
      usedFallback: parsed.confidence === 0,
      confidence: parsed.confidence,
      primaryCategory: (items[0]?.routeCategory || effectiveCategory) as ServiceCategory,
      routingNotes,
      visits: [], // visits generated separately in V1 flow
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

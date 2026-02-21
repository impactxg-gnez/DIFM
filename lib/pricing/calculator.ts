import { ServiceCategory } from '../constants';
import { parseJobDescription, PhraseMapping } from './jobParser';
import { excelSource } from './excelLoader';
import { buildVisits, calculateTierAndPrice } from './visitEngine';

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
    throw new Error('Pricing parsing must be enabled. Legacy fixed pricing is deprecated for Anti-Negotiation.');
  }

  try {
    // 1. Data Source (Excel)
    const catalogue = Array.from(excelSource.jobItems.values());
    const mappings = excelSource.phraseMappings;

    // 2. Parse (Excel-Driven)
    const parsed = parseJobDescription(description, catalogue, mappings);

    // 3. Visit Gen (Summation by Capability)
    const visits = buildVisits(parsed.detectedItemIds || []);

    // 4. Transform Visits back to Item list for legacy UI compatibility if needed
    const items: JobItemData[] = (parsed.detectedItemIds || []).map((id) => {
      const item = excelSource.jobItems.get(id);

      // Calculate individual item theoretical price (for breakdown display)
      const { price } = calculateTierAndPrice(item?.default_time_weight_minutes || 0, item?.pricing_ladder || 'HANDYMAN');

      return {
        itemType: id,
        quantity: 1,
        unitPrice: price,
        totalPrice: price,
        description: item?.display_name || id,
        routeCategory: (item?.capability_tag === 'CLEANING' ? 'CLEANING' : effectiveCategory) as ServiceCategory,
        requiresCapability: (item?.capability_tag !== 'HANDYMAN')
      };
    });

    const totalPrice = visits.reduce((sum, v) => sum + v.price, 0);

    return {
      totalPrice,
      items,
      needsReview: parsed.confidence < 0.7,
      usedFallback: parsed.confidence === 0,
      confidence: parsed.confidence,
      primaryCategory: (items[0]?.routeCategory || effectiveCategory) as ServiceCategory,
      routingNotes: [],
      visits,
    };
  } catch (error) {
    console.error('Pricing calculation error:', error);
    return {
      totalPrice: 0,
      items: [],
      needsReview: true,
      usedFallback: true,
      confidence: 0,
      primaryCategory: effectiveCategory,
    };
  }
}

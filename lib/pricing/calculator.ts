import { ServiceCategory, PRICE_MATRIX } from '../constants';
import { parseJobDescription } from './jobParser';
import { prisma } from '../prisma';

export interface JobItemData {
  itemType: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  description: string;
}

export interface PricingResult {
  totalPrice: number;
  items: JobItemData[];
  needsReview: boolean;
  usedFallback: boolean;
  confidence: number;
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
    };
  }

  try {
    // Parse description to detect items
    const parsed = await parseJobDescription(description);

    // Look up pricing rules for each item
    const items: JobItemData[] = [];
    
    for (const item of parsed.items) {
      // Try to find pricing rule
      const rule = await prisma.pricingRule.findFirst({
        where: {
          category: effectiveCategory,
          itemType: item.itemType,
          isActive: true,
        },
      });

      const unitPrice = rule?.basePrice || PRICE_MATRIX[effectiveCategory];
      const totalPrice = unitPrice * item.quantity;

      items.push({
        itemType: item.itemType,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
        description: item.description,
      });
    }

    // Calculate total
    let totalPrice = items.reduce((sum, item) => sum + item.totalPrice, 0);

    // Apply guardrails
    const basePrice = PRICE_MATRIX[effectiveCategory];
    const MAX_PRICE = basePrice * 5; // 5x base price cap
    const REVIEW_THRESHOLD = basePrice * 3; // Review if > 3x base

    const needsReview = 
      parsed.needsReview || 
      totalPrice > REVIEW_THRESHOLD || 
      parsed.confidence < 0.7;

    // Cap the price
    if (totalPrice > MAX_PRICE) {
      totalPrice = MAX_PRICE;
    }

    return {
      totalPrice,
      items,
      needsReview,
      usedFallback: false,
      confidence: parsed.confidence,
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
    };
  }
}

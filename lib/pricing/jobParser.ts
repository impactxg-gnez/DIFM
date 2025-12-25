import { ServiceCategory } from './constants';

interface ParsedItem {
  itemType: string;
  quantity: number;
  description: string;
}

interface ParseResult {
  items: ParsedItem[];
  confidence: number;
  needsReview: boolean;
}

// Item detection patterns for Handyman category
const HANDYMAN_PATTERNS = {
  MOUNT_TV: ['mount tv', 'hang tv', 'install tv', 'tv mount', 'tv installation'],
  SHELF: ['shelf', 'shelve', 'shelving'],
  PICTURE_HANG: ['hang picture', 'hang mirror', 'picture', 'mirror', 'frame'],
  DOOR_FIX: ['door', 'hinge', 'door handle'],
  FURNITURE_ASSEMBLY: ['assemble', 'assembly', 'furniture', 'ikea'],
  CURTAIN_RAIL: ['curtain', 'blind', 'rail'],
  LOCK_CHANGE: ['lock', 'deadbolt', 'key'],
};

const ELECTRICIAN_PATTERNS = {
  OUTLET_INSTALL: ['outlet', 'socket', 'plug'],
  LIGHT_FIXTURE: ['light', 'fixture', 'chandelier', 'lamp'],
};

const PLUMBER_PATTERNS = {
  LEAK_FIX: ['leak', 'leaking', 'drip'],
  DRAIN_UNBLOCK: ['drain', 'clog', 'block', 'unblock'],
  TAP_INSTALL: ['tap', 'faucet', 'sink'],
};

const CATEGORY_PATTERNS: Record<ServiceCategory, Record<string, string[]>> = {
  HANDYMAN: HANDYMAN_PATTERNS,
  ELECTRICIAN: ELECTRICIAN_PATTERNS,
  PLUMBER: PLUMBER_PATTERNS,
  CLEANING: {},
  PEST_CONTROL: {},
  CARPENTER: {},
  PAINTER: {},
  PC_REPAIR: {},
};

// Quantity detection patterns
const QUANTITY_PATTERNS = [
  { pattern: /(\d+)\s+/g, type: 'number' },
  { pattern: /\b(one|a|an)\b/gi, value: 1 },
  { pattern: /\b(two|couple)\b/gi, value: 2 },
  { pattern: /\b(three)\b/gi, value: 3 },
  { pattern: /\b(four)\b/gi, value: 4 },
  { pattern: /\b(five)\b/gi, value: 5 },
  { pattern: /\b(few)\b/gi, value: 3 },
  { pattern: /\b(several)\b/gi, value: 3 },
];

/**
 * Parse job description to detect multiple items and quantities
 */
export async function parseJobDescription(
  description: string,
  category: ServiceCategory
): Promise<ParseResult> {
  const lowerDesc = description.toLowerCase();
  const patterns = CATEGORY_PATTERNS[category] || {};
  const detectedItems: ParsedItem[] = [];
  let totalConfidence = 0;

  // Split by common separators
  const segments = lowerDesc.split(/\band\b|\bplus\b|\balso\b|,|;/);

  for (const segment of segments) {
    const trimmedSegment = segment.trim();
    if (!trimmedSegment) continue;

    // Try to match item types
    for (const [itemType, keywords] of Object.entries(patterns)) {
      const matched = keywords.some(keyword => trimmedSegment.includes(keyword));
      
      if (matched) {
        // Extract quantity
        let quantity = 1;
        let quantityConfidence = 0.5;

        // Look for explicit numbers
        const numberMatch = trimmedSegment.match(/(\d+)/);
        if (numberMatch) {
          quantity = parseInt(numberMatch[1], 10);
          quantityConfidence = 1.0;
        } else {
          // Look for word quantities
          for (const qp of QUANTITY_PATTERNS) {
            if (qp.type !== 'number' && qp.value) {
              if (qp.pattern.test(trimmedSegment)) {
                quantity = qp.value;
                quantityConfidence = 0.8;
                break;
              }
            }
          }
        }

        detectedItems.push({
          itemType,
          quantity,
          description: trimmedSegment,
        });

        totalConfidence += quantityConfidence;
        break; // Only match one item type per segment
      }
    }
  }

  // If no items detected, use general hourly rate
  if (detectedItems.length === 0) {
    detectedItems.push({
      itemType: 'GENERAL_HOUR',
      quantity: 1,
      description: description,
    });
    totalConfidence = 0.6; // Lower confidence for fallback
  }

  const avgConfidence = totalConfidence / detectedItems.length;
  const needsReview = avgConfidence < 0.7 || detectedItems.length > 5;

  return {
    items: detectedItems,
    confidence: avgConfidence,
    needsReview,
  };
}

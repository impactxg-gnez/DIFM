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

type TaskKey =
  | 'MOUNT_TV'
  | 'SHELF'
  | 'PICTURE_HANG'
  | 'DOOR_FIX'
  | 'FURNITURE_ASSEMBLY'
  | 'CURTAIN_RAIL'
  | 'LOCK_CHANGE'
  | 'SMALL_PLUMBING'
  | 'SMALL_ELECTRICAL'
  | 'GENERAL_HOUR';

const HANDYMAN_TASKS: Record<
  TaskKey,
  { keywords: string[]; defaultQuantity?: number }
> = {
  MOUNT_TV: {
    keywords: ['mount tv', 'hang tv', 'install tv', 'tv mount', 'tv installation'],
  },
  SHELF: { keywords: ['shelf', 'shelves', 'shelving'], defaultQuantity: 1 },
  PICTURE_HANG: { keywords: ['hang picture', 'hang mirror', 'picture', 'mirror', 'frame'] },
  DOOR_FIX: { keywords: ['door', 'hinge', 'door handle'] },
  FURNITURE_ASSEMBLY: { keywords: ['assemble', 'assembly', 'furniture', 'ikea'] },
  CURTAIN_RAIL: { keywords: ['curtain', 'blind', 'rail'] },
  LOCK_CHANGE: { keywords: ['lock', 'deadbolt', 'key'] },
  SMALL_PLUMBING: { keywords: ['leak', 'leaking', 'drip', 'tap', 'faucet'] },
  SMALL_ELECTRICAL: { keywords: ['outlet', 'socket', 'plug', 'light', 'fixture', 'lamp'] },
  GENERAL_HOUR: { keywords: [] },
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
export async function parseJobDescription(description: string): Promise<ParseResult> {
  const lowerDesc = description.toLowerCase();
  const detectedItems: ParsedItem[] = [];
  let totalConfidence = 0;

  // Split by common separators
  const segments = lowerDesc.split(/\band\b|\bplus\b|\balso\b|,|;/);

  for (const segment of segments) {
    const trimmedSegment = segment.trim();
    if (!trimmedSegment) continue;

    let matchedTask: TaskKey | null = null;

    for (const [itemType, task] of Object.entries(HANDYMAN_TASKS) as [TaskKey, any][]) {
      if (!task.keywords.length && matchedTask) continue;
      const matched =
        task.keywords.length === 0
          ? false
          : task.keywords.some((keyword: string) => trimmedSegment.includes(keyword));

      if (matched) {
        matchedTask = itemType;
        break;
      }
    }

    const itemType: TaskKey = matchedTask || 'GENERAL_HOUR';

    // Extract quantity
    let quantity = HANDYMAN_TASKS[itemType].defaultQuantity || 1;
    let quantityConfidence = matchedTask ? 0.8 : 0.5;

    const numberMatch = trimmedSegment.match(/(\d+)/);
    if (numberMatch) {
      quantity = parseInt(numberMatch[1], 10);
      quantityConfidence = 1.0;
    } else {
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
      description: trimmedSegment || description,
    });

    totalConfidence += quantityConfidence;
  }

  if (detectedItems.length === 0) {
    detectedItems.push({
      itemType: 'GENERAL_HOUR',
      quantity: 1,
      description,
    });
    totalConfidence = 0.6;
  }

  const avgConfidence = totalConfidence / detectedItems.length;
  const needsReview = avgConfidence < 0.7 || detectedItems.length > 5;

  return {
    items: detectedItems,
    confidence: avgConfidence,
    needsReview,
  };
}

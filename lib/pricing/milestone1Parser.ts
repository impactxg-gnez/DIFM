/**
 * Milestone 1: Simple rule-based handyman job parser
 * No AI, no categories - just deterministic text matching
 */

export interface HandymanTask {
  code: string;
  name: string;
  unitPrice: number;
  keywords: string[];
}

// Simple handyman task definitions
export const HANDYMAN_TASKS: HandymanTask[] = [
  {
    code: 'SHELF_INSTALL',
    name: 'Shelf Installation',
    unitPrice: 25,
    keywords: ['shelf', 'shelves', 'hang shelf', 'install shelf', 'mount shelf']
  },
  {
    code: 'TAP_REPAIR',
    name: 'Tap/Leak Repair',
    unitPrice: 45,
    keywords: ['tap', 'leak', 'leaking', 'dripping', 'faucet', 'fix tap', 'repair tap']
  },
  {
    code: 'TV_MOUNT',
    name: 'TV Mounting',
    unitPrice: 60,
    keywords: ['tv', 'television', 'mount tv', 'hang tv', 'install tv', 'wall mount']
  },
  {
    code: 'FURNITURE_ASSEMBLE',
    name: 'Furniture Assembly',
    unitPrice: 40,
    keywords: ['assemble', 'furniture', 'ikea', 'flat pack', 'build', 'put together']
  },
  {
    code: 'FAN_INSTALL',
    name: 'Fan Installation',
    unitPrice: 55,
    keywords: ['fan', 'ceiling fan', 'install fan', 'mount fan']
  },
  {
    code: 'DOOR_REPAIR',
    name: 'Door Repair',
    unitPrice: 50,
    keywords: ['door', 'hinge', 'lock', 'fix door', 'repair door', 'door lock']
  },
  {
    code: 'CURTAIN_RAIL',
    name: 'Curtain Rail Installation',
    unitPrice: 35,
    keywords: ['curtain', 'blind', 'rail', 'curtain rail', 'blinds', 'window treatment']
  },
  {
    code: 'ELECTRICAL_SMALL',
    name: 'Small Electrical Work',
    unitPrice: 50,
    keywords: ['socket', 'switch', 'light', 'bulb', 'electrical', 'outlet', 'plug']
  },
  {
    code: 'GENERAL_INSPECTION',
    name: 'General Inspection/Assessment',
    unitPrice: 40,
    keywords: [] // Fallback for unclear requests
  }
];

export interface ParsedJobItem {
  taskCode: string;
  taskName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  description: string;
}

export interface ParseResult {
  items: ParsedJobItem[];
  totalPrice: number;
  needsReview: boolean;
}

/**
 * Parse customer text into handyman job items
 * Rule-based only - no AI, deterministic matching
 */
export function parseHandymanRequest(text: string): ParseResult {
  const lowerText = text.toLowerCase().trim();
  
  if (!lowerText) {
    // Empty text defaults to inspection
    return {
      items: [{
        taskCode: 'GENERAL_INSPECTION',
        taskName: 'General Inspection/Assessment',
        quantity: 1,
        unitPrice: 40,
        totalPrice: 40,
        description: 'Unclear request - requires inspection'
      }],
      totalPrice: 40,
      needsReview: true
    };
  }

  const items: ParsedJobItem[] = [];
  let needsReview = false;

  // Split by common separators
  const segments = lowerText.split(/\band\b|\bplus\b|\balso\b|,|;|&|\+/i)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // If no segments found, treat whole text as one request
  const textSegments = segments.length > 0 ? segments : [lowerText];

  for (const segment of textSegments) {
    let matched = false;
    let quantity = 1;

    // Extract quantity hints
    const numberMatch = segment.match(/(\d+)/);
    if (numberMatch) {
      const num = parseInt(numberMatch[1], 10);
      if (num > 0 && num <= 10) {
        quantity = num;
      }
    } else {
      // Word-based quantity hints
      if (/\btwo\b|\bcouple\b/.test(segment)) quantity = 2;
      else if (/\bthree\b/.test(segment)) quantity = 3;
      else if (/\bfour\b/.test(segment)) quantity = 4;
      else if (/\bfive\b/.test(segment)) quantity = 5;
      else if (/\bseveral\b|\bfew\b|\bmany\b|\bmultiple\b/.test(segment)) {
        quantity = 3;
        needsReview = true; // Multiple items may need review
      }
    }

    // Try to match against task keywords
    for (const task of HANDYMAN_TASKS) {
      if (task.keywords.length === 0) continue; // Skip GENERAL_INSPECTION for now

      const matchesKeyword = task.keywords.some(keyword => 
        segment.includes(keyword.toLowerCase())
      );

      if (matchesKeyword) {
        items.push({
          taskCode: task.code,
          taskName: task.name,
          quantity,
          unitPrice: task.unitPrice,
          totalPrice: task.unitPrice * quantity,
          description: segment
        });
        matched = true;
        break;
      }
    }

    // If no match found, use general inspection
    if (!matched) {
      items.push({
        taskCode: 'GENERAL_INSPECTION',
        taskName: 'General Inspection/Assessment',
        quantity: 1,
        unitPrice: 40,
        totalPrice: 40,
        description: segment
      });
      needsReview = true; // Unclear requests need review
    }
  }

  // If we have more than 3 items, flag for review
  if (items.length > 3) {
    needsReview = true;
  }

  const totalPrice = items.reduce((sum, item) => sum + item.totalPrice, 0);

  return {
    items,
    totalPrice,
    needsReview
  };
}


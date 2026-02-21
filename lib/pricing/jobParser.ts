import { CatalogueItem } from './catalogue';

export interface PhraseMapping {
  phrase: string;
  canonical_job_item_id: string;
}

export interface ParseResult {
  detectedItemIds: string[];
  confidence: number;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Common stop words to remove for better matching
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'my', 'our', 'your', 'their', 'his', 'her', 'its',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might',
  'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'as', 'and', 'or', 'but'
]);

// Normalize text: remove stop words, handle possessives, normalize whitespace
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/'s\b/g, '') // Remove possessives: "my pipe's" -> "my pipe"
    .replace(/\b(my|our|your|their|his|her|its)\s+/g, '') // Remove possessive pronouns
    .split(/\s+/)
    .filter(word => word.length > 0 && !STOP_WORDS.has(word))
    .join(' ');
}

// Check if all keywords in a pattern exist in the text (order-independent)
function patternMatches(textNormalized: string, patternKeywords: string[]): boolean {
  const textWords = new Set(textNormalized.split(/\s+/));
  return patternKeywords.every(keyword => {
    // Handle multi-word keywords
    if (keyword.includes(' ')) {
      return textNormalized.includes(keyword);
    }
    // Single word - check if it exists
    return textWords.has(keyword);
  });
}

// Enhanced keyword matching that handles variations
function keywordMatches(textLower: string, keywordLower: string): boolean {
  // Normalize both texts
  const normalizedText = normalizeText(textLower);
  const normalizedKeyword = normalizeText(keywordLower);

  // If keyword is a phrase, check if all words exist (order-independent)
  if (normalizedKeyword.includes(' ')) {
    const keywordWords = normalizedKeyword.split(/\s+/).filter(w => w.length > 0);
    return patternMatches(normalizedText, keywordWords);
  }

  // Single word - check as whole word
  const re = new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`, 'i');
  return re.test(normalizedText);
}

// Pattern-based matching: looks for combinations of keywords
// Example: "pipe" + "leak" anywhere in text = plumbing leak
interface KeywordPattern {
  keywords: string[]; // All keywords must be present
  itemId: string;
  description: string;
}

// Enhanced pattern matching for common variations
const PATTERN_MATCHES: KeywordPattern[] = [
  // ========== PLUMBING PATTERNS ==========
  { keywords: ['pipe', 'leak'], itemId: 'tap_leak_fix', description: 'pipe leak' },
  { keywords: ['pipe', 'leaking'], itemId: 'tap_leak_fix', description: 'pipe leaking' },
  { keywords: ['pipe', 'broken'], itemId: 'tap_leak_fix', description: 'broken pipe' },
  { keywords: ['pipe', 'fix'], itemId: 'tap_leak_fix', description: 'fix pipe' },
  { keywords: ['pipe', 'repair'], itemId: 'tap_leak_fix', description: 'repair pipe' },
  { keywords: ['leak', 'pipe'], itemId: 'tap_leak_fix', description: 'leak pipe' },
  { keywords: ['leaking', 'pipe'], itemId: 'tap_leak_fix', description: 'leaking pipe' },
  { keywords: ['tap', 'leak'], itemId: 'tap_leak_fix', description: 'tap leak' },
  { keywords: ['tap', 'leaking'], itemId: 'tap_leak_fix', description: 'tap leaking' },
  { keywords: ['sink', 'leak'], itemId: 'tap_leak_fix', description: 'sink leak' },
  { keywords: ['sink', 'leaking'], itemId: 'tap_leak_fix', description: 'sink leaking' },
  { keywords: ['faucet', 'leak'], itemId: 'tap_leak_fix', description: 'faucet leak' },
  { keywords: ['faucet', 'leaking'], itemId: 'tap_leak_fix', description: 'faucet leaking' },
  { keywords: ['water', 'leak'], itemId: 'tap_leak_fix', description: 'water leak' },
  { keywords: ['drip', 'tap'], itemId: 'tap_leak_fix', description: 'dripping tap' },
  { keywords: ['drip', 'pipe'], itemId: 'tap_leak_fix', description: 'dripping pipe' },
  { keywords: ['toilet', 'broken'], itemId: 'toilet_repair_simple', description: 'broken toilet' },
  { keywords: ['toilet', 'fix'], itemId: 'toilet_repair_simple', description: 'fix toilet' },
  { keywords: ['toilet', 'repair'], itemId: 'toilet_repair_simple', description: 'repair toilet' },
  { keywords: ['toilet', 'flush'], itemId: 'toilet_repair_simple', description: 'toilet flush' },
  { keywords: ['drain', 'blocked'], itemId: 'tap_leak_fix', description: 'blocked drain' },
  { keywords: ['drain', 'unclog'], itemId: 'tap_leak_fix', description: 'unclog drain' },
  { keywords: ['shower', 'leak'], itemId: 'tap_leak_fix', description: 'shower leak' },
  { keywords: ['bath', 'leak'], itemId: 'tap_leak_fix', description: 'bath leak' },

  // Concealed leak investigation (FORCE_H3) - must come before general leak patterns
  { keywords: ['hidden', 'leak'], itemId: 'concealed_leak_investigation', description: 'hidden leak' },
  { keywords: ['concealed', 'leak'], itemId: 'concealed_leak_investigation', description: 'concealed leak' },
  { keywords: ['leak', 'behind'], itemId: 'concealed_leak_investigation', description: 'leak behind wall' },
  { keywords: ['leak', 'wall'], itemId: 'concealed_leak_investigation', description: 'leak behind wall' },
  { keywords: ['water', 'through', 'wall'], itemId: 'concealed_leak_investigation', description: 'water coming through wall' },
  { keywords: ['water', 'wall'], itemId: 'concealed_leak_investigation', description: 'water through wall' },
  { keywords: ['unknown', 'leak'], itemId: 'concealed_leak_investigation', description: 'unknown leak source' },
  { keywords: ['leak', 'source'], itemId: 'concealed_leak_investigation', description: 'unknown leak source' },
  { keywords: ['investigate', 'leak'], itemId: 'concealed_leak_investigation', description: 'investigate leak' },
  { keywords: ['investigate', 'hidden'], itemId: 'concealed_leak_investigation', description: 'investigate hidden leak' },
  { keywords: ['investigate', 'water'], itemId: 'concealed_leak_investigation', description: 'investigate water leak' },

  // ========== ELECTRICAL PATTERNS ==========
  { keywords: ['socket', 'replace'], itemId: 'socket_replace', description: 'replace socket' },
  { keywords: ['socket', 'broken'], itemId: 'socket_replace', description: 'broken socket' },
  { keywords: ['socket', 'fix'], itemId: 'socket_replace', description: 'fix socket' },
  { keywords: ['plug', 'replace'], itemId: 'socket_replace', description: 'replace plug' },
  { keywords: ['plug', 'broken'], itemId: 'socket_replace', description: 'broken plug' },
  { keywords: ['switch', 'replace'], itemId: 'socket_replace', description: 'replace switch' },
  { keywords: ['switch', 'broken'], itemId: 'socket_replace', description: 'broken switch' },
  { keywords: ['outlet', 'replace'], itemId: 'socket_replace', description: 'replace outlet' },
  { keywords: ['light', 'fix'], itemId: 'socket_replace', description: 'fix light' },
  { keywords: ['light', 'broken'], itemId: 'socket_replace', description: 'broken light' },
  { keywords: ['bulb', 'replace'], itemId: 'socket_replace', description: 'replace bulb' },
  { keywords: ['fuse', 'replace'], itemId: 'socket_replace', description: 'replace fuse' },
  { keywords: ['electrical', 'fix'], itemId: 'socket_replace', description: 'electrical fix' },
  { keywords: ['electrical', 'repair'], itemId: 'socket_replace', description: 'electrical repair' },
  { keywords: ['light', 'fitting'], itemId: 'light_fitting_replace', description: 'light fitting' },
  { keywords: ['fitting', 'light'], itemId: 'light_fitting_replace', description: 'fitting light' },
  { keywords: ['pendant', 'light'], itemId: 'light_fitting_replace', description: 'pendant light' },
  { keywords: ['chandelier'], itemId: 'light_fitting_replace', description: 'chandelier' },

  // ========== HANDYMAN PATTERNS ==========
  { keywords: ['door', 'broken'], itemId: 'general_handyman_repair', description: 'broken door' },
  { keywords: ['door', 'fix'], itemId: 'general_handyman_repair', description: 'fix door' },
  { keywords: ['door', 'repair'], itemId: 'general_handyman_repair', description: 'repair door' },
  { keywords: ['door', 'hinge'], itemId: 'general_handyman_repair', description: 'door hinge' },
  { keywords: ['door', 'handle'], itemId: 'general_handyman_repair', description: 'door handle' },
  { keywords: ['door', 'lock'], itemId: 'general_handyman_repair', description: 'door lock' },
  { keywords: ['window', 'broken'], itemId: 'general_handyman_repair', description: 'broken window' },
  { keywords: ['window', 'fix'], itemId: 'general_handyman_repair', description: 'fix window' },
  { keywords: ['window', 'repair'], itemId: 'general_handyman_repair', description: 'repair window' },
  { keywords: ['shelf', 'install'], itemId: 'shelf_install_single', description: 'install shelf' },
  { keywords: ['shelf', 'broken'], itemId: 'shelf_install_single', description: 'broken shelf' },
  { keywords: ['shelf', 'fix'], itemId: 'shelf_install_single', description: 'fix shelf' },
  { keywords: ['shelf', 'mount'], itemId: 'shelf_install_single', description: 'mount shelf' },
  { keywords: ['mirror', 'hang'], itemId: 'mirror_hang', description: 'hang mirror' },
  { keywords: ['mirror', 'mount'], itemId: 'mirror_hang', description: 'mount mirror' },
  { keywords: ['picture', 'hang'], itemId: 'pic_hang', description: 'hang picture' },
  { keywords: ['picture', 'frame'], itemId: 'pic_hang', description: 'picture frame' },
  { keywords: ['picture', 'mount'], itemId: 'pic_hang', description: 'mount picture' },
  { keywords: ['curtain', 'rail'], itemId: 'curtain_rail_standard', description: 'curtain rail' },
  { keywords: ['curtain', 'install'], itemId: 'curtain_rail_standard', description: 'install curtain' },
  { keywords: ['blind', 'install'], itemId: 'curtain_rail_standard', description: 'install blind' },
  { keywords: ['tv', 'mount'], itemId: 'tv_mount_standard', description: 'mount tv' },
  { keywords: ['tv', 'hang'], itemId: 'tv_mount_standard', description: 'hang tv' },
  { keywords: ['television', 'mount'], itemId: 'tv_mount_standard', description: 'mount television' },

  // ========== PAINTING PATTERNS ==========
  { keywords: ['paint', 'wall'], itemId: 'paint_wall_standard', description: 'paint wall' },
  { keywords: ['wall', 'paint'], itemId: 'paint_wall_standard', description: 'wall paint' },
  { keywords: ['paint', 'room'], itemId: 'paint_wall_standard', description: 'paint room' },
  { keywords: ['room', 'paint'], itemId: 'paint_wall_standard', description: 'room paint' },
  { keywords: ['paint', 'decorate'], itemId: 'paint_wall_standard', description: 'paint decorate' },
  { keywords: ['decorate', 'wall'], itemId: 'paint_wall_standard', description: 'decorate wall' },
  { keywords: ['decorate', 'room'], itemId: 'paint_wall_standard', description: 'decorate room' },
  { keywords: ['touch', 'up'], itemId: 'paint_touchup', description: 'touch up' },
  { keywords: ['patch', 'paint'], itemId: 'paint_touchup', description: 'patch paint' },
  { keywords: ['paint', 'patch'], itemId: 'paint_touchup', description: 'paint patch' },
  { keywords: ['scuff', 'paint'], itemId: 'paint_touchup', description: 'scuff paint' },
  { keywords: ['scratch', 'paint'], itemId: 'paint_touchup', description: 'scratch paint' },

  // ========== CARPENTRY PATTERNS ==========
  { keywords: ['cabinet', 'install'], itemId: 'cabinet_install', description: 'install cabinet' },
  { keywords: ['cabinet', 'fix'], itemId: 'carpentry_repair', description: 'fix cabinet' },
  { keywords: ['cabinet', 'repair'], itemId: 'carpentry_repair', description: 'repair cabinet' },
  { keywords: ['cabinet', 'broken'], itemId: 'carpentry_repair', description: 'broken cabinet' },
  { keywords: ['furniture', 'repair'], itemId: 'carpentry_repair', description: 'repair furniture' },
  { keywords: ['furniture', 'fix'], itemId: 'carpentry_repair', description: 'fix furniture' },
  { keywords: ['furniture', 'broken'], itemId: 'carpentry_repair', description: 'broken furniture' },
  { keywords: ['wood', 'repair'], itemId: 'carpentry_repair', description: 'repair wood' },
  { keywords: ['wood', 'fix'], itemId: 'carpentry_repair', description: 'fix wood' },
  { keywords: ['woodwork', 'repair'], itemId: 'carpentry_repair', description: 'repair woodwork' },
  { keywords: ['table', 'repair'], itemId: 'carpentry_repair', description: 'repair table' },
  { keywords: ['table', 'fix'], itemId: 'carpentry_repair', description: 'fix table' },
  { keywords: ['chair', 'repair'], itemId: 'carpentry_repair', description: 'repair chair' },
  { keywords: ['chair', 'fix'], itemId: 'carpentry_repair', description: 'fix chair' },
  { keywords: ['wardrobe', 'install'], itemId: 'cabinet_install', description: 'install wardrobe' },
  { keywords: ['wardrobe', 'fix'], itemId: 'carpentry_repair', description: 'fix wardrobe' },
  { keywords: ['built', 'in'], itemId: 'cabinet_install', description: 'built in' },

  // ========== CLEANING PATTERNS ==========
  { keywords: ['clean', 'apartment'], itemId: 'apartment_cleaning_standard', description: 'clean apartment' },
  { keywords: ['apartment', 'clean'], itemId: 'apartment_cleaning_standard', description: 'apartment clean' },
  { keywords: ['clean', 'flat'], itemId: 'apartment_cleaning_standard', description: 'clean flat' },
  { keywords: ['flat', 'clean'], itemId: 'apartment_cleaning_standard', description: 'flat clean' },
  { keywords: ['clean', 'house'], itemId: 'apartment_cleaning_standard', description: 'clean house' },
  { keywords: ['house', 'clean'], itemId: 'apartment_cleaning_standard', description: 'house clean' },
  { keywords: ['clean', 'room'], itemId: 'apartment_cleaning_standard', description: 'clean room' },
  { keywords: ['room', 'clean'], itemId: 'apartment_cleaning_standard', description: 'room clean' },
  { keywords: ['deep', 'clean'], itemId: 'eot_cleaning_1bed', description: 'deep clean' },
  { keywords: ['end', 'tenancy'], itemId: 'eot_cleaning_1bed', description: 'end of tenancy' },
  { keywords: ['tenancy', 'clean'], itemId: 'eot_cleaning_1bed', description: 'tenancy clean' },
  { keywords: ['move', 'out'], itemId: 'eot_cleaning_1bed', description: 'move out clean' },
  { keywords: ['oven', 'clean'], itemId: 'apartment_cleaning_standard', description: 'oven clean' },
  { keywords: ['tidy', 'up'], itemId: 'apartment_cleaning_standard', description: 'tidy up' },

  // ========== GAS PATTERNS ==========
  { keywords: ['gas', 'cert'], itemId: 'gas_cert_cp12', description: 'gas cert' },
  { keywords: ['gas', 'safety'], itemId: 'gas_cert_cp12', description: 'gas safety' },
  { keywords: ['cp12'], itemId: 'gas_cert_cp12', description: 'cp12' },
  { keywords: ['safety', 'cert'], itemId: 'gas_cert_cp12', description: 'safety cert' },
];

// Category detection keywords - detect category FIRST, then find best catalogue item
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  PLUMBING: ['pipe', 'plumb', 'tap', 'faucet', 'sink', 'water', 'leak', 'drip', 'fixture', 'drain', 'unclog', 'clog', 'shower', 'bath', 'toilet', 'cistern', 'valve', 'washer', 'hose', 'leaking', 'leaks'],
  ELECTRICAL: ['electr', 'socket', 'plug', 'switch', 'outlet', 'wiring', 'light', 'bulb', 'fuse', 'circuit', 'breaker', 'rcd', 'consumer unit', 'light fitting'],
  CLEANING: ['clean', 'cleaning', 'tidy', 'deep clean', 'end of tenancy', 'eot clean', 'oven clean', 'apartment clean', 'flat clean'],
  PAINTING: ['paint', 'painting', 'decorate', 'decorating', 'wall paint', 'room paint', 'touch up', 'patch', 'brush', 'roller'],
  CARPENTRY: ['carpenter', 'carpentry', 'wood', 'woodwork', 'cabinet', 'cabinetry', 'furniture', 'table', 'chair', 'shelf', 'shelving', 'cabinet install', 'wardrobe', 'built-in'],
  HANDYMAN: ['door', 'window', 'hinge', 'handle', 'lock', 'repair', 'fix', 'install', 'mount', 'hang', 'broken', 'general repair', 'handyman', 'tv', 'television']
};

// Specific catalogue item keywords (more specific matches take priority)
const KEYWORD_MAP: Record<string, string[]> = {
  // TV Mounting
  'tv_mount_large': ['55', 'large tv', '65', '75', 'big tv'],
  'tv_mount_standard': ['mount tv', 'tv mount', 'hang tv', 'television'],

  // Handyman
  'mirror_hang': [
    'mirror', 'hang mirror', 'mount mirror', 'install mirror',
    'my mirror', 'mirror is', 'mirror needs'
  ],
  'shelf_install_single': [
    'shelf', 'shelves', 'floating shelf', 'install shelf',
    'mount shelf', 'fix shelf', 'broken shelf', 'repair shelf',
    'my shelf', 'shelf is', 'shelf needs'
  ],
  'curtain_rail_standard': [
    'curtain', 'blind', 'rail', 'pole', 'curtain rail',
    'install curtain', 'install blind', 'curtain pole',
    'my curtain', 'curtain is', 'curtain needs'
  ],
  'pic_hang': [
    'picture', 'art', 'frame', 'canvas', 'hang picture', 'hang a picture',
    'mount picture', 'install picture', 'picture frame',
    'my picture', 'picture is', 'picture needs', 'artwork'
  ],
  'general_handyman_repair': [
    'door', 'broken door', 'repair door', 'fix door',
    'window', 'broken window', 'repair window', 'fix window',
    'door hinge', 'door handle', 'door lock', 'window handle',
    'my door', 'door is', 'door needs', 'my window', 'window is', 'window needs'
  ],

  // Plumbing - concealed leak investigation (FORCE_H3) - must come before general leak patterns
  'concealed_leak_investigation': [
    'hidden leak', 'concealed leak', 'leak behind wall', 'leak behind',
    'water coming through wall', 'water through wall', 'water wall',
    'unknown leak source', 'unknown leak', 'leak source',
    'investigate leak', 'investigate hidden', 'investigate water',
    'investigate hidden leak', 'investigate concealed leak',
    'hidden water leak', 'concealed water leak', 'behind wall leak'
  ],

  // Plumbing - expanded with variations
  'tap_leak_fix': [
    'leak', 'drip', 'tap', 'sink', 'faucet', 'fixture', 'water',
    'repair pipe', 'fix pipe', 'broken pipe', 'leaking pipe',
    'pipe leak', 'pipe leaking', 'pipe is leaking', 'my pipe is leaking',
    'fix leaking pipe', 'repair leaking pipe', 'leaking tap', 'leaking sink',
    'tap is leaking', 'sink is leaking', 'faucet is leaking'
  ],
  'toilet_repair_simple': [
    'toilet', 'flush', 'cistern',
    'toilet broken', 'toilet fix', 'toilet repair',
    'toilet is', 'toilet needs', 'my toilet',
    'toilet not working', 'toilet broken', 'broken toilet'
  ],

  // Electrical
  'socket_replace': [
    'socket', 'plug', 'switch', 'outlet', 'replace socket',
    'socket broken', 'socket fix', 'socket repair',
    'plug broken', 'plug fix', 'switch broken', 'switch fix',
    'outlet broken', 'outlet fix', 'light fix', 'bulb replace',
    'fuse replace', 'electrical fix', 'electrical repair',
    'my socket', 'socket is', 'socket needs', 'my plug', 'plug is'
  ],
  'light_fitting_replace': [
    'light fitting', 'fitting light', 'replace light', 'install light',
    'pendant light', 'ceiling light', 'wall light', 'chandelier',
    'fitting', 'light fixture'
  ],

  // Gas
  'gas_cert_cp12': [
    'gas cert', 'cp12', 'safety cert', 'landlord', 'gas safety',
    'gas certificate', 'gas safety certificate', 'cp12 certificate',
    'landlord cert', 'safety certificate', 'gas check'
  ],

  // Cleaning
  'apartment_cleaning_standard': [
    'clean my apartment', 'apartment clean', 'clean apartment', 'flat clean', 'clean my flat',
    'clean house', 'house clean', 'clean home', 'home clean',
    'clean room', 'room clean', 'clean my room', 'my room clean',
    'my apartment', 'apartment is', 'apartment needs', 'my flat', 'flat is',
    'oven clean', 'deep clean apartment', 'deep clean flat'
  ],
  'eot_cleaning_1bed': [
    'end of tenancy', 'eot clean', 'move out clean',
    'end tenancy', 'tenancy clean', 'move out', 'moving out clean',
    'checkout clean', 'check out clean', 'final clean'
  ],
  'eot_cleaning_2bed': [
    'end of tenancy 2 bed', 'eot clean 2 bed', 'move out clean 2 bed',
    'end tenancy 2 bed', 'tenancy clean 2 bed', 'move out 2 bed',
    'checkout clean 2 bed', 'final clean 2 bed'
  ],

  // Painting
  'paint_wall_standard': [
    'paint wall', 'paint my wall', 'paint room', 'wall paint',
    'paint house', 'paint home', 'decorate wall', 'decorate room',
    'room decorate', 'wall decorate', 'my wall', 'wall is', 'wall needs',
    'paint bedroom', 'paint living room', 'paint kitchen'
  ],
  'paint_touchup': [
    'touch up', 'patch', 'small scuff', 'scratch',
    'touch up paint', 'paint touch up', 'patch paint', 'paint patch',
    'scuff paint', 'scratch paint', 'small repair', 'minor paint'
  ],

  // Carpentry
  'carpentry_repair': [
    'carpenter', 'carpentry', 'wood repair', 'furniture repair',
    'furniture fix', 'furniture broken', 'wood fix', 'wood broken',
    'table repair', 'table fix', 'chair repair', 'chair fix',
    'cabinet repair', 'cabinet fix', 'wardrobe repair', 'wardrobe fix',
    'my furniture', 'furniture is', 'furniture needs', 'my table', 'table is'
  ],
  'cabinet_install': [
    'cabinet', 'cabinetry', 'install cabinet', 'built-in',
    'cabinet install', 'install cabinets', 'built in cabinet',
    'wardrobe install', 'install wardrobe', 'fitted cabinet',
    'my cabinet', 'cabinet is', 'cabinet needs'
  ],
};

// Extract quantity from a segment (e.g., "install 4 shelves" -> 4, "hang picture" -> 1)
function extractQuantity(segment: string): { quantity: number; cleanedSegment: string } {
  // Match patterns like "4 shelves", "2 pictures", "three mirrors", etc.
  // Look for numbers at the start or before the main noun
  const lower = segment.toLowerCase().trim();

  // Pattern 1: Number at start (e.g., "4 shelves", "2 pictures")
  const startNumberMatch = lower.match(/^(\d+)\s+/);
  if (startNumberMatch) {
    const quantity = parseInt(startNumberMatch[1], 10);
    const cleanedSegment = segment.substring(startNumberMatch[0].length).trim();
    return { quantity: Math.max(1, Math.min(quantity, 100)), cleanedSegment }; // Cap at 100
  }

  // Pattern 2: Number before noun (e.g., "install 4 shelves", "hang 2 pictures")
  const beforeNounMatch = lower.match(/\b(\d+)\s+(shelf|shelves|picture|pictures|mirror|mirrors|tv|tvs|door|doors|window|windows|socket|sockets|plug|plugs|light|lights|bulb|bulbs|tap|taps|pipe|pipes|cabinet|cabinets|chair|chairs|table|tables|item|items|thing|things)\b/i);
  if (beforeNounMatch) {
    const numStr = beforeNounMatch[1];

    // TV size safety: If the number is a common TV size (32, 40, 42, 50, 55, 65, 75, 85) 
    // AND it's followed by "tv", "inch", "in" or '"', assume it's a size, not quantity.
    const tvSizeIndicators = ['inch', 'in', '"', 'tv', 'television'];
    const commonTvSizes = ['32', '40', '42', '43', '48', '50', '55', '60', '65', '70', '75', '80', '85'];

    const isTvSize = commonTvSizes.includes(numStr) &&
      tvSizeIndicators.some(ind => lower.includes(ind));

    if (!isTvSize) {
      const quantity = parseInt(numStr, 10);
      // Remove the number from the segment for parsing
      const cleanedSegment = segment.replace(new RegExp(`\\b${numStr}\\s+`, 'i'), '').trim();
      return { quantity: Math.max(1, Math.min(quantity, 100)), cleanedSegment };
    }
  }

  // Pattern 3: Written numbers (e.g., "two shelves", "three pictures")
  const writtenNumbers: Record<string, number> = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
  };
  for (const [word, num] of Object.entries(writtenNumbers)) {
    const regex = new RegExp(`\\b${word}\\s+`, 'i');
    if (regex.test(lower)) {
      const cleanedSegment = segment.replace(regex, '').trim();
      return { quantity: num, cleanedSegment };
    }
  }

  // Default: quantity = 1
  return { quantity: 1, cleanedSegment: segment };
}

// Segment description by common separators
function segmentDescription(text: string): string[] {
  // Split by "and", commas, semicolons, "plus", "also", "then"
  // Also handle numbered lists like "1. fix door 2. paint wall"
  const normalized = text
    .replace(/\d+[\.\)]\s*/g, ' ') // Remove numbered list markers
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  const segments = normalized
    .split(/\s+and\s+|\s*,\s*|\s*;\s*|\s+plus\s+|\s+also\s+|\s+then\s+/i)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // If no separators found, return the whole text as a single segment
  return segments.length > 0 ? segments : [normalized];
}

// Detect category from segment text (enhanced with pattern matching)
function detectCategory(segmentLower: string): string | null {
  const normalizedSegment = normalizeText(segmentLower);

  // Check categories in order of specificity (most specific first)
  const categoryOrder = ['CLEANING', 'PAINTING', 'CARPENTRY', 'PLUMBING', 'ELECTRICAL', 'HANDYMAN'];

  for (const category of categoryOrder) {
    // Check for pattern matches first (more specific)
    for (const pattern of PATTERN_MATCHES) {
      if (patternMatches(normalizedSegment, pattern.keywords)) {
        // Infer category from pattern's itemId
        if (pattern.itemId.includes('cleaning') || pattern.itemId.includes('clean')) return 'CLEANING';
        if (pattern.itemId.includes('paint')) return 'PAINTING';
        if (pattern.itemId.includes('carpent') || pattern.itemId.includes('cabinet')) return 'CARPENTRY';
        if (pattern.itemId.includes('plumb') || pattern.itemId.includes('tap') || pattern.itemId.includes('pipe')) return 'PLUMBING';
        if (pattern.itemId.includes('electr') || pattern.itemId.includes('socket')) return 'ELECTRICAL';
        if (pattern.itemId.includes('handyman') || pattern.itemId.includes('door') || pattern.itemId.includes('window')) return 'HANDYMAN';
      }
    }

    // Fallback to individual keyword matching
    const keywords = CATEGORY_KEYWORDS[category];
    if (keywords && keywords.some(kw => keywordMatches(segmentLower, kw))) {
      return category;
    }
  }

  return null;
}

// Infer category from catalogue item
function inferCategoryFromItem(item: CatalogueItem): string {
  if (item.item_class === 'CLEANING') return 'CLEANING';
  if (item.item_class === 'SPECIALIST') {
    const tags = item.required_capability_tags || [];
    if (tags.includes('PAINTER')) return 'PAINTING';
    if (tags.includes('CARPENTER')) return 'CARPENTRY';
    if (tags.includes('PLUMBING')) return 'PLUMBING';
    if (tags.includes('ELECTRICAL')) return 'ELECTRICAL';
    return 'SPECIALIST';
  }
  // STANDARD items
  const tags = item.required_capability_tags || [];
  if (tags.includes('PLUMBING')) return 'PLUMBING';
  if (tags.includes('ELECTRICAL')) return 'ELECTRICAL';
  return 'HANDYMAN';
}

// Find best catalogue item for a category and segment (enhanced with pattern matching)
function findBestCatalogueItem(
  category: string,
  segmentLower: string,
  catalogue: CatalogueItem[],
  customPatterns?: KeywordPattern[]
): string | null {
  const normalizedSegment = normalizeText(segmentLower);

  // Merge custom patterns (from DB) with hardcoded patterns
  // Custom patterns take priority (checked first)
  const allPatterns = customPatterns
    ? [...customPatterns, ...PATTERN_MATCHES]
    : PATTERN_MATCHES;

  // First, try pattern-based matching (handles variations like "pipe is leaking")
  for (const pattern of allPatterns) {
    if (patternMatches(normalizedSegment, pattern.keywords)) {
      const catalogueItem = catalogue.find(c => c.job_item_id === pattern.itemId);
      if (catalogueItem) {
        const itemCategory = inferCategoryFromItem(catalogueItem);
        if (itemCategory === category || (category === 'HANDYMAN' && itemCategory === 'STANDARD')) {
          console.log(`[JobParser] Pattern match: "${pattern.description}" -> ${pattern.itemId}`);
          return pattern.itemId;
        }
      }
    }
  }

  // Then try specific keyword matches
  const sortedEntries = Object.entries(KEYWORD_MAP).sort((a, b) => {
    const aMaxLen = Math.max(...a[1].map(k => k.length));
    const bMaxLen = Math.max(...b[1].map(k => k.length));
    return bMaxLen - aMaxLen; // Longer keywords first
  });

  for (const [itemId, keywords] of sortedEntries) {
    const matchedKeyword = keywords.find(k => keywordMatches(segmentLower, k.toLowerCase()));
    if (matchedKeyword) {
      const catalogueItem = catalogue.find(c => c.job_item_id === itemId);
      if (catalogueItem) {
        // Verify category matches
        const itemCategory = inferCategoryFromItem(catalogueItem);
        if (itemCategory === category || (category === 'HANDYMAN' && itemCategory === 'STANDARD')) {
          return itemId;
        }
      }
    }
  }

  // Fallback: find any catalogue item for this category
  return findFallbackItem(category, catalogue);
}

// Find fallback catalogue item for a category
function findFallbackItem(category: string, catalogue: CatalogueItem[]): string | null {
  const fallbackMap: Record<string, string[]> = {
    PLUMBING: ['concealed_leak_investigation', 'tap_leak_fix'],
    ELECTRICAL: ['socket_replace'],
    CLEANING: ['apartment_cleaning_standard', 'eot_cleaning_1bed'],
    PAINTING: ['paint_wall_standard', 'paint_touchup'],
    CARPENTRY: ['carpentry_repair', 'cabinet_install', 'shelf_install_single'],
    HANDYMAN: ['general_handyman_repair', 'shelf_install_single', 'pic_hang']
  };

  const fallbackIds = fallbackMap[category] || [];
  for (const id of fallbackIds) {
    const item = catalogue.find(c => c.job_item_id === id);
    if (item) return id;
  }

  return null;
}

export function parseJobDescription(
  text: string,
  catalogue: CatalogueItem[],
  phraseMappings: PhraseMapping[]
): ParseResult {
  const detectedIds: string[] = [];
  const segmentConfidences: number[] = [];

  // Segment the description
  const segments = segmentDescription(text);
  console.log(`[JobParser] Segmented "${text}" into:`, segments);

  for (const segment of segments) {
    const { quantity, cleanedSegment } = extractQuantity(segment);
    const segmentLower = cleanedSegment.toLowerCase().trim();

    // 1. Collision Safeguard: Prefer Exact Match
    let matchedItemId: string | null = null;
    let confidence = 0;
    const segmentDetectedIds: string[] = [];

    // Try exact phrase match from DB
    const exactMatch = phraseMappings.find(pm => pm.phrase.toLowerCase() === segmentLower);
    if (exactMatch) {
      matchedItemId = exactMatch.canonical_job_item_id;
      segmentDetectedIds.push(matchedItemId);
      confidence = 1.0;
      console.log(`[JobParser] Exact match found: "${segmentLower}" -> ${matchedItemId}`);
    } else {
      // 2. Phrase Detection (Fuzzy/Partial)
      // Sort phrase mappings by length descending to match longest phrases first
      const sortedMappings = [...phraseMappings].sort((a, b) => b.phrase.length - a.phrase.length);

      let remainingText = segmentLower;

      // Loop to find multiple phrases in the same segment
      for (const mapping of sortedMappings) {
        const phraseLower = mapping.phrase.toLowerCase();
        if (remainingText.includes(phraseLower)) {
          matchedItemId = mapping.canonical_job_item_id;
          segmentDetectedIds.push(matchedItemId);

          // Remove the matched phrase from remaining text to avoid double-matching 
          // (or finding inner phrases of a longer phrase)
          remainingText = remainingText.replace(phraseLower, ' '.repeat(phraseLower.length));

          confidence = Math.max(confidence, 0.9);
          console.log(`[JobParser] Phrase match found: "${mapping.phrase}" in segment -> ${matchedItemId}`);
        }
      }

      if (segmentDetectedIds.length > 0) {
        // Handle all phrases found in the non-exact path
        matchedItemId = null; // Mark as handled for fallback check
      }
    }

    // Add all detected IDs for this segment (except for fallback which adds later)
    if (segmentDetectedIds.length > 0) {
      for (const id of segmentDetectedIds) {
        for (let i = 0; i < quantity; i++) {
          detectedIds.push(id);
        }
      }
    }

    // 3. Fallback: Existing Keyword Search if DB mapping fails AND no phrases were found
    if (segmentDetectedIds.length === 0 && !matchedItemId) {
      const category = detectCategory(segmentLower);
      if (category) {
        matchedItemId = findFallbackItem(category, catalogue);
        confidence = 0.5;
        console.log(`[JobParser] Fallback category match: ${category} -> ${matchedItemId}`);

        if (matchedItemId) {
          for (let i = 0; i < quantity; i++) {
            detectedIds.push(matchedItemId);
          }
        }
      }
    }
    segmentConfidences.push(confidence);
  }

  const overallConfidence = segmentConfidences.length > 0
    ? segmentConfidences.reduce((sum, c) => sum + c, 0) / segmentConfidences.length
    : 0;

  return {
    detectedItemIds: detectedIds,
    confidence: overallConfidence
  };
}

import { CatalogueItem } from './catalogue';

export interface ParseResult {
  detectedItemIds: string[];
  confidence: number;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordMatches(textLower: string, keywordLower: string) {
  // If keyword is a phrase, do a direct includes.
  if (keywordLower.includes(' ')) return textLower.includes(keywordLower);
  // Otherwise, match as a whole word to avoid false positives (e.g. "art" in "apartment").
  const re = new RegExp(`\\b${escapeRegExp(keywordLower)}\\b`, 'i');
  return re.test(textLower);
}

// Simple V1 detection rules
// In a real app this would be more sophisticated or fuzzy match against DB
const KEYWORD_MAP: Record<string, string[]> = {
  'tv_mount_large': ['55', 'large tv', ' 65', ' 75'],
  'tv_mount_standard': ['mount tv', 'tv mount', 'hang tv', 'television'],
  'mirror_hang': ['mirror'],
  'shelf_install_single': ['shelf', 'shelves', 'floating'],
  'curtain_rail_standard': ['curtain', 'blind', 'rail', 'pole'],
  'pic_hang': ['picture', 'art', 'frame', 'canvas'],
  'tap_leak_fix': ['leak', 'drip', 'tap', 'sink', 'plumb'],
  'toilet_repair_simple': ['toilet', 'flush'],
  'socket_replace': ['socket', 'plug', 'switch', 'outlet'],
  'gas_cert_cp12': ['gas cert', 'cp12', 'safety cert', 'landlord'],
  // Accept "clean" phrases directly (acceptance criteria) while avoiding substring false positives.
  'eot_cleaning_1bed': ['cleaning', 'clean', 'clean my', 'apartment clean', 'end of tenancy', 'deep clean'],
};

export function parseJobDescription(text: string, catalogue: CatalogueItem[]): ParseResult {
  const lower = text.toLowerCase();
  const detectedIds = new Set<string>();

  // 1. Exact/Keyword matching from Map
  // Order matters if we want priority, but here we detect all.

  // Special handling for TV size to distinguish
  if ((lower.includes('tv') || lower.includes('television')) && (lower.includes('mount') || lower.includes('hang'))) {
    if (lower.includes('55') || lower.includes('65') || lower.includes('75') || lower.includes('big') || lower.includes('large')) {
      detectedIds.add('tv_mount_large');
    } else {
      detectedIds.add('tv_mount_standard');
    }
  }

  // Iterate other rules
  for (const [id, keywords] of Object.entries(KEYWORD_MAP)) {
    if (id.startsWith('tv_mount')) continue; // Handled above

    if (keywords.some(k => keywordMatches(lower, k.toLowerCase()))) {
      // Validate against catalogue (only return valid IDs)
      if (catalogue.find(c => c.job_item_id === id)) {
        detectedIds.add(id);
      }
    }
  }

  // Default to General Handyman if nothing found? 
  // For V1, if nothing found, maybe return a generic 'general_handyman_hour' if we had one.
  // We didn't seed one. I'll rely on the caller handling empty.

  return {
    detectedItemIds: Array.from(detectedIds),
    confidence: detectedIds.size > 0 ? 0.9 : 0
  };
}


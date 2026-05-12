/**
 * Illegal / unethical / abusive requests — must not create review leads or bookings.
 */

export interface BlockedRequestResult {
    blocked: true;
    reason_code: string;
}

const BLOCK_REASON = 'UNSUPPORTED_OR_UNSAFE';

/** Whole-input checks (normalized lower + punctuation-friendly). */
const BLOCKED_PATTERNS: RegExp[] = [
    /\b(hack(?:ing)?|crack(?:ing)?)\b.{0,60}\b(wifi|wi-?fi|wlan|router|wpa|network\s+password|neighbours?\s+wifi|neighbors?\s+wifi)\b/i,
    /\b(bypass)\b.{0,40}\b(router|wifi|firewall|encryption|wpa)\b/i,
    /\bsteal(?:ing)?\s+electricity\b|\belectricity\b.{0,20}\b(meter\s+bypass|bypass|steal)\b/i,
    /\b(bypass|tamper(?:ing)?\s+with)\b.{0,30}\b(meter|utility)\b/i,
    /\bspy(?:ing)?\s+on\s+(?:my\s+)?(?:the\s+)?(?:neighbours?|neighbors?|someone)\b/i,
    /\bspy\s+(?:on\s+)?(?:the\s+)?(?:neighbours?|neighbors?)\b/i,
    /\bbreak\s+(into|open)\b.{0,30}\block\b|\bbreak\s+into\b.{0,30}\b(home|house|flat|door)\b/i,
    /\bspy\s+camera\s+install\b|\b(hidden|secret|covert)\s+(?:cctv|camera)\s+(install|fitting)\b/i,
    /\binsider\s+hacking\b|\bpenetration\s+test\b.*(?:someone'?s\s+network|neighbor|neighbour)\b/i,
];

export function classifyBlockedUnsafeRequest(canonicalNormalizedLower: string): BlockedRequestResult | null {
    const n = canonicalNormalizedLower;
    for (const re of BLOCKED_PATTERNS) {
        if (re.test(n)) {
            return { blocked: true, reason_code: BLOCK_REASON };
        }
    }
    return null;
}

export const BLOCKED_UNSUPPORTED_MESSAGE =
    'We cannot assist with this request. Tell us what we can help fix or install safely in your home.';

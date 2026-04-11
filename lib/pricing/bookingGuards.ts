/**
 * Production QA guards: out-of-scope, vague phrasing, commercial bulk, contradictions.
 * Used by v1Pricing + intentMapper + extractionEngine.
 */

/** Multi-word or distinctive phrases (avoid single-token false positives where possible). */
export const OUT_OF_SCOPE_BOOKING_PHRASES: string[] = [
    'swimming pool',
    'build a pool',
    'pool installation',
    'loft conversion',
    'structural engineer',
    'demolish house',
    'new build house',
    'planning permission',
    'asbestos removal',
    'gas appliance install',
    'gas boiler install',
    'rewire entire',
    'full rewire',
    'underpinning',
    'foundation repair',
    'roof replacement',
    'replace roof',
    'solar panel install',
    'heat pump install',
    'cctv install',
    'alarm system install',
    'pest control',
    'pest removal',
    'locksmith emergency',
    'car repair',
    'vehicle repair',
    'wedding',
    'catering event',
];

export function matchesExtendedOutOfScope(normalizedLower: string): boolean {
    return OUT_OF_SCOPE_BOOKING_PHRASES.some((phrase) => normalizedLower.includes(phrase));
}

/** Vague / under-specified booking intent — clarify instead of guessing. */
export const VAGUE_BOOKING_PATTERNS: string[] = [
    'full house handyman',
    'fix my house',
    'fix house',
    'everything',
    'whole house',
    'general handyman',
    'need help',
    'help in the house',
    'help in house',
    'help around the house',
    'help around house',
    'something broken',
    'something broke',
    'fix something',
    'handyman needed',
    'need a handyman',
    'need handyman',
    'general help',
    'around the house',
    'not sure what',
    'everything done',
    'odd jobs',
    'odd job',
    'miscellaneous',
    'random jobs',
    'small jobs',
    'bits and bobs',
    'few things',
    'couple of things',
    'stuff to fix',
    'things to fix',
];

export function isVagueBookingRequest(normalizedInput: string): boolean {
    const n = normalizedInput.toLowerCase();
    return VAGUE_BOOKING_PATTERNS.some((p) => n.includes(p));
}

/** Commercial / fit-out language — custom quote, not instant matrix price. */
const COMMERCIAL_PHRASE = /\b(office\s+fit|shop\s+fit|retail\s+fit|warehouse|commercial\s+unit|fit\s*out|bulk\s+install|store\s+refit|workplace)\b/i;

/** Quantity thresholds for residential vs commercial-style bulk. */
export const COMMERCIAL_MIN_SINGLE_ITEM_QTY = 30;
export const COMMERCIAL_MIN_HEAVY_ITEM_QTY = 20;

export type MappedClauseLite = { quantity: number; clause: string; ruleJob: string };

export function detectCommercialBulkClarify(
    normalizedInput: string,
    matches: MappedClauseLite[],
): { reason: 'COMMERCIAL_BULK' | 'HIGH_QUANTITY' } | null {
    if (COMMERCIAL_PHRASE.test(normalizedInput)) {
        return { reason: 'COMMERCIAL_BULK' };
    }
    const maxQty = matches.length ? Math.max(...matches.map((m) => m.quantity), 0) : 0;
    if (maxQty >= COMMERCIAL_MIN_SINGLE_ITEM_QTY) {
        return { reason: 'HIGH_QUANTITY' };
    }
    for (const m of matches) {
        if (m.quantity >= COMMERCIAL_MIN_HEAVY_ITEM_QTY) {
            if (/\b(desk|desks|cubicle|workstation|chair|chairs|shelf|shelves|socket|sockets|blind|blinds)\b/i.test(m.clause)) {
                return { reason: 'HIGH_QUANTITY' };
            }
        }
    }
    return null;
}

/** TV / wall mount without a viable mounting surface — do not auto-price. */
export function detectScopeContradiction(normalizedInput: string): boolean {
    const n = normalizedInput.toLowerCase();
    const tvMention = /\b(tv|television|telly)\b/i.test(n);
    const mountMention = /\b(mount|hang|wall)\b/i.test(n);
    if (!tvMention || !mountMention) return false;
    if (
        /\b(no wall|without a wall|no suitable wall|nowhere to mount|can't drill|cannot drill|no drilling|rental.*?no holes|no holes allowed)\b/i.test(
            n,
        )
    ) {
        return true;
    }
    return false;
}

import {
    buildCountableNounCapturePattern,
    extractQuantityFromPart,
} from './quantityParse';

/**
 * Structured clause parse: quantity + item/object + action + context.
 * Produced before rule classification; consumed together with mapPartToJob output.
 */
export interface ParsedBookingClause {
    raw: string;
    quantity: number;
    /** Best-effort primary countable object (e.g. shelves, tvs). */
    itemHint: string | null;
    /** Normalized verbs (install, mount, put up, …). */
    actions: string[];
    /** Environment / surface / scope hints. */
    contextModifiers: string[];
}

const ACTION_PATTERN =
    /\b(mount|install|hang|fit|put\s+up|replace|fix|repair|assemble|take\s+down|remove)\b/gi;

const CONTEXT_TOKENS = [
    'wall',
    'ceiling',
    'concrete',
    'brick',
    'drywall',
    'plaster',
    'wood',
    'stud',
    'bathroom',
    'kitchen',
    'ladder',
    'outdoor',
    'inside',
    'outside',
];

function normalizeAction(raw: string): string {
    return raw.toLowerCase().replace(/\s+/g, ' ').trim();
}

function extractActions(part: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(ACTION_PATTERN.source, ACTION_PATTERN.flags);
    while ((m = re.exec(part)) !== null) {
        const a = normalizeAction(m[1]);
        if (a && !seen.has(a)) {
            seen.add(a);
            out.push(a);
        }
    }
    return out;
}

function extractContextModifiers(part: string): string[] {
    const lower = part.toLowerCase();
    return CONTEXT_TOKENS.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(lower));
}

function extractItemHint(part: string): string | null {
    const cap = buildCountableNounCapturePattern();
    const m = part.match(new RegExp(`\\b${cap}\\b`, 'i'));
    return m ? m[1].replace(/\s+/g, ' ').toLowerCase() : null;
}

/** Step 1–2 of the pipeline: quantity + item/action/context before rule classification. */
export function parseBookingClause(part: string): ParsedBookingClause {
    const quantity = Math.max(1, extractQuantityFromPart(part) || 1);
    return {
        raw: part,
        quantity,
        itemHint: extractItemHint(part),
        actions: extractActions(part),
        contextModifiers: extractContextModifiers(part),
    };
}

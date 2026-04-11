/**
 * Natural-language quantity extraction (runs before SKU / tier resolution).
 * Supports digits, English words, and compounds (e.g. "twenty four shelves").
 */

const UNITS: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
};

const TENS: Record<string, number> = {
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
};

/** Alternation body used for quantity + item detection (shared across parsers). */
export function getCountableNounAlternation(): string {
    const parts = [
        'shelf|shelves',
        'mirror|mirrors',
        'picture|pictures',
        'frame|frames',
        'blind|blinds',
        'curtain\\s+rail|curtain\\s+rails',
        'rail|rails',
        'curtain|curtains',
        'light\\s+fitting|light\\s+fittings',
        'light|lights',
        'socket|sockets',
        'plug|plugs',
        'radiator|radiators',
        'toilet|toilets',
        'dishwasher|dishwashers',
        'tv|tvs|television|televisions',
        'hook|hooks',
        'bracket|brackets',
        'fixture|fixtures',
        'unit|units',
        'item|items',
        'piece|pieces',
    ];
    return parts.join('|');
}

/** Non-capturing noun group for quantity regexes. */
export function buildCountableNounPattern(): string {
    return `(?:${getCountableNounAlternation()})`;
}

/** Capturing noun group for extracting the matched object phrase. */
export function buildCountableNounCapturePattern(): string {
    return `(${getCountableNounAlternation()})`;
}

function normalizeWords(text: string): string {
    return text
        .toLowerCase()
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Parses a standalone English number phrase (no leading digit). */
export function parseEnglishWordNumber(phrase: string): number | null {
    const t = normalizeWords(phrase);
    if (!t) return null;

    if (UNITS[t] !== undefined) return UNITS[t];

    const tensUnit = t.match(/^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s+(one|two|three|four|five|six|seven|eight|nine))?$/);
    if (tensUnit) {
        const base = TENS[tensUnit[1]];
        if (!tensUnit[2]) return base;
        return base + (UNITS[tensUnit[2]] || 0);
    }

    return null;
}

/**
 * Extract quantity from a single clause (after normalizeInput).
 * Order: digit + noun, word + noun, pair of, multiplier x, default 1.
 */
export function extractQuantityFromPart(part: string): number {
    const noun = buildCountableNounPattern();

    const digitFirst = part.match(new RegExp(`\\b(\\d+)\\s+${noun}\\b`, 'i'));
    if (digitFirst) return Math.max(1, Number(digitFirst[1]));

    const tensNames = Object.keys(TENS).join('|');
    const unitNames = Object.keys(UNITS).join('|');
    const wordBeforeNoun = new RegExp(
        `\\b(?:(${tensNames})(?:\\s+(${unitNames}))?|(${unitNames}))\\s+${noun}\\b`,
        'i'
    );
    const wm = part.match(wordBeforeNoun);
    if (wm) {
        let n: number | null = null;
        if (wm[3]) n = UNITS[wm[3].toLowerCase()] ?? null;
        else if (wm[1]) {
            const t = TENS[wm[1].toLowerCase()];
            n = t + (wm[2] ? UNITS[wm[2].toLowerCase()] ?? 0 : 0);
        }
        if (n !== null && n >= 1) return n;
    }

    const pairOf = part.match(new RegExp(`\\b(?:a\\s+)?pair\\s+of\\s+${noun}\\b`, 'i'));
    if (pairOf) return 2;

    const multiplier =
        part.match(/\b(\d+)\s*x\b/i) ||
        part.match(/\bx\s*(\d+)\b/i) ||
        part.match(/\b(\d+)\s*(?:times|off)\b/i);
    if (multiplier) return Math.max(1, Number(multiplier[1]));

    return 1;
}

/**
 * Normalizes messy mobile / no-space typing before tokenization and quantity extraction.
 */

const MERGED_COUNT_NOUNS =
    'shelves|shelf|mirrors|mirror|pictures|picture|frames|frame|blinds|blind|tvs|tv|televisions|television|' +
    'lights|light|sockets|socket|plugs|plug|rails|rail|curtains|curtain|hooks|hook|brackets|bracket|' +
    'units|unit|items|item|pieces|piece|desks|desk|tables|table|chairs|chair|wardrobes|wardrobe';

/**
 * Insert space between digits and trailing countable nouns: "50shelves" → "50 shelves".
 * Word boundaries do not sit between digit and letter, so we allow a non-word or start before the run.
 */
function splitDigitMergedNouns(s: string): string {
    return s.replace(
        new RegExp(`(^|[^a-z0-9])(\\d+)\\s*(${MERGED_COUNT_NOUNS})\\b`, 'gi'),
        (_m, lead: string, n: string, w: string) => `${lead}${n} ${w}`,
    );
}

/** Common abbreviations after a count (with or without space: "24 hs", "24hs") */
function expandShelfAbbreviations(s: string): string {
    return s
        .replace(/(^|[^a-z0-9])(\d+)\s*hs\b/gi, (_m, lead: string, n: string) => `${lead}${n} shelves`)
        .replace(/(^|[^a-z0-9])(\d+)\s*sh\b/gi, (_m, lead: string, n: string) => `${lead}${n} shelves`);
}

/** "55inch" / "65in" → spaced (parseTvDetails expects inch patterns) */
function splitDigitUnits(s: string): string {
    return s.replace(/\b(\d{1,3})\s*(inch|inches|in)\b/gi, '$1 $2');
}

/** flat pack variants → single token for RULES */
function normalizeFlatpack(s: string): string {
    return s.replace(/flat\s*-?\s*pack/gi, 'flatpack');
}

/**
 * Run before lowercasing / comma splitting so later regexes see clean tokens.
 */
export function preprocessBookingInput(raw: string): string {
    let t = raw.trim();
    if (!t) return t;
    t = normalizeFlatpack(t);
    t = splitDigitUnits(t);
    t = splitDigitMergedNouns(t);
    t = expandShelfAbbreviations(t);
    return t;
}

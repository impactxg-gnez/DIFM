/**
 * Text shaping for flexible phrase/keyword job detection (Matrix V2).
 */

/** Collapse fillers so "clean my apartment" ~ "clean apartment". */
export function collapsedForPhraseMatch(normalized: string): string {
    return normalized
        .replace(/\b(my|the|our|a|an|me|to)\b/gi, ' ')
        .replace(/\b(please|pls|could\s+you|can\s+you|i\s+need|need|want|wanna|gotta)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Lowercase alnum + spaces only; drop punctuation that breaks token adjacency. */
export function stripPunctuationForMatch(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Remove TV/monitor diagonal clauses so "mount tv" stays adjacent after a size (real-world wording).
 */
export function stripDisplaySizePatterns(s: string): string {
    let t = s;
    t = t.replace(/\b\d{1,3}\s*-?\s*(inch|inches|"|in)\b/gi, ' ');
    t = t.replace(/\b\d{1,3}\s*cm\b/gi, ' ');
    return t.replace(/\s+/g, ' ').trim();
}

/** Chain used before keyword inference + secondary phrase passes. */
export function buildFlexibleMatchingText(normalizedV2Lowercase: string): string {
    const punct = stripPunctuationForMatch(normalizedV2Lowercase);
    const noSize = stripDisplaySizePatterns(punct);
    return collapsedForPhraseMatch(noSize);
}

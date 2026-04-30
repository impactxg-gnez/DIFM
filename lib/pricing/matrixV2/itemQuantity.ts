/**
 * Parsed quantity signals from booking text vs pricing default (1 unit).
 */

const NUM_WORDS: Record<string, number> = {
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
};

/** Parse qty from `3 blinds` / `three blinds`. Returns null when no hit. */
function qtyFromDigitOrWordMatch(n: string, re: RegExp): number | null {
    const m = n.match(re);
    if (!m) return null;
    const g = m[1];
    if (!g) return null;
    if (/^\d+$/.test(g)) return Math.max(1, parseInt(g, 10));
    const w = NUM_WORDS[g.toLowerCase()];
    return w !== undefined ? w : null;
}

function isTvMountQuantityJob(jobId: string): boolean {
    return (
        jobId === 'tv_mount' ||
        /tv.?mount|mount.?tv/i.test(jobId) ||
        (jobId.includes('tv') && jobId.includes('mount'))
    );
}

/** Only quantities explicitly stated in text (never defaults to 1). */
export function explicitItemQuantityFromText(jobId: string, normalized: string): number | undefined {
    const n = normalized.toLowerCase();
    const pick = (re: RegExp, hay: string = n): number | undefined => {
        const m = hay.match(re);
        if (!m) return undefined;
        const v = parseInt(m[1] || m[2], 10);
        return Number.isFinite(v) ? Math.max(1, v) : undefined;
    };

    if (isTvMountQuantityJob(jobId)) {
        const stripped = n.replace(/\b\d{1,3}\s*-?\s*(inch|inches|"|″|cm)\b/gi, ' ');
        const multiTvs = pick(/\b(\d+)\s*tvs\b/i, stripped);
        if (multiTvs !== undefined) return multiTvs;
        const numTv = stripped.match(/\b(\d+)\s+tv\b/i);
        if (numTv) {
            const idx = stripped.indexOf(numTv[0]);
            const tail = stripped.slice(idx + numTv[0].length, idx + numTv[0].length + 16);
            if (!/\b(inch|inches|"|″)\b/i.test(tail)) {
                return Math.max(1, parseInt(numTv[1], 10));
            }
        }
        return pick(/\bmount\s+(\d+)\s*tvs?\b/i, stripped);
    }
    if (jobId === 'shelf_install') {
        const w =
            qtyFromDigitOrWordMatch(n, /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(shelves|shelf)\b/i) ??
            pick(/\b(\d+)\s*(shelves|shelf)\b/i);
        return w ?? undefined;
    }
    if (jobId === 'blind_install') {
        const w =
            qtyFromDigitOrWordMatch(n, /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+blinds?\b/i) ??
            qtyFromDigitOrWordMatch(n, /\bblinds?\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i) ??
            pick(/\b(\d+)\s*blinds?\b/i);
        return w ?? undefined;
    }
    if (jobId === 'curtain_rail') {
        return pick(/\b(\d+)\s*(rails?|curtains?)\b/i);
    }
    if (jobId === 'furniture_assembly') {
        return pick(/\b(\d+)\s*(desks?|chairs?|tables?|items?|units?|pieces?)\b/i);
    }
    if (jobId === 'wall_repair' || jobId === 'mirror_hang' || jobId === 'picture_hang') {
        return pick(/\b(\d+)\s*(holes?|mirrors?|pictures?|frames?|photos?)\b/i);
    }
    if (jobId === 'washing_machine_install' || jobId === 'dishwasher_install') {
        return pick(/\b(\d+)\s*(machines?|dishwashers?|washers?)\b/i);
    }
    return undefined;
}

/** Pricing baseline: explicit quantity from text or 1 residential unit. */
export function quantityForJob(jobId: string, normalized: string): number {
    return explicitItemQuantityFromText(jobId, normalized) ?? 1;
}

/**
 * Residential cleaning phrase resolution, commercial gating, and tier rules
 * (standard/deep × BHK) for the deterministic booking pipeline.
 */

const COMMERCIAL_CLEAN_PATTERNS: RegExp[] = [
    /\boffice\s+floor\b/i,
    /\b(shop|retail|warehouse|factory|hospital|school)\s+floor\b/i,
    /\bclean(ing)?\b.*\b(warehouse|factory|hospital|schools?|gyms?)\b/i,
    /\b(warehouse|factory|hospital|schools?)\b.*\bclean(ing)?\b/i,
    /\bcommercial\s+(clean(ing)?|unit|space|property|building)\b/i,
    /\b(clean|cleaning)\b.*\bcommercial\s+(unit|space|property|building|floor)\b/i,
    /\b(retail|warehouse|factory)\b.*\b(clean|cleaning)\b/i,
    /\bopen\s*plan\s+office\b.*\bclean/i,
    /\bclean\b.*\b(?<!home\s)office\b/i,
    /\b(?<!home\s)office\b.*\bclean\b/i,
];

/** True when copy clearly refers to a home office (not commercial). */
function mentionsHomeOffice(n: string): boolean {
    return /\bhome\s+office\b/i.test(n);
}

/**
 * Commercial / large-scale cleaning — fixed matrix is not appropriate.
 */
export function detectCommercialCleaningContext(normalizedInput: string): boolean {
    const n = normalizedInput.toLowerCase();
    if (!/\b(clean|cleaning|maid|housekeep)\b/i.test(n)) return false;
    if (/\b([4-9]|[1-9]\d+)\s*-?\s*bhk\b/i.test(n)) return true;
    if (mentionsHomeOffice(n)) return false;
    return COMMERCIAL_CLEAN_PATTERNS.some((re) => re.test(n));
}

const BATHROOM_HINT = /\b(bathroom|toilet|wc|ensuite|en-suite|shower\s+room|restroom)\b/i;
const KITCHEN_HINT = /\b(kitchen)\b/i;
const CLEAN_VERB = /\b(clean(?:ing)?|maid|housekeep\w*|domestic\s+clean(?:ing)?)\b/i;
const WHOLE_HOME_HINT =
    /\b(apartment|flat|house|home|bungalow|condo|maisonette|property|place|residence)\b/i;
const BHK_HINT = /\b([123])\s*-?\s*bhk\b|\b(one|two|three)\s+-?\s*bhk\b|\bstudio\b/i;

const DEEP_HINT =
    /\b(deep\s+clean|deep\s+cleaning|spring\s+clean|end\s+of\s+tenancy|move\s*out\s+clean|moving\s+out\s+clean|post\s*[-\s]?construction\s+clean)\b/i;

const EXCLUDE_HINT =
    /\b(gutter|chimney|driveway|pressure\s+wash|power\s+wash|window\s+clean(ing)?\s*(only|outside)|car\s+valet|oven\s+clean|upholstery|carpet\s+only)\b/i;

/**
 * Map a clause to a cleaning rule_job id, or null if not a priced cleaning clause.
 */
export function tryMapCleaningRuleJob(partLower: string): string | null {
    const p = partLower.trim();
    if (!p) return null;
    if (EXCLUDE_HINT.test(p)) return null;
    const hasClean = CLEAN_VERB.test(p) || /\b(home\s+cleaning|house\s+cleaning)\b/i.test(p);
    if (!hasClean) return null;

    const bathroomHit = BATHROOM_HINT.test(p);
    const kitchenHit = KITCHEN_HINT.test(p);
    const wholeHit = WHOLE_HOME_HINT.test(p) || BHK_HINT.test(p);
    const deepHit = DEEP_HINT.test(p) || /\bdeep\b/i.test(p);

    const roomCleaning =
        /\b(room|rooms|bedroom|bathroom|kitchen|lounge|living\s+room)\s+cleaning\b/i.test(p) ||
        /\bclean\b.*\b(the\s+)?(room|bedroom|kitchen|bathroom|living\s+room|lounge)\b/i.test(p);

    // Room-specific (takes precedence over whole-home when that room is explicit).
    if (bathroomHit && (hasClean || /\bcleaning\b/i.test(p))) {
        return 'bathroom_cleaning';
    }
    if (kitchenHit && (hasClean || /\bcleaning\b/i.test(p)) && !/\b(install|fit|repair|fix|leak)\b/i.test(p)) {
        return 'kitchen_cleaning';
    }

    // Whole-home deep
    if (deepHit && (wholeHit || BHK_HINT.test(p) || /\b(house|home)\b/i.test(p))) {
        return 'home_cleaning_deep';
    }
    if (deepHit && !bathroomHit && !kitchenHit) {
        return 'home_cleaning_deep';
    }

    // Whole-home standard
    if (wholeHit || BHK_HINT.test(p) || /\b(home|house)\s+cleaning\b/i.test(p)) {
        return 'home_cleaning_standard';
    }
    if (/\bfull\s+house\s+clean\b/i.test(p) || /\bwhole\s+house\s+clean\b/i.test(p)) {
        return 'home_cleaning_standard';
    }
    if (/\bclean\b.*\b(my|the|our)\s+(apartment|flat|house|home|place)\b/i.test(p)) {
        return 'home_cleaning_standard';
    }
    if (/\b(need|want|get|book)\s+.*\b(house|home)\s+cleaning\b/i.test(p)) {
        return 'home_cleaning_standard';
    }
    if (
        roomCleaning &&
        !bathroomHit &&
        !kitchenHit &&
        /\b(room|rooms|bedroom|living\s+room|lounge)\b/i.test(p)
    ) {
        return 'home_cleaning_standard';
    }

    return null;
}

export type CleaningBhk = 1 | 2 | 3;

export function parseBhkFromText(text: string): CleaningBhk | null {
    const t = text.toLowerCase();
    if (/\bstudio\b/i.test(t)) return 1;
    const digit = t.match(/\b([123])\s*-?\s*bhk\b/);
    if (digit) return Number(digit[1]) as CleaningBhk;
    const word = t.match(/\b(one|two|three)\s+-?\s*bhk\b/);
    if (word) {
        const w = word[1].toLowerCase();
        if (w === 'one') return 1;
        if (w === 'two') return 2;
        if (w === 'three') return 3;
    }
    return null;
}

export function parseDeepFromText(text: string): boolean {
    return DEEP_HINT.test(text) || /\bdeep\s+clean/i.test(text);
}

type CleaningRuleJob =
    | 'home_cleaning_standard'
    | 'home_cleaning_deep'
    | 'bathroom_cleaning'
    | 'kitchen_cleaning';

const TIER_ORDER = ['H1', 'H2', 'H3'] as const;

export function bumpTier(tier: (typeof TIER_ORDER)[number], steps: number): (typeof TIER_ORDER)[number] {
    const idx = TIER_ORDER.indexOf(tier);
    const next = Math.min(TIER_ORDER.length - 1, Math.max(0, idx + steps));
    return TIER_ORDER[next];
}

/**
 * Tier for one cleaning clause from phrase text and resolved rule job.
 * Standard: 1 BHK → H1, 2 → H2, 3 → H3. Deep: +1 tier (capped at H3).
 */
export function tierForCleaningClause(ruleJob: string, clause: string): (typeof TIER_ORDER)[number] {
    const cj = ruleJob as CleaningRuleJob;
    const deepInText = parseDeepFromText(clause);
    if (cj === 'bathroom_cleaning' || cj === 'kitchen_cleaning') {
        let t: (typeof TIER_ORDER)[number] = 'H1';
        if (deepInText) t = bumpTier(t, 1);
        return t;
    }

    const bhk = parseBhkFromText(clause) ?? 1;
    const base: (typeof TIER_ORDER)[number] = bhk === 1 ? 'H1' : bhk === 2 ? 'H2' : 'H3';
    const isDeep = cj === 'home_cleaning_deep' || (cj === 'home_cleaning_standard' && deepInText);
    return isDeep ? bumpTier(base, 1) : base;
}

/**
 * Aggregate tier for a bundle of mapped cleaning clauses (take highest).
 */
export function aggregateCleaningTier(
    inputs: Array<{ ruleJob: string; clause: string }>,
): (typeof TIER_ORDER)[number] {
    let best: (typeof TIER_ORDER)[number] = 'H1';
    for (const row of inputs) {
        const t = tierForCleaningClause(row.ruleJob, row.clause);
        if (TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf(best)) best = t;
    }
    return best;
}

export function isCleaningRuleJob(ruleJob: string): boolean {
    return (
        ruleJob === 'home_cleaning_standard' ||
        ruleJob === 'home_cleaning_deep' ||
        ruleJob === 'bathroom_cleaning' ||
        ruleJob === 'kitchen_cleaning'
    );
}

export function mentionsPropertySize(normalizedClause: string): boolean {
    return parseBhkFromText(normalizedClause) !== null || /\bstudio\b/i.test(normalizedClause);
}

export function cleaningTypeNeedsClarifier(ruleJob: string, clause: string): boolean {
    const deep = parseDeepFromText(clause);
    const standardSignals = /\b(regular|standard|weekly|maintain(?:ance)?)\s+(clean|cleaning)\b/i.test(clause);
    if (ruleJob === 'home_cleaning_deep') return false;
    if (deep || standardSignals) return false;
    return (
        ruleJob === 'home_cleaning_standard' ||
        ruleJob === 'bathroom_cleaning' ||
        ruleJob === 'kitchen_cleaning'
    );
}

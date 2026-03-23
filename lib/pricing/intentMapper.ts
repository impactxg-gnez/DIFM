import { excelSource } from './excelLoader';
import { getMatrixTime } from './visitEngine';

export type IntentType = 'MOUNTING' | 'ELECTRICAL' | 'FIX_MINOR' | 'FURNITURE' | 'TV' | 'UNKNOWN';

export interface MappedIntentJob {
    job: string;
    jobId: string;
    quantity: number;
    clause: string;
    intent: IntentType;
    resolutionSource: 'SPECIFIC' | 'GENERIC';
    quantityTier: 'H1' | 'H2' | 'H3';
}

export type IntentMappingResult =
    | { type: 'CLARIFY'; reason: string; matches: [] }
    | { type: 'MAPPED'; matches: MappedIntentJob[] };

interface JobMappingRule {
    job: string;
    candidates: string[];
    intent: IntentType;
    keywords: string[];
    exclude?: string[];
    priority: number;
    lowPriorityFallback?: boolean;
}

const INTENT_KEYWORDS: Record<Exclude<IntentType, 'UNKNOWN'>, string[]> = {
    ELECTRICAL: ['socket', 'outlet', 'switch', 'electrical', 'wire', 'fuse', 'light fitting', 'light switch', 'light'],
    FIX_MINOR: ['tighten', 'fix', 'repair', 'loose', 'wobbly', 'hinge', 'cabinet hinge'],
    TV: ['tv', 'television'],
    FURNITURE: ['cabinet', 'drawer', 'wardrobe', 'furniture'],
    MOUNTING: ['mount', 'install', 'hang', 'put up', 'wall mount', 'mirror', 'picture', 'frame', 'shelf', 'shelves', 'curtain']
};

const VAGUE_PATTERNS = [
    'full house handyman',
    'fix my house',
    'fix house',
    'everything',
    'whole house',
    'general handyman',
];

export const JOB_MAPPING: JobMappingRule[] = [
    {
        job: 'cabinet_hinge_fix',
        candidates: ['cabinet_hinge_fix', 'handyman_small_repair', 'general_handyman_repair'],
        intent: 'FIX_MINOR',
        keywords: ['cabinet', 'hinge'],
        exclude: ['tv', 'socket', 'electrical'],
        priority: 100
    },
    {
        job: 'replace_socket',
        candidates: ['replace_socket', 'replace_socket_faceplate', 'socket_replace'],
        intent: 'ELECTRICAL',
        keywords: ['replace', 'socket'],
        exclude: ['tv', 'wall mount', 'mirror'],
        priority: 95
    },
    {
        job: 'install_socket',
        candidates: ['install_socket', 'socket_replace', 'replace_socket_faceplate'],
        intent: 'ELECTRICAL',
        keywords: ['install', 'socket'],
        exclude: ['tv', 'wall mount', 'mirror'],
        priority: 95
    },
    {
        job: 'light_install',
        candidates: ['light_install', 'install_light_fitting', 'install_light_fitting_standard'],
        intent: 'ELECTRICAL',
        keywords: ['light', 'install'],
        exclude: ['tv', 'mirror'],
        priority: 90
    },
    {
        job: 'tv_mount_standard',
        candidates: ['tv_mount_standard'],
        intent: 'TV',
        keywords: ['tv'],
        priority: 80
    },
    {
        job: 'mirror_hang',
        candidates: ['mirror_hang'],
        intent: 'MOUNTING',
        keywords: ['mirror'],
        exclude: ['tv'],
        priority: 85
    },
    {
        job: 'pic_hang',
        candidates: ['pic_hang'],
        intent: 'MOUNTING',
        keywords: ['picture'],
        exclude: ['tv'],
        priority: 85
    },
    {
        job: 'pic_hang',
        candidates: ['pic_hang'],
        intent: 'MOUNTING',
        keywords: ['frame'],
        exclude: ['tv'],
        priority: 85
    },
    {
        job: 'install_shelves_set',
        candidates: ['install_shelves_set', 'shelf_install_single'],
        intent: 'MOUNTING',
        keywords: ['shelves', 'set'],
        exclude: ['tv', 'electrical'],
        priority: 85
    },
    {
        job: 'shelf_install_single',
        candidates: ['shelf_install_single', 'install_shelves_set'],
        intent: 'MOUNTING',
        keywords: ['shelf'],
        exclude: ['tv', 'electrical'],
        priority: 85
    },
    {
        job: 'mount_hang_install_wall',
        candidates: ['mount_hang_install_wall'],
        intent: 'MOUNTING',
        keywords: ['mount', 'install', 'hang'],
        priority: 1,
        lowPriorityFallback: true
    }
];

function splitInputClauses(userInput: string): string[] {
    return userInput
        .toLowerCase()
        .split(/\s*(?:and|,|\+|&)\s*/g)
        .map((s) => s.trim())
        .filter(Boolean);
}

function extractQuantity(clause: string): number {
    const NUMBER_WORDS: Record<string, number> = {
        one: 1,
        two: 2,
        three: 3,
        four: 4,
        five: 5,
        six: 6,
        seven: 7,
        eight: 8,
        nine: 9,
        ten: 10
    };
    const quantityPattern = clause.match(/\b(\d+)\s*(x|mirrors?|pictures?|frames?|shelves?|sockets?|outlets?|lights?|curtains?|rails?)\b/);
    const wordPattern = clause.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(mirrors?|pictures?|frames?|shelves?|sockets?|outlets?|lights?|curtains?|rails?)\b/);
    const quantity = quantityPattern
        ? Number(quantityPattern[1])
        : (wordPattern ? NUMBER_WORDS[wordPattern[1]] : 1);
    return Math.max(1, Math.min(10, quantity));
}

function contains(text: string, token: string): boolean {
    if (text.includes(token)) return true;
    if (token.endsWith('f') && text.includes(`${token.slice(0, -1)}ves`)) return true;
    if (token.endsWith('fe') && text.includes(`${token.slice(0, -2)}ves`)) return true;
    if (text.includes(`${token}s`)) return true;
    if (text.includes(`${token}es`)) return true;
    return false;
}

function hasAllKeywords(text: string, keywords: string[]): boolean {
    return keywords.every((kw) => contains(text, kw));
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
    return keywords.some((kw) => contains(text, kw));
}

function resolveIntentByKeywords(input: string): IntentType {
    const lower = input.toLowerCase();
    const isElectrical = hasAnyKeyword(lower, INTENT_KEYWORDS.ELECTRICAL);
    const isFixMinor = hasAnyKeyword(lower, INTENT_KEYWORDS.FIX_MINOR);
    const isTv = hasAnyKeyword(lower, INTENT_KEYWORDS.TV);
    const isFurniture = hasAnyKeyword(lower, INTENT_KEYWORDS.FURNITURE);
    const isMounting = hasAnyKeyword(lower, INTENT_KEYWORDS.MOUNTING);

    if (isElectrical) return 'ELECTRICAL';
    if (isFixMinor) return 'FIX_MINOR';
    if (isTv) return 'TV';
    if (isFurniture) return 'FURNITURE';
    if (isMounting) return 'MOUNTING';
    return 'UNKNOWN';
}

export function detectIntent(input: string): IntentType {
    return resolveIntentByKeywords(input);
}

function isVagueInput(input: string): boolean {
    const lower = input.toLowerCase();
    return VAGUE_PATTERNS.some((pattern) => lower.includes(pattern));
}

function resolveAllowedJobId(rule: JobMappingRule, allowedSet: Set<string>): string | null {
    return rule.candidates.find((candidate) => allowedSet.has(candidate)) || null;
}

function resolveCabinetFixOverride(input: string, allowedSet: Set<string>): string | null {
    const lower = input.toLowerCase();
    const hasObject = hasAnyKeyword(lower, ['cabinet', 'door', 'cupboard']);
    const hasFixAction = hasAnyKeyword(lower, ['fix', 'repair', 'loose', 'hinge', 'adjust', 'tighten']);
    const hingeOnlyFix = hasAnyKeyword(lower, ['hinge']) && hasAnyKeyword(lower, ['fix', 'repair', 'adjust', 'tighten', 'loose']);
    if ((!hasObject || !hasFixAction) && !hingeOnlyFix) return null;
    const overrideCandidates = ['cabinet_hinge_fix', 'handyman_small_repair', 'general_handyman_repair'];
    return overrideCandidates.find((candidate) => allowedSet.has(candidate)) || null;
}

function deriveTierFromQuantity(quantity: number): 'H1' | 'H2' | 'H3' {
    if (quantity > 8) return 'H3';
    if (quantity >= 4) return 'H2';
    return 'H1';
}

function scoreRule(rule: JobMappingRule, clause: string, intent: IntentType): number {
    const keywordScore = hasAllKeywords(clause, rule.keywords) ? 10 : 0;
    const intentScore = rule.intent === intent ? 5 : 0;
    const fallbackScore = rule.lowPriorityFallback ? 1 : 0;
    return keywordScore + intentScore + fallbackScore + (rule.priority / 1000);
}

function getRuleKind(rule: JobMappingRule): 'GENERIC' | 'SPECIFIC' {
    return rule.lowPriorityFallback ? 'GENERIC' : 'SPECIFIC';
}

export function mapToJobs(input: string, allowedJobIds: string[]): IntentMappingResult {
    if (!input || !input.trim()) {
        return { type: 'CLARIFY', reason: 'EMPTY_INPUT', matches: [] };
    }

    if (isVagueInput(input)) {
        return { type: 'CLARIFY', reason: 'VAGUE_INPUT', matches: [] };
    }

    const allowedSet = new Set(allowedJobIds);

    const clauses = splitInputClauses(input);
    const matches: MappedIntentJob[] = [];

    for (const clause of clauses) {
        const hardOverrideJob = resolveCabinetFixOverride(clause, allowedSet);
        if (hardOverrideJob) {
            const quantity = extractQuantity(clause);
            const baseMinutes = getMatrixTime(hardOverrideJob);
            const computedMinutes = baseMinutes * quantity;
            if (computedMinutes > 300) {
                throw new Error(`ERROR_UNREALISTIC_TIME:${hardOverrideJob}:${computedMinutes}`);
            }
            matches.push({
                job: 'cabinet_hinge_fix',
                jobId: hardOverrideJob,
                quantity,
                clause,
                intent: 'FIX_MINOR',
                resolutionSource: 'SPECIFIC',
                quantityTier: deriveTierFromQuantity(quantity),
            });
            continue;
        }

        const intent = detectIntent(clause);
        const quantity = extractQuantity(clause);
        const scored = JOB_MAPPING
            .map((rule) => {
                const resolvedJobId = resolveAllowedJobId(rule, allowedSet);
                if (!resolvedJobId) return null;
                if (rule.exclude && hasAnyKeyword(clause, rule.exclude)) return null;

                const hasKeyword = hasAllKeywords(clause, rule.keywords) || (rule.lowPriorityFallback && hasAnyKeyword(clause, rule.keywords));
                if (!hasKeyword) return null;

                if (!rule.lowPriorityFallback && rule.intent !== intent) return null;

                return {
                    ruleJob: rule.job,
                    resolvedJobId,
                    score: scoreRule(rule, clause, intent),
                    kind: getRuleKind(rule)
                };
            })
            .filter((v): v is { ruleJob: string; resolvedJobId: string; score: number; kind: 'GENERIC' | 'SPECIFIC' } => !!v)
            .sort((a, b) => b.score - a.score);

        const bestSpecific = scored.find((s) => s.kind === 'SPECIFIC') || null;
        const bestGeneric = scored.find((s) => s.kind === 'GENERIC') || null;
        const final = bestSpecific || bestGeneric;

        console.log('[IntentResolution]', {
            input: clause,
            matchedSpecificIntent: bestSpecific?.resolvedJobId || null,
            matchedGenericIntent: bestGeneric?.resolvedJobId || null,
            finalSelectedIntent: final?.resolvedJobId || null,
            resolutionSource: bestSpecific ? 'SPECIFIC' : 'GENERIC'
        });

        if (!final) continue;

        if (intent === 'ELECTRICAL' && final.resolvedJobId === 'mount_hang_install_wall') {
            throw new Error('ERROR_DOMAIN_PROTECTION_ELECTRICAL_MAPPED_TO_MOUNTING');
        }
        if (intent === 'FIX_MINOR' && final.resolvedJobId === 'mount_hang_install_wall') {
            throw new Error('ERROR_DOMAIN_PROTECTION_FIX_MINOR_MAPPED_TO_MOUNTING');
        }

        const baseMinutes = getMatrixTime(final.resolvedJobId);
        const computedMinutes = baseMinutes * quantity;
        if (computedMinutes > 300) {
            throw new Error(`ERROR_UNREALISTIC_TIME:${final.resolvedJobId}:${computedMinutes}`);
        }

        matches.push({
            job: final.ruleJob,
            jobId: final.resolvedJobId,
            quantity,
            clause,
            intent,
            resolutionSource: bestSpecific ? 'SPECIFIC' : 'GENERIC',
            quantityTier: deriveTierFromQuantity(quantity),
        });
    }

    if (matches.length === 0) {
        return { type: 'CLARIFY', reason: 'NO_STRONG_MATCH', matches: [] };
    }

    const merged = new Map<string, MappedIntentJob>();
    for (const match of matches) {
        const existing = merged.get(match.jobId);
        if (!existing) {
            merged.set(match.jobId, { ...match });
            continue;
        }
        const quantity = Math.min(10, existing.quantity + match.quantity);
        merged.set(match.jobId, {
            ...existing,
            quantity,
            quantityTier: deriveTierFromQuantity(quantity),
            clause: `${existing.clause} | ${match.clause}`
        });
    }

    return { type: 'MAPPED', matches: Array.from(merged.values()) };
}

export function enforceMappingOutputGuardrails(matches: MappedIntentJob[]) {
    for (const match of matches) {
        if (match.quantity > 10) {
            throw new Error(`ERROR_QUANTITY_CAP_EXCEEDED:${match.jobId}:${match.quantity}`);
        }
        if (match.intent === 'ELECTRICAL' && match.jobId === 'mount_hang_install_wall') {
            throw new Error('ERROR_DOMAIN_PROTECTION_ELECTRICAL_MAPPED_TO_MOUNTING');
        }
        if (match.intent === 'FIX_MINOR' && match.jobId === 'mount_hang_install_wall') {
            throw new Error('ERROR_DOMAIN_PROTECTION_FIX_MINOR_MAPPED_TO_MOUNTING');
        }
    }
}

import { getMatrixTime } from './visitEngine';

export type IntentType = 'MOUNTING' | 'ELECTRICAL' | 'PLUMBING' | 'HEATING' | 'APPLIANCE' | 'UNKNOWN';

export interface MappedIntentJob {
    job: string;
    jobId: string;
    quantity: number;
    adjustedMinutes: number;
    complexityTierDelta: number;
    clause: string;
    intent: IntentType;
    resolutionSource: 'SPECIFIC' | 'GENERIC';
    quantityTier: 'H1' | 'H2' | 'H3';
}

export type IntentMappingResult =
    | { type: 'CLARIFY'; reason: string; matches: [] }
    | { type: 'MAPPED'; matches: MappedIntentJob[] };

export interface DeterministicRule {
    match: string[];
    job: string;
}

export interface ClarifierQuestion {
    tag: string;
    question: string;
    capability_tag?: string;
    affects_time?: boolean;
    affects_safety?: boolean;
}

export const RULES: DeterministicRule[] = [
    { match: ['picture', 'pictures', 'frame', 'frames'], job: 'pic_hang' },
    { match: ['mirror', 'mirrors'], job: 'mirror_hang' },
    { match: ['shelf', 'shelves'], job: 'shelf_install_single' },
    { match: ['curtain', 'curtains'], job: 'curtain_rail_install' },
    { match: ['tv'], job: 'tv_mount_standard' },
    { match: ['socket', 'sockets', 'plug', 'plugs'], job: 'replace_socket' },
    { match: ['light', 'lights'], job: 'install_light_fitting' },
    { match: ['radiator', 'radiators'], job: 'heating_diagnostic' },
    { match: ['toilet', 'toilets'], job: 'plumbing_diagnostic' },
    { match: ['dishwasher', 'dishwashers'], job: 'appliance_install' },
];

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
    ten: 10,
};

const GENERIC_FALLBACK_JOB = 'mount_hang_install_wall';

const RULE_JOB_ALIASES: Record<string, string[]> = {
    replace_socket: ['replace_socket', 'socket_replace', 'replace_socket_faceplate'],
    install_light_fitting: ['install_light_fitting', 'install_light_fitting_standard', 'light_install'],
    curtain_rail_install: ['curtain_rail_install', 'curtain_rail_standard'],
    heating_diagnostic: ['heating_diagnostic', 'radiator_diagnosis'],
    plumbing_diagnostic: ['plumbing_diagnostic', 'toilet_repair_simple', 'toilet_flush_repair', 'unblock_toilet_simple'],
    appliance_install: ['appliance_install', 'install_dishwasher', 'replace_dishwasher', 'install_dishwasher_integrated', 'appliance_install_plug_in'],
};

const VAGUE_PATTERNS = [
    'full house handyman',
    'fix my house',
    'fix house',
    'everything',
    'whole house',
    'general handyman',
];

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasMatchToken(part: string, token: string): boolean {
    return new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i').test(part);
}

function includesAny(part: string, tokens: string[]): boolean {
    return tokens.some((token) => hasMatchToken(part, token));
}

function isIntentUnclear(part: string): boolean {
    const hasGenericAction = includesAny(part, ['mount', 'hang', 'install', 'put', 'replace', 'fix', 'repair']);
    if (!hasGenericAction) return false;
    const hasKnownObject = RULES.some((rule) => includesAny(part, rule.match));
    return !hasKnownObject;
}

function deriveIntent(jobId: string): IntentType {
    if (jobId.includes('socket') || jobId.includes('light')) return 'ELECTRICAL';
    if (jobId.includes('plumbing') || jobId.includes('toilet')) return 'PLUMBING';
    if (jobId.includes('heating') || jobId.includes('radiator')) return 'HEATING';
    if (jobId.includes('appliance') || jobId.includes('dishwasher')) return 'APPLIANCE';
    if (jobId.includes('mount') || jobId.includes('hang') || jobId.includes('shelf') || jobId.includes('curtain')) return 'MOUNTING';
    return 'UNKNOWN';
}

function deriveTierFromQuantity(quantity: number): 'H1' | 'H2' | 'H3' {
    if (quantity > 8) return 'H3';
    if (quantity >= 4) return 'H2';
    return 'H1';
}

function resolveAllowedJobId(ruleJob: string, allowedSet: Set<string>): string | null {
    const candidates = [ruleJob, ...(RULE_JOB_ALIASES[ruleJob] || [])];
    for (const candidate of candidates) {
        if (allowedSet.has(candidate)) return candidate;
    }
    return null;
}

function hasExplicitSpecializedSku(part: string): boolean {
    return includesAny(part, ['faceplate', 'concealed wiring', 'cable concealment', 'premium bracket', 'custom bracket']);
}

function resolveJobIdForPart(ruleJob: string, part: string, allowedSet: Set<string>): string | null {
    // Base normalization first: keep generic/base jobs unless explicit specialized SKU signals exist.
    if (ruleJob === 'replace_socket') {
        if (hasMatchToken(part, 'faceplate') && allowedSet.has('replace_socket_faceplate')) return 'replace_socket_faceplate';
        if (allowedSet.has('replace_socket')) return 'replace_socket';
        if (allowedSet.has('socket_replace')) return 'socket_replace';
        if (allowedSet.has('replace_socket_faceplate')) return 'replace_socket_faceplate';
        return null;
    }
    return resolveAllowedJobId(ruleJob, allowedSet);
}

function parseCurtainLengthMeters(part: string): number | null {
    const meter = part.match(/\b(\d+(?:\.\d+)?)\s*(m|meter|meters)\b/i);
    if (meter) return Number(meter[1]);
    const cm = part.match(/\b(\d{2,4})\s*(cm)\b/i);
    if (cm) return Number(cm[1]) / 100;
    return null;
}

function parseHeightOver25m(part: string): boolean {
    if (hasMatchToken(part, 'ladder')) return true;
    if (/\bheight\b/i.test(part) && /\b(2\.[6-9]|[3-9](?:\.\d+)?)\b/.test(part)) return true;
    if (/\b(over|above)\s*2\.5m\b/i.test(part)) return true;
    return false;
}

function parseFixingsUnavailable(part: string): boolean {
    return includesAny(part, ['no fixings', 'fixings unavailable', 'without fixings', 'no screws', 'no anchors']);
}

function parseComplexity(part: string, canonicalJob: string, tvDetails: { size: number | null; wall: string | null; concealed: boolean | null }) {
    let deltaMinutes = 0;
    let tierDelta = 0;
    let overrideJobId: string | null = null;

    const isConcrete = tvDetails.wall === 'concrete' || hasMatchToken(part, 'concrete');
    const isHigh = parseHeightOver25m(part);
    const noFixings = parseFixingsUnavailable(part);

    if (canonicalJob === 'tv_mount_standard') {
        if ((tvDetails.size || 0) > 65) {
            tierDelta += 1;
            deltaMinutes += 30;
            overrideJobId = 'mount_tv_custom';
        }
        if (isConcrete) {
            tierDelta += 1;
            deltaMinutes += 30;
        }
        if (tvDetails.concealed === true || includesAny(part, ['concealed', 'hidden cables', 'hide cables'])) {
            tierDelta += 1;
            deltaMinutes += 35;
            overrideJobId = 'mount_tv_custom';
        }
        if (includesAny(part, ['premium bracket', 'custom bracket'])) {
            tierDelta += 1;
            deltaMinutes += 20;
            overrideJobId = 'mount_tv_custom';
        }
    }

    if (canonicalJob === 'curtain_rail_install') {
        const length = parseCurtainLengthMeters(part);
        if (length !== null && length > 3) {
            deltaMinutes += 20;
            tierDelta += 1;
        }
        if (isConcrete) {
            deltaMinutes += 15;
            tierDelta += 1;
        }
    }

    if (isHigh) {
        deltaMinutes += 20;
        tierDelta += 1;
    }
    if (noFixings) {
        deltaMinutes += 15;
        tierDelta += 1;
    }

    return { deltaMinutes, tierDelta: Math.min(2, tierDelta), overrideJobId };
}

function applyBulkEfficiency(baseMinutes: number, quantity: number): number {
    if (quantity <= 1) return baseMinutes;
    // First unit full time, following units at 80% each.
    return Math.round(baseMinutes * (1 + ((quantity - 1) * 0.8)));
}

function parseTvDetails(input: string): { size: number | null; wall: string | null; concealed: boolean | null } {
    const sizeMatch = input.match(/\b(\d{2,3})\s*(?:inch|inches|")\b/i) || input.match(/\b(\d{2,3})\b(?=\s*tv)/i);
    const wallMatch = input.match(/\b(concrete|brick|drywall|plaster|wood|stud)\b/i);
    const concealment = /\b(conceal(?:ed)?|hide|hidden)\b.*\b(cable|cables|wire|wires)\b/i.test(input)
        || /\b(cable|cables|wire|wires)\b.*\b(conceal(?:ed)?|hide|hidden)\b/i.test(input);
    return {
        size: sizeMatch ? Number(sizeMatch[1]) : null,
        wall: wallMatch ? wallMatch[1].toLowerCase() : null,
        concealed: concealment ? true : null,
    };
}

export function normalizeInput(input: string): string {
    return input
        .toLowerCase()
        .replace(/\+/g, ' and ')
        .replace(/,/g, ' and ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function splitInput(input: string): string[] {
    return input.split(' and ').map((part) => part.trim()).filter(Boolean);
}

export function extractQuantity(part: string): number {
    const countNouns = '(?:mirrors?|pictures?|frames?|shelves?|sockets?|plugs?|lights?|radiators?|toilets?|dishwashers?|tvs?|televisions?)';
    const explicitCountNumeric = part.match(new RegExp(`\\b(\\d+)\\s*${countNouns}\\b`, 'i'));
    if (explicitCountNumeric) return Math.max(1, Number(explicitCountNumeric[1]));

    const explicitCountWord = part.match(new RegExp(`\\b(one|two|three|four|five|six|seven|eight|nine|ten)\\s+${countNouns}\\b`, 'i'));
    if (explicitCountWord) return NUMBER_WORDS[explicitCountWord[1].toLowerCase()] || 1;

    const multiplier = part.match(/\b(\d+)\s*x\b/i) || part.match(/\bx\s*(\d+)\b/i);
    if (multiplier) return Math.max(1, Number(multiplier[1]));

    return 1;
}

export function mapPartToJob(part: string): { job: string; resolutionSource: 'SPECIFIC' | 'GENERIC' } | null {
    for (const rule of RULES) {
        if (includesAny(part, rule.match)) {
            return { job: rule.job, resolutionSource: 'SPECIFIC' };
        }
    }

    if (isIntentUnclear(part)) {
        return { job: GENERIC_FALLBACK_JOB, resolutionSource: 'GENERIC' };
    }

    return null;
}

export function getClarifiers(
    normalizedInput: string,
    jobs: Array<{ job: string; quantity: number; part: string }>
): ClarifierQuestion[] {
    const clarifiers: ClarifierQuestion[] = [];
    const addClarifier = (clarifier: ClarifierQuestion) => {
        if (!clarifiers.some((item) => item.tag === clarifier.tag)) {
            clarifiers.push(clarifier);
        }
    };

    const tvDetails = parseTvDetails(normalizedInput);

    for (const entry of jobs) {
        if (entry.job === 'tv_mount_standard') {
            addClarifier({ tag: 'TV_SIZE_INCHES', question: 'What is the TV size in inches?', affects_time: true });
            addClarifier({ tag: 'WALL_TYPE', question: 'What wall type is it mounted on?', affects_time: true });
            addClarifier({ tag: 'CABLE_CONCEALMENT', question: 'Do you need cable concealment?', affects_time: true });
            addClarifier({ tag: 'HEIGHT_OVER_2_5M', question: 'Is installation height over 2.5m?', affects_time: true, affects_safety: true });
            addClarifier({ tag: 'FIXINGS_AVAILABLE', question: 'Do you already have suitable fixings?', affects_time: true });
            continue;
        }

        if (entry.job === 'shelf_install_single') {
            const quantityUnclear = entry.quantity <= 1 && !/\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(entry.part);
            if (quantityUnclear) {
                addClarifier({ tag: 'SHELF_COUNT', question: 'How many shelves should be installed?', affects_time: true });
            }
            addClarifier({ tag: 'WALL_TYPE', question: 'What wall type is it mounted on?', affects_time: true });
            addClarifier({ tag: 'HEIGHT_OVER_2_5M', question: 'Is installation height over 2.5m?', affects_time: true, affects_safety: true });
            addClarifier({ tag: 'FIXINGS_AVAILABLE', question: 'Do you already have suitable fixings?', affects_time: true });
            continue;
        }

        if (entry.job === 'curtain_rail_install') {
            addClarifier({ tag: 'CURTAIN_RAIL_LENGTH', question: 'What is the curtain rail length?', affects_time: true });
            addClarifier({ tag: 'WALL_TYPE', question: 'What wall type is it mounted on?', affects_time: true });
            addClarifier({ tag: 'HEIGHT_OVER_2_5M', question: 'Is installation height over 2.5m?', affects_time: true, affects_safety: true });
            addClarifier({ tag: 'FIXINGS_AVAILABLE', question: 'Do you already have suitable fixings?', affects_time: true });
            continue;
        }

        if (entry.job === 'replace_socket') {
            addClarifier({ tag: 'SOCKET_TYPE', question: 'What socket type needs replacement?', affects_time: true });
            continue;
        }

        if (includesAny(entry.part, ['mount', 'hang', 'install'])) {
            addClarifier({ tag: 'HEIGHT_OVER_2_5M', question: 'Is installation height over 2.5m?', affects_time: true, affects_safety: true });
            addClarifier({ tag: 'FIXINGS_AVAILABLE', question: 'Do you already have suitable fixings?', affects_time: true });
        }
    }

    return clarifiers;
}

export function detectIntent(input: string): IntentType {
    const normalized = normalizeInput(input);
    const mapped = mapPartToJob(normalized);
    if (!mapped) return 'UNKNOWN';
    return deriveIntent(mapped.job);
}

function isVagueInput(input: string): boolean {
    return VAGUE_PATTERNS.some((pattern) => input.includes(pattern));
}

export function mapToJobs(input: string, allowedJobIds: string[]): IntentMappingResult {
    if (!input || !input.trim()) {
        return { type: 'CLARIFY', reason: 'EMPTY_INPUT', matches: [] };
    }

    const normalized = normalizeInput(input);
    if (!normalized) {
        return { type: 'CLARIFY', reason: 'EMPTY_INPUT', matches: [] };
    }
    if (isVagueInput(normalized)) {
        return { type: 'CLARIFY', reason: 'VAGUE_INPUT', matches: [] };
    }

    const allowedSet = new Set(allowedJobIds);
    const parts = splitInput(normalized);
    const tvDetails = parseTvDetails(normalized);
    const matches: MappedIntentJob[] = [];

    for (const part of parts) {
        const mapped = mapPartToJob(part);
        if (!mapped) continue;

        let resolvedJobId = resolveJobIdForPart(mapped.job, part, allowedSet);
        if (!resolvedJobId) continue;

        const quantity = extractQuantity(part) || 1;
        const baseMinutes = getMatrixTime(resolvedJobId);
        const complexity = parseComplexity(part, mapped.job, tvDetails);
        if (complexity.overrideJobId && hasExplicitSpecializedSku(part) && allowedSet.has(complexity.overrideJobId)) {
            resolvedJobId = complexity.overrideJobId;
        } else if (complexity.overrideJobId && mapped.job === 'tv_mount_standard' && allowedSet.has(complexity.overrideJobId)) {
            resolvedJobId = complexity.overrideJobId;
        }
        const adjustedBaseMinutes = getMatrixTime(resolvedJobId);
        const computedMinutes = applyBulkEfficiency(adjustedBaseMinutes, quantity) + complexity.deltaMinutes;
        if (computedMinutes > 300) {
            throw new Error(`ERROR_UNREALISTIC_TIME:${resolvedJobId}:${computedMinutes}`);
        }

        matches.push({
            job: mapped.job,
            jobId: resolvedJobId,
            quantity,
            adjustedMinutes: computedMinutes,
            complexityTierDelta: complexity.tierDelta,
            clause: part,
            intent: deriveIntent(resolvedJobId),
            resolutionSource: mapped.resolutionSource,
            quantityTier: deriveTierFromQuantity(quantity),
        });
    }

    if (matches.length === 0) {
        return { type: 'CLARIFY', reason: 'NO_STRONG_MATCH', matches: [] };
    }

    return { type: 'MAPPED', matches };
}

export function enforceMappingOutputGuardrails(matches: MappedIntentJob[]) {
    for (const match of matches) {
        if (match.intent === 'ELECTRICAL' && match.jobId === GENERIC_FALLBACK_JOB) {
            throw new Error('ERROR_DOMAIN_PROTECTION_ELECTRICAL_MAPPED_TO_MOUNTING');
        }
    }
}

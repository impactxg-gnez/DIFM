import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { excelSource } from './excelLoader';
import { parseJobDescription, tokenize } from './jobParser';
import { buildVisitsWithQuantities, GeneratedVisit } from './visitEngine';
import { attachClarifiersToVisits } from './clarifierEngine';
import { enforceMappingOutputGuardrails, mapToJobs } from './intentMapper';

export interface ExtractionPipelineResult {
    jobs: string[];
    capabilities: string[];
    quantities: Record<string, number>;
    visits: GeneratedVisit[];
    price: number;
    clarifiers: Array<{ tag: string; question: string; capability_tag?: string; affects_time?: boolean; affects_safety?: boolean }>;
    aiResult: string[];
    fallbackResult: string[];
    message?: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const extractionCache = new Map<string, { expiresAt: number; result: ExtractionPipelineResult }>();

function normalizeCacheKey(input: string) {
    return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

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

function splitInputClauses(userInput: string): string[] {
    return userInput
        .toLowerCase()
        .split(/\s*(?:,|\band\b|\+|&|\bplus\b)\s*/g)
        .map((s) => s.trim())
        .filter(Boolean);
}

function extractQuantityFromClause(clause: string): number {
    const numeric = clause.match(/\b(\d+)\b/);
    if (numeric) return Math.max(1, Number(numeric[1]));
    for (const [word, value] of Object.entries(NUMBER_WORDS)) {
        if (new RegExp(`\\b${word}\\b`, 'i').test(clause)) return value;
    }
    return 1;
}

function buildClarifiers(jobIds: string[]) {
    const allClarifierIds = new Set<string>();
    jobIds.forEach((id) => {
        const item = excelSource.jobItems.get(id);
        item?.clarifier_ids?.forEach((clarifierId) => allClarifierIds.add(clarifierId));
    });

    return Array.from(allClarifierIds).map((id) => ({
        tag: id,
        question: excelSource.clarifierLibrary.get(id) || `Please provide details for ${id}`,
        capability_tag: Array.from(new Set(jobIds
            .map((jobId) => {
                const item = excelSource.jobItems.get(jobId);
                return item?.clarifier_ids?.includes(id) ? item?.capability_tag : null;
            })
            .filter(Boolean)))[0] || undefined,
        affects_time: /time|tier|price/i.test(String(excelSource.clarifierDefinitions.get(id)?.impacts || '')),
        affects_safety: /safety|inspection|compliance|risk/i.test(String(excelSource.clarifierDefinitions.get(id)?.impacts || '')),
    }));
}

function validateAllowedJobs(candidateIds: string[], allowedJobIds: string[]) {
    const allowed = new Set(allowedJobIds);
    return candidateIds.filter((id) => allowed.has(id));
}

interface PhraseMatch {
    jobId: string;
    quantity: number;
    clause: string;
    resolutionSource: 'SPECIFIC' | 'GENERIC';
}

interface SpecificIntentRule {
    keywords: string[];
    jobId: string;
}

interface ComposedIntentRule {
    verbs: string[];
    objects: string[];
    jobId: string;
}

const SPECIFIC_INTENT_RULES: SpecificIntentRule[] = [
    { keywords: ['mirror'], jobId: 'mirror_hang' },
    { keywords: ['picture', 'frame'], jobId: 'pic_hang' },
    { keywords: ['shelf', 'shelves'], jobId: 'shelf_install_single' },
    { keywords: ['curtain', 'curtain rail', 'curtain rod'], jobId: 'curtain_rail_standard' },
];

const COMPOSED_INTENT_RULES: ComposedIntentRule[] = [
    { verbs: ['hang', 'mount', 'install'], objects: ['mirror'], jobId: 'mirror_hang' },
    { verbs: ['hang', 'mount', 'install'], objects: ['picture', 'frame'], jobId: 'pic_hang' },
    { verbs: ['install', 'mount', 'put up'], objects: ['shelf', 'shelves'], jobId: 'shelf_install_single' },
    { verbs: ['hang', 'install', 'mount'], objects: ['curtain', 'curtain rail', 'curtain rod'], jobId: 'curtain_rail_standard' },
];

const GENERIC_FALLBACK_JOB_IDS = ['mount_hang_install_wall'];

function includesAnyPhrase(text: string, phrases: string[]) {
    return phrases.some((phrase) => text.includes(phrase));
}

function resolveSpecificIntent(clause: string, allowedSet: Set<string>): string | null {
    for (const rule of SPECIFIC_INTENT_RULES) {
        if (!allowedSet.has(rule.jobId)) continue;
        if (includesAnyPhrase(clause, rule.keywords)) return rule.jobId;
    }
    return null;
}

function resolveComposedIntent(clause: string, allowedSet: Set<string>): string | null {
    for (const rule of COMPOSED_INTENT_RULES) {
        if (!allowedSet.has(rule.jobId)) continue;
        const hasVerb = includesAnyPhrase(clause, rule.verbs);
        const hasObject = includesAnyPhrase(clause, rule.objects);
        if (hasVerb && hasObject) return rule.jobId;
    }
    return null;
}

function resolveGenericIntent(scoredJobId: string | null, allowedSet: Set<string>): string | null {
    if (scoredJobId && allowedSet.has(scoredJobId)) return scoredJobId;
    for (const genericId of GENERIC_FALLBACK_JOB_IDS) {
        if (allowedSet.has(genericId)) return genericId;
    }
    return null;
}

function hasRadiatorDiagnosticPhrase(userInput: string) {
    const lower = userInput.toLowerCase();
    const phrases = [
        'radiator not working',
        'radiators not working',
        'radiator not heating',
        'radiators not heating',
        'radiator cold at top',
        'radiator cold',
        'radiator warm at bottom',
        'radiator issue'
    ];
    return phrases.some((phrase) => lower.includes(phrase));
}

function phraseMatchJobs(userInput: string, allowedJobIds: string[]): PhraseMatch[] {
    const lower = userInput.toLowerCase();
    const tokenSet = new Set(tokenize(userInput));
    const allowedSet = new Set(allowedJobIds);
    const clauses = splitInputClauses(lower);

    if (hasRadiatorDiagnosticPhrase(userInput)) {
        if (allowedSet.has('radiator_diagnosis')) {
            return [{ jobId: 'radiator_diagnosis', quantity: 1, clause: lower, resolutionSource: 'SPECIFIC' }];
        }
        // Prevent over-assuming bleed when diagnostic intent is explicit.
        return [];
    }

    const scoreClause = (clause: string) => {
        const ranked = excelSource.phraseMappings
            .map((mapping) => {
            if (!mapping.canonical_job_item_id || !allowedSet.has(mapping.canonical_job_item_id)) return false;
            if (String(mapping.status || 'active').toLowerCase() !== 'active') return false;
            if (!mapping.auto_match_allowed) return false;

            const minTokens = mapping.auto_match_min_tokens || 1;
            if (tokenSet.size < minTokens) return false;

            const hasNegative = (mapping.negative_keywords || []).some((kw) => kw && (tokenSet.has(kw) || lower.includes(kw)));
            if (hasNegative) return false;

            const phraseCandidates = String(mapping.phrase || '')
                .split(',')
                .map((p) => p.trim().toLowerCase())
                .filter((p) => p.length >= 3);
            const hasPhrase = phraseCandidates.some((p) => clause.includes(p));
            const matchedPositive = (mapping.positive_keywords || []).filter((kw) => clause.includes(kw) || tokenSet.has(kw)).length;
            const hasAllPositive = (mapping.positive_keywords || []).length > 0
                && matchedPositive === (mapping.positive_keywords || []).length;

            if (!hasPhrase && !hasAllPositive) return false;
            if (matchedPositive < minTokens && !hasPhrase) return false;

            return {
                id: mapping.canonical_job_item_id,
                score: (hasPhrase ? 5 : 0) + (matchedPositive * 2) + ((mapping.priority || 0) / 100),
                priority: mapping.priority || 0
            };
        })
            .filter((v): v is { id: string; score: number; priority: number } => !!v)
            .sort((a, b) => b.score - a.score || b.priority - a.priority);
        return ranked[0]?.id || null;
    };

    const perClause = clauses
        .map((clause) => {
            const matchedSpecificIntent = resolveSpecificIntent(clause, allowedSet);
            const matchedComposedIntent = matchedSpecificIntent ? null : resolveComposedIntent(clause, allowedSet);
            const matchedGenericIntent = resolveGenericIntent(scoreClause(clause), allowedSet);
            const finalSelectedIntent = matchedSpecificIntent || matchedComposedIntent || matchedGenericIntent;
            const resolutionSource: 'SPECIFIC' | 'GENERIC' =
                matchedSpecificIntent || matchedComposedIntent ? 'SPECIFIC' : 'GENERIC';

            console.log('[IntentResolution]', {
                input: clause,
                matchedSpecificIntent: matchedSpecificIntent || matchedComposedIntent || null,
                matchedGenericIntent,
                finalSelectedIntent,
                resolutionSource
            });

            if (!finalSelectedIntent) return null;
            return {
                jobId: finalSelectedIntent,
                quantity: extractQuantityFromClause(clause),
                clause,
                resolutionSource
            };
        })
        .filter((v): v is PhraseMatch => !!v);
    return perClause;
}

function directRuleOverrides(userInput: string, allowedJobIds: string[]): { jobs: string[]; skipFallback: boolean } | null {
    const lower = userInput.toLowerCase();
    const allowed = new Set(allowedJobIds);
    const jobs: string[] = [];

    const includesAny = (terms: string[]) => terms.some((t) => lower.includes(t));

    const hasMountTv = includesAny(['mount tv', 'tv mount', 'mounting tv']);
    const hasCableHide = includesAny(['conceal cables', 'hide cables', 'cabling hide', 'hide cable']);
    const hasComplexity = includesAny(['above fireplace', 'very large tv', 'brick wall', 'complicated install', 'over 65 inch tv']);

    if (hasMountTv) {
        if (hasComplexity && allowed.has('mount_tv_custom')) jobs.push('mount_tv_custom');
        else if (allowed.has('tv_mount_standard')) jobs.push('tv_mount_standard');
        if (hasCableHide && allowed.has('install_wall_tv_cabling_hide')) jobs.push('install_wall_tv_cabling_hide');
        if (jobs.length > 0) return { jobs: [...new Set(jobs)], skipFallback: true };
    }

    if (includesAny(['replace light fitting']) && includesAny(['plug socket', 'replace socket', 'socket faceplate'])) {
        if (allowed.has('install_light_fitting')) jobs.push('install_light_fitting');
        if (allowed.has('replace_socket_faceplate')) jobs.push('replace_socket_faceplate');
        if (jobs.length > 0) return { jobs: [...new Set(jobs)], skipFallback: true };
    }

    if (includesAny(['bleed radiator', 'bleeding radiator', 'bleed 3 radiators']) && allowed.has('radiator_bleed')) {
        return { jobs: ['radiator_bleed'], skipFallback: true };
    }

    return null;
}

export async function runExtractionPipeline(userInput: string): Promise<ExtractionPipelineResult> {
    const cacheKey = normalizeCacheKey(userInput);
    const cached = extractionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.result;
    }

    const jobItems = Array.from(excelSource.jobItems.values());
    const allowedJobIds = jobItems.map((j) => j.job_item_id);
    const directOverride = directRuleOverrides(userInput, allowedJobIds);
    const mappedIntentResult = mapToJobs(userInput, allowedJobIds);
    if (mappedIntentResult.type === 'CLARIFY') {
        const clarifyResult: ExtractionPipelineResult = {
            jobs: [],
            capabilities: [],
            quantities: {},
            visits: [],
            price: 0,
            clarifiers: [],
            aiResult: [],
            fallbackResult: [],
            message: 'Please clarify the exact tasks so we can price accurately.',
        };
        extractionCache.set(cacheKey, {
            expiresAt: Date.now() + CACHE_TTL_MS,
            result: clarifyResult,
        });
        return clarifyResult;
    }

    enforceMappingOutputGuardrails(mappedIntentResult.matches);
    const phraseMatches: PhraseMatch[] = mappedIntentResult.matches.map((match) => ({
        jobId: match.jobId,
        quantity: match.quantity,
        clause: match.clause,
        resolutionSource: match.resolutionSource
    }));
    const phraseResult = validateAllowedJobs(phraseMatches.map((m) => m.jobId), allowedJobIds);
    let aiResult: string[] = [];
    let fallbackResult: string[] = [];
    let aiConfidence = 0;
    let skipFallback = false;
    let extractionMode: 'AI' | 'FALLBACK' | 'PATTERN_MATCH' = 'FALLBACK';
    let message: string | undefined;

    try {
        if (phraseResult.length > 0) {
            aiResult = phraseResult;
            aiConfidence = 1;
            extractionMode = 'PATTERN_MATCH';
        } else if (directOverride) {
            aiResult = validateAllowedJobs(directOverride.jobs, allowedJobIds);
            aiConfidence = aiResult.length > 0 ? 1 : 0;
            skipFallback = directOverride.skipFallback;
            extractionMode = 'PATTERN_MATCH';
        } else if (process.env.OPENAI_API_KEY) {
            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
            });

            const completion = await openai.chat.completions.create({
                model: 'gpt-4o',
                temperature: 0,
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'job_extraction',
                        schema: {
                            type: 'object',
                            properties: {
                                detected_jobs: {
                                    type: 'array',
                                    items: {
                                        type: 'string',
                                        enum: allowedJobIds,
                                    },
                                },
                                confidence: {
                                    type: 'number',
                                    minimum: 0,
                                    maximum: 1,
                                },
                            },
                            required: ['detected_jobs', 'confidence'],
                            additionalProperties: false,
                        },
                    },
                },
                messages: [
                    {
                        role: 'system',
                        content: `You are a structured service request parser.

Your job is to map a customer request to internal DIFM job identifiers.

Rules:
- Only return job_item_ids from the provided list
- If multiple tasks are mentioned return multiple jobs
- Prefer standard job variants when the request is simple
- Only select custom or complex variants if user explicitly describes complexity
- Complexity triggers include: above fireplace, very large TV, brick wall, complicated install, over 65 inch TV
- Never choose mount_tv_custom unless complexity keywords exist
- If uncertain, choose the simpler job
- Return JSON only
- Format: { detected_jobs: [job_item_id], confidence: number }`,
                    },
                    {
                        role: 'user',
                        content: `allowed_jobs: ${JSON.stringify(allowedJobIds)}

Few-shot examples:
Input: Fix leaking tap
Output: ["tap_leak_fix"]

Input: Mount TV
Output: ["tv_mount_standard"]

Input: Mount TV and hide cables
Output: ["tv_mount_standard","install_wall_tv_cabling_hide"]

Input: Hang mirror
Output: ["mirror_hang"]

Input: Replace socket
Output: ["replace_socket_faceplate"]

User input:
${userInput}

Return matching job_item_ids from allowed_jobs.`,
                    },
                ],
            });

            const content = completion.choices[0]?.message?.content || '{"detected_jobs":[],"confidence":0}';
            const parsed = JSON.parse(content);
            let aiDetectedJobs = Array.isArray(parsed?.detected_jobs) ? parsed.detected_jobs : [];
            // Override guard: enforce radiator diagnosis for symptom phrases
            // AFTER AI extraction but BEFORE final validation.
            if (hasRadiatorDiagnosticPhrase(userInput)) {
                aiDetectedJobs = ['radiator_diagnosis'];
            }
            aiResult = validateAllowedJobs(aiDetectedJobs, allowedJobIds);
            aiConfidence = typeof parsed?.confidence === 'number' ? parsed.confidence : 0;
            // Guardrail: suspiciously broad extraction should fall back to deterministic parser.
            if (aiResult.length > 3) {
                aiResult = [];
                aiConfidence = 0;
            } else if (aiResult.length > 0) {
                extractionMode = 'AI';
            }
        }
    } catch (err) {
        console.error('[Extraction] GPT-4o extraction failed:', err);
    }

    if (!skipFallback && (aiResult.length === 0 || aiConfidence < 0.6)) {
        const parsedFallback = await parseJobDescription(userInput, excelSource.jobItemRules);
        fallbackResult = validateAllowedJobs(parsedFallback.detectedItemIds, allowedJobIds);
        if (fallbackResult.length > 3) {
            fallbackResult = [];
            message = 'Please provide a bit more detail about the job.';
        }
        extractionMode = 'FALLBACK';
    }

    const selectedModelJobs = aiResult.length > 0 ? aiResult : fallbackResult;
    const quantityByJob: Record<string, number> = {};

    for (const match of phraseMatches) {
        if (!allowedJobIds.includes(match.jobId)) continue;
        quantityByJob[match.jobId] = (quantityByJob[match.jobId] || 0) + Math.max(1, match.quantity);
    }

    for (const jobId of selectedModelJobs) {
        quantityByJob[jobId] = Math.max(1, quantityByJob[jobId] || 1);
    }

    const finalJobs = Object.keys(quantityByJob);
    const visits = attachClarifiersToVisits(buildVisitsWithQuantities(finalJobs, quantityByJob));
    const capabilities = Array.from(new Set(
        finalJobs
            .map((jobId) => excelSource.jobItems.get(jobId)?.capability_tag || jobId)
            .filter(Boolean)
    ));
    const price = visits.reduce((sum, v) => sum + v.price, 0);
    const clarifiers = buildClarifiers(finalJobs);
    const unresolvedClauses = splitInputClauses(userInput).filter((clause) => {
        const normalizedClause = clause.toLowerCase();
        return !phraseMatches.some((m) => m.clause.toLowerCase() === normalizedClause);
    });
    if (!message && finalJobs.length > 0 && unresolvedClauses.length > 0 && unresolvedClauses.length < splitInputClauses(userInput).length) {
        message = `Need a bit more detail for: ${unresolvedClauses.join(', ')}`;
    }

    const minutesBefore = visits.reduce((sum, v) => sum + (v.total_minutes || 0), 0);
    const tierBefore = visits.map((v) => v.tier).join(',');

    const logPayload = {
        userInput,
        direct_override: directOverride?.jobs || [],
        phrase_result: phraseResult,
        phrase_quantities: quantityByJob,
        extraction_mode: extractionMode,
        ai_result: aiResult,
        ai_confidence: aiConfidence,
        fallback_result: fallbackResult,
        jobs_detected: finalJobs,
        capabilities,
        final_jobs: finalJobs,
        clarifiers_loaded: clarifiers.map((c) => c.tag),
        clarifier_answers: {},
        minutes_before: minutesBefore,
        minutes_after: minutesBefore,
        tier_before: tierBefore,
        tier_after: tierBefore,
        price_before: price,
        price_after: price,
        final_price: price
    };

    console.log('[Extraction]', logPayload);

    try {
        await prisma.auditLog.create({
            data: {
                action: 'AI_EXTRACTION',
                entityType: 'EXTRACTION',
                entityId: 'N/A',
                details: JSON.stringify(logPayload),
                actorId: 'SYSTEM',
            },
        });
    } catch (err) {
        console.error('[Extraction] Failed to persist extraction audit log:', err);
    }

    const result = {
        jobs: finalJobs,
        capabilities,
        quantities: quantityByJob,
        visits,
        price,
        clarifiers,
        aiResult,
        fallbackResult,
        message
    };

    extractionCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        result,
    });

    return result;
}

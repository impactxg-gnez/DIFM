import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { excelSource } from './excelLoader';
import { parseJobDescription, tokenize } from './jobParser';
import { buildVisits, GeneratedVisit } from './visitEngine';
import { attachClarifiersToVisits } from './clarifierEngine';

export interface ExtractionPipelineResult {
    jobs: string[];
    visits: GeneratedVisit[];
    price: number;
    clarifiers: Array<{ tag: string; question: string }>;
    aiResult: string[];
    fallbackResult: string[];
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const extractionCache = new Map<string, { expiresAt: number; result: ExtractionPipelineResult }>();

function normalizeCacheKey(input: string) {
    return input.trim().toLowerCase().replace(/\s+/g, ' ');
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
    }));
}

function validateAllowedJobs(candidateIds: string[], allowedJobIds: string[]) {
    const allowed = new Set(allowedJobIds);
    return candidateIds.filter((id) => allowed.has(id));
}

function phraseMatchJobs(userInput: string, allowedJobIds: string[]) {
    const lower = userInput.toLowerCase();
    const tokenSet = new Set(tokenize(userInput));
    const allowedSet = new Set(allowedJobIds);
    const clauses = lower
        .split(/,| and | & | plus /g)
        .map((s) => s.trim())
        .filter(Boolean);

    const diagnosticRadiatorTriggers = [
        'radiator not working',
        'radiators not heating',
        'radiator not heating',
        'radiator cold at top'
    ];
    if (diagnosticRadiatorTriggers.some((t) => lower.includes(t))) {
        if (allowedSet.has('radiator_diagnosis')) return ['radiator_diagnosis'];
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

    const perClause = clauses.map(scoreClause).filter(Boolean) as string[];
    return [...new Set(perClause)];
}

function directRuleOverrides(userInput: string, allowedJobIds: string[]): { jobs: string[]; skipFallback: boolean } | null {
    const lower = userInput.toLowerCase();
    const allowed = new Set(allowedJobIds);
    const jobs: string[] = [];

    const includesAny = (terms: string[]) => terms.some((t) => lower.includes(t));

    if (includesAny(['radiator not working', 'radiators not heating', 'radiator not heating', 'radiator cold at top'])) {
        if (allowed.has('radiator_diagnosis')) return { jobs: ['radiator_diagnosis'], skipFallback: true };
        return { jobs: [], skipFallback: true };
    }

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

    if (includesAny(['bleed radiator', 'bleeding radiator']) && allowed.has('radiator_bleed')) {
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

    const phraseResult = validateAllowedJobs(phraseMatchJobs(userInput, allowedJobIds), allowedJobIds);
    let aiResult: string[] = [];
    let fallbackResult: string[] = [];
    let aiConfidence = 0;
    let skipFallback = false;
    let extractionMode: 'AI' | 'FALLBACK' | 'PATTERN_MATCH' = 'FALLBACK';

    try {
        if (directOverride) {
            aiResult = validateAllowedJobs(directOverride.jobs, allowedJobIds);
            aiConfidence = aiResult.length > 0 ? 1 : 0;
            skipFallback = directOverride.skipFallback;
            extractionMode = 'PATTERN_MATCH';
        } else if (phraseResult.length > 0) {
            // Fast path: phrase matching hit skips AI call.
            aiResult = phraseResult;
            aiConfidence = 1;
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
            aiResult = validateAllowedJobs(
                Array.isArray(parsed?.detected_jobs) ? parsed.detected_jobs : [],
                allowedJobIds
            );
            aiConfidence = typeof parsed?.confidence === 'number' ? parsed.confidence : 0;
            // Guardrail: suspiciously broad extraction should fall back to deterministic parser.
            if (aiResult.length > 4) {
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
        extractionMode = 'FALLBACK';
    }

    const finalJobs = [...new Set(aiResult.length > 0 ? aiResult : fallbackResult)];
    const visits = attachClarifiersToVisits(buildVisits(finalJobs));
    const price = visits.reduce((sum, v) => sum + v.price, 0);
    const clarifiers = buildClarifiers(finalJobs);

    const minutesBefore = visits.reduce((sum, v) => sum + (v.total_minutes || 0), 0);
    const tierBefore = visits.map((v) => v.tier).join(',');

    const logPayload = {
        userInput,
        direct_override: directOverride?.jobs || [],
        phrase_result: phraseResult,
        extraction_mode: extractionMode,
        ai_result: aiResult,
        ai_confidence: aiConfidence,
        fallback_result: fallbackResult,
        jobs_detected: finalJobs,
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
        visits,
        price,
        clarifiers,
        aiResult,
        fallbackResult,
    };

    extractionCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        result,
    });

    return result;
}

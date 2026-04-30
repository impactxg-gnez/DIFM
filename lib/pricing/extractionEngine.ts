import { prisma } from '@/lib/prisma';
import { persistMatrixV2AuditLog } from './matrixV2/audit';
import { routeAndPriceMatrixV2, normalizeV2Input } from './matrixV2/engine';
import { excelSource } from './excelLoader';
import { buildVisitsWithQuantities, GeneratedVisit } from './visitEngine';
import { attachClarifiersToVisits } from './clarifierEngine';
import {
    enforceMappingOutputGuardrails,
    getClarifiers,
    mapToJobs,
    normalizeInput,
    splitInput,
} from './intentMapper';
import { aggregateCleaningTier, isCleaningRuleJob } from './cleaningIntent';
import type { BookingMappingMeta } from './bookingRoutingTypes';
import { evaluateBookingConfidence, REVIEW_QUOTE_MESSAGE } from './bookingRouter';
import { computeBundleSignals } from './bundleRouting';

export interface ExtractionPipelineResult {
    jobs: string[];
    quantitiesList: number[];
    total_minutes: number;
    tier: string;
    jobDetails: Array<{
        job: string;
        ruleJob: string;
        pricingJobId: string;
        quantity: number;
        adjustedMinutes: number;
        complexityTierDelta: number;
        itemHint?: string | null;
        actions?: string[];
        contextModifiers?: string[];
    }>;
    capabilities: string[];
    quantities: Record<string, number>;
    visits: GeneratedVisit[];
    price: number;
    clarifiers: Array<{ tag: string; question: string; capability_tag?: string; affects_time?: boolean; affects_safety?: boolean; inputType?: string }>;
    flags: {
        usedDeterministicPipeline: boolean;
        usedGenericFallback: boolean;
        unresolvedPartCount: number;
    };
    aiResult: string[];
    fallbackResult: string[];
    message?: string;
    /** UX / v1Pricing: clarify, commercial quote, partial parse, etc. */
    warnings?: string[];
    mappingMeta?: BookingMappingMeta;
    /** Set when MATRIX V2 workbook path ran (classification + pricing). */
    pipeline?: 'MATRIX_V2' | 'LEGACY';
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const extractionCache = new Map<string, { expiresAt: number; result: ExtractionPipelineResult }>();
const TIER_PRICING: Record<'H1' | 'H2' | 'H3', number> = {
    H1: 59,
    H2: 109,
    H3: 159,
};

function normalizeCacheKey(input: string) {
    return normalizeInput(input);
}

function validateAllowedJobs(candidateIds: string[], allowedJobIds: string[]) {
    const allowed = new Set(allowedJobIds);
    return candidateIds.filter((id) => allowed.has(id));
}

interface PhraseMatch {
    /** Quantity-tier classification (final_jobs). */
    canonicalJob: string;
    ruleJob: string;
    jobId: string;
    quantity: number;
    adjustedMinutes: number;
    complexityTierDelta: number;
    clause: string;
    resolutionSource: 'SPECIFIC' | 'GENERIC';
    itemHint: string | null;
    actions: string[];
    contextModifiers: string[];
}

function deriveTierFromMinutes(totalMinutes: number): 'H1' | 'H2' | 'H3' {
    if (totalMinutes >= 160) return 'H3';
    if (totalMinutes > 60) return 'H2';
    return 'H1';
}

function warningsForClarifyReason(reason: string): string[] {
    if (reason === 'COMMERCIAL_BULK' || reason === 'HIGH_QUANTITY') {
        return ['COMMERCIAL_QUOTE_REQUIRED'];
    }
    if (reason === 'CONTRADICTION') {
        return ['CONTRADICTION_CLARIFY'];
    }
    return ['NEEDS_CLARIFICATION'];
}

function buildClarifyResult(
    userInput: string,
    parts: string[],
    warnings: string[],
    message: string,
): ExtractionPipelineResult {
    return {
        jobs: [],
        quantitiesList: [],
        total_minutes: 0,
        tier: 'H1',
        jobDetails: [],
        capabilities: [],
        quantities: {},
        visits: [],
        price: 0,
        clarifiers: [],
        flags: {
            usedDeterministicPipeline: true,
            usedGenericFallback: false,
            unresolvedPartCount: parts.length,
        },
        aiResult: [],
        fallbackResult: [],
        message,
        warnings,
        mappingMeta: undefined,
    };
}

export async function runExtractionPipeline(userInput: string): Promise<ExtractionPipelineResult> {
    const cacheKey = normalizeCacheKey(userInput);
    const cached = extractionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.result;
    }

    excelSource.ensureLoaded();
    const v2 = excelSource.getMatrixV2Model();
    if (v2 && excelSource.isMatrixV2()) {
        const v2Result = routeAndPriceMatrixV2(v2, userInput);
        const result: ExtractionPipelineResult = { ...v2Result, pipeline: 'MATRIX_V2' };
        extractionCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, result });
        const qty = result.mappingMeta?.quantityByJob ?? result.quantities ?? {};
        await persistMatrixV2AuditLog({
            rawInput: userInput,
            normalizedInput: normalizeV2Input(userInput),
            detectedJobIds: result.jobs.length > 0 ? result.jobs : Object.keys(qty),
            quantityByJob: qty as Record<string, number>,
            routing: result.mappingMeta?.matrixV2?.routing ?? 'REVIEW_QUOTE',
            routingWarnings: result.warnings ?? [],
            reviewReason: result.mappingMeta?.matrixV2?.reviewReason,
            totalPrice: result.price,
            tier: result.tier,
            clarifierIds: (result.clarifiers ?? []).map((c) => c.tag),
            minutesEstimated: result.mappingMeta?.estimatedTotalMinutes ?? result.total_minutes,
        });
        return result;
    }

    const jobItems = Array.from(excelSource.jobItems.values());
    const allowedJobIds = jobItems.map((j) => j.job_item_id);
    const normalizedInput = normalizeInput(userInput);
    const parts = splitInput(normalizedInput);
    let mappedIntentResult;
    try {
        mappedIntentResult = mapToJobs(userInput, allowedJobIds);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith('ERROR_UNREALISTIC_TIME')) {
            const clarify = buildClarifyResult(
                userInput,
                parts,
                ['COMMERCIAL_QUOTE_REQUIRED'],
                'This looks larger than a standard residential visit. Contact us for a custom quote.',
            );
            extractionCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, result: clarify });
            return clarify;
        }
        throw err;
    }
    if (mappedIntentResult.type === 'CLARIFY') {
        const reason = mappedIntentResult.reason;
        const warnings = warningsForClarifyReason(reason);
        const clarifyMessages: Record<string, string> = {
            VAGUE_INPUT: 'Please describe the specific task (for example what to mount, fix, or install).',
            NO_STRONG_MATCH: 'We could not match that to a priced service. Please add more detail.',
            EMPTY_INPUT: 'Please describe what you need done.',
            GENERIC_FALLBACK: 'Please be more specific about the item and work so we can price it accurately.',
            CONTRADICTION:
                'Your message seems to conflict (for example mounting without a suitable wall). Please clarify how you want this done.',
            COMMERCIAL_BULK: 'This looks like a commercial or large-scale job. We will need a custom quote.',
            HIGH_QUANTITY: 'That quantity is outside standard residential pricing. Please contact us for a custom quote.',
        };
        const clarifyResult = buildClarifyResult(
            userInput,
            parts,
            warnings,
            clarifyMessages[reason] ?? 'Please clarify the exact tasks so we can price accurately.',
        );
        extractionCache.set(cacheKey, {
            expiresAt: Date.now() + CACHE_TTL_MS,
            result: clarifyResult,
        });
        return clarifyResult;
    }

    enforceMappingOutputGuardrails(mappedIntentResult.matches);

    const resolvedClauses = new Set(mappedIntentResult.matches.map((m) => m.clause.trim()));
    const unresolvedClauses = parts.filter((p) => !resolvedClauses.has(p.trim()));
    if (unresolvedClauses.length > 0) {
        const clarify = buildClarifyResult(
            userInput,
            parts,
            ['PARTIAL_PARSE_CLARIFY'],
            `We understood part of your request. Please clarify: ${unresolvedClauses.join(', ')}`,
        );
        extractionCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, result: clarify });
        return clarify;
    }

    const phraseMatches: PhraseMatch[] = mappedIntentResult.matches.map((match) => ({
        canonicalJob: match.job,
        ruleJob: match.ruleJob,
        jobId: match.jobId,
        quantity: match.quantity,
        adjustedMinutes: match.adjustedMinutes,
        complexityTierDelta: match.complexityTierDelta,
        clause: match.clause,
        resolutionSource: match.resolutionSource,
        itemHint: match.clauseParse.itemHint,
        actions: match.clauseParse.actions,
        contextModifiers: match.clauseParse.contextModifiers,
    }));
    const phraseResult = validateAllowedJobs(phraseMatches.map((m) => m.jobId), allowedJobIds);
    const aiResult: string[] = phraseResult;
    const fallbackResult: string[] = [];
    const quantityByJob: Record<string, number> = {};
    const quantityByCanonicalJob: Record<string, number> = {};
    const adjustedMinutesByCanonicalJob: Record<string, number> = {};
    const minuteTotalsByJob: Record<string, number> = {};
    const classificationByJobId: Record<string, string> = {};

    for (const match of phraseMatches) {
        if (!allowedJobIds.includes(match.jobId)) continue;
        quantityByJob[match.jobId] = (quantityByJob[match.jobId] || 0) + Math.max(1, match.quantity);
        quantityByCanonicalJob[match.canonicalJob] = (quantityByCanonicalJob[match.canonicalJob] || 0) + Math.max(1, match.quantity);
        adjustedMinutesByCanonicalJob[match.canonicalJob] = (adjustedMinutesByCanonicalJob[match.canonicalJob] || 0) + Math.max(1, match.adjustedMinutes);
        minuteTotalsByJob[match.jobId] = (minuteTotalsByJob[match.jobId] || 0) + Math.max(1, match.adjustedMinutes);
        classificationByJobId[match.jobId] = match.canonicalJob;
    }

    const finalJobs = Object.keys(quantityByCanonicalJob);
    const pricingJobIds = Object.keys(quantityByJob);
    const quantitiesList = finalJobs.map((job) => quantityByCanonicalJob[job] || 1);
    const jobDetails = phraseMatches.map((match) => ({
        job: match.canonicalJob,
        ruleJob: match.ruleJob,
        pricingJobId: match.jobId,
        quantity: Math.max(1, match.quantity),
        adjustedMinutes: Math.max(1, match.adjustedMinutes),
        complexityTierDelta: Math.max(0, match.complexityTierDelta),
        itemHint: match.itemHint,
        actions: match.actions,
        contextModifiers: match.contextModifiers,
    }));

    const flags = {
        usedDeterministicPipeline: true,
        usedGenericFallback: phraseMatches.some((match) => match.resolutionSource === 'GENERIC'),
        unresolvedPartCount: 0,
    };

    const uniqueRuleJobs = new Set(phraseMatches.map((m) => m.ruleJob));
    const { estimatedTotalMinutes, distinctRoutingBucketCount } = computeBundleSignals(
        pricingJobIds,
        adjustedMinutesByCanonicalJob,
        finalJobs.length,
    );

    const mappingMeta: BookingMappingMeta = {
        distinctRuleJobCount: uniqueRuleJobs.size,
        allResolutionSpecific: phraseMatches.every((m) => m.resolutionSource === 'SPECIFIC'),
        usedGenericFallback: flags.usedGenericFallback,
        partClauseCount: parts.length,
        distinctPricingJobCount: Object.keys(quantityByJob).length,
        quantityByJob: { ...quantityByJob },
        estimatedTotalMinutes,
        distinctRoutingBucketCount,
    };

    const confidenceGate = evaluateBookingConfidence(mappingMeta);
    if (confidenceGate.routing === 'REVIEW_QUOTE') {
        const clarifiersEarly = getClarifiers(
            normalizedInput,
            phraseMatches.map((match) => ({ job: match.ruleJob, quantity: match.quantity, part: match.clause })),
        );
        const capabilitiesEarly = Array.from(
            new Set(
                pricingJobIds
                    .map((jobId) => excelSource.jobItems.get(jobId)?.capability_tag || jobId)
                    .filter(Boolean),
            ),
        );
        const gatedResult: ExtractionPipelineResult = {
            jobs: finalJobs,
            quantitiesList,
            total_minutes: 0,
            tier: 'H1',
            jobDetails,
            capabilities: capabilitiesEarly,
            quantities: quantityByCanonicalJob,
            visits: [],
            price: 0,
            clarifiers: clarifiersEarly,
            flags,
            aiResult,
            fallbackResult,
            message: confidenceGate.reviewMessage ?? REVIEW_QUOTE_MESSAGE,
            warnings: confidenceGate.warnings,
            mappingMeta,
        };
        extractionCache.set(cacheKey, {
            expiresAt: Date.now() + CACHE_TTL_MS,
            result: gatedResult,
        });
        console.log('[Extraction] Confidence gate → REVIEW_QUOTE (tier pricing skipped)', {
            warnings: confidenceGate.warnings,
            mappingMeta,
        });
        return gatedResult;
    }

    const visitsBuilt = attachClarifiersToVisits(
        buildVisitsWithQuantities(pricingJobIds, quantityByJob, {
            minuteTotalsByJob,
            classificationByJobId,
        }),
        userInput,
    );
    const capabilities = Array.from(new Set(
        pricingJobIds
            .map((jobId) => excelSource.jobItems.get(jobId)?.capability_tag || jobId)
            .filter(Boolean)
    ));
    const legacyVisitPrice = visitsBuilt.reduce((sum, v) => sum + v.price, 0);
    const clarifiers = getClarifiers(
        normalizedInput,
        phraseMatches.map((match) => ({ job: match.ruleJob, quantity: match.quantity, part: match.clause })),
    );
    let message: string | undefined;
    if (finalJobs.length === 0) {
        message = 'Please clarify the exact tasks so we can price accurately.';
    }
    const unresolvedDiagnostics: string[] = [];
    const summedMinutes = Object.values(adjustedMinutesByCanonicalJob).reduce((sum, minutes) => sum + minutes, 0);
    const multiJobOverhead = Math.max(0, finalJobs.length - 1) * 10;
    const totalMinutes = summedMinutes + multiJobOverhead;

    const cleaningBundle =
        phraseMatches.length > 0 && phraseMatches.every((m) => isCleaningRuleJob(m.ruleJob));
    let finalTier: 'H1' | 'H2' | 'H3';
    let finalPrice: number;
    let visits = visitsBuilt;
    if (cleaningBundle) {
        finalTier = aggregateCleaningTier(
            phraseMatches.map((m) => ({ ruleJob: m.ruleJob, clause: m.clause })),
        );
        finalPrice = TIER_PRICING[finalTier];
        visits = visits.map((v) => ({
            ...v,
            tier: finalTier,
            price: visitsBuilt.length === 1 ? finalPrice : v.price,
            item_prices: visitsBuilt.length === 1 ? [finalPrice] : v.item_prices,
        }));
    } else {
        finalTier = deriveTierFromMinutes(totalMinutes);
        finalPrice = TIER_PRICING[finalTier as 'H1' | 'H2' | 'H3'];
        visits = visitsBuilt;
    }

    const minutesBefore = visits.reduce((sum, v) => sum + (v.total_minutes || 0), 0);
    const tierBefore = visits.map((v) => v.tier).join(',');

    const logPayload = {
        userInput,
        phrase_result: phraseResult,
        phrase_quantities: quantityByCanonicalJob,
        extraction_mode: 'PATTERN_MATCH',
        ai_result: aiResult,
        ai_confidence: 1,
        fallback_result: fallbackResult,
        jobs_detected: finalJobs,
        job_details: jobDetails,
        capabilities,
        final_jobs: finalJobs,
        clarifiers_loaded: clarifiers.map((c) => c.tag),
        clarifier_answers: {},
        minutes_before: minutesBefore,
        minutes_after: totalMinutes,
        tier_before: tierBefore,
        tier_after: finalTier,
        price_before: legacyVisitPrice,
        price_after: finalPrice,
        final_price: finalPrice,
        flags,
        unresolved_clauses: unresolvedDiagnostics,
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
        quantitiesList,
        total_minutes: totalMinutes,
        tier: finalTier,
        jobDetails,
        capabilities,
        quantities: quantityByCanonicalJob,
        visits,
        price: finalPrice,
        clarifiers,
        flags,
        aiResult,
        fallbackResult,
        message,
        mappingMeta,
    };

    // Tier pricing path only — confidence gate returned earlier otherwise.
    const fallbackUsedUnnecessarily = flags.usedGenericFallback && phraseMatches.some((m) => m.resolutionSource === 'SPECIFIC');
    if (!excelSource.isMatrixV2()) {
        if (![59, 109, 159].includes(finalPrice)) {
            throw new Error(`INVALID_TIER_PRICE:${finalPrice}`);
        }
    }
    if (fallbackUsedUnnecessarily) {
        throw new Error('INVALID_FALLBACK_USAGE');
    }

    extractionCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        result,
    });

    return result;
}

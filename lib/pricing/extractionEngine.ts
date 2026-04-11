import { prisma } from '@/lib/prisma';
import { excelSource } from './excelLoader';
import { buildVisitsWithQuantities, GeneratedVisit } from './visitEngine';
import { attachClarifiersToVisits } from './clarifierEngine';
import {
    enforceMappingOutputGuardrails,
    getClarifiers,
    mapPartToJob,
    mapToJobs,
    normalizeInput,
    splitInput,
} from './intentMapper';

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
    clarifiers: Array<{ tag: string; question: string; capability_tag?: string; affects_time?: boolean; affects_safety?: boolean }>;
    flags: {
        usedDeterministicPipeline: boolean;
        usedGenericFallback: boolean;
        unresolvedPartCount: number;
    };
    aiResult: string[];
    fallbackResult: string[];
    message?: string;
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

export async function runExtractionPipeline(userInput: string): Promise<ExtractionPipelineResult> {
    const cacheKey = normalizeCacheKey(userInput);
    const cached = extractionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.result;
    }

    const jobItems = Array.from(excelSource.jobItems.values());
    const allowedJobIds = jobItems.map((j) => j.job_item_id);
    const normalizedInput = normalizeInput(userInput);
    const parts = splitInput(normalizedInput);
    const mappedIntentResult = mapToJobs(userInput, allowedJobIds);
    if (mappedIntentResult.type === 'CLARIFY') {
        const clarifyResult: ExtractionPipelineResult = {
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
    const visits = attachClarifiersToVisits(
        buildVisitsWithQuantities(pricingJobIds, quantityByJob, {
            minuteTotalsByJob,
            classificationByJobId,
        }),
    );
    const capabilities = Array.from(new Set(
        pricingJobIds
            .map((jobId) => excelSource.jobItems.get(jobId)?.capability_tag || jobId)
            .filter(Boolean)
    ));
    const legacyVisitPrice = visits.reduce((sum, v) => sum + v.price, 0);
    const clarifiers = getClarifiers(
        normalizedInput,
        phraseMatches.map((match) => ({ job: match.ruleJob, quantity: match.quantity, part: match.clause })),
    );
    const unresolvedClauses = parts.filter((part) => {
        const mapped = mapPartToJob(part);
        if (!mapped) return true;
        return false;
    });
    let message: string | undefined;
    if (finalJobs.length === 0) {
        message = 'Please clarify the exact tasks so we can price accurately.';
    } else if (unresolvedClauses.length > 0 && unresolvedClauses.length < parts.length) {
        message = `Need a bit more detail for: ${unresolvedClauses.join(', ')}`;
    } else if (unresolvedClauses.length === parts.length) {
        message = 'Please clarify the exact tasks so we can price accurately.';
    }
    const flags = {
        usedDeterministicPipeline: true,
        usedGenericFallback: phraseMatches.some((match) => match.resolutionSource === 'GENERIC'),
        unresolvedPartCount: unresolvedClauses.length,
    };
    const unresolvedDiagnostics = [...unresolvedClauses];
    const summedMinutes = Object.values(adjustedMinutesByCanonicalJob).reduce((sum, minutes) => sum + minutes, 0);
    const multiJobOverhead = Math.max(0, finalJobs.length - 1) * 10;
    const totalMinutes = summedMinutes + multiJobOverhead;
    const minuteTier = deriveTierFromMinutes(totalMinutes);
    const finalTier: 'H1' | 'H2' | 'H3' = minuteTier;
    const finalPrice = TIER_PRICING[finalTier as 'H1' | 'H2' | 'H3'];

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
        message
    };

    // Validation gate: enforce deterministic contract constraints before returning.
    const fallbackUsedUnnecessarily = flags.usedGenericFallback && phraseMatches.some((m) => m.resolutionSource === 'SPECIFIC');
    if (![59, 109, 159].includes(finalPrice)) {
        throw new Error(`INVALID_TIER_PRICE:${finalPrice}`);
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

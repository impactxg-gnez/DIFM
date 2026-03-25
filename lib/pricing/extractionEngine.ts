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
    jobDetails: Array<{ job: string; pricingJobId: string; quantity: number; adjustedMinutes: number; complexityTierDelta: number }>;
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

function normalizeCacheKey(input: string) {
    return normalizeInput(input);
}

function validateAllowedJobs(candidateIds: string[], allowedJobIds: string[]) {
    const allowed = new Set(allowedJobIds);
    return candidateIds.filter((id) => allowed.has(id));
}

interface PhraseMatch {
    canonicalJob: string;
    jobId: string;
    quantity: number;
    adjustedMinutes: number;
    complexityTierDelta: number;
    clause: string;
    resolutionSource: 'SPECIFIC' | 'GENERIC';
}

function tierRank(tier: string): number {
    const match = String(tier || '').match(/(\d)/);
    return match ? Number(match[1]) : 1;
}

function rankToTier(rank: number): string {
    return `H${Math.max(1, Math.min(3, rank))}`;
}

function deriveBaseTierFromVisitJob(jobId: string, visits: GeneratedVisit[]): number {
    const visit = visits.find((v) => v.primary_job_item.job_item_id === jobId || v.addon_job_items.some((a) => a.job_item_id === jobId));
    if (!visit) return 1;
    return tierRank(visit.tier);
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
        jobId: match.jobId,
        quantity: match.quantity,
        adjustedMinutes: match.adjustedMinutes,
        complexityTierDelta: match.complexityTierDelta,
        clause: match.clause,
        resolutionSource: match.resolutionSource
    }));
    const phraseResult = validateAllowedJobs(phraseMatches.map((m) => m.jobId), allowedJobIds);
    const aiResult: string[] = phraseResult;
    const fallbackResult: string[] = [];
    const quantityByJob: Record<string, number> = {};
    const quantityByCanonicalJob: Record<string, number> = {};
    const adjustedMinutesByCanonicalJob: Record<string, number> = {};

    for (const match of phraseMatches) {
        if (!allowedJobIds.includes(match.jobId)) continue;
        quantityByJob[match.jobId] = (quantityByJob[match.jobId] || 0) + Math.max(1, match.quantity);
        quantityByCanonicalJob[match.canonicalJob] = (quantityByCanonicalJob[match.canonicalJob] || 0) + Math.max(1, match.quantity);
        adjustedMinutesByCanonicalJob[match.canonicalJob] = (adjustedMinutesByCanonicalJob[match.canonicalJob] || 0) + Math.max(1, match.adjustedMinutes);
    }

    const finalJobs = Object.keys(quantityByCanonicalJob);
    const pricingJobIds = Object.keys(quantityByJob);
    const quantitiesList = finalJobs.map((job) => quantityByCanonicalJob[job] || 1);
    const jobDetails = phraseMatches.map((match) => ({
        job: match.canonicalJob,
        pricingJobId: match.jobId,
        quantity: Math.max(1, match.quantity),
        adjustedMinutes: Math.max(1, match.adjustedMinutes),
        complexityTierDelta: Math.max(0, match.complexityTierDelta),
    }));
    const visits = attachClarifiersToVisits(buildVisitsWithQuantities(pricingJobIds, quantityByJob));
    const capabilities = Array.from(new Set(
        pricingJobIds
            .map((jobId) => excelSource.jobItems.get(jobId)?.capability_tag || jobId)
            .filter(Boolean)
    ));
    const price = visits.reduce((sum, v) => sum + v.price, 0);
    const clarifiers = getClarifiers(
        normalizedInput,
        phraseMatches.map((match) => ({ job: match.canonicalJob, quantity: match.quantity, part: match.clause }))
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
    const totalMinutes = Object.values(adjustedMinutesByCanonicalJob).reduce((sum, minutes) => sum + minutes, 0);

    const perJobTierRanks = phraseMatches.map((match) => {
        const baseRank = deriveBaseTierFromVisitJob(match.jobId, visits);
        return Math.min(3, baseRank + Math.max(0, match.complexityTierDelta));
    });
    const finalTierRank = perJobTierRanks.length > 0 ? Math.max(...perJobTierRanks) : 1;
    const finalTier = rankToTier(finalTierRank);

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
        price_before: price,
        price_after: price,
        final_price: price,
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
        price,
        clarifiers,
        flags,
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

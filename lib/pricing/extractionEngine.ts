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
    jobDetails: Array<{ job: string; quantity: number }>;
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
    jobId: string;
    quantity: number;
    clause: string;
    sourceJob: string;
    resolutionSource: 'SPECIFIC' | 'GENERIC';
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
        jobId: match.jobId,
        quantity: match.quantity,
        clause: match.clause,
        sourceJob: match.job,
        resolutionSource: match.resolutionSource
    }));
    const phraseResult = validateAllowedJobs(phraseMatches.map((m) => m.jobId), allowedJobIds);
    const aiResult: string[] = phraseResult;
    const fallbackResult: string[] = [];
    const quantityByJob: Record<string, number> = {};

    for (const match of phraseMatches) {
        if (!allowedJobIds.includes(match.jobId)) continue;
        quantityByJob[match.jobId] = (quantityByJob[match.jobId] || 0) + Math.max(1, match.quantity);
    }

    const finalJobs = Object.keys(quantityByJob);
    const jobDetails = phraseMatches.map((match) => ({
        job: match.jobId,
        quantity: Math.max(1, match.quantity),
    }));
    const visits = attachClarifiersToVisits(buildVisitsWithQuantities(finalJobs, quantityByJob));
    const capabilities = Array.from(new Set(
        finalJobs
            .map((jobId) => excelSource.jobItems.get(jobId)?.capability_tag || jobId)
            .filter(Boolean)
    ));
    const price = visits.reduce((sum, v) => sum + v.price, 0);
    const clarifiers = getClarifiers(
        normalizedInput,
        phraseMatches.map((match) => ({ job: match.sourceJob, quantity: match.quantity, part: match.clause }))
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

    const minutesBefore = visits.reduce((sum, v) => sum + (v.total_minutes || 0), 0);
    const tierBefore = visits.map((v) => v.tier).join(',');

    const logPayload = {
        userInput,
        phrase_result: phraseResult,
        phrase_quantities: quantityByJob,
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
        minutes_after: minutesBefore,
        tier_before: tierBefore,
        tier_after: tierBefore,
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
        jobDetails,
        capabilities,
        quantities: quantityByJob,
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

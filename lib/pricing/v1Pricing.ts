import { GeneratedVisit } from './visitEngine';
import { runExtractionPipeline } from './extractionEngine';
import { matchesExtendedOutOfScope, matchesKeywordOutOfScope } from './bookingGuards';
import { computeBookingRouting, REVIEW_QUOTE_MESSAGE } from './bookingRouter';
import type { BookingMappingMeta, BookingRouting } from './bookingRoutingTypes';
import { persistBookingPipelineLog } from './bookingPipelineLog';

export interface V1PricingResult {
    visits: GeneratedVisit[];
    totalPrice: number;
    confidence: number;
    primaryCategory: string;
    warnings: string[];
    isOutOfScope?: boolean;
    suggestedServices?: string[];
    clarifiers?: any[];
    /** Human-readable detail when visits are empty (clarify / commercial / partial). */
    clarifyMessage?: string;
    /** Hybrid booking: fixed matrix vs review/quote vs reject. */
    routing: BookingRouting;
    confidenceLevel: 'HIGH' | 'LOW';
    /** Mapping statistics (set when extraction ran with at least one job). */
    mappingMeta?: BookingMappingMeta | null;
    /** True when customer may submit a review/quote request (not out of scope). */
    canSubmitQuoteRequest: boolean;
    /** Detected job_item_ids after classification (matrix or legacy). */
    finalJobs?: string[];
    /** Quantity per job_item_id from extraction / matrix. */
    quantitiesByJob?: Record<string, number>;
    /** Which pricing path produced this result. */
    pipeline?: 'MATRIX_V2' | 'LEGACY';
    /** MATRIX V2 merged clarifier answers (text + user) used for pricing. */
    clarifier_answers?: Record<string, string | number>;
    /** MATRIX V2 text-only hydration snapshot. */
    clarifier_hydration?: Record<string, string | number>;
}

function applyRoutingToPublicPricing(pricing: V1PricingResult, routing: BookingRouting): V1PricingResult {
    if (routing === 'FIXED_PRICE' || routing === 'REJECT') {
        return pricing;
    }
    return {
        ...pricing,
        visits: [],
        totalPrice: 0,
        confidence: 0,
        clarifyMessage: pricing.clarifyMessage || REVIEW_QUOTE_MESSAGE,
    };
}

// Supported service categories for suggestions
const SUPPORTED_SERVICES = [
    'Plumbing', 'Electrical', 'Handyman', 'Cleaning',
    'Painting', 'TV Mounting', 'Carpentry', 'General Repairs'
];

export interface CalculateV1PricingOptions {
    clarifierAnswers?: Record<string, unknown>;
}

async function finalizePipelineLog(
    description: string,
    extraction: Awaited<ReturnType<typeof runExtractionPipeline>> | undefined,
    pricing: V1PricingResult,
): Promise<V1PricingResult> {
    await persistBookingPipelineLog({ description, extraction, result: pricing });
    return pricing;
}

export async function calculateV1Pricing(
    description: string,
    options?: CalculateV1PricingOptions,
): Promise<V1PricingResult> {
    const lower = description.toLowerCase();

    // 1. Out-of-scope: phrase list + heuristics (no naive single-substring "tax" / "class" / "pet" matching).
    const isOutOfScope = matchesKeywordOutOfScope(lower) || matchesExtendedOutOfScope(lower);

    if (isOutOfScope) {
        return finalizePipelineLog(description, undefined, {
            visits: [],
            totalPrice: 0,
            confidence: 0,
            primaryCategory: 'HANDYMAN',
            warnings: ['OUT_OF_SCOPE'],
            isOutOfScope: true,
            suggestedServices: SUPPORTED_SERVICES,
            clarifyMessage:
                'This looks outside the home handyman, installation, and cleaning work we can price in the app. Submit a review request and we will get back with a quote, or change your request to a specific task.',
            routing: 'REVIEW_QUOTE',
            confidenceLevel: 'LOW',
            mappingMeta: null,
            canSubmitQuoteRequest: true,
            finalJobs: [],
            quantitiesByJob: {},
            pipeline: 'LEGACY',
        });
    }

    // 2. Extraction Pipeline:
    // userInput -> GPT-4o extraction -> validated job_item_ids -> fallback deterministic parser
    const extraction = await runExtractionPipeline(description, {
        clarifierAnswers: options?.clarifierAnswers,
    });

    if (extraction.jobs.length === 0) {
        const fromPipeline = extraction.warnings?.length ? extraction.warnings : ['NEEDS_CLARIFICATION'];
        const qb = extraction.mappingMeta?.quantityByJob ?? extraction.quantities ?? {};
        const pipelineFlag =
            extraction.pipeline ?? (extraction.mappingMeta?.matrixV2 ? ('MATRIX_V2' as const) : ('LEGACY' as const));
        const base: V1PricingResult = {
            visits: [],
            totalPrice: 0,
            confidence: 0,
            primaryCategory: 'HANDYMAN',
            warnings: fromPipeline,
            isOutOfScope: false,
            suggestedServices: SUPPORTED_SERVICES,
            clarifiers: extraction.clarifiers,
            clarifyMessage: extraction.message || REVIEW_QUOTE_MESSAGE,
            routing: 'REVIEW_QUOTE',
            confidenceLevel: 'LOW',
            mappingMeta: extraction.mappingMeta ?? null,
            canSubmitQuoteRequest: true,
            finalJobs: Object.keys(qb),
            quantitiesByJob: qb,
            pipeline: pipelineFlag,
            clarifier_answers: extraction.clarifier_answers ?? extraction.mappingMeta?.clarifierAnswers,
            clarifier_hydration: extraction.clarifier_hydration ?? extraction.mappingMeta?.clarifierHydration,
        };
        return finalizePipelineLog(description, extraction, base);
    }

    // 3. Build Visits (Capability-aware split for labels/tasks)
    // Backend extraction pipeline already computes the final display price after
    // quantity scaling + complexity escalation + tier resolution.
    const totalPrice = Number(extraction.price ?? 0);
    const visits = extraction.visits.map((visit) => ({
        ...visit,
        // Keep visit/task structure, but ensure single-visit previews render
        // the same backend-final price shown in extraction/admin logs.
        price: extraction.visits.length === 1 ? totalPrice : visit.price,
    }));

    // Determination of Primary Category
    let primaryCategory = 'HANDYMAN';
    if (visits.length > 0) {
        const first = visits[0];
        if (first.required_capability_tags.includes('PLUMBING')) primaryCategory = 'PLUMBER';
        else if (first.required_capability_tags.includes('ELECTRICAL')) primaryCategory = 'ELECTRICIAN';
        else if (first.item_class === 'CLEANING') primaryCategory = 'CLEANING';
        else if (first.item_class === 'SPECIALIST') primaryCategory = 'SPECIALIST';
    }

    // 5. Clarifier Binding (Excel-Driven) + hybrid routing
    const mergedWarnings = [...(extraction.warnings ?? [])].filter(Boolean);
    const quantitiesByJob = extraction.mappingMeta?.quantityByJob ?? extraction.quantities ?? {};
    const pipelineFlag =
        extraction.pipeline ?? (extraction.mappingMeta?.matrixV2 ? ('MATRIX_V2' as const) : ('LEGACY' as const));
    const raw: V1PricingResult = {
        visits,
        totalPrice,
        confidence: extraction.jobs.length > 0 ? 1 : 0,
        primaryCategory,
        warnings: mergedWarnings,
        clarifiers: extraction.clarifiers,
        mappingMeta: extraction.mappingMeta ?? null,
        routing: 'FIXED_PRICE',
        confidenceLevel: 'HIGH',
        canSubmitQuoteRequest: true,
        finalJobs: [...extraction.jobs],
        quantitiesByJob,
        pipeline: pipelineFlag,
        clarifier_answers: extraction.clarifier_answers ?? extraction.mappingMeta?.clarifierAnswers,
        clarifier_hydration: extraction.clarifier_hydration ?? extraction.mappingMeta?.clarifierHydration,
    };

    const { routing, confidenceLevel, reviewMessage } = computeBookingRouting(raw, extraction.mappingMeta ?? null);
    raw.routing = routing;
    raw.confidenceLevel = confidenceLevel;
    if (reviewMessage && (routing === 'REVIEW_QUOTE' || !raw.clarifyMessage)) {
        raw.clarifyMessage = reviewMessage;
    }
    return finalizePipelineLog(description, extraction, applyRoutingToPublicPricing(raw, routing));
}

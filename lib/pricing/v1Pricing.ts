import { GeneratedVisit } from './visitEngine';
import { runExtractionPipeline } from './extractionEngine';
import { matchesExtendedOutOfScope, matchesKeywordOutOfScope } from './bookingGuards';
import { computeBookingRouting, REVIEW_QUOTE_MESSAGE } from './bookingRouter';
import type { BookingMappingMeta, BookingRouting } from './bookingRoutingTypes';

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

export async function calculateV1Pricing(description: string): Promise<V1PricingResult> {
    const lower = description.toLowerCase();

    // 1. Out-of-scope: phrase list + heuristics (no naive single-substring "tax" / "class" / "pet" matching).
    const isOutOfScope = matchesKeywordOutOfScope(lower) || matchesExtendedOutOfScope(lower);

    if (isOutOfScope) {
        return {
            visits: [],
            totalPrice: 0,
            confidence: 0,
            primaryCategory: 'HANDYMAN',
            warnings: ['OUT_OF_SCOPE'],
            isOutOfScope: true,
            suggestedServices: SUPPORTED_SERVICES,
            clarifyMessage:
                'This looks outside the home handyman, installation, and cleaning work we can price in the app. For anything else, contact us for a custom quote or change the request to a specific task (e.g. fix a tap, mount a TV, clean a flat).',
            routing: 'REJECT',
            confidenceLevel: 'LOW',
            mappingMeta: null,
            canSubmitQuoteRequest: false,
        };
    }

    // 2. Extraction Pipeline:
    // userInput -> GPT-4o extraction -> validated job_item_ids -> fallback deterministic parser
    const extraction = await runExtractionPipeline(description);

    if (extraction.jobs.length === 0) {
        const fromPipeline = extraction.warnings?.length ? extraction.warnings : ['NEEDS_CLARIFICATION'];
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
        };
        return base;
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
    };

    const { routing, confidenceLevel, reviewMessage } = computeBookingRouting(raw, extraction.mappingMeta ?? null);
    raw.routing = routing;
    raw.confidenceLevel = confidenceLevel;
    if (reviewMessage && (routing === 'REVIEW_QUOTE' || !raw.clarifyMessage)) {
        raw.clarifyMessage = reviewMessage;
    }
    return applyRoutingToPublicPricing(raw, routing);
}

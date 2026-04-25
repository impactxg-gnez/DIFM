import type { BookingMappingMeta, BookingRouting } from './bookingRoutingTypes';

export type { BookingRouting, BookingMappingMeta } from './bookingRoutingTypes';

export const REVIEW_QUOTE_MESSAGE =
    "We'll review your request and get back to you with a confirmed quote.";

/**
 * Core hybrid routing: fixed matrix price only when confidence is high; otherwise
 * customer sees review/quote path (no displayed price). Out-of-scope rejects.
 */
export function computeBookingRouting(
    pricing: {
        isOutOfScope?: boolean;
        warnings?: string[];
        visits: unknown[];
        totalPrice: number;
    },
    meta: BookingMappingMeta | null,
): { routing: BookingRouting; confidenceLevel: 'HIGH' | 'LOW'; reviewMessage?: string } {
    if (pricing.isOutOfScope) {
        return { routing: 'REJECT', confidenceLevel: 'LOW' };
    }

    const warnings = pricing.warnings ?? [];
    const hasVisits = Array.isArray(pricing.visits) && pricing.visits.length > 0;
    const total = Number(pricing.totalPrice);
    const hasPrice = Number.isFinite(total) && total > 0;

    const forcedLowByWarning = warnings.some((w) =>
        [
            'NEEDS_CLARIFICATION',
            'COMMERCIAL_QUOTE_REQUIRED',
            'CONTRADICTION_CLARIFY',
            'PARTIAL_PARSE_CLARIFY',
        ].includes(w),
    );

    if (!hasVisits || !hasPrice || forcedLowByWarning || !meta) {
        return {
            routing: 'REVIEW_QUOTE',
            confidenceLevel: 'LOW',
            reviewMessage: REVIEW_QUOTE_MESSAGE,
        };
    }

    const multiService = meta.distinctRuleJobCount >= 2;
    const lowMapping = !meta.allResolutionSpecific || meta.usedGenericFallback;

    if (multiService || lowMapping) {
        return {
            routing: 'REVIEW_QUOTE',
            confidenceLevel: 'LOW',
            reviewMessage: REVIEW_QUOTE_MESSAGE,
        };
    }

    return { routing: 'FIXED_PRICE', confidenceLevel: 'HIGH' };
}

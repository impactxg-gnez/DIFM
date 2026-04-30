import type { V1PricingResult } from './v1Pricing';

/**
 * Warnings that mean we must not persist a PRICED job with matrix pricing.
 * Kept in sync with booking UI (e.g. HomeSearchInterface BOOKING_BLOCK_WARNINGS).
 */
export const V1_PRICING_BLOCK_WARNINGS = new Set<string>([
    'OUT_OF_SCOPE',
    'NEEDS_CLARIFICATION',
    'COMMERCIAL_QUOTE_REQUIRED',
    'BUNDLE_COMPLEX_QUOTE_REQUIRED',
    'CONTRADICTION_CLARIFY',
    'PARTIAL_PARSE_CLARIFY',
]);

/**
 * True when the customer may proceed to a visit-backed booking at the quoted matrix price (high-confidence path only).
 */
export function isV1PricingBookable(pricing: V1PricingResult): boolean {
    if (pricing.isOutOfScope) return false;
    if (pricing.routing !== 'FIXED_PRICE') return false;
    const warnings = pricing.warnings ?? [];
    if (warnings.some((w) => V1_PRICING_BLOCK_WARNINGS.has(w))) return false;
    if (!Array.isArray(pricing.visits) || pricing.visits.length === 0) return false;
    const total = Number(pricing.totalPrice);
    if (!Number.isFinite(total) || total <= 0) return false;
    return true;
}

export interface V1JobCreateRejection {
    code: string;
    message: string;
    warnings: string[];
    clarifyMessage?: string;
    /** When true, client should use review/quote submission instead of a dead end. */
    useQuoteFlow?: boolean;
}

export function getV1JobCreateRejection(pricing: V1PricingResult): V1JobCreateRejection {
    if (isV1PricingBookable(pricing)) {
        throw new Error('getV1JobCreateRejection: pricing is bookable');
    }
    const warnings = pricing.warnings ?? [];
    if (pricing.isOutOfScope) {
        return {
            code: 'OUT_OF_SCOPE',
            message:
                pricing.clarifyMessage ||
                'This request needs a manual review. Submit the details so we can get back with a quote.',
            warnings,
            clarifyMessage: pricing.clarifyMessage,
            useQuoteFlow: true,
        };
    }
    if (warnings.includes('COMMERCIAL_QUOTE_REQUIRED')) {
        return {
            code: 'COMMERCIAL_QUOTE_REQUIRED',
            message: pricing.clarifyMessage || 'This job is outside standard residential instant pricing. Please request a custom quote.',
            warnings,
            clarifyMessage: pricing.clarifyMessage,
            useQuoteFlow: true,
        };
    }
    if (warnings.includes('CONTRADICTION_CLARIFY')) {
        return {
            code: 'CONTRADICTION_CLARIFY',
            message: pricing.clarifyMessage || 'Please resolve conflicting details before booking.',
            warnings,
            clarifyMessage: pricing.clarifyMessage,
            useQuoteFlow: true,
        };
    }
    if (warnings.includes('PARTIAL_PARSE_CLARIFY')) {
        return {
            code: 'PARTIAL_PARSE_CLARIFY',
            message: pricing.clarifyMessage || 'We only understood part of the request. Add detail for the missing tasks.',
            warnings,
            clarifyMessage: pricing.clarifyMessage,
            useQuoteFlow: true,
        };
    }
    if (pricing.routing === 'REVIEW_QUOTE') {
        return {
            code: 'REVIEW_QUOTE_REQUIRED',
            message:
                pricing.clarifyMessage ||
                'We will review your request and follow up with a confirmed quote. Submit the details to continue.',
            warnings,
            clarifyMessage: pricing.clarifyMessage,
            useQuoteFlow: true,
        };
    }
    return {
        code: 'NEEDS_CLARIFICATION',
        message: pricing.clarifyMessage || 'Add a clearer task description so we can price it accurately.',
        warnings,
        clarifyMessage: pricing.clarifyMessage,
        useQuoteFlow: true,
    };
}

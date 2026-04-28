import type { BookingMappingMeta, BookingRouting } from './bookingRoutingTypes';
import { isComplexBundle } from './bundleRouting';

export type { BookingRouting, BookingMappingMeta } from './bookingRoutingTypes';

export const REVIEW_QUOTE_MESSAGE =
    "We'll review your request and get back to you with a confirmed quote.";

/** Warnings that always block fixed matrix price (defence in depth with confidence layer). */
export const REVIEW_ONLY_WARNINGS = new Set([
    'NEEDS_CLARIFICATION',
    'COMMERCIAL_QUOTE_REQUIRED',
    'CONTRADICTION_CLARIFY',
    'PARTIAL_PARSE_CLARIFY',
    'BUNDLE_COMPLEX_QUOTE_REQUIRED',
]);

/**
 * Residential bulk thresholds — above these ⇒ review / quote only (no matrix price).
 */
export function exceedsResidentialQuantityLimits(quantityByJob: Record<string, number>): boolean {
    for (const [jobId, rawQty] of Object.entries(quantityByJob)) {
        const qty = Number(rawQty);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        const id = jobId.toLowerCase();

        if (
            (id.includes('tv_mount') ||
                id.includes('mount_tv') ||
                id.includes('install_wall_tv')) &&
            qty > 3
        ) {
            return true;
        }
        if ((id.includes('shelf') || id.includes('shelves')) && qty > 10) {
            return true;
        }
        if (
            (id.includes('furniture') ||
                id.includes('flatpack') ||
                id.includes('assemble') ||
                id.includes('wardrobe') ||
                id.includes('desk')) &&
            qty > 5
        ) {
            return true;
        }
    }
    return false;
}

export type ConfidenceEvaluation = {
    routing: BookingRouting;
    confidenceLevel: 'HIGH' | 'LOW';
    reviewMessage?: string;
    warnings: string[];
};

/**
 * Classification → confidence → routing. Call BEFORE attaching tier/pricing to visits.
 */
export function evaluateBookingConfidence(meta: BookingMappingMeta | null): ConfidenceEvaluation {
    if (!meta) {
        return {
            routing: 'REVIEW_QUOTE',
            confidenceLevel: 'LOW',
            reviewMessage: REVIEW_QUOTE_MESSAGE,
            warnings: [],
        };
    }

    const qtyMap = meta.quantityByJob || {};

    const warnings: string[] = [];

    if (exceedsResidentialQuantityLimits(qtyMap)) {
        warnings.push('COMMERCIAL_QUOTE_REQUIRED');
    }

    const lowConfidence = !meta.allResolutionSpecific || meta.usedGenericFallback;
    if (lowConfidence) {
        warnings.push('NEEDS_CLARIFICATION');
    }

    /** Multi-job alone does not force review — only complex bundles (multi-trade or high effort). */
    const bundleNeedsReview = isComplexBundle(meta);
    if (bundleNeedsReview) {
        warnings.push('BUNDLE_COMPLEX_QUOTE_REQUIRED');
    }

    const forceReview =
        exceedsResidentialQuantityLimits(qtyMap) || lowConfidence || bundleNeedsReview;

    if (forceReview) {
        return {
            routing: 'REVIEW_QUOTE',
            confidenceLevel: 'LOW',
            reviewMessage: REVIEW_QUOTE_MESSAGE,
            warnings: [...new Set(warnings)],
        };
    }

    return { routing: 'FIXED_PRICE', confidenceLevel: 'HIGH', warnings: [] };
}

/**
 * Final routing after extraction pricing payload exists — merges extraction warnings + confidence.
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

    const extractionWarnings = pricing.warnings ?? [];
    const forcedLowByWarning = extractionWarnings.some((w) => REVIEW_ONLY_WARNINGS.has(w));

    const conf = evaluateBookingConfidence(meta);
    if (conf.routing !== 'FIXED_PRICE') {
        return {
            routing: 'REVIEW_QUOTE',
            confidenceLevel: 'LOW',
            reviewMessage: conf.reviewMessage ?? REVIEW_QUOTE_MESSAGE,
        };
    }

    const hasVisits = Array.isArray(pricing.visits) && pricing.visits.length > 0;
    const total = Number(pricing.totalPrice);
    const hasPrice = Number.isFinite(total) && total > 0;

    if (!meta || !hasVisits || !hasPrice || forcedLowByWarning) {
        return {
            routing: 'REVIEW_QUOTE',
            confidenceLevel: 'LOW',
            reviewMessage: REVIEW_QUOTE_MESSAGE,
        };
    }

    return { routing: 'FIXED_PRICE', confidenceLevel: 'HIGH' };
}

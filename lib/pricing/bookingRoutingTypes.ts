export type BookingRouting = 'FIXED_PRICE' | 'REVIEW_QUOTE' | 'REJECT';

export interface BookingMappingMeta {
    distinctRuleJobCount: number;
    allResolutionSpecific: boolean;
    usedGenericFallback: boolean;
    partClauseCount: number;
    /** Distinct matrix pricing job IDs in this request (>1 ⇒ multi-job, review-only). */
    distinctPricingJobCount: number;
    /** Per job_item_id aggregated quantity — used for commercial / bulk thresholds. */
    quantityByJob: Record<string, number>;
}

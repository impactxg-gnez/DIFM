export type BookingRouting = 'FIXED_PRICE' | 'REVIEW_QUOTE' | 'REJECT';

export interface BookingMappingMeta {
    distinctRuleJobCount: number;
    allResolutionSpecific: boolean;
    usedGenericFallback: boolean;
    partClauseCount: number;
    /** Distinct matrix pricing job IDs in this request. */
    distinctPricingJobCount: number;
    /** Per job_item_id aggregated quantity — used for commercial / bulk thresholds. */
    quantityByJob: Record<string, number>;
    /** Sum of task minutes + multi-job overhead (same formula as tier pricing). */
    estimatedTotalMinutes: number;
    /** Distinct routing buckets (trade/category); >1 ⇒ cross-trade bundle. */
    distinctRoutingBucketCount: number;
    /** When set, V2 matrix routing overrides legacy confidence gates. */
    matrixV2?: {
        routing: 'FIXED_PRICE' | 'REVIEW_QUOTE';
        reviewReason?: string;
    };
}

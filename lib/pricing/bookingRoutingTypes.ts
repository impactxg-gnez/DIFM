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
        /** Parser telemetry (phrase vs keyword resolution, entities, logs). */
        parser?: MatrixV2ParserTrace;
    };
    /** MATRIX V2: merged clarifier answers used for pricing (user + text hydration). */
    clarifierAnswers?: Record<string, string | number>;
    /** MATRIX V2: values inferred only from raw text before user edits. */
    clarifierHydration?: Record<string, string | number>;
}

/** Matrix V2 flexible parser audit fields (persisted in BOOKING_PIPELINE logs). */
export interface MatrixV2ParserTrace {
    normalized_input: string;
    flexible_match_text: string;
    phrase_job_ids: string[];
    phrase_job_ids_flex: string[];
    keyword_job_ids: string[];
    keywords_matched: string[];
    merged_job_ids: string[];
    resolution: 'phrase' | 'phrase_flex' | 'keyword' | 'phrase+keyword' | 'mixed' | 'none';
    entities: Record<string, string | number>;
}

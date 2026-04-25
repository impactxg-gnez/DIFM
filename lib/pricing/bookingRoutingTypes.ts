export type BookingRouting = 'FIXED_PRICE' | 'REVIEW_QUOTE' | 'REJECT';

export interface BookingMappingMeta {
    distinctRuleJobCount: number;
    allResolutionSpecific: boolean;
    usedGenericFallback: boolean;
    partClauseCount: number;
}

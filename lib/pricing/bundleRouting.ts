import { excelSource } from './excelLoader';
import type { BookingMappingMeta } from './bookingRoutingTypes';

/** Multi-job bundles at or below this total estimated time can stay on fixed pricing if single trade bucket. */
export const SIMPLE_BUNDLE_MAX_TOTAL_MINUTES = 240;

/**
 * Trade / routing bucket for cross-category detection (simple = one bucket).
 */
export function routingBucketForJobItem(jobItemId: string): string {
    const item = excelSource.jobItems.get(jobItemId);
    const id = jobItemId.toLowerCase();
    const cap = (item?.capability_tag || '').toUpperCase();

    if (/CLEAN|CVAC|CARPET|OVEN\s*CLEAN/.test(cap) || /clean|carpet|oven\s+clean|deep\s+clean/.test(id)) {
        return 'CLEANING';
    }

    if (
        /PLUMB|DRAIN|PIPE|TOILET|TAP|SINK|BOILER|RADIATOR|BATH/.test(cap) ||
        /plumb|leak|tap|sink|toilet|drain|pipe|boiler|radiator/.test(id)
    ) {
        return 'PLUMBING';
    }
    if (
        /ELECTRIC|SOCKET|LIGHT|WIRING|FUSE|CIRCUIT/.test(cap) ||
        /socket|lighting|electric|rewire|circuit/.test(id)
    ) {
        return 'ELECTRICAL';
    }
    if (/PEST/.test(cap) || /pest/.test(id)) return 'PEST';
    if (/PAINT|DECOR|WALLPAPER/.test(cap) || /paint|decor|wallpaper/.test(id)) return 'PAINTING';
    if (/APPLIANCE|OVEN|DISHWASHER|WASHER|FRIDGE/.test(cap) || /appliance|washer|dishwasher|oven/.test(id)) {
        return 'APPLIANCE';
    }

    return 'HANDYMAN';
}

function normalizeRoutingBucket(bucket: string): string {
    const b = bucket.trim();
    if (!b || b === 'UNKNOWN') return 'HANDYMAN';
    return b;
}

/**
 * Estimated wall-clock effort (matches extraction tier aggregation) + distinct trade buckets.
 */
export function computeBundleSignals(
    pricingJobIds: string[],
    adjustedMinutesByCanonicalJob: Record<string, number>,
    canonicalDistinctCount: number,
): { estimatedTotalMinutes: number; distinctRoutingBucketCount: number } {
    const summedMinutes = Object.values(adjustedMinutesByCanonicalJob).reduce((sum, minutes) => sum + minutes, 0);
    const multiJobOverhead = Math.max(0, canonicalDistinctCount - 1) * 10;
    const estimatedTotalMinutes = summedMinutes + multiJobOverhead;

    const buckets = new Set<string>();
    for (const jid of pricingJobIds) {
        buckets.add(normalizeRoutingBucket(routingBucketForJobItem(jid)));
    }
    const distinctRoutingBucketCount = Math.max(buckets.size, 1);

    return { estimatedTotalMinutes, distinctRoutingBucketCount };
}

/**
 * Complex bundle ⇒ review/quote only: multi-trade mix, excessive combined time, etc.
 * NOT triggered solely by job count — same-category residential bundles can stay fixed.
 */
export function isComplexBundle(meta: BookingMappingMeta): boolean {
    const qtyMap = meta.quantityByJob || {};
    const distinctPricing =
        typeof meta.distinctPricingJobCount === 'number'
            ? meta.distinctPricingJobCount
            : Object.keys(qtyMap).length;

    const multiJob = distinctPricing > 1 || meta.distinctRuleJobCount >= 2;
    if (!multiJob) return false;

    const buckets = meta.distinctRoutingBucketCount ?? 1;
    if (buckets > 1) return true;

    const mins = typeof meta.estimatedTotalMinutes === 'number' ? meta.estimatedTotalMinutes : 0;
    if (mins > SIMPLE_BUNDLE_MAX_TOTAL_MINUTES) return true;

    return false;
}

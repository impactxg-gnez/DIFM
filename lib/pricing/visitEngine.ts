import { excelSource, JobItemExcel } from './excelLoader';

// Tiers and Prices are now loaded from Excel at runtime.

// V1 Quote Contract (Visit is the primary unit)
export interface GeneratedVisit {
    // visit_id is assigned when persisted; for quote generation we keep it empty.
    visit_id: string;
    item_class: "STANDARD" | "CLEANING" | "SPECIALIST";
    visit_type_label: string; // e.g. "Cleaning", "Handyman", "Plumbing"
    primary_job_item: {
        job_item_id: string;
        display_name: string;
        time_weight_minutes: number;
    };
    addon_job_items: Array<{
        job_item_id: string;
        display_name: string;
        time_weight_minutes: number;
    }>;
    required_capability_tags: string[];
    total_minutes: number;
    tier: "H1" | "H2" | "H3";
    price: number;
    // Track individual item prices for accurate summing when bundling
    item_prices?: number[]; // Prices for each item (primary + addons)
    clarifiers?: Array<{
        id: string;
        question: string;
        inputType: 'number' | 'select' | 'boolean' | 'text';
        required: boolean;
        options?: string[];
        impacts?: string;
        capability_tag?: string;
        affects_time?: boolean;
        affects_safety?: boolean;
        clarifier_type?: 'PRICING' | 'SAFETY';
    }>;
    detected_tasks?: string[];
}

export function calculateTierAndPrice(minutes: number, ladder: string): { tier: string, price: number } {
    const tiers = excelSource.pricingTiers.get(ladder) || [];
    // Tiers are sorted by max_minutes ascending in excelSource
    const matchedTier = tiers.find(t => minutes <= t.max_minutes) || tiers[tiers.length - 1];

    if (!matchedTier) {
        return { tier: 'UNK', price: 0 };
    }

    return {
        tier: matchedTier.tier,
        price: matchedTier.price_gbp
    };
}

export function getPriceByTier(tier: string, ladder: string): number {
    const tiers = excelSource.pricingTiers.get(ladder) || [];
    const matched = tiers.find(t => t.tier === tier);
    return matched ? matched.price_gbp : 0;
}

interface MatrixTimedItem {
    item: JobItemExcel;
    quantity: number;
    matrixBaseTime: number;
    finalBaseTimeUsed: number;
}

export function getMatrixTime(jobItemId: string): number {
    const item = excelSource.jobItems.get(jobItemId);
    return Number(item?.default_time_weight_minutes || 0);
}

function getExpectedUpperBoundForCapability(capability: string, ladder: string): number {
    const tiers = excelSource.pricingTiers.get(ladder) || [];
    if (tiers.length === 0) return Number.MAX_SAFE_INTEGER;
    return tiers.reduce((max, tier) => Math.max(max, Number(tier.max_minutes || 0)), 0);
}

function inferVisitTypeLabel(itemClass: GeneratedVisit['item_class'], capabilityTags: string[]): string {
    if (itemClass === 'CLEANING') return 'Cleaning';
    if (itemClass === 'SPECIALIST') {
        // If we have more specific tags, prefer those.
        if (capabilityTags.includes('PLUMBING')) return 'Plumbing';
        if (capabilityTags.includes('ELECTRICAL')) return 'Electrical';
        if (capabilityTags.includes('PAINTER')) return 'Painting';
        return 'Specialist';
    }
    // STANDARD (default)
    if (capabilityTags.includes('PLUMBING')) return 'Plumbing';
    if (capabilityTags.includes('ELECTRICAL')) return 'Electrical';
    if (capabilityTags.includes('PAINTER')) return 'Painting';
    return 'Handyman';
}

/**
 * Core Algorithm: V1 Baseline Visit Generation (Excel-Driven)
 * 1. Group items by capability_tag.
 * 2. For each capability group:
 *    - Sum default_time_weight_minutes.
 *    - Recalculate Tier and Price from the Pricing_Tiers Excel tab.
 * 3. Return 1 visit per capability.
 */
export function buildVisits(itemIds: string[]): GeneratedVisit[] {
    return buildVisitsWithQuantities(itemIds, {});
}

export function buildVisitsWithQuantities(itemIds: string[], quantities: Record<string, number>): GeneratedVisit[] {
    const visits: GeneratedVisit[] = [];

    // Map IDs to matrix-backed time rows with explicit quantity multiplication.
    const uniqueIds = [...new Set(itemIds)];
    const items = uniqueIds
        .map((id) => {
            const item = excelSource.jobItems.get(id);
            if (!item) return null;
            const quantity = Math.max(1, Number(quantities[id] || 1));
            const matrixBaseTime = getMatrixTime(id);
            const finalBaseTimeUsed = matrixBaseTime * quantity;
            const expectedUpperBound = getExpectedUpperBoundForCapability(item.capability_tag || 'HANDYMAN', item.pricing_ladder || item.capability_tag || 'HANDYMAN');

            if (finalBaseTimeUsed > expectedUpperBound) {
                console.error('[BASE_TIME_INFLATED]', {
                    capability: id,
                    matrix_base_time: matrixBaseTime,
                    final_base_time_used: finalBaseTimeUsed,
                    expected_upper_bound_for_capability: expectedUpperBound
                });
            }

            console.log('[BaseTimeTrace]', {
                capability: id,
                matrix_base_time: matrixBaseTime,
                final_base_time_used: finalBaseTimeUsed
            });

            console.log('[PricingJobTrace]', {
                capability: id,
                matrix_base_time: matrixBaseTime,
                quantity,
                clarifier_time: 0,
                buffer_time: 0,
                final_time: finalBaseTimeUsed
            });

            return {
                item,
                quantity,
                matrixBaseTime,
                finalBaseTimeUsed
            };
        })
        .filter((i): i is MatrixTimedItem => !!i);

    // Group by capability_tag
    const groups: Record<string, MatrixTimedItem[]> = {};

    for (const timedItem of items) {
        const tag = timedItem.item.capability_tag || 'HANDYMAN';
        if (!groups[tag]) groups[tag] = [];
        groups[tag].push(timedItem);
    }

    for (const [tag, groupItems] of Object.entries(groups)) {
        const totalMinutes = groupItems.reduce((sum, i) => sum + i.finalBaseTimeUsed, 0);

        // Lookup ladder from first item (they should all share same ladder if same capability)
        const ladder = groupItems[0].item.pricing_ladder || tag;
        const { tier, price } = calculateTierAndPrice(totalMinutes, ladder);

        visits.push(createGroupVisit(tag, groupItems, totalMinutes, tier, price));
    }

    return visits;
}

function createGroupVisit(capability: string, items: MatrixTimedItem[], minutes: number, tier: string, price: number): GeneratedVisit {
    const primary = items[0];

    // Infer class
    let itemClass: GeneratedVisit['item_class'] = "STANDARD";
    if (capability === 'CLEANING') itemClass = "CLEANING";
    else if (['PLUMBING', 'ELECTRICAL', 'PAINTER'].includes(capability)) itemClass = "SPECIALIST";

    const visitTypeLabel = inferVisitTypeLabel(itemClass, [capability]);

    return {
        visit_id: '',
        item_class: itemClass,
        visit_type_label: visitTypeLabel,
        primary_job_item: {
            job_item_id: primary.item.job_item_id,
            display_name: primary.quantity > 1 ? `${primary.item.display_name} x${primary.quantity}` : primary.item.display_name,
            time_weight_minutes: primary.finalBaseTimeUsed,
        },
        addon_job_items: items.slice(1).map(i => ({
            job_item_id: i.item.job_item_id,
            display_name: i.quantity > 1 ? `${i.item.display_name} x${i.quantity}` : i.item.display_name,
            time_weight_minutes: i.finalBaseTimeUsed,
        })),
        required_capability_tags: [capability],
        total_minutes: minutes,
        tier: tier as any,
        price: price,
        item_prices: [price],
    };
}

// Greedy packing logic removed in favor of capability-aware summation per spec.

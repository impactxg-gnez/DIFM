import { CatalogueItem } from './catalogue';

// Tiers per spec
export const TIER_THRESHOLDS = {
    H1: 45,
    H2: 90,
    H3: 150,
};

// Default pricing for V1 (Founder controlled, but these are fallbacks or engine defaults)
// Real price should likely come from Matrix or catalogue sums?
// Spec says: "Visit-based pricing engine using H1/H2/H3 tiers sized by summed minutes."
// And "Pricing Catalogue... time_weight_minutes... only sizing input".
// "Rule: Tier is chosen by sum(time_weight_minutes)..."
// Price values per tier:
// H1: Fixed Price (e.g. £X)
// H2: Fixed Price (e.g. £Y)
// H3: Fixed Price (e.g. £Z)
// The spec assumes a fixed price per tier. I'll define them here or fetch from a PricingMatrix if it exists.
// I'll stick to fixed constants for now matching the existing matrix logic or defaults.

export const TIER_PRICES: Record<string, number> = {
    H1: 60,
    H2: 90,
    H3: 130,
    // Cleaning Tiers from Matrix
    C1: 69,
    C2: 119,
    C3: 199,
};

export const TIER_ITEM_CAPS: Record<string, number> = {
    // Allow bundling of similar tasks (e.g., "hang mirror" + "hang picture") into single visit
    // Costs are summed (e.g., 60 + 60 = 120) rather than recalculated by tier
    // Increased limits to allow better bundling while respecting time constraints
    H1: 4,  // Allow up to 4 items in H1 visit (if time allows)
    H2: 6,  // Allow up to 6 items in H2 visit
    H3: 10, // Allow up to 10 items in H3 visit (150 min max still applies)
};

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
}

export function calculateTier(minutes: number): string {
    if (minutes <= TIER_THRESHOLDS.H1) return 'H1';
    if (minutes <= TIER_THRESHOLDS.H2) return 'H2';
    if (minutes <= TIER_THRESHOLDS.H3) return 'H3';
    return 'H3'; // For V1, cap at H3 or overflow logic
}

export function calculatePrice(tier: string, itemClass: string): number {
    // If CLEANING and tier is Hx, we might want to map to Cx? 
    // In V1, we'll explicitly pass the correct tier (H or C) from the scope lock logic.
    return TIER_PRICES[tier] || 0;
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
 * Core Algorithm: V1 Baseline Visit Generation
 * 1. Group items by capability_tag.
 * 2. For each capability group:
 *    - Sum default_minutes.
 *    - Recalculate Tier and Price once for the group.
 * 3. Return separate visits for each capability.
 */
export function buildVisits(items: CatalogueItem[]): GeneratedVisit[] {
    const visits: GeneratedVisit[] = [];

    // Group by capability_tag
    const groups: Record<string, CatalogueItem[]> = {};

    for (const item of items) {
        const tag = item.capability_tag || 'HANDYMAN';
        if (!groups[tag]) groups[tag] = [];
        groups[tag].push(item);
    }

    for (const [tag, groupItems] of Object.entries(groups)) {
        // Special classes still handled separately within their capability visit if needed,
        // but spec implies grouping by tag.

        // If it's CLEANING or SPECIALIST, we might still want isolated visits, 
        // but the spec says "Capability grouping" + "Minute summation before tiering".
        // I'll follow the spec strictly: sum per capability.

        const totalMinutes = groupItems.reduce((sum, i) => sum + (i.default_minutes || i.time_weight_minutes), 0);

        // Split if totalMinutes > 150? The spec doesn't explicitly mention splitting large bundles,
        // but usually we don't want a single visit > 150m.
        // However, "Tier AFTER Summation" implies one price for the bunch.

        if (totalMinutes > TIER_THRESHOLDS.H3) {
            // Split into multiple visits of the same capability
            const numVisits = Math.ceil(totalMinutes / TIER_THRESHOLDS.H3);
            const minsPerVisit = Math.floor(totalMinutes / numVisits);

            for (let i = 0; i < numVisits; i++) {
                const currentMins = i === numVisits - 1 ? totalMinutes - (minsPerVisit * i) : minsPerVisit;
                visits.push(createGroupVisit(tag, groupItems, currentMins, i === 0));
            }
        } else {
            visits.push(createGroupVisit(tag, groupItems, totalMinutes, true));
        }
    }

    return visits;
}

function createGroupVisit(capability: string, items: CatalogueItem[], groupMinutes: number, isFirst: boolean): GeneratedVisit {
    const primary = items[0];
    const addons = isFirst ? items.slice(1) : []; // Distribute items logic? 
    // Usually we just want to show all items in the visit(s) generated.

    // Simplify: Put all items in the first visit if split, or just distribute.
    // For now, I'll put all items in the first visit's label/metadata, and just the time in others.

    const tier = calculateTier(groupMinutes) as any;
    const itemClass = primary.item_class as any;
    const price = calculatePrice(tier, itemClass);
    const visitTypeLabel = inferVisitTypeLabel(itemClass, [capability]);

    return {
        visit_id: '',
        item_class: itemClass,
        visit_type_label: visitTypeLabel,
        primary_job_item: {
            job_item_id: primary.job_item_id,
            display_name: primary.display_name,
            time_weight_minutes: primary.default_minutes || primary.time_weight_minutes,
        },
        addon_job_items: (isFirst ? items.slice(1) : []).map(i => ({
            job_item_id: i.job_item_id,
            display_name: i.display_name,
            time_weight_minutes: i.default_minutes || i.time_weight_minutes,
        })),
        required_capability_tags: [capability],
        total_minutes: groupMinutes,
        tier: tier,
        price: price,
        item_prices: [price],
    };
}

// Greedy packing logic removed in favor of capability-aware summation per spec.

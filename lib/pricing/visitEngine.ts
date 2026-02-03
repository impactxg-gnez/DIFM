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
    H1: 60,  // Example
    H2: 90,
    H3: 130,
    // Specialist/Cleaning might differ?
    // Spec says: "Each Visit is priced... separately."
    // I will use these defaults but ideally we'd look up a PriceRule.
};

export const TIER_ITEM_CAPS: Record<string, number> = {
    H1: 1,
    H2: 2,
    H3: 4,
};

export interface GeneratedVisit {
    itemClass: string;
    primaryItemId: string;
    addonItemIds: string[];
    tier: string;
    totalMinutes: number;
    price: number;
    capabilityTags: string[];
    items: CatalogueItem[]; // For reference
}

export function calculateTier(minutes: number): string {
    if (minutes <= TIER_THRESHOLDS.H1) return 'H1';
    if (minutes <= TIER_THRESHOLDS.H2) return 'H2';
    if (minutes <= TIER_THRESHOLDS.H3) return 'H3';
    return 'H3'; // Cap at H3 for V1, or handle overflow (spec says "splitVisit" but "never exceed H3 in V1")
}

export function calculatePrice(tier: string, itemClass: string): number {
    // Can expand to specific prices per class later
    // For V1, H1/H2/H3 applies to Standard.
    // Cleaning/Specialist might have their own rates. For now using same tiers.
    return TIER_PRICES[tier] || 0;
}

/**
 * Core Algorithm: Visit Generation
 * 1. Isolate CLEANING -> Visits
 * 2. Isolate SPECIALIST -> Visits
 * 3. Bundle STANDARD -> Visits (Greedy pack)
 */
export function buildVisits(items: CatalogueItem[]): GeneratedVisit[] {
    const cleaning = items.filter(i => i.item_class === 'CLEANING');
    const specialist = items.filter(i => i.item_class === 'SPECIALIST');
    const standard = items.filter(i => i.item_class === 'STANDARD');

    const visits: GeneratedVisit[] = [];

    // 1. Cleaning: Always isolated, one visit per item (usually) or bundle if same type?
    // Spec: "Any CLEANING item always creates its own visit and never bundles."
    for (const item of cleaning) {
        visits.push(createSingleItemVisit(item));
    }

    // 2. Specialist: Always isolated
    // Spec: "Any SPECIALIST item always creates its own visit and never bundles."
    for (const item of specialist) {
        visits.push(createSingleItemVisit(item));
    }

    // 3. Standard: Bundle
    visits.push(...bundleStandard(standard));

    return visits;
}

function createSingleItemVisit(item: CatalogueItem): GeneratedVisit {
    const tier = calculateTier(item.time_weight_minutes);
    return {
        itemClass: item.item_class,
        primaryItemId: item.job_item_id,
        addonItemIds: [],
        tier,
        totalMinutes: item.time_weight_minutes,
        price: calculatePrice(tier, item.item_class),
        capabilityTags: item.required_capability_tags,
        items: [item]
    };
}

function bundleStandard(items: CatalogueItem[]): GeneratedVisit[] {
    // Greedy pack by time desc
    const sorted = [...items].sort((a, b) => b.time_weight_minutes - a.time_weight_minutes);
    const visits: GeneratedVisit[] = [];

    for (const item of sorted) {
        let placed = false;
        for (const v of visits) {
            if (canAdd(item, v)) {
                addToVisit(item, v);
                placed = true;
                break;
            }
        }
        if (!placed) {
            visits.push(createSingleItemVisit(item));
        }
    }

    return visits;
}

function canAdd(item: CatalogueItem, visit: GeneratedVisit): boolean {
    if (visit.itemClass !== 'STANDARD') return false;
    if (item.allowed_addon === false) return false;

    const newMinutes = visit.totalMinutes + item.time_weight_minutes;
    // Cap at 150 (H3 max)
    if (newMinutes > TIER_THRESHOLDS.H3) return false;

    const newTier = calculateTier(newMinutes);
    const newCount = 1 + visit.addonItemIds.length + 1; // current Items + this one

    if (newCount > TIER_ITEM_CAPS[newTier]) return false;

    // Capability Superset check
    // Spec: "Capability superset holds: provider_capabilities ⊇ union(required_capability_tags for items in the Visit)"
    // This check here is implicit: If we merge them, the required tags become the UNION.
    // The constraint is whether a provider CAN exist with that union.
    // "HANDYMAN is a real capability tag and can be mixed as add-ons when capability-superset holds."
    // V1 Logic: We assume merging is allowed if tags are compatible (e.g. Handyman + Plumbing).
    // If we have distinct trades that never mix (e.g. "Roofing" + "Gardening"), we might block it.
    // Spec says: "HANDYMAN mixed add-ons: HANDYMAN items may bundle across different task types as add-ons".
    // For now, allow bundling, the resulting visit will require UNION of tags.
    // dispatch will ensure a provider has all tags.

    return true;
}

function addToVisit(item: CatalogueItem, visit: GeneratedVisit) {
    visit.addonItemIds.push(item.job_item_id);
    visit.items.push(item);
    visit.totalMinutes += item.time_weight_minutes;
    visit.capabilityTags = Array.from(new Set([...visit.capabilityTags, ...item.required_capability_tags]));

    // Recalc tier/price
    visit.tier = calculateTier(visit.totalMinutes);
    visit.price = calculatePrice(visit.tier, visit.itemClass);
}

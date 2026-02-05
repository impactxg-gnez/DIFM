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
    item_class: string;
    primary_job_item_id: string;
    addon_job_item_ids: string[];
    tier: string;
    base_minutes: number;
    effective_minutes: number;
    price: number;
    required_capability_tags_union: string[];
    items: CatalogueItem[]; // For reference
}

export function calculateTier(minutes: number): string {
    if (minutes <= TIER_THRESHOLDS.H1) return 'H1';
    if (minutes <= TIER_THRESHOLDS.H2) return 'H2';
    if (minutes <= TIER_THRESHOLDS.H3) return 'H3';
    return 'H3'; // For V1, cap at H3 or overflow logic
}

export function calculatePrice(tier: string, itemClass: string): number {
    return TIER_PRICES[tier] || 0;
}

/**
 * Core Algorithm: Visit Generation
 * 1. Isolate CLEANING -> one visit per item
 * 2. Isolate SPECIALIST -> one visit per item
 * 3. Bundle STANDARD -> Visits (Greedy pack)
 */
export function buildVisits(items: CatalogueItem[]): GeneratedVisit[] {
    const cleaning = items.filter(i => i.item_class === 'CLEANING');
    const specialist = items.filter(i => i.item_class === 'SPECIALIST');
    const standard = items.filter(i => i.item_class === 'STANDARD');

    const visits: GeneratedVisit[] = [];

    // 1. Cleaning: Isolated, one visit per item
    for (const item of cleaning) {
        visits.push(createSingleItemVisit(item));
    }

    // 2. Specialist: Isolated, one visit per item
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
        item_class: item.item_class,
        primary_job_item_id: item.job_item_id,
        addon_job_item_ids: [],
        tier,
        base_minutes: item.time_weight_minutes,
        effective_minutes: item.time_weight_minutes,
        price: calculatePrice(tier, item.item_class),
        required_capability_tags_union: item.required_capability_tags,
        items: [item]
    };
}

function bundleStandard(items: CatalogueItem[]): GeneratedVisit[] {
    // Greedy pack by time desc
    const sorted = [...items].sort((a, b) => b.time_weight_minutes - a.time_weight_minutes);
    const visits: GeneratedVisit[] = [];

    for (const item of sorted) {
        // Handle items that exceed H3 threshold (>150 minutes)
        if (item.time_weight_minutes > TIER_THRESHOLDS.H3) {
            visits.push(...splitLargeItem(item));
            continue;
        }

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

function splitLargeItem(item: CatalogueItem): GeneratedVisit[] {
    // For items >150min, create multiple visits
    const visits: GeneratedVisit[] = [];
    const numVisits = Math.ceil(item.time_weight_minutes / TIER_THRESHOLDS.H3);

    for (let i = 0; i < numVisits; i++) {
        const remainingMinutes = item.time_weight_minutes - (i * TIER_THRESHOLDS.H3);
        const visitMinutes = Math.min(TIER_THRESHOLDS.H3, remainingMinutes);

        const tier = calculateTier(visitMinutes);
        const visit: GeneratedVisit = {
            item_class: item.item_class,
            primary_job_item_id: item.job_item_id,
            addon_job_item_ids: [],
            tier,
            base_minutes: visitMinutes,
            effective_minutes: visitMinutes,
            price: calculatePrice(tier, item.item_class),
            required_capability_tags_union: item.required_capability_tags,
            items: [item]
        };
        visits.push(visit);
    }

    return visits;
}

function canAdd(item: CatalogueItem, visit: GeneratedVisit): boolean {
    if (visit.item_class !== 'STANDARD') return false;
    if (item.allowed_addon === false) return false;

    // Capability compatibility check
    const itemCaps = new Set(item.required_capability_tags);
    const visitCaps = new Set(visit.required_capability_tags_union);
    const allCaps = new Set([...itemCaps, ...visitCaps]);

    // Check if a single provider can handle all capabilities
    if (!canProviderHandleAll(allCaps)) return false;

    const newMinutes = visit.effective_minutes + item.time_weight_minutes;
    // Cap at 150 (H3 max)
    if (newMinutes > TIER_THRESHOLDS.H3) return false;

    const newTier = calculateTier(newMinutes);
    const newCount = 1 + visit.addon_job_item_ids.length + 1; // current Items + this one

    if (newCount > TIER_ITEM_CAPS[newTier]) return false;

    return true;
}

function canProviderHandleAll(caps: Set<string>): boolean {
    // Check if a single provider type can handle all capabilities
    if (caps.size === 0) return true;
    if (caps.size === 1) return true;

    const capsArray = Array.from(caps);

    // HANDYMAN can do basic tasks but not specialized work
    if (capsArray.includes('HANDYMAN')) {
        const specialized = ['PLUMBING', 'ELECTRICAL', 'PAINTER', 'CLEANING'];
        return !capsArray.some(c => specialized.includes(c));
    }

    // Specialized capabilities can't mix with each other
    const specialized = ['PLUMBING', 'ELECTRICAL', 'PAINTER', 'CLEANING'];
    const specializedCount = capsArray.filter(c => specialized.includes(c)).length;
    return specializedCount <= 1;
}

function addToVisit(item: CatalogueItem, visit: GeneratedVisit) {
    visit.addon_job_item_ids.push(item.job_item_id);
    visit.items.push(item);
    visit.base_minutes += item.time_weight_minutes;
    visit.effective_minutes += item.time_weight_minutes;
    visit.required_capability_tags_union = Array.from(new Set([...visit.required_capability_tags_union, ...item.required_capability_tags]));

    // Recalc tier/price
    visit.tier = calculateTier(visit.effective_minutes);
    visit.price = calculatePrice(visit.tier, visit.item_class);
}

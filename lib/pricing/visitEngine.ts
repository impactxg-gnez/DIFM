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
    // Allow small add-ons to be bundled into a single H1 visit (per DIFM V1 acceptance criteria)
    // BUT: Similar tasks like "hang mirror" and "hang picture" should be separate visits
    // So we limit to 1 item per visit for hanging/mounting tasks to ensure proper visit isolation
    H1: 1,  // Changed from 2 to 1 to prevent bundling similar tasks
    H2: 2,
    H3: 4,
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
        if (item.time_weight_minutes > TIER_THRESHOLDS.H3) {
            visits.push(...splitLargeItem(item));
        } else {
            visits.push(createSingleItemVisit(item));
        }
    }

    // 2. Specialist: Isolated, one visit per item
    for (const item of specialist) {
        if (item.time_weight_minutes > TIER_THRESHOLDS.H3) {
            visits.push(...splitLargeItem(item));
        } else {
            visits.push(createSingleItemVisit(item));
        }
    }

    // 3. Standard: Bundle
    visits.push(...bundleStandard(standard));

    return visits;
}

function createSingleItemVisit(item: CatalogueItem): GeneratedVisit {
    const tier = calculateTier(item.time_weight_minutes);
    const requiredCaps = item.required_capability_tags || [];
    const visitTypeLabel = inferVisitTypeLabel(item.item_class as any, requiredCaps);
    return {
        visit_id: '',
        item_class: item.item_class as any,
        visit_type_label: visitTypeLabel,
        primary_job_item: {
            job_item_id: item.job_item_id,
            display_name: item.display_name,
            time_weight_minutes: item.time_weight_minutes,
        },
        addon_job_items: [],
        required_capability_tags: requiredCaps,
        total_minutes: item.time_weight_minutes,
        tier: tier as any,
        price: calculatePrice(tier, item.item_class),
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
    const requiredCaps = item.required_capability_tags || [];
    const visitTypeLabel = inferVisitTypeLabel(item.item_class as any, requiredCaps);

    for (let i = 0; i < numVisits; i++) {
        const remainingMinutes = item.time_weight_minutes - (i * TIER_THRESHOLDS.H3);
        const visitMinutes = Math.min(TIER_THRESHOLDS.H3, remainingMinutes);

        const tier = calculateTier(visitMinutes);
        const visit: GeneratedVisit = {
            visit_id: '',
            item_class: item.item_class as any,
            visit_type_label: visitTypeLabel,
            primary_job_item: {
                job_item_id: item.job_item_id,
                display_name: item.display_name,
                time_weight_minutes: item.time_weight_minutes,
            },
            addon_job_items: [],
            required_capability_tags: requiredCaps,
            total_minutes: visitMinutes,
            tier: tier as any,
            price: calculatePrice(tier, item.item_class),
        };
        visits.push(visit);
    }

    return visits;
}

function canAdd(item: CatalogueItem, visit: GeneratedVisit): boolean {
    if (visit.item_class !== 'STANDARD') return false;
    if (item.allowed_addon === false) return false;

    // Don't bundle similar hanging/mounting tasks - they should be separate visits
    // This ensures "hang mirror" and "hang picture" create 2 separate visits
    const hangingTasks = ['mirror_hang', 'pic_hang', 'tv_mount_standard', 'tv_mount_large', 'shelf_install_single'];
    const isHangingTask = hangingTasks.includes(item.job_item_id);
    const visitIsHangingTask = hangingTasks.includes(visit.primary_job_item.job_item_id);
    if (isHangingTask && visitIsHangingTask) {
        return false; // Keep hanging tasks separate
    }

    // Capability compatibility check
    const itemCaps = new Set(item.required_capability_tags);
    const visitCaps = new Set(visit.required_capability_tags);
    const allCaps = new Set([...itemCaps, ...visitCaps]);

    // Check if a single provider can handle all capabilities
    if (!canProviderHandleAll(allCaps)) return false;

    const newMinutes = visit.total_minutes + item.time_weight_minutes;
    // Cap at 150 (H3 max)
    if (newMinutes > TIER_THRESHOLDS.H3) return false;

    const newTier = calculateTier(newMinutes);
    const newCount = 1 + visit.addon_job_items.length + 1; // current Items + this one

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
    visit.addon_job_items.push({
        job_item_id: item.job_item_id,
        display_name: item.display_name,
        time_weight_minutes: item.time_weight_minutes,
    });
    visit.total_minutes += item.time_weight_minutes;
    visit.required_capability_tags = Array.from(new Set([...visit.required_capability_tags, ...(item.required_capability_tags || [])]));
    visit.visit_type_label = inferVisitTypeLabel(visit.item_class, visit.required_capability_tags);

    // Recalc tier/price
    visit.tier = calculateTier(visit.total_minutes) as any;
    visit.price = calculatePrice(visit.tier, visit.item_class);
}

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
    const itemPrice = calculatePrice(tier, item.item_class);
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
        price: itemPrice,
        item_prices: [itemPrice], // Track individual item price
    };
}

function bundleStandard(items: CatalogueItem[]): GeneratedVisit[] {
    // Greedy packing algorithm: sort by time descending, pack into existing visits first
    const sorted = [...items].sort((a, b) => b.time_weight_minutes - a.time_weight_minutes);
    const visits: GeneratedVisit[] = [];

    console.log(`[VisitEngine] bundleStandard: Processing ${items.length} items`);

    for (const item of sorted) {
        // Handle items that exceed H3 threshold (>150 minutes) - split them
        if (item.time_weight_minutes > TIER_THRESHOLDS.H3) {
            const splitVisits = splitLargeItem(item);
            visits.push(...splitVisits);
            console.log(`[VisitEngine] Split large item ${item.job_item_id} (${item.time_weight_minutes}min) into ${splitVisits.length} visits`);
            continue;
        }

        // Try to add item to an existing visit (greedy packing)
        let placed = false;
        for (const v of visits) {
            if (canAdd(item, v)) {
                addToVisit(item, v);
                placed = true;
                console.log(`[VisitEngine] Added ${item.job_item_id} (${item.time_weight_minutes}min) to existing visit (total: ${v.total_minutes}min, items: ${1 + v.addon_job_items.length})`);
                break; // Stop searching once placed
            }
        }

        // Only create new visit if item couldn't be added to any existing visit
        if (!placed) {
            const newVisit = createSingleItemVisit(item);
            visits.push(newVisit);
            console.log(`[VisitEngine] Created new visit for ${item.job_item_id} (${item.time_weight_minutes}min)`);
        }
    }

    console.log(`[VisitEngine] bundleStandard: Created ${visits.length} visits from ${items.length} items`);
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
        const itemPrice = calculatePrice(tier, item.item_class);
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
            price: itemPrice,
            item_prices: [itemPrice], // Track individual item price
        };
        visits.push(visit);
    }

    return visits;
}

function canAdd(item: CatalogueItem, visit: GeneratedVisit): boolean {
    // Rule 1: Only STANDARD items can be bundled together
    if (visit.item_class !== 'STANDARD') {
        console.log(`[VisitEngine] canAdd: REJECTED - visit.item_class is ${visit.item_class}, not STANDARD`);
        return false;
    }

    // Rule 2: Item must be allowed as addon
    if (item.allowed_addon === false) {
        console.log(`[VisitEngine] canAdd: REJECTED - ${item.job_item_id} has allowed_addon=false`);
        return false;
    }

    // Rule 3: Capability compatibility check - single provider must handle all capabilities
    const itemCaps = new Set(item.required_capability_tags || []);
    const visitCaps = new Set(visit.required_capability_tags || []);
    const allCaps = new Set([...itemCaps, ...visitCaps]);

    if (!canProviderHandleAll(allCaps)) {
        console.log(`[VisitEngine] canAdd: REJECTED - capability mismatch. Item: [${Array.from(itemCaps).join(', ')}], Visit: [${Array.from(visitCaps).join(', ')}]`);
        return false;
    }

    // Rule 4: Total minutes must not exceed 150 (H3 max)
    const newMinutes = visit.total_minutes + item.time_weight_minutes;
    if (newMinutes > TIER_THRESHOLDS.H3) {
        console.log(`[VisitEngine] canAdd: REJECTED - time limit exceeded. Visit: ${visit.total_minutes}min, Item: ${item.time_weight_minutes}min, Total: ${newMinutes}min > ${TIER_THRESHOLDS.H3}min`);
        return false;
    }

    // Rule 5: Item count must not exceed tier limit for the new tier
    const newTier = calculateTier(newMinutes);
    // Count: 1 primary item + existing addon items + 1 new addon item
    const currentItemCount = 1 + visit.addon_job_items.length; // primary + existing addons
    const newItemCount = currentItemCount + 1; // add the new item

    if (newItemCount > TIER_ITEM_CAPS[newTier]) {
        console.log(`[VisitEngine] canAdd: REJECTED - item count limit exceeded. Current: ${currentItemCount}, New: ${newItemCount}, Tier: ${newTier}, Limit: ${TIER_ITEM_CAPS[newTier]}`);
        return false;
    }

    // All rules passed - item can be added
    console.log(`[VisitEngine] canAdd: ACCEPTED - ${item.job_item_id} can be added to visit (${visit.total_minutes}min + ${item.time_weight_minutes}min = ${newMinutes}min, ${currentItemCount} + 1 = ${newItemCount} items, tier: ${newTier})`);
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

    // Calculate individual item price based on its own tier
    const itemTier = calculateTier(item.time_weight_minutes);
    const itemPrice = calculatePrice(itemTier, item.item_class);

    // Initialize item_prices array if not present
    if (!visit.item_prices) {
        // If visit was created without item_prices, estimate from current price
        visit.item_prices = [visit.price];
    }

    // Add the new item's price to the array
    visit.item_prices.push(itemPrice);

    // Sum all individual item prices instead of recalculating by tier
    visit.price = visit.item_prices.reduce((sum, p) => sum + p, 0);

    // Update tier based on total minutes (for display/logging purposes)
    visit.tier = calculateTier(visit.total_minutes) as any;
}

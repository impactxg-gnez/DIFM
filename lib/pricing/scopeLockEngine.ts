import { calculateTierAndPrice } from './visitEngine';
import { excelSource } from './excelLoader';
import { computeClarifierAdjustmentMinutes } from './clarifierEngine';

export interface ScopePricingResult {
    effectiveMinutes: number;
    finalTier: string;
    finalPrice: number;
    extraMinutes: number;
}

export function computeScopePricing(visit: any, answers: Record<string, string>): ScopePricingResult {
    let extraMinutes = 0;
    let forceH3 = false;

    if (visit.item_class === 'CLEANING') {
        const beds = parseInt(answers.CLEAN_BEDROOMS || answers.bedrooms || '1', 10);
        const baths = parseInt(answers.CLEAN_BATHROOMS || answers.bathrooms || '1', 10);
        const extraBeds = Math.max(0, beds - 1);
        const extraBaths = Math.max(0, baths - 1);
        extraMinutes += (extraBeds * 30) + (extraBaths * 20);
    }

    const primaryItem = excelSource.jobItems.get(visit.primary_job_item_id);
    const addonItems = (visit.addon_job_item_ids || []).map((itemId: string) => excelSource.jobItems.get(itemId));
    const allItems = [primaryItem, ...addonItems].filter(Boolean);

    const hasUncertaintyAnswer = Object.values(answers).some(
        (answer) => answer === 'not_sure' || answer === 'No' || answer === 'No / Not sure'
    );
    if (hasUncertaintyAnswer) {
        for (const item of allItems as any[]) {
            if (!item) continue;
            if (item.uncertainty_prone) {
                if (item.uncertainty_handling === 'BUFFER') {
                    extraMinutes += item.risk_buffer_minutes || 0;
                } else if (item.uncertainty_handling === 'FORCE_H3') {
                    forceH3 = true;
                    break;
                }
            }
        }
    }

    extraMinutes += computeClarifierAdjustmentMinutes(visit, answers);

    const effectiveMinutes = (visit.base_minutes ?? 0) + extraMinutes;
    const ladder = primaryItem?.pricing_ladder || (visit.item_class === 'CLEANING' ? 'CLEANING' : 'HANDYMAN');

    let { tier: finalTier, price: finalPrice } = forceH3
        ? { tier: 'H3', price: calculateTierAndPrice(150, ladder).price }
        : calculateTierAndPrice(effectiveMinutes, ladder);

    if (visit.item_class === 'CLEANING') {
        const beds = parseInt(answers.CLEAN_BEDROOMS || answers.bedrooms || '1', 10);
        const baths = parseInt(answers.CLEAN_BATHROOMS || answers.bathrooms || '1', 10);
        const totalRooms = beds + baths;

        if (totalRooms <= 2) finalTier = 'C1';
        else if (totalRooms <= 4) finalTier = 'C2';
        else finalTier = 'C3';

        finalPrice = calculateTierAndPrice(effectiveMinutes, 'CLEANING').price;
    }

    return {
        effectiveMinutes,
        finalTier,
        finalPrice,
        extraMinutes
    };
}


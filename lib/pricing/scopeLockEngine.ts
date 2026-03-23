import { calculateTierAndPrice, getPriceByTier } from './visitEngine';
import { excelSource } from './excelLoader';
import { computeClarifierAdjustmentMinutes } from './clarifierEngine';
import { OVERFLOW_REVIEW_ETA, OVERFLOW_REVIEW_MESSAGE } from '../review/reviewWorkflow';

export interface ScopePricingSuccessResult {
    status: 'OK';
    bookingAllowed: true;
    effectiveMinutes: number;
    finalTier: string;
    finalPrice: number;
    extraMinutes: number;
}

export interface ScopePricingOverflowResult {
    status: 'OVERFLOW';
    action: 'ROUTE_TO_REVIEW';
    reason: 'EXCEEDS_MAX_LADDER_TIME';
    bookingAllowed: false;
    nextStep: 'REVIEW';
    message: string;
    eta: '30-60 minutes';
    effectiveMinutes: number;
    ladderMaxTime: number;
    overflowDelta: number;
    capability: string;
    maxLadder: string;
    overflowAction: 'REVIEW';
    selectedClarifiers: string[];
}

export type ScopePricingResult = ScopePricingSuccessResult | ScopePricingOverflowResult;

function getSelectedClarifiers(answers: Record<string, string>): string[] {
    return Object.entries(answers || {})
        .filter(([, value]) => {
            if (value === null || value === undefined) return false;
            return String(value).trim().length > 0;
        })
        .map(([key]) => key);
}

export function computeScopePricing(visit: any, answers: Record<string, string>): ScopePricingResult {
    let bufferTime = 0;
    let clarifierTime = 0;
    let forceH3 = false;

    if (visit.item_class === 'CLEANING') {
        const beds = parseInt(answers.CLEAN_BEDROOMS || answers.bedrooms || '1', 10);
        const baths = parseInt(answers.CLEAN_BATHROOMS || answers.bathrooms || '1', 10);
        const extraBeds = Math.max(0, beds - 1);
        const extraBaths = Math.max(0, baths - 1);
        clarifierTime += (extraBeds * 30) + (extraBaths * 20);
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
                    bufferTime += item.risk_buffer_minutes || 0;
                } else if (item.uncertainty_handling === 'FORCE_H3') {
                    forceH3 = true;
                    break;
                }
            }
        }
    }

    clarifierTime += computeClarifierAdjustmentMinutes(visit, answers);

    const matrixBaseTime = [visit.primary_job_item_id, ...(visit.addon_job_item_ids || [])]
        .map((jobItemId: string) => Number(excelSource.jobItems.get(jobItemId)?.default_time_weight_minutes || 0))
        .reduce((sum: number, minutes: number) => sum + minutes, 0);
    const baseTime = Number(visit.base_minutes ?? 0);
    const finalBaseTimeUsed = baseTime;
    const mappingTime = baseTime + clarifierTime;
    const effectiveMinutes = mappingTime + bufferTime;
    const ladder = primaryItem?.pricing_ladder || (visit.item_class === 'CLEANING' ? 'CLEANING' : 'HANDYMAN');
    const capability =
        primaryItem?.capability_tag ||
        visit.required_capability_tags_union?.[0] ||
        visit.required_capability_tags?.[0] ||
        'HANDYMAN';
    const selectedClarifiers = getSelectedClarifiers(answers);
    const guardrail = excelSource.getCapabilityGuardrail(capability, ladder);
    const expectedUpperBoundForCapability = guardrail?.ladder_max_time || Number.MAX_SAFE_INTEGER;

    if (finalBaseTimeUsed > expectedUpperBoundForCapability) {
        console.error('[BASE_TIME_INFLATED]', {
            capability,
            matrix_base_time: matrixBaseTime,
            final_base_time_used: finalBaseTimeUsed,
            expected_upper_bound_for_capability: expectedUpperBoundForCapability
        });
    }

    if (guardrail && effectiveMinutes > guardrail.ladder_max_time) {
        const overflowDelta = effectiveMinutes - guardrail.ladder_max_time;
        return {
            status: 'OVERFLOW',
            action: 'ROUTE_TO_REVIEW',
            reason: 'EXCEEDS_MAX_LADDER_TIME',
            bookingAllowed: false,
            nextStep: 'REVIEW',
            message: OVERFLOW_REVIEW_MESSAGE,
            eta: OVERFLOW_REVIEW_ETA,
            effectiveMinutes,
            ladderMaxTime: guardrail.ladder_max_time,
            overflowDelta,
            capability: guardrail.capability,
            maxLadder: guardrail.max_ladder,
            overflowAction: guardrail.overflow_action,
            selectedClarifiers,
        };
    }

    let { tier: finalTier, price: finalPrice } = forceH3
        ? { tier: 'H3', price: calculateTierAndPrice(150, ladder).price }
        : calculateTierAndPrice(mappingTime, ladder);

    const h1Tier = (excelSource.pricingTiers.get(ladder) || []).find((tier) => tier.tier === 'H1');
    if (!forceH3 && h1Tier && baseTime < h1Tier.max_minutes && clarifierTime <= 0) {
        finalTier = 'H1';
        finalPrice = getPriceByTier('H1', ladder);
    }

    if (visit.item_class === 'CLEANING') {
        const beds = parseInt(answers.CLEAN_BEDROOMS || answers.bedrooms || '1', 10);
        const baths = parseInt(answers.CLEAN_BATHROOMS || answers.bathrooms || '1', 10);
        const totalRooms = beds + baths;

        if (totalRooms <= 2) finalTier = 'C1';
        else if (totalRooms <= 4) finalTier = 'C2';
        else finalTier = 'C3';

        finalPrice = calculateTierAndPrice(effectiveMinutes, 'CLEANING').price;
    }

    console.log('[ScopePricingDebug]', {
        capability,
        ladder,
        matrix_base_time: matrixBaseTime,
        final_base_time_used: finalBaseTimeUsed,
        base_time: baseTime,
        added_time_from_clarifiers: clarifierTime,
        buffer_time: bufferTime,
        final_mapping_time: mappingTime,
        selected_tier: finalTier
    });

    console.log('[PricingJobTrace]', {
        capability,
        matrix_base_time: matrixBaseTime,
        quantity: 1,
        clarifier_time: clarifierTime,
        buffer_time: bufferTime,
        final_time: effectiveMinutes
    });

    return {
        status: 'OK',
        bookingAllowed: true,
        effectiveMinutes,
        finalTier,
        finalPrice,
        extraMinutes: clarifierTime + bufferTime
    };
}


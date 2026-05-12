import { calculateTierAndPrice, getMatrixTime, getPriceByTier } from './visitEngine';
import { excelSource } from './excelLoader';
import { computeClarifierPricingEffects } from './dynamicClarifiers';
import { cleaningTierBhkFromRoomClarifierValue } from './wholeHomeCleaningScope';
import type { MatrixV2Model } from './matrixV2/types';

// Keep overflow copy local to avoid hard dependency on review modules in builds
// where review workflow files are not deployed yet.
const OVERFLOW_REVIEW_ETA = '30-60 minutes' as const;
const OVERFLOW_REVIEW_MESSAGE = "This job looks more complex than a standard booking. We'll review it and share a custom quote shortly.";

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
    reason: 'EXCEEDS_MAX_LADDER_TIME' | 'COMMERCIAL_QUANTITY';
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

function bumpTierOnLadder(ladder: string, tier: string, steps: number): string {
    if (steps <= 0) return tier;
    const tiers = excelSource.pricingTiers.get(ladder) || [];
    const ordered = [...tiers].sort((a, b) => Number(a.max_minutes || 0) - Number(b.max_minutes || 0));
    const idx = ordered.findIndex((t) => t.tier === tier);
    if (idx < 0) return tier;
    const nextIdx = Math.min(ordered.length - 1, idx + steps);
    return ordered[nextIdx].tier;
}

function getLadderGuardrail(capability: string, ladder: string) {
    const tiers = excelSource.pricingTiers.get(ladder) || [];
    if (tiers.length === 0) return null;
    const highest = tiers.reduce((acc, tier) => {
        if (!acc) return tier;
        return Number(tier.max_minutes || 0) >= Number(acc.max_minutes || 0) ? tier : acc;
    }, tiers[0]);
    return {
        capability,
        max_ladder: highest.tier,
        ladder_max_time: Number(highest.max_minutes || 0),
        overflow_action: 'REVIEW' as const,
    };
}

function getSelectedClarifiers(answers: Record<string, string>): string[] {
    return Object.entries(answers || {})
        .filter(([, value]) => {
            if (value === null || value === undefined) return false;
            return String(value).trim().length > 0;
        })
        .map(([key]) => key);
}

function parseVisitClarifierDefs(visit: any): Array<{ id: string; question: string }> {
    const raw = visit?.clarifiers;
    if (!Array.isArray(raw)) return [];
    return raw
        .map((c: any) => ({
            id: String(c?.id ?? c?.tag ?? '').trim(),
            question: String(c?.question ?? ''),
        }))
        .filter((r: { id: string }) => r.id.length > 0);
}

/** Align with matrixV2/engine cleaning: infer BHK band from explicit room/BHK clarifier answers */
function inferCleaningRoomsBhk(
    defs: Array<{ id: string; question: string }>,
    ans: Record<string, string>,
): { inferredBhk: number } {
    for (const d of defs) {
        const v = String(ans[d.id] ?? '').trim();
        if (!v) continue;
        const cid = d.id.toLowerCase();
        const qt = (d.question || '').toLowerCase();
        const isDeepQuestion = /standard\s+or\s+deep/.test(qt);
        const looksRoom =
            /room|bhk/.test(cid) ||
            /\b(room|bhk)s?\b/.test(qt) ||
            /\bhow many\b.*\b(room|bhk)\b/.test(qt);
        if (!looksRoom || isDeepQuestion) continue;
        const n = parseInt(v.replace(/[^\d]/g, ''), 10);
        if (!Number.isFinite(n) || n < 1) continue;
        const inferredBhk = cleaningTierBhkFromRoomClarifierValue(n);
        return { inferredBhk };
    }

    return { inferredBhk: 1 };
}

function inferCleaningDeep(
    defs: Array<{ id: string; question: string }>,
    ans: Record<string, string>,
): boolean {
    for (const d of defs) {
        const v = String(ans[d.id] ?? '').trim();
        if (!v) continue;
        const qt = (d.question || '').toLowerCase();
        if (/standard\s+or\s+deep/.test(qt) && /\bdeep\b/i.test(v)) return true;
    }
    for (const [key, raw] of Object.entries(ans)) {
        if (!/^clean(?:ing)?_?type$/i.test(key)) continue;
        if (/\bdeep\b/i.test(String(raw))) return true;
    }
    return false;
}

function matrixV2CleaningLinePrice(jobItemId: string, model: MatrixV2Model, inferredBhk: number): number {
    const row = model.jobs.get(String(jobItemId));
    if (!row) return 0;
    const bhk = Math.min(4, Math.max(1, inferredBhk));
    const tierByBhk = `C${bhk}`;
    const sizeRow = model.cleaningTiers.find((r) => r.tier === tierByBhk);
    if (sizeRow && Number(sizeRow.price_gbp) > 0) return Number(sizeRow.price_gbp);
    const baseKey = String(row.base_tier || '').trim().toUpperCase();
    const baseRow = model.cleaningTiers.find((r) => r.tier === baseKey);
    return baseRow ? Number(baseRow.price_gbp) : 0;
}

export function computeScopePricing(visit: any, answers: Record<string, string>): ScopePricingResult {
    let bufferTime = 0;
    let clarifierTime = 0;
    let forceH3 = false;

    const primaryItem = excelSource.jobItems.get(visit.primary_job_item_id);
    const ladder = primaryItem?.pricing_ladder || (visit.item_class === 'CLEANING' ? 'CLEANING' : 'HANDYMAN');
    const capability =
        primaryItem?.capability_tag ||
        visit.required_capability_tags_union?.[0] ||
        visit.required_capability_tags?.[0] ||
        'HANDYMAN';
    const visitBaseMinutes = Number(visit.base_minutes ?? 0);

    console.log({
        stage: 'incoming_visit',
        capability,
        visitBaseMinutes
    });

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

    const clarifierEffects = computeClarifierPricingEffects(
        visit.primary_job_item_id,
        visit.addon_job_item_ids || [],
        answers,
    );
    clarifierTime += clarifierEffects.extraMinutes;

    // Diagnostic: quoted base_minutes often differs from raw matrix row sum (quantity tiers, bulk
    // efficiency, extraction overrides). Persisted visit.base_minutes is the contract baseline — do not throw.
    const matrixBaseMinutes = [visit.primary_job_item_id, ...(visit.addon_job_item_ids || [])]
        .map((jobItemId: string) => getMatrixTime(jobItemId))
        .reduce((sum: number, minutes: number) => sum + minutes, 0);
    if (visitBaseMinutes !== matrixBaseMinutes) {
        console.warn('[VISIT_BASE_TIME_NOTE]', {
            visitBaseMinutes,
            matrixBaseMinutes,
            primary: visit.primary_job_item_id,
            addons: visit.addon_job_item_ids || [],
            message: 'Quoted base differs from single-pass matrix sum (expected for quantity/extraction pricing).',
        });
    }

    const mappingTime = visitBaseMinutes + clarifierTime;
    
    let effectiveMinutes = visitBaseMinutes + clarifierTime;
    const selectedClarifiers = getSelectedClarifiers(answers);
    
    const qtyKeys = ['ITEM_COUNT', 'QUANTITY', 'SHELF_COUNT', 'NUM_ITEMS', 'HOW_MANY', 'COUNT', 'N_ITEMS', 'NUM_BLIND'];
    let answersQty: number | null = null;
    for (const k of qtyKeys) {
        if (answers[k] !== undefined && String(answers[k]).trim() !== '') {
            answersQty = parseInt(String(answers[k]), 10);
            if (!Number.isNaN(answersQty)) break;
        }
    }

    if (answersQty !== null && answersQty > 0) {
        let matchedMax = 999;
        if (visit.primary_job_item_id.includes('mirror')) matchedMax = 10;
        else if (visit.primary_job_item_id.includes('tv')) matchedMax = 5;
        else if (visit.primary_job_item_id.includes('blind')) matchedMax = 8;
        else if (visit.primary_job_item_id.includes('shelf')) matchedMax = 12;

        if (answersQty > matchedMax) {
            return {
                status: 'OVERFLOW',
                action: 'ROUTE_TO_REVIEW',
                reason: 'COMMERCIAL_QUANTITY',
                bookingAllowed: false,
                nextStep: 'REVIEW',
                message: "That quantity is outside standard residential pricing. Please contact us for a custom quote.",
                eta: '30-60 minutes',
                effectiveMinutes: 999,
                ladderMaxTime: 999,
                overflowDelta: 0,
                capability: capability,
                maxLadder: 'H3',
                overflowAction: 'REVIEW',
                selectedClarifiers,
            };
        }

        // Recalculate effective minutes using the new quantity
        const primaryMatrixMinutes = getMatrixTime(visit.primary_job_item_id);
        const dynamicBase = primaryMatrixMinutes * answersQty;
        // Include addon minutes as originally planned, assume addons are 1x or unchanged bulk
        const addonMatrixMinutes = matrixBaseMinutes - primaryMatrixMinutes;
        effectiveMinutes = dynamicBase + addonMatrixMinutes + clarifierTime;
    }

    const guardrail = getLadderGuardrail(capability, ladder);
    const expectedUpperBoundForCapability = guardrail?.ladder_max_time || Number.MAX_SAFE_INTEGER;

    if (visitBaseMinutes > expectedUpperBoundForCapability) {
        console.error('[BASE_TIME_INFLATED]', {
            capability,
            matrix_base_time: matrixBaseMinutes,
            final_base_time_used: visitBaseMinutes,
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

    if (!forceH3 && clarifierEffects.tierStepDelta > 0) {
        finalTier = bumpTierOnLadder(ladder, finalTier, clarifierEffects.tierStepDelta);
        finalPrice = getPriceByTier(finalTier, ladder);
    }

    if (visit.item_class === 'CLEANING') {
        const defs = parseVisitClarifierDefs(visit);
        const { inferredBhk } = inferCleaningRoomsBhk(defs, answers);
        const deep = inferCleaningDeep(defs, answers);
        const tierLabel = `C${Math.min(4, Math.max(1, inferredBhk))}`;
        finalTier = tierLabel;

        let cleaningPrice = 0;
        const model = excelSource.getMatrixV2Model();
        if (model && excelSource.isMatrixV2()) {
            const primaryId = String(visit.primary_job_item_id || '');
            cleaningPrice += matrixV2CleaningLinePrice(primaryId, model, inferredBhk);
            for (const aid of visit.addon_job_item_ids || []) {
                cleaningPrice += matrixV2CleaningLinePrice(String(aid), model, inferredBhk);
            }
        }
        if (!cleaningPrice || cleaningPrice <= 0) {
            cleaningPrice = getPriceByTier(tierLabel, 'CLEANING');
        }
        if (!cleaningPrice || cleaningPrice <= 0) {
            cleaningPrice = calculateTierAndPrice(effectiveMinutes, 'CLEANING').price;
        }
        finalPrice = deep && cleaningPrice > 0 ? cleaningPrice * 1.5 : cleaningPrice;
        finalPrice = Math.round(finalPrice * 100) / 100;
    }

    console.log('[ScopePricingDebug]', {
        capability,
        ladder,
        matrix_base_time: matrixBaseMinutes,
        final_base_time_used: visitBaseMinutes,
        base_time: visitBaseMinutes,
        added_time_from_clarifiers: clarifierTime,
        buffer_time: bufferTime,
        final_mapping_time: mappingTime,
        selected_tier: finalTier
    });

    console.log({
        stage: 'final_computed',
        effectiveMinutes
    });

    console.log('[PricingJobTrace]', {
        capability,
        matrix_base_time: matrixBaseMinutes,
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
        extraMinutes: clarifierTime
    };
}


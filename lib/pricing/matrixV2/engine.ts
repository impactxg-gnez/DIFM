/**
 * Pricing + routing logic for MATRIX V2 workbook (JOB_ITEMS / PHRASE_MAPPING / PRICING_TIERS / CLARIFIERS).
 */

import type { BookingMappingMeta } from '../bookingRoutingTypes';
import { preprocessBookingInput } from '../inputPreprocess';
import type { GeneratedVisit } from '../visitEngine';
import type { MatrixV2Model, MatrixV2JobRow } from './types';

export const MATRIX_V2_REVIEW_MESSAGE = "We'll review your request and get back with a quote.";

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeV2Input(input: string): string {
    return preprocessBookingInput(input)
        .toLowerCase()
        .replace(/\+/g, ' and ')
        .replace(/&/g, ' and ')
        .replace(/;/g, ' and ')
        .replace(/,/g, ' and ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** True if phrase appears in input — allows optional qty between tokens (e.g. mount 20 tv). */
export function phraseMatchesInput(phrase: string, normalized: string): boolean {
    const p = phrase.trim().toLowerCase();
    if (!p) return false;
    if (normalized.includes(p)) return true;
    const parts = p.split(/\s+/).filter(Boolean).map(escapeRe);
    if (parts.length === 0) return false;
    const flex = parts.join('\\s+(?:\\d+\\s*)?');
    try {
        return new RegExp(`(?:^|\\s)${flex}(?:\\s|$|\\b)`, 'i').test(normalized);
    } catch {
        return false;
    }
}

/** All distinct job_item_ids whose phrase matches anywhere in the input (longer phrases checked first). */
export function matchAllJobIdsFromPhrases(model: MatrixV2Model, normalized: string): string[] {
    const sorted = [...model.phrases].sort((a, b) => b.phrase.length - a.phrase.length);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of sorted) {
        if (!row.job_item_id || !row.phrase) continue;
        if (!phraseMatchesInput(row.phrase, normalized)) continue;
        if (seen.has(row.job_item_id)) continue;
        seen.add(row.job_item_id);
        out.push(row.job_item_id);
    }
    return out;
}

function inferCleaningBhk(normalized: string): number {
    const m = normalized.match(/\b(\d+)\s*-?\s*bhk\b|\b(one|two|three|four)\s+-?\s*bhk\b/i);
    if (!m) return 1;
    if (/^\d+$/.test(m[1])) return Math.min(4, Math.max(1, parseInt(m[1], 10)));
    const w = m[1].toLowerCase();
    const mapWord: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
    return mapWord[w] ?? 1;
}

function inferCleaningUnits(normalized: string): number {
    const m = normalized.match(/\b(\d+)\s*(houses|homes|properties|flats|apartments)\b/i);
    if (m) return Math.max(1, parseInt(m[1], 10));
    return 1;
}

function quantityForJob(jobId: string, normalized: string): number {
    const n = normalized.toLowerCase();
    const pick = (re: RegExp) => {
        const m = n.match(re);
        if (!m) return null;
        const v = parseInt(m[1] || m[2], 10);
        return Number.isFinite(v) ? Math.max(1, v) : null;
    };

    if (jobId === 'tv_mount') {
        return pick(/\b(\d+)\s*tvs?\b/i) ?? pick(/\bmount\s+(\d+)\s*tvs?\b/i) ?? pick(/\bmount\s+(\d+)\b/i) ?? 1;
    }
    if (jobId === 'shelf_install') {
        return pick(/\b(\d+)\s*(shelves|shelf)\b/i) ?? 1;
    }
    if (jobId === 'blind_install') {
        return pick(/\b(\d+)\s*blinds?\b/i) ?? 1;
    }
    if (jobId === 'curtain_rail') {
        return pick(/\b(\d+)\s*(rails?|curtains?)\b/i) ?? 1;
    }
    if (jobId === 'furniture_assembly') {
        return pick(/\b(\d+)\s*(desks?|chairs?|tables?|items?|units?|pieces?)\b/i) ?? 1;
    }
    if (jobId === 'wall_repair' || jobId === 'mirror_hang' || jobId === 'picture_hang') {
        return pick(/\b(\d+)\s*(holes?|mirrors?|pictures?|frames?|photos?)\b/i) ?? 1;
    }
    if (jobId === 'washing_machine_install' || jobId === 'dishwasher_install') {
        return pick(/\b(\d+)\s*(machines?|dishwashers?|washers?)\b/i) ?? 1;
    }
    return 1;
}

function handymanPriceForTier(tiers: MatrixV2Model['handymanTiers'], tierCode: string): number {
    const row = tiers.find((t) => t.tier === tierCode);
    return row ? Number(row.price_gbp) || 0 : 0;
}

/** Combined handyman tier from total minutes ceiling. */
function handymanTierForMinutes(
    totalMin: number,
    tiers: MatrixV2Model['handymanTiers'],
): (typeof tiers)[number] | null {
    const sorted = [...tiers].sort((a, b) => a.max_minutes - b.max_minutes);
    for (const t of sorted) {
        if (totalMin <= t.max_minutes) return t;
    }
    return sorted[sorted.length - 1] ?? null;
}

function cleaningPrice(job: MatrixV2JobRow, model: MatrixV2Model, bhkBands: number): number {
    const bhk = Math.min(4, Math.max(1, bhkBands));
    const tierByBhk = `C${bhk}`;
    const sizeRow = model.cleaningTiers.find((r) => r.tier === tierByBhk);
    const baseRow = model.cleaningTiers.find((r) => r.tier === job.base_tier);
    const pSize = sizeRow?.price_gbp ?? 0;
    const pBase = baseRow?.price_gbp ?? 0;
    return Math.max(pSize, pBase);
}

function mergeClarifiers(model: MatrixV2Model, jobIds: string[]): Array<{ tag: string; question: string }> {
    const seen = new Set<string>();
    const out: Array<{ tag: string; question: string }> = [];
    for (const jid of jobIds) {
        const row = model.jobs.get(jid);
        if (!row) continue;
        for (const cid of row.clarifierIds) {
            if (!cid || seen.has(cid)) continue;
            seen.add(cid);
            const def = model.clarifiers.get(cid);
            out.push({
                tag: cid,
                question: def?.question ?? cid,
            });
        }
    }
    return out;
}

export function routeAndPriceMatrixV2(model: MatrixV2Model, userInput: string) {
    const normalized = normalizeV2Input(userInput);
    const parts = normalized.split(' and ').map((s) => s.trim()).filter(Boolean);

    const jobIds = matchAllJobIdsFromPhrases(model, normalized);

    /** Step 5: vague / no mapping */
    if (jobIds.length === 0 || !normalized.trim()) {
        return buildReviewResult(parts, MATRIX_V2_REVIEW_MESSAGE, ['MATRIX_V2_NO_MATCH'], []);
    }

    /** Step 5: unknown job safeguard */
    for (const id of jobIds) {
        if (!model.jobs.has(id)) {
            return buildReviewResult(parts, MATRIX_V2_REVIEW_MESSAGE, ['MATRIX_V2_JOB_UNKNOWN'], []);
        }
    }

    const qtyMap: Record<string, number> = {};
    for (const id of jobIds) {
        qtyMap[id] = Math.max(1, quantityForJob(id, normalized));
    }

    const cleaningUnits = inferCleaningUnits(normalized);

    /** Quantity threshold (cleaning uses property count, not BHK). */
    for (const id of jobIds) {
        const row = model.jobs.get(id)!;
        const th = Number(row.quantity_threshold || 0);
        if (th <= 0) continue;
        let q = qtyMap[id];
        if (row.category === 'CLEANING') q = cleaningUnits;
        if (q > th) {
            return buildReviewResult(parts, MATRIX_V2_REVIEW_MESSAGE, ['MATRIX_V2_QUANTITY_REVIEW'], mergeClarifiers(model, jobIds));
        }
    }

    for (const id of jobIds) {
        const row = model.jobs.get(id)!;
        if (row.category === 'CLEANING') qtyMap[id] = cleaningUnits;
    }

    /** Commercial cleaning-style office cue (phrase not in V2 mapping) handled by NO_MATCH unless we detect */
    if (normalized.includes('clean') && /\b(?<!home\s)(office|retail|warehouse|commercial)\b/i.test(normalized)) {
        return buildReviewResult(parts, MATRIX_V2_REVIEW_MESSAGE, ['MATRIX_V2_COMMERCIAL_CLEAN'], []);
    }

    const categories = [...new Set(jobIds.map((id) => model.jobs.get(id)!.category))];

    /** Multi-job different category → REVIEW */
    if (categories.length > 1) {
        return buildReviewResult(parts, MATRIX_V2_REVIEW_MESSAGE, ['MATRIX_V2_CROSS_CATEGORY'], mergeClarifiers(model, jobIds));
    }

    const category = categories[0] || 'HANDYMAN';

    const totalMinutes = jobIds.reduce((sum, id) => {
        const row = model.jobs.get(id)!;
        return sum + row.max_minutes * qtyMap[id];
    }, 0) + Math.max(0, jobIds.length - 1) * 10;

    /** Multi-job same category: combined time ceiling */
    if (jobIds.length > 1 && category === 'HANDYMAN' && totalMinutes >= 240) {
        return buildReviewResult(parts, MATRIX_V2_REVIEW_MESSAGE, ['MATRIX_V2_TIME_BUNDLE'], mergeClarifiers(model, jobIds));
    }

    /** Pricing */
    let totalPrice = 0;
    let displayTier = 'H1';
    let displayMinutes = totalMinutes;

    if (category === 'HANDYMAN') {
        if (jobIds.length === 1) {
            const j = model.jobs.get(jobIds[0])!;
            displayTier = j.base_tier;
            totalPrice = handymanPriceForTier(model.handymanTiers, j.base_tier);
            if (!totalPrice) {
                const fallback = handymanTierForMinutes(j.max_minutes * qtyMap[jobIds[0]], model.handymanTiers);
                totalPrice = fallback?.price_gbp ?? 0;
                displayTier = fallback?.tier ?? displayTier;
            }
        } else {
            const t = handymanTierForMinutes(totalMinutes, model.handymanTiers);
            totalPrice = t?.price_gbp ?? 0;
            displayTier = t?.tier ?? displayTier;
        }
    } else if (category === 'CLEANING') {
        if (jobIds.length > 1) {
            return buildReviewResult(parts, MATRIX_V2_REVIEW_MESSAGE, ['MATRIX_V2_CLEANING_BUNDLE'], mergeClarifiers(model, jobIds));
        }
        const j = model.jobs.get(jobIds[0])!;
        const bhk = inferCleaningBhk(normalized);
        totalPrice = cleaningPrice(j, model, bhk);
        displayTier = `C${Math.min(4, Math.max(1, bhk))}`;
    }

    if (!totalPrice || totalPrice <= 0) {
        return buildReviewResult(parts, MATRIX_V2_REVIEW_MESSAGE, ['MATRIX_V2_PRICE_FAIL'], mergeClarifiers(model, jobIds));
    }

    const clarifiers = mergeClarifiers(model, jobIds).map((c) => ({
        tag: c.tag,
        question: c.question,
        affects_time: true,
        affects_safety: false as const,
    }));

    const visits = buildVisits(jobIds, qtyMap, model, category, displayTier, totalPrice, totalMinutes);

    const mappingMeta: BookingMappingMeta = {
        distinctRuleJobCount: jobIds.length,
        allResolutionSpecific: true,
        usedGenericFallback: false,
        partClauseCount: parts.length,
        distinctPricingJobCount: jobIds.length,
        quantityByJob: qtyMap,
        estimatedTotalMinutes: totalMinutes,
        distinctRoutingBucketCount: 1,
        matrixV2: { routing: 'FIXED_PRICE' as const },
    };

    return {
        jobs: [...new Set(jobIds)],
        quantitiesList: jobIds.map((id) => qtyMap[id]),
        total_minutes: displayMinutes,
        tier: displayTier,
        jobDetails: jobIds.map((id) => ({
            job: id,
            ruleJob: id,
            pricingJobId: id,
            quantity: qtyMap[id],
            adjustedMinutes: (model.jobs.get(id)?.max_minutes ?? 0) * qtyMap[id],
            complexityTierDelta: 0,
        })),
        capabilities: [category === 'CLEANING' ? 'CLEANING' : 'HANDYMAN'],
        quantities: { ...qtyMap },
        visits,
        price: totalPrice,
        clarifiers,
        flags: {
            usedDeterministicPipeline: true,
            usedGenericFallback: false,
            unresolvedPartCount: 0,
        },
        aiResult: jobIds,
        fallbackResult: [],
        warnings: [],
        mappingMeta,
    };
}

function buildVisits(
    jobIds: string[],
    qtyMap: Record<string, number>,
    model: MatrixV2Model,
    category: string,
    tier: string,
    totalPrice: number,
    totalMinutes: number,
): GeneratedVisit[] {
    const primaryId = jobIds[0];
    const primaryJob = model.jobs.get(primaryId)!;
    const cap = category === 'CLEANING' ? 'CLEANING' : 'HANDYMAN';
    const itemClass = category === 'CLEANING' ? 'CLEANING' : ('STANDARD' as const);
    return [
        {
            visit_id: '',
            item_class: itemClass,
            visit_type_label: category === 'CLEANING' ? 'Cleaning' : 'Handyman',
            primary_job_item: {
                job_item_id: primaryId,
                display_name: humanize(primaryId),
                time_weight_minutes: primaryJob.max_minutes * qtyMap[primaryId],
            },
            addon_job_items: jobIds.slice(1).map((id) => {
                const j = model.jobs.get(id)!;
                return {
                    job_item_id: id,
                    display_name: humanize(id),
                    time_weight_minutes: j.max_minutes * qtyMap[id],
                };
            }),
            required_capability_tags: [cap],
            total_minutes: totalMinutes,
            tier: tier as any,
            price: totalPrice,
            item_prices: [totalPrice],
        },
    ];
}

function humanize(id: string): string {
    return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildReviewResult(
    parts: string[],
    message: string,
    warnings: string[],
    clarifiers: Array<{ tag: string; question: string }>,
) {
    return {
        jobs: [],
        quantitiesList: [],
        total_minutes: 0,
        tier: 'H1',
        jobDetails: [],
        capabilities: [],
        quantities: {},
        visits: [],
        price: 0,
        clarifiers: clarifiers.map((c) => ({
            tag: c.tag,
            question: c.question,
            affects_time: true,
            affects_safety: false,
        })),
        flags: {
            usedDeterministicPipeline: true,
            usedGenericFallback: false,
            unresolvedPartCount: parts.length,
        },
        aiResult: [],
        fallbackResult: [],
        message,
        warnings,
        mappingMeta: {
            distinctRuleJobCount: 0,
            allResolutionSpecific: false,
            usedGenericFallback: false,
            partClauseCount: parts.length,
            distinctPricingJobCount: 0,
            quantityByJob: {},
            estimatedTotalMinutes: 0,
            distinctRoutingBucketCount: 0,
            matrixV2: { routing: 'REVIEW_QUOTE' as const, reviewReason: warnings[0] },
        },
    };
}

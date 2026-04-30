/**
 * Pricing + routing logic for MATRIX V2 workbook (JOB_ITEMS / PHRASE_MAPPING / PRICING_TIERS / CLARIFIERS).
 */

import type { BookingMappingMeta } from '../bookingRoutingTypes';
import { preprocessBookingInput } from '../inputPreprocess';
import type { GeneratedVisit } from '../visitEngine';
import type { MatrixV2Model, MatrixV2JobRow } from './types';
import {
    applyClarifierAnswersToQuantityMap,
    hydrateClarifiersFromText,
    mergeClarifierAnswerLayers,
    normalizeClientClarifierAnswers,
    wallMinuteAdjustmentForJobs,
} from './clarifierHydration';

export const MATRIX_V2_REVIEW_MESSAGE = "We'll review your request and get back with a quote.";

export interface MatrixV2RouteOptions {
    /** User-edited clarifier values; merged over text-hydration (used for pricing + UI). */
    clarifierAnswers?: Record<string, unknown>;
}

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

/** Collapse fillers so matrix phrases match "clean apartment" ↔ "clean my apartment". */
export function collapsedForPhraseMatch(normalized: string): string {
    return normalized
        .replace(/\b(my|the|our|a|an|me|to)\b/gi, ' ')
        .replace(/\b(please|pls|could\s+you|can\s+you|i\s+need|need|want|wanna|gotta)\b/gi, ' ')
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
    const collapsed = collapsedForPhraseMatch(normalized);
    const sorted = [...model.phrases].sort((a, b) => b.phrase.length - a.phrase.length);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of sorted) {
        if (!row.job_item_id || !row.phrase) continue;
        const hit =
            phraseMatchesInput(row.phrase, normalized) ||
            phraseMatchesInput(row.phrase, collapsed);
        if (!hit) continue;
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

const NUM_WORDS: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
};

/** Parse qty from `3 things` or `three things`. */
function qtyFromDigitOrWordMatch(n: string, re: RegExp): number | null {
    const m = n.match(re);
    if (!m) return null;
    const g = m[1];
    if (!g) return null;
    if (/^\d+$/.test(g)) return Math.max(1, parseInt(g, 10));
    const w = NUM_WORDS[g.toLowerCase()];
    return w !== undefined ? w : null;
}

export function quantityForJob(jobId: string, normalized: string): number {
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
        return (
            qtyFromDigitOrWordMatch(n, /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(shelves|shelf)\b/i) ??
            pick(/\b(\d+)\s*(shelves|shelf)\b/i) ??
            1
        );
    }
    if (jobId === 'blind_install') {
        return (
            qtyFromDigitOrWordMatch(n, /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+blinds?\b/i) ??
            qtyFromDigitOrWordMatch(n, /\bblinds?\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i) ??
            pick(/\b(\d+)\s*blinds?\b/i) ??
            1
        );
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
    if (sizeRow && sizeRow.price_gbp > 0) return sizeRow.price_gbp;
    const baseKey = String(job.base_tier || '').trim().toUpperCase();
    const baseRow = model.cleaningTiers.find((r) => r.tier === baseKey);
    return baseRow?.price_gbp ?? 0;
}

function mergeClarifiers(
    model: MatrixV2Model,
    jobIds: string[],
): Array<{ tag: string; question: string; inputType?: string; options?: string[] }> {
    const seen = new Set<string>();
    const out: Array<{ tag: string; question: string; inputType?: string; options?: string[] }> = [];
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
                inputType: def?.type,
                options: def?.options,
            });
        }
    }
    return out;
}

function formatMatrixV2Clarifiers(
    model: MatrixV2Model,
    jobIds: string[],
    merged: Record<string, string | number>,
): Array<{
    tag: string;
    question: string;
    inputType?: string;
    options?: string[];
    value?: string | number;
    affects_time: boolean;
    affects_safety: boolean;
}> {
    return mergeClarifiers(model, jobIds).map((c) => ({
        tag: c.tag,
        question: c.question,
        ...(c.inputType ? { inputType: c.inputType } : {}),
        ...(c.options?.length ? { options: c.options } : {}),
        ...(merged[c.tag] !== undefined ? { value: merged[c.tag] } : {}),
        affects_time: true,
        affects_safety: false,
    }));
}

export function routeAndPriceMatrixV2(model: MatrixV2Model, userInput: string, opts?: MatrixV2RouteOptions) {
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

    const hydratedFromText = hydrateClarifiersFromText(model, jobIds, normalized, quantityForJob);
    const clientAnswers = normalizeClientClarifierAnswers(opts?.clarifierAnswers);
    const clarifierAnswersMerged = mergeClarifierAnswerLayers(hydratedFromText, clientAnswers);
    applyClarifierAnswersToQuantityMap(model, jobIds, qtyMap, clarifierAnswersMerged);

    const cleaningUnits = inferCleaningUnits(normalized);

    /** Quantity threshold (cleaning uses property count, not BHK). */
    for (const id of jobIds) {
        const row = model.jobs.get(id)!;
        const th = Number(row.quantity_threshold || 0);
        if (th <= 0) continue;
        let q = qtyMap[id];
        if (row.category === 'CLEANING') q = cleaningUnits;
        if (q > th) {
            return buildReviewResult(
                parts,
                MATRIX_V2_REVIEW_MESSAGE,
                ['MATRIX_V2_QUANTITY_REVIEW'],
                formatMatrixV2Clarifiers(model, jobIds, clarifierAnswersMerged),
                {
                    detectedJobIds: [...jobIds],
                    quantityByJob: { ...qtyMap },
                    estimatedMinutes:
                        computeEstimatedMinutes(jobIds, qtyMap, model) +
                        wallMinuteAdjustmentForJobs(model, jobIds, clarifierAnswersMerged),
                    clarifierAnswers: clarifierAnswersMerged,
                    clarifierHydration: hydratedFromText,
                },
            );
        }
    }

    for (const id of jobIds) {
        const row = model.jobs.get(id)!;
        if (row.category === 'CLEANING') qtyMap[id] = cleaningUnits;
    }

    /** Commercial cleaning-style office cue (phrase not in V2 mapping) handled by NO_MATCH unless we detect */
    if (normalized.includes('clean') && /\b(?<!home\s)(office|retail|warehouse|commercial)\b/i.test(normalized)) {
        return buildReviewResult(
            parts,
            MATRIX_V2_REVIEW_MESSAGE,
            ['MATRIX_V2_COMMERCIAL_CLEAN'],
            formatMatrixV2Clarifiers(model, jobIds, clarifierAnswersMerged),
            {
                detectedJobIds: [...jobIds],
                quantityByJob: { ...qtyMap },
                estimatedMinutes:
                    computeEstimatedMinutes(jobIds, qtyMap, model) +
                    wallMinuteAdjustmentForJobs(model, jobIds, clarifierAnswersMerged),
                clarifierAnswers: clarifierAnswersMerged,
                clarifierHydration: hydratedFromText,
            },
        );
    }

    const categories = [...new Set(jobIds.map((id) => model.jobs.get(id)!.category))];

    /** Multi-job different category → REVIEW */
    if (categories.length > 1) {
        return buildReviewResult(
            parts,
            MATRIX_V2_REVIEW_MESSAGE,
            ['MATRIX_V2_CROSS_CATEGORY'],
            formatMatrixV2Clarifiers(model, jobIds, clarifierAnswersMerged),
            {
                detectedJobIds: [...jobIds],
                quantityByJob: { ...qtyMap },
                estimatedMinutes:
                    computeEstimatedMinutes(jobIds, qtyMap, model) +
                    wallMinuteAdjustmentForJobs(model, jobIds, clarifierAnswersMerged),
                distinctRoutingBuckets: categories.length,
                clarifierAnswers: clarifierAnswersMerged,
                clarifierHydration: hydratedFromText,
            },
        );
    }

    const category = categories[0] || 'HANDYMAN';

    const baseMinutes =
        jobIds.reduce((sum, id) => {
            const row = model.jobs.get(id)!;
            return sum + row.max_minutes * qtyMap[id];
        }, 0) + Math.max(0, jobIds.length - 1) * 10;

    const wallAdj = wallMinuteAdjustmentForJobs(model, jobIds, clarifierAnswersMerged);
    const totalMinutes = baseMinutes + wallAdj;

    /** Pricing (single source: matrix tiers; handyman uses combined minutes incl. quantity × max_minutes per job + clarifier adjustments) */
    let totalPrice = 0;
    let displayTier = 'H1';
    const displayMinutes = totalMinutes;

    if (category === 'HANDYMAN') {
        const t = handymanTierForMinutes(totalMinutes, model.handymanTiers);
        totalPrice = t?.price_gbp ?? 0;
        displayTier = t?.tier ?? 'H1';
    } else if (category === 'CLEANING') {
        const bhk = inferCleaningBhk(normalized);
        totalPrice = jobIds.reduce((sum, id) => sum + cleaningPrice(model.jobs.get(id)!, model, bhk), 0);
        displayTier = `C${Math.min(4, Math.max(1, bhk))}`;
    }

    if (!totalPrice || totalPrice <= 0) {
        return buildReviewResult(
            parts,
            MATRIX_V2_REVIEW_MESSAGE,
            ['MATRIX_V2_PRICE_FAIL'],
            formatMatrixV2Clarifiers(model, jobIds, clarifierAnswersMerged),
            {
                detectedJobIds: [...jobIds],
                quantityByJob: { ...qtyMap },
                estimatedMinutes:
                    computeEstimatedMinutes(jobIds, qtyMap, model) +
                    wallMinuteAdjustmentForJobs(model, jobIds, clarifierAnswersMerged),
                clarifierAnswers: clarifierAnswersMerged,
                clarifierHydration: hydratedFromText,
            },
        );
    }

    const clarifiers = formatMatrixV2Clarifiers(model, jobIds, clarifierAnswersMerged);

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
        clarifierAnswers: clarifierAnswersMerged,
        clarifierHydration: hydratedFromText,
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
        clarifier_answers: clarifierAnswersMerged,
        clarifier_hydration: hydratedFromText,
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

function computeEstimatedMinutes(jobIds: string[], qtyMap: Record<string, number>, model: MatrixV2Model): number {
    return (
        jobIds.reduce((sum, id) => sum + (model.jobs.get(id)?.max_minutes ?? 0) * qtyMap[id], 0) +
        Math.max(0, jobIds.length - 1) * 10
    );
}

export interface MatrixV2ReviewMetaExtras {
    detectedJobIds: string[];
    quantityByJob: Record<string, number>;
    estimatedMinutes: number;
    distinctRoutingBuckets?: number;
    clarifierAnswers?: Record<string, string | number>;
    clarifierHydration?: Record<string, string | number>;
}

function buildReviewResult(
    parts: string[],
    message: string,
    warnings: string[],
    clarifiers: Array<{
        tag: string;
        question: string;
        inputType?: string;
        options?: string[];
        value?: string | number;
        affects_time?: boolean;
        affects_safety?: boolean;
    }>,
    metaExtras?: MatrixV2ReviewMetaExtras,
) {
    const jobIds = metaExtras?.detectedJobIds ?? [];
    const qtyMap = metaExtras?.quantityByJob ?? {};
    const bucketCount = metaExtras?.distinctRoutingBuckets ?? (jobIds.length === 0 ? 0 : 1);
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
            ...(c.inputType ? { inputType: c.inputType } : {}),
            ...(c.options?.length ? { options: c.options } : {}),
            ...(c.value !== undefined ? { value: c.value } : {}),
            affects_time: c.affects_time ?? true,
            affects_safety: c.affects_safety ?? false,
        })),
        clarifier_answers: metaExtras?.clarifierAnswers ?? {},
        clarifier_hydration: metaExtras?.clarifierHydration ?? {},
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
            distinctRuleJobCount: jobIds.length,
            allResolutionSpecific: jobIds.length > 0,
            usedGenericFallback: false,
            partClauseCount: parts.length,
            distinctPricingJobCount: jobIds.length,
            quantityByJob: { ...qtyMap },
            estimatedTotalMinutes: metaExtras?.estimatedMinutes ?? 0,
            distinctRoutingBucketCount: bucketCount,
            matrixV2: { routing: 'REVIEW_QUOTE' as const, reviewReason: warnings[0] },
            ...(metaExtras?.clarifierAnswers
                ? { clarifierAnswers: metaExtras.clarifierAnswers }
                : {}),
            ...(metaExtras?.clarifierHydration
                ? { clarifierHydration: metaExtras.clarifierHydration }
                : {}),
        },
    };
}

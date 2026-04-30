/**
 * Pricing + routing logic for MATRIX V2 workbook (JOB_ITEMS / PHRASE_MAPPING / PRICING_TIERS / CLARIFIERS).
 */

import type { BookingMappingMeta, MatrixV2ParserTrace } from '../bookingRoutingTypes';
import { preprocessBookingInput } from '../inputPreprocess';
import type { GeneratedVisit } from '../visitEngine';
import type { MatrixV2Model, MatrixV2JobRow } from './types';
import {
    applyClarifierAnswersToQuantityMap,
    hydrateClarifiersFromText,
    inferTvScreenInches,
    inferWallSurfaceFromText,
    mergeClarifierAnswerLayers,
    normalizeClientClarifierAnswers,
    wallMinuteAdjustmentForJobs,
} from './clarifierHydration';
import { buildFlexibleMatchingText, collapsedForPhraseMatch } from './flexText';
import { inferJobsByKeywords } from './keywordJobInference';
import { quantityForJob } from './itemQuantity';

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

export { collapsedForPhraseMatch } from './flexText';

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

/** Show prefills from text hydration + explicit client answers only (no pricing defaults). */
function clarifierUiValue(
    tag: string,
    hydrated: Record<string, string | number>,
    client: Record<string, string | number>,
): string | number | undefined {
    const c = client[tag];
    if (c !== undefined && c !== '') return c;
    const h = hydrated[tag];
    if (h !== undefined && h !== '') return h;
    return undefined;
}

function formatMatrixV2Clarifiers(
    model: MatrixV2Model,
    jobIds: string[],
    hydratedFromText: Record<string, string | number>,
    clientAnswers: Record<string, string | number>,
): Array<{
    tag: string;
    question: string;
    inputType?: string;
    options?: string[];
    value?: string | number;
    affects_time: boolean;
    affects_safety: boolean;
}> {
    return mergeClarifiers(model, jobIds).map((c) => {
        const dv = clarifierUiValue(c.tag, hydratedFromText, clientAnswers);
        return {
            tag: c.tag,
            question: c.question,
            ...(c.inputType ? { inputType: c.inputType } : {}),
            ...(c.options?.length ? { options: c.options } : {}),
            ...(dv !== undefined ? { value: dv } : {}),
            affects_time: true,
            affects_safety: false,
        };
    });
}

function mergeKnownJobIds(model: MatrixV2Model, lists: string[][]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const list of lists) {
        for (const id of list) {
            if (!id || seen.has(id)) continue;
            if (!model.jobs.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
    }
    return out;
}

function classifyParserResolution(params: {
    phrase_job_ids: string[];
    phrase_job_ids_flex: string[];
    keyword_job_ids: string[];
    merged: string[];
}): MatrixV2ParserTrace['resolution'] {
    if (params.merged.length === 0) return 'none';
    const p = params.phrase_job_ids.length > 0;
    const pf = params.phrase_job_ids_flex.length > 0;
    const kw = params.keyword_job_ids.length > 0;
    if (kw && !p && !pf) return 'keyword';
    if ((p || pf) && kw) return 'phrase+keyword';
    if (pf && !p) return 'phrase_flex';
    if (p) return 'phrase';
    return 'mixed';
}

function resolveMatrixV2JobIds(model: MatrixV2Model, normalized: string): {
    jobIds: string[];
    parser: MatrixV2ParserTrace;
} {
    const flexibleText = buildFlexibleMatchingText(normalized);
    const phrase_job_ids = matchAllJobIdsFromPhrases(model, normalized);
    const phrase_job_ids_flex = matchAllJobIdsFromPhrases(model, flexibleText);
    const kw = inferJobsByKeywords(model, normalized);
    const merged = mergeKnownJobIds(model, [phrase_job_ids, phrase_job_ids_flex, kw.jobIds]);

    const entities: Record<string, string | number> = {};
    const wall = inferWallSurfaceFromText(normalized);
    if (wall) entities.WALL_TYPE = wall;
    const inch = inferTvScreenInches(normalized);
    if (inch !== undefined) entities.TV_SIZE = inch;

    return {
        jobIds: merged,
        parser: {
            normalized_input: normalized,
            flexible_match_text: flexibleText,
            phrase_job_ids,
            phrase_job_ids_flex,
            keyword_job_ids: kw.jobIds,
            keywords_matched: kw.keywords_matched,
            merged_job_ids: merged,
            resolution: classifyParserResolution({
                phrase_job_ids,
                phrase_job_ids_flex,
                keyword_job_ids: kw.jobIds,
                merged,
            }),
            entities: { ...entities },
        },
    };
}

function enrichParserEntitiesFromAnswers(
    parser: MatrixV2ParserTrace,
    merged: Record<string, string | number>,
): void {
    const e = { ...parser.entities };
    for (const [k, val] of Object.entries(merged)) {
        const up = k.toUpperCase().replace(/\s+/g, '_');
        if (/(ITEM_COUNT|QUANTITY|NUM_ITEMS|HOW_MANY|^COUNT$|N_ITEMS|NUM_BLIND)/i.test(up)) {
            e.ITEM_COUNT = val;
        }
        if (/(TV.?SIZE|SCREEN.?SIZE|DISPLAY.?SIZE|DIAGONAL|SCREEN.?DIAG|PANEL.?SIZE)/i.test(k)) {
            e.TV_SIZE = val;
        }
        if (/(WALL.?TYPE|SURFACE|SUBSTRATE|INSTALL.?SURFACE)/i.test(up)) {
            e.WALL_TYPE = val;
        }
    }
    parser.entities = e;
}

export function routeAndPriceMatrixV2(model: MatrixV2Model, userInput: string, opts?: MatrixV2RouteOptions) {
    const normalized = normalizeV2Input(userInput);
    const parts = normalized.split(' and ').map((s) => s.trim()).filter(Boolean);

    const { jobIds, parser: parserTrace } = resolveMatrixV2JobIds(model, normalized);

    /** Step 5: vague / no mapping */
    if (!normalized.trim()) {
        return buildReviewResult(parts, MATRIX_V2_REVIEW_MESSAGE, ['MATRIX_V2_NO_MATCH'], [], {
            parser: parserTrace,
        });
    }

    if (jobIds.length === 0) {
        return buildReviewResult(parts, MATRIX_V2_REVIEW_MESSAGE, ['MATRIX_V2_NO_MATCH'], [], {
            parser: parserTrace,
        });
    }

    /** Step 5: unknown job safeguard */
    for (const id of jobIds) {
        if (!model.jobs.has(id)) {
            return buildReviewResult(parts, MATRIX_V2_REVIEW_MESSAGE, ['MATRIX_V2_JOB_UNKNOWN'], [], {
                parser: parserTrace,
            });
        }
    }

    const qtyMap: Record<string, number> = {};
    for (const id of jobIds) {
        qtyMap[id] = Math.max(1, quantityForJob(id, normalized));
    }

    const hydratedFromText = hydrateClarifiersFromText(model, jobIds, normalized);
    const clientAnswers = normalizeClientClarifierAnswers(opts?.clarifierAnswers);
    const clarifierAnswersMerged = mergeClarifierAnswerLayers(hydratedFromText, clientAnswers);
    applyClarifierAnswersToQuantityMap(model, jobIds, qtyMap, clarifierAnswersMerged);
    enrichParserEntitiesFromAnswers(parserTrace, clarifierAnswersMerged);

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
                formatMatrixV2Clarifiers(model, jobIds, hydratedFromText, clientAnswers),
                {
                    detectedJobIds: [...jobIds],
                    quantityByJob: { ...qtyMap },
                    estimatedMinutes:
                        computeEstimatedMinutes(jobIds, qtyMap, model) +
                        wallMinuteAdjustmentForJobs(model, jobIds, clarifierAnswersMerged),
                    clarifierAnswers: clarifierAnswersMerged,
                    clarifierHydration: hydratedFromText,
                    parser: parserTrace,
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
            formatMatrixV2Clarifiers(model, jobIds, hydratedFromText, clientAnswers),
            {
                detectedJobIds: [...jobIds],
                quantityByJob: { ...qtyMap },
                estimatedMinutes:
                    computeEstimatedMinutes(jobIds, qtyMap, model) +
                    wallMinuteAdjustmentForJobs(model, jobIds, clarifierAnswersMerged),
                clarifierAnswers: clarifierAnswersMerged,
                clarifierHydration: hydratedFromText,
                parser: parserTrace,
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
            formatMatrixV2Clarifiers(model, jobIds, hydratedFromText, clientAnswers),
            {
                detectedJobIds: [...jobIds],
                quantityByJob: { ...qtyMap },
                estimatedMinutes:
                    computeEstimatedMinutes(jobIds, qtyMap, model) +
                    wallMinuteAdjustmentForJobs(model, jobIds, clarifierAnswersMerged),
                distinctRoutingBuckets: categories.length,
                clarifierAnswers: clarifierAnswersMerged,
                clarifierHydration: hydratedFromText,
                parser: parserTrace,
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
            formatMatrixV2Clarifiers(model, jobIds, hydratedFromText, clientAnswers),
            {
                detectedJobIds: [...jobIds],
                quantityByJob: { ...qtyMap },
                estimatedMinutes:
                    computeEstimatedMinutes(jobIds, qtyMap, model) +
                    wallMinuteAdjustmentForJobs(model, jobIds, clarifierAnswersMerged),
                clarifierAnswers: clarifierAnswersMerged,
                clarifierHydration: hydratedFromText,
                parser: parserTrace,
            },
        );
    }

    const clarifiers = formatMatrixV2Clarifiers(model, jobIds, hydratedFromText, clientAnswers);

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
        matrixV2: { routing: 'FIXED_PRICE' as const, parser: parserTrace },
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
    detectedJobIds?: string[];
    quantityByJob?: Record<string, number>;
    estimatedMinutes?: number;
    distinctRoutingBuckets?: number;
    clarifierAnswers?: Record<string, string | number>;
    clarifierHydration?: Record<string, string | number>;
    parser?: MatrixV2ParserTrace;
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
            matrixV2: {
                routing: 'REVIEW_QUOTE' as const,
                reviewReason: warnings[0],
                ...(metaExtras?.parser ? { parser: metaExtras.parser } : {}),
            },
            ...(metaExtras?.clarifierAnswers
                ? { clarifierAnswers: metaExtras.clarifierAnswers }
                : {}),
            ...(metaExtras?.clarifierHydration
                ? { clarifierHydration: metaExtras.clarifierHydration }
                : {}),
        },
    };
}

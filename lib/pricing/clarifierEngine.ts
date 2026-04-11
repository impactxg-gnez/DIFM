import { excelSource, type ClarifierExcel } from './excelLoader';
import { planClarifiersForVisitJobIds, type PlannedClarifier } from './dynamicClarifiers';
import { normalizeInput } from './intentMapper';
import type { GeneratedVisit } from './visitEngine';

export interface ClarifierQuestion {
    id: string;
    question: string;
    inputType: 'number' | 'select' | 'boolean' | 'text';
    required: boolean;
    options?: string[];
    impacts?: string;
    capability_tag?: string;
    affects_time: boolean;
    affects_safety: boolean;
    clarifier_type: 'PRICING' | 'SAFETY';
}

function toArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((v) => String(v));
    return [];
}

function getVisitJobIds(visit: any): string[] {
    const primary = visit?.primary_job_item?.job_item_id || visit?.primary_job_item_id;
    const addons = toArray(visit?.addon_job_item_ids).concat(
        toArray(visit?.addon_job_items)
            .map((a: any) => a?.job_item_id)
            .filter(Boolean),
    );
    return [primary, ...addons].filter(Boolean);
}

function parseImpactFlags(impacts: unknown): { affectsTime: boolean; affectsSafety: boolean } {
    const normalized = String(impacts || '').toLowerCase();
    return {
        affectsTime: /time|tier|price/.test(normalized),
        affectsSafety: /safety|inspection|compliance|risk/.test(normalized),
    };
}

function mergePlannedWithExcel(planned: PlannedClarifier, def?: ClarifierExcel): ClarifierQuestion {
    const impactFlags = def ? parseImpactFlags(def.impacts) : { affectsTime: true, affectsSafety: false };
    const affectsTime = impactFlags.affectsTime || planned.affects_time;
    const affectsSafety = impactFlags.affectsSafety || planned.affects_safety;
    const inputType = (def?.input_type || def?.type || planned.inputType || 'text') as ClarifierQuestion['inputType'];
    const options =
        def?.options && def.options.length > 0 ? def.options : planned.options.length > 0 ? planned.options : [];
    return {
        id: planned.id,
        question: def?.question || planned.question,
        inputType,
        required: String(def?.required_YN || '').toUpperCase() === 'Y' ? true : planned.required,
        options,
        impacts: def?.impacts || 'time,tier,price',
        capability_tag: String((def as any)?.capability_tag || ''),
        affects_time: affectsTime,
        affects_safety: affectsSafety,
        clarifier_type: affectsSafety && !affectsTime ? 'SAFETY' : planned.clarifier_type,
    };
}

function excelOnlyQuestion(id: string, capabilityTag: string | undefined): ClarifierQuestion | null {
    const definition = excelSource.clarifierDefinitions.get(id);
    if (!definition) return null;
    const impactFlags = parseImpactFlags(definition.impacts);
    const affectsTime = impactFlags.affectsTime || ['TV_SIZE_INCHES', 'WALL_TYPE', 'ITEM_COUNT', 'ELECTRICAL_POINT_COUNT'].includes(id);
    const affectsSafety = impactFlags.affectsSafety;
    return {
        id,
        question: definition.question || id,
        inputType: (definition.input_type || definition.type || 'text') as ClarifierQuestion['inputType'],
        required: String(definition.required_YN || '').toUpperCase() === 'Y',
        options: definition.options || [],
        impacts: definition.impacts || '',
        capability_tag: String((definition as any).capability_tag || capabilityTag || ''),
        affects_time: affectsTime,
        affects_safety: affectsSafety,
        clarifier_type: affectsTime ? 'PRICING' : 'SAFETY',
    };
}

/**
 * Scope-shaping clarifiers: gated on job description + matrix job ids, merged with Excel copy when present.
 */
export function getClarifierSchemaForVisit(
    visit: any,
    options?: { jobDescription?: string },
): ClarifierQuestion[] {
    const jobIds = getVisitJobIds(visit);
    const capabilityTag = visit?.required_capability_tags?.[0] || visit?.required_capability_tags_union?.[0];
    const normalizedDesc = options?.jobDescription ? normalizeInput(options.jobDescription) : '';
    const primary = jobIds[0] || '';
    const addons = jobIds.slice(1);

    const planned = planClarifiersForVisitJobIds(normalizedDesc, primary, addons);
    const plannedIds = new Set(planned.map((p) => p.id));
    const questions: ClarifierQuestion[] = planned.map((p) =>
        mergePlannedWithExcel(p, excelSource.clarifierDefinitions.get(p.id)),
    );

    for (const jobId of jobIds) {
        const item = excelSource.jobItems.get(jobId);
        if (!item?.clarifier_ids?.length) continue;
        for (const clarifierId of item.clarifier_ids) {
            if (plannedIds.has(clarifierId)) continue;
            const q = excelOnlyQuestion(clarifierId, item.capability_tag || capabilityTag);
            if (q && !questions.some((x) => x.id === q.id)) questions.push(q);
        }
    }

    return questions;
}

/**
 * @deprecated Use computeClarifierPricingEffects in dynamicClarifiers + scopeLockEngine tier bump.
 */
export function computeClarifierAdjustmentMinutes(_visit: any, _answers: Record<string, any>): number {
    return 0;
}

export function attachClarifiersToVisits(visits: GeneratedVisit[], jobDescription?: string): GeneratedVisit[] {
    const normalizedDesc = jobDescription ? normalizeInput(jobDescription) : '';
    return visits.map((visit) => ({
        ...visit,
        clarifiers: getClarifierSchemaForVisit(
            {
                primary_job_item_id: visit.primary_job_item.job_item_id,
                addon_job_item_ids: visit.addon_job_items.map((a) => a.job_item_id),
                required_capability_tags: visit.required_capability_tags,
            },
            { jobDescription: normalizedDesc || undefined },
        ),
        detected_tasks: [
            visit.primary_job_item?.job_item_id,
            ...(visit.addon_job_items || []).map((a) => a.job_item_id),
        ].filter(Boolean),
    })) as GeneratedVisit[];
}

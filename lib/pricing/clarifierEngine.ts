import { excelSource } from './excelLoader';
import type { GeneratedVisit } from './visitEngine';

export interface ClarifierQuestion {
    id: string;
    question: string;
    inputType: 'number' | 'select' | 'boolean' | 'text';
    required: boolean;
    options?: string[];
    impacts?: string;
}

function toArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((v) => String(v));
    return [];
}

function getVisitJobIds(visit: any): string[] {
    const primary = visit?.primary_job_item?.job_item_id || visit?.primary_job_item_id;
    const addons = toArray(visit?.addon_job_item_ids).concat(
        toArray(visit?.addon_job_items).map((a: any) => a?.job_item_id).filter(Boolean)
    );
    return [primary, ...addons].filter(Boolean);
}

function getDerivedClarifierIds(jobIds: string[]): string[] {
    const ids = new Set<string>();
    const hasShelfOrPicture = jobIds.some((id) =>
        id.includes('shelf') || id.includes('pic_hang') || id.includes('mirror_hang')
    );
    const hasSocketOrLight = jobIds.some((id) =>
        id.includes('socket') || id.includes('light')
    );
    const hasRadiatorBleed = jobIds.some((id) => id.includes('radiator_bleed'));

    if (hasShelfOrPicture) ids.add('ITEM_COUNT');
    if (hasSocketOrLight) ids.add('ELECTRICAL_POINT_COUNT');
    if (hasRadiatorBleed) ids.add('ITEM_COUNT');

    return [...ids];
}

export function getClarifierSchemaForVisit(visit: any): ClarifierQuestion[] {
    const jobIds = getVisitJobIds(visit);
    const clarifierIds = new Set<string>();

    for (const jobId of jobIds) {
        const item = excelSource.jobItems.get(jobId);
        if (!item?.clarifier_ids) continue;
        item.clarifier_ids.forEach((clarifierId) => clarifierIds.add(clarifierId));
    }

    getDerivedClarifierIds(jobIds).forEach((id) => clarifierIds.add(id));

    return [...clarifierIds]
        .map((id) => {
            const definition = excelSource.clarifierDefinitions.get(id);
            if (!definition) return null;
            return {
                id,
                question: definition.question || id,
                inputType: (definition.input_type || definition.type || 'text') as ClarifierQuestion['inputType'],
                required: String(definition.required_YN || '').toUpperCase() === 'Y',
                options: definition.options || [],
                impacts: definition.impacts || '',
            } satisfies ClarifierQuestion;
        })
        .filter((q): q is ClarifierQuestion => !!q);
}

function parseNumber(raw: unknown): number | null {
    if (raw === null || raw === undefined) return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
}

function includesAny(value: string, needles: string[]) {
    const lower = String(value || '').toLowerCase();
    return needles.some((n) => lower.includes(n));
}

export function computeClarifierAdjustmentMinutes(visit: any, answers: Record<string, any>): number {
    let delta = 0;
    const jobIds = getVisitJobIds(visit);

    const tvSize = parseNumber(answers.TV_SIZE_INCHES ?? answers.tv_size);
    if (tvSize !== null) {
        if (tvSize > 85) delta += 60;
        else if (tvSize >= 65) delta += 30;
    }

    const wallType = String(answers.WALL_TYPE ?? answers.wall_type ?? '');
    if (wallType) {
        if (includesAny(wallType, ['concrete'])) delta += 45;
        else if (includesAny(wallType, ['brick'])) delta += 30;
    }

    const hasQuantityPattern = jobIds.some((id) =>
        id.includes('shelf') ||
        id.includes('pic_hang') ||
        id.includes('socket') ||
        id.includes('light') ||
        id.includes('radiator_bleed')
    );
    if (hasQuantityPattern) {
        const count = parseNumber(
            answers.ITEM_COUNT ??
            answers.ELECTRICAL_POINT_COUNT ??
            answers.shelf_count
        );
        if (count !== null) {
            if (count >= 5) delta += 60;
            else if (count >= 3) delta += 30;
        }
    }

    return delta;
}

export function attachClarifiersToVisits(visits: GeneratedVisit[]): GeneratedVisit[] {
    return visits.map((visit) => ({
        ...visit,
        clarifiers: getClarifierSchemaForVisit(visit),
        detected_tasks: [
            visit.primary_job_item?.job_item_id,
            ...(visit.addon_job_items || []).map((a) => a.job_item_id)
        ].filter(Boolean)
    })) as GeneratedVisit[];
}


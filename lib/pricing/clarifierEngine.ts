import { excelSource } from './excelLoader';
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
        toArray(visit?.addon_job_items).map((a: any) => a?.job_item_id).filter(Boolean)
    );
    return [primary, ...addons].filter(Boolean);
}

function getDerivedClarifierIds(jobIds: string[]): string[] {
    const ids = new Set<string>();
    const hasTvMount = jobIds.some((id) =>
        id.includes('tv_mount') || id.includes('mount_tv') || id.includes('install_wall_tv_cabling_hide')
    );
    const hasShelfOrPicture = jobIds.some((id) =>
        id.includes('shelf') || id.includes('pic_hang') || id.includes('mirror_hang')
    );
    const hasSocketOrLight = jobIds.some((id) =>
        id.includes('socket') || id.includes('light')
    );
    const hasRadiatorBleed = jobIds.some((id) => id.includes('radiator_bleed'));

    if (hasTvMount) {
        ids.add('TV_SIZE_INCHES');
        ids.add('WALL_TYPE');
        ids.add('CABLE_CONCEALMENT');
    }
    if (hasShelfOrPicture) ids.add('ITEM_COUNT');
    if (hasSocketOrLight) ids.add('ELECTRICAL_POINT_COUNT');
    if (hasRadiatorBleed) ids.add('ITEM_COUNT');

    return [...ids];
}

function parseImpactFlags(impacts: unknown): { affectsTime: boolean; affectsSafety: boolean } {
    const normalized = String(impacts || '').toLowerCase();
    return {
        affectsTime: /time|tier|price/.test(normalized),
        affectsSafety: /safety|inspection|compliance|risk/.test(normalized)
    };
}

export function getClarifierSchemaForVisit(visit: any): ClarifierQuestion[] {
    const jobIds = getVisitJobIds(visit);
    const clarifierIds = new Set<string>();
    const capabilityTag = visit?.required_capability_tags?.[0] || visit?.required_capability_tags_union?.[0];

    for (const jobId of jobIds) {
        const item = excelSource.jobItems.get(jobId);
        if (!item?.clarifier_ids) continue;
        item.clarifier_ids.forEach((clarifierId) => clarifierIds.add(clarifierId));
    }

    getDerivedClarifierIds(jobIds).forEach((id) => clarifierIds.add(id));

    const questions: ClarifierQuestion[] = [];
    for (const id of [...clarifierIds]) {
        const definition = excelSource.clarifierDefinitions.get(id);
        if (!definition) continue;
        const impactFlags = parseImpactFlags(definition.impacts);
        const affectsTime = impactFlags.affectsTime || ['TV_SIZE_INCHES', 'WALL_TYPE', 'ITEM_COUNT', 'ELECTRICAL_POINT_COUNT'].includes(id);
        const affectsSafety = impactFlags.affectsSafety;
        questions.push({
            id,
            question: definition.question || id,
            inputType: (definition.input_type || definition.type || 'text') as ClarifierQuestion['inputType'],
            required: String(definition.required_YN || '').toUpperCase() === 'Y',
            options: definition.options || [],
            impacts: definition.impacts || '',
            capability_tag: String((definition as any).capability_tag || capabilityTag || ''),
            affects_time: affectsTime,
            affects_safety: affectsSafety,
            clarifier_type: affectsTime ? 'PRICING' : 'SAFETY'
        });
    }
    return questions;
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
    const clarifierSchema = getClarifierSchemaForVisit(visit);
    const affectsTimeIds = new Set(clarifierSchema.filter((q) => q.affects_time).map((q) => q.id));

    const tvSize = parseNumber(answers.TV_SIZE_INCHES ?? answers.tv_size);
    if (tvSize !== null && affectsTimeIds.has('TV_SIZE_INCHES')) {
        if (tvSize > 85) delta += 60;
        else if (tvSize >= 65) delta += 30;
    }

    const wallType = String(answers.WALL_TYPE ?? answers.wall_type ?? '');
    if (wallType && affectsTimeIds.has('WALL_TYPE')) {
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
    if (hasQuantityPattern && (affectsTimeIds.has('ITEM_COUNT') || affectsTimeIds.has('ELECTRICAL_POINT_COUNT'))) {
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


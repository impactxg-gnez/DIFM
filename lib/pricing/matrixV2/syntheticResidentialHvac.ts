import type { MatrixV2JobRow, MatrixV2Model } from './types';

/** Priced via HANDYMAN minute ladder (`handymanTierForMinutes`). */
const AC_WALL_UNIT_INSTALL: MatrixV2JobRow = {
    job_item_id: 'ac_wall_unit_install',
    category: 'HVAC',
    base_tier: 'H3',
    min_minutes: 130,
    max_minutes: 190,
    clarifierIds: [],
    quantity_threshold: 8,
};

const AC_UNIT_SERVICE: MatrixV2JobRow = {
    job_item_id: 'ac_unit_service',
    category: 'HVAC',
    base_tier: 'H2',
    min_minutes: 55,
    max_minutes: 95,
    clarifierIds: [],
    quantity_threshold: 12,
};

/** Per job phrases (lowercase equivalents matched via workbook phrase layer). */
const PHRASES_BY_JOB: Record<string, string[]> = {
    ac_wall_unit_install: [
        'install ac',
        'install air con',
        'install air conditioner',
        'install split ac',
        'install mini split',
        'install hvac unit',
        'ac installation',
        'hvac installation',
        'air con install',
        'wall ac install',
        'mini split installation',
        'split unit install',
    ],
    ac_unit_service: [
        'ac service',
        'air con service',
        'air conditioning service',
        'aircon service',
        'hvac service',
        'ac repair',
        'air con repair',
        'servicing ac',
        'annual ac service',
    ],
};

export function applySyntheticResidentialHvacToModel(model: MatrixV2Model): void {
    if (!model.jobs.has('ac_wall_unit_install')) model.jobs.set('ac_wall_unit_install', AC_WALL_UNIT_INSTALL);
    if (!model.jobs.has('ac_unit_service')) model.jobs.set('ac_unit_service', AC_UNIT_SERVICE);

    const existing = new Set(model.phrases.map((p) => `${p.phrase.toLowerCase().trim()}::${p.job_item_id}`));
    for (const [jobId, phrases] of Object.entries(PHRASES_BY_JOB)) {
        for (const phrase of phrases) {
            const key = `${phrase.toLowerCase().trim()}::${jobId}`;
            if (existing.has(key)) continue;
            existing.add(key);
            model.phrases.push({ phrase, job_item_id: jobId });
        }
    }
}

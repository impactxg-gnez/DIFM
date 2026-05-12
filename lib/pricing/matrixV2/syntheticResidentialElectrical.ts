import type { MatrixV2JobRow, MatrixV2Model, MatrixV2PhraseRow } from './types';

/** Priced like HANDYMAN via matrix engine (`handymanTierForMinutes`). */
const REPLACE_SOCKET: MatrixV2JobRow = {
    job_item_id: 'replace_socket',
    category: 'ELECTRICAL',
    base_tier: 'H1',
    min_minutes: 40,
    max_minutes: 55,
    clarifierIds: [],
    quantity_threshold: 0,
};

const INSTALL_CEILING_LIGHT: MatrixV2JobRow = {
    job_item_id: 'install_light_fitting',
    category: 'ELECTRICAL',
    base_tier: 'H1',
    min_minutes: 45,
    max_minutes: 65,
    clarifierIds: [],
    quantity_threshold: 0,
};

const INSTALL_CEILING_FAN: MatrixV2JobRow = {
    job_item_id: 'install_ceiling_fan',
    category: 'ELECTRICAL',
    base_tier: 'H2',
    min_minutes: 65,
    max_minutes: 95,
    clarifierIds: [],
    quantity_threshold: 0,
};

/** Per job_item_id phrases (lowercase) when missing from workbook PHRASE_MAPPING */
const SYNTH_PHRASES: Record<string, string[]> = {
    replace_socket: [
        'replace socket',
        'socket replacement',
        'changing socket',
        'change socket',
        'upgrade socket',
        'new socket',
        'broken socket',
        'faulty socket',
        'swap socket',
    ],
    install_light_fitting: [
        'install ceiling light',
        'hang ceiling light',
        'install light fitting',
        'ceiling lights install',
        'fit ceiling light',
        'mount ceiling light',
        'install chandelier',
        'hang chandelier',
    ],
    install_ceiling_fan: [
        'install ceiling fan',
        'hang ceiling fan',
        'fit ceiling fan',
        'mount ceiling fan',
        'fix ceiling fan',
    ],
};

const SYNTH_JOBS_IN_ORDER: Array<{ id: keyof typeof SYNTH_PHRASES; row: MatrixV2JobRow }> = [
    { id: 'replace_socket', row: REPLACE_SOCKET },
    { id: 'install_light_fitting', row: INSTALL_CEILING_LIGHT },
    { id: 'install_ceiling_fan', row: INSTALL_CEILING_FAN },
];

/**
 * Matrix V2 pilot workbook ships without electrical SKUs; merge common residential jobs when absent.
 */
export function applySyntheticResidentialElectricalToModel(model: MatrixV2Model): void {
    const existingPhraseKeys = new Set(model.phrases.map((p) => `${p.phrase.toLowerCase().trim()}::${p.job_item_id}`));

    for (const { id, row } of SYNTH_JOBS_IN_ORDER) {
        if (model.jobs.has(row.job_item_id)) continue;
        model.jobs.set(row.job_item_id, row);

        const lines = SYNTH_PHRASES[id] ?? [];
        for (const phrase of lines) {
            const key = `${phrase.toLowerCase().trim()}::${row.job_item_id}`;
            if (existingPhraseKeys.has(key)) continue;
            existingPhraseKeys.add(key);
            model.phrases.push({ phrase, job_item_id: row.job_item_id });
        }
    }
}

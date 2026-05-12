import type { MatrixV2ClarifierRow, MatrixV2JobRow, MatrixV2Model } from './types';

const SCOPE_CLARIFIER: MatrixV2ClarifierRow = {
    id: 'EXT_SCOPE_RESIDENTIAL',
    question: 'Is this work at a residential address?',
    type: 'select',
    options: ['Yes', 'Not sure / commercial'],
};

function ensureClarifier(model: MatrixV2Model): void {
    if (!model.clarifiers.has('EXT_SCOPE_RESIDENTIAL')) {
        model.clarifiers.set('EXT_SCOPE_RESIDENTIAL', SCOPE_CLARIFIER);
    }
}

const C = ['EXT_SCOPE_RESIDENTIAL'];

const APPLIANCE = (row: Omit<MatrixV2JobRow, 'clarifierIds'> & { clarifierIds?: string[] }): MatrixV2JobRow => ({
    ...row,
    clarifierIds: row.clarifierIds?.length ? row.clarifierIds : C,
});

const HANDY = (row: Omit<MatrixV2JobRow, 'clarifierIds'> & { clarifierIds?: string[] }): MatrixV2JobRow => ({
    ...row,
    clarifierIds: row.clarifierIds?.length ? row.clarifierIds : C,
});

const JOBS: MatrixV2JobRow[] = [
    APPLIANCE({
        job_item_id: 'water_purifier_service',
        category: 'APPLIANCE',
        base_tier: 'H2',
        min_minutes: 40,
        max_minutes: 65,
        quantity_threshold: 14,
    }),
    APPLIANCE({
        job_item_id: 'water_purifier_repair',
        category: 'APPLIANCE',
        base_tier: 'H2',
        min_minutes: 45,
        max_minutes: 75,
        quantity_threshold: 14,
    }),
    APPLIANCE({
        job_item_id: 'geyser_repair',
        category: 'APPLIANCE',
        base_tier: 'H2',
        min_minutes: 55,
        max_minutes: 95,
        quantity_threshold: 12,
    }),
    APPLIANCE({
        job_item_id: 'geyser_install',
        category: 'APPLIANCE',
        base_tier: 'H3',
        min_minutes: 90,
        max_minutes: 150,
        quantity_threshold: 8,
    }),
    APPLIANCE({
        job_item_id: 'microwave_repair',
        category: 'APPLIANCE',
        base_tier: 'H1',
        min_minutes: 35,
        max_minutes: 60,
        quantity_threshold: 16,
    }),
    APPLIANCE({
        job_item_id: 'fridge_repair',
        category: 'APPLIANCE',
        base_tier: 'H2',
        min_minutes: 50,
        max_minutes: 90,
        quantity_threshold: 12,
    }),
    APPLIANCE({
        job_item_id: 'washing_machine_repair',
        category: 'APPLIANCE',
        base_tier: 'H2',
        min_minutes: 55,
        max_minutes: 100,
        quantity_threshold: 10,
    }),
    APPLIANCE({
        job_item_id: 'dishwasher_install',
        category: 'APPLIANCE',
        base_tier: 'H2',
        min_minutes: 70,
        max_minutes: 115,
        quantity_threshold: 10,
    }),
    APPLIANCE({
        job_item_id: 'thermostat_install',
        category: 'APPLIANCE',
        base_tier: 'H2',
        min_minutes: 45,
        max_minutes: 75,
        quantity_threshold: 14,
    }),
    HANDY({
        job_item_id: 'door_lock_install',
        category: 'HANDYMAN',
        base_tier: 'H2',
        min_minutes: 50,
        max_minutes: 80,
        quantity_threshold: 14,
    }),
    HANDY({
        job_item_id: 'smart_lock_install',
        category: 'HANDYMAN',
        base_tier: 'H2',
        min_minutes: 60,
        max_minutes: 95,
        quantity_threshold: 12,
    }),
    HANDY({
        job_item_id: 'door_repair',
        category: 'HANDYMAN',
        base_tier: 'H2',
        min_minutes: 45,
        max_minutes: 85,
        quantity_threshold: 14,
    }),
    HANDY({
        job_item_id: 'window_repair',
        category: 'HANDYMAN',
        base_tier: 'H2',
        min_minutes: 50,
        max_minutes: 90,
        quantity_threshold: 12,
    }),
    HANDY({
        job_item_id: 'curtain_repair',
        category: 'HANDYMAN',
        base_tier: 'H1',
        min_minutes: 30,
        max_minutes: 55,
        quantity_threshold: 18,
    }),
    HANDY({
        job_item_id: 'cabinet_repair',
        category: 'HANDYMAN',
        base_tier: 'H2',
        min_minutes: 45,
        max_minutes: 85,
        quantity_threshold: 14,
    }),
];

const PHRASES: Record<string, string[]> = {
    water_purifier_service: [
        'water purifier service',
        'purifier service',
        'ro service',
        'uv water purifier service',
        'filter service water purifier',
    ],
    water_purifier_repair: ['water purifier repair', 'purifier repair', 'repair water purifier', 'ro repair', 'reverse osmosis repair'],
    geyser_repair: ['geyser repair', 'geyser not working', 'water heater repair', 'hot water cylinder repair', 'booster repair'],
    geyser_install: ['geyser install', 'geyser installation', 'install geyser', 'water heater install', 'electric water heater installation'],
    microwave_repair: [
        'microwave repair',
        'microwave not heating',
        'fix microwave',
        'repair microwave',
        'micrwave repair',
        'micro wave repair',
    ],
    fridge_repair: [
        'fridge repair',
        'refrigerator repair',
        'repair fridge',
        'fix refrigerator',
        'fridge not cooling',
        'freezer repair',
    ],
    washing_machine_repair: [
        'washing machine repair',
        'washer repair',
        'fix washing machine',
        'repair washer',
        'washing machine not spinning',
    ],
    dishwasher_install: ['dishwasher install', 'dishwasher installation', 'install dishwasher', 'fit dishwasher', 'integrated dishwasher install'],
    thermostat_install: [
        'thermostat install',
        'thermostat installation',
        'install thermostat',
        'smart thermostat fit',
        'nest thermostat install',
        'hive thermostat install',
    ],
    door_lock_install: ['door lock install', 'install door lock', 'new lock fitting', 'mortise lock install', 'replace door lock fitting'],
    smart_lock_install: ['smart lock install', 'digital lock install', 'keypad lock install', 'install smart lock', 'smart door lock'],
    door_repair: ['door repair', 'fix door', 'repair door hinge', 'internal door repair', 'repair door frame'],
    window_repair: ['window repair', 'fix window', 'repair window hinge', 'double glazing repair'],
    curtain_repair: ['curtain repair', 'repair curtain', 'curtain pole repair'],
    cabinet_repair: ['cabinet repair', 'kitchen cupboard repair', 'fix cabinet door'],
};

/** Merge workbook + deterministic extended residential SKUs. */
export function applySyntheticExtendedHomeServicesToModel(model: MatrixV2Model): void {
    ensureClarifier(model);
    for (const row of JOBS) {
        if (!model.jobs.has(row.job_item_id)) {
            model.jobs.set(row.job_item_id, row);
        }
    }
    const existing = new Set(model.phrases.map((p) => `${p.phrase.toLowerCase().trim()}::${p.job_item_id}`));
    for (const [jobId, phrases] of Object.entries(PHRASES)) {
        for (const phrase of phrases) {
            const key = `${phrase.toLowerCase().trim()}::${jobId}`;
            if (existing.has(key)) continue;
            existing.add(key);
            model.phrases.push({ phrase, job_item_id: jobId });
        }
    }
}

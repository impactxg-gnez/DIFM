import type { MatrixV2JobRow, MatrixV2Model, MatrixV2PhraseRow } from './types';

/** Core residential SKU — aligns with prisma seed / catalogue; priced on HANDYMAN minutes ladder like other Matrix V2 add-ons */
const TAP_LEAK_FIX_JOB: MatrixV2JobRow = {
    job_item_id: 'tap_leak_fix',
    category: 'PLUMBING',
    base_tier: 'H1',
    min_minutes: 35,
    max_minutes: 55,
    clarifierIds: [],
    quantity_threshold: 0,
};

/** Phrase rows merged into Matrix V2 when the workbook ships without plumbing JOB_ITEMS yet. */
const TAP_LEAK_PHRASE_TEXTS = [
    'blocked sink',
    'clog sink',
    'clogged sink',
    'sink blocked',
    'sink clog',
    'unblock sink',
    'sink not drain',
    'fix leaking tap',
    'fix leaky tap',
    'fix dripping tap',
    'leaking tap',
    'leaky tap',
    'dripping tap',
    'tap dripping',
    'tap drip',
    'tap leaks',
    'tap leak',
    'faucet leak',
    'blocked drain',
    'clogged drain',
    'clog drain',
    'unclog drain',
    'leaking sink',
    'sink leak',
    'pipe leak',
    'fix pipe leak',
];

/**
 * If the Matrix V2 workbook has no plumbing job row, attach a synthetic `tap_leak_fix` SKU + phrases
 * so residential tap / sink / drain requests still map and price on the HANDYMAN minute ladder (via engine).
 */
export function applySyntheticResidentialPlumbingToModel(model: MatrixV2Model): void {
    if (model.jobs.has('tap_leak_fix')) return;

    model.jobs.set('tap_leak_fix', TAP_LEAK_FIX_JOB);

    const existing = new Set(model.phrases.map((p) => `${p.phrase.toLowerCase().trim()}::${p.job_item_id}`));

    const newRows: MatrixV2PhraseRow[] = TAP_LEAK_PHRASE_TEXTS.filter(Boolean).map((phrase) => ({
        phrase,
        job_item_id: 'tap_leak_fix',
    }));

    for (const row of newRows) {
        const key = `${row.phrase.toLowerCase().trim()}::${row.job_item_id}`;
        if (existing.has(key)) continue;
        existing.add(key);
        model.phrases.push(row);
    }
}

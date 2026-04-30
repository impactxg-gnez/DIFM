import type { WorkBook } from 'xlsx';
import * as XLSX from 'xlsx';
import type {
    MatrixV2ClarifierRow,
    MatrixV2CleaningTier,
    MatrixV2HandymanTier,
    MatrixV2JobRow,
    MatrixV2Model,
    MatrixV2PhraseRow,
} from './types';

export function parseMatrixV2Workbook(workbook: WorkBook): MatrixV2Model {
    const jobSheet = workbook.Sheets['JOB_ITEMS'];
    const phraseSheet = workbook.Sheets['PHRASE_MAPPING'];
    const tierSheet = workbook.Sheets['PRICING_TIERS'];
    const clarSheet = workbook.Sheets['CLARIFIERS'];
    if (!jobSheet || !phraseSheet || !tierSheet || !clarSheet) {
        throw new Error('MATRIX_V2_SHEETS_MISSING');
    }

    const jobs = new Map<string, MatrixV2JobRow>();
    const jobRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(jobSheet);
    for (const row of jobRows) {
        const id = String(row.job_item_id || '').trim();
        if (!id) continue;
        const clarRaw = String(row.clarifiers ?? row.clarifier_ids ?? '');
        const clarifierIds = clarRaw
            .split(/[|,]/)
            .map((s: string) => s.trim())
            .filter(Boolean);
        jobs.set(id, {
            job_item_id: id,
            category: String(row.category || 'HANDYMAN').trim().toUpperCase(),
            base_tier: String(row.base_tier || 'H1').trim(),
            min_minutes: Number(row.min_minutes) || 0,
            max_minutes: Number(row.max_minutes) || 0,
            clarifierIds,
            quantity_threshold: Number(row.quantity_threshold) || 0,
        });
    }

    const phraseSeen = new Map<string, MatrixV2PhraseRow>();
    const phraseRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(phraseSheet);
    for (const row of phraseRows) {
        const phrase = String(row.phrase || '').trim().toLowerCase();
        const jid = String(row.job_item_id || '').trim();
        if (!phrase || !jid) continue;
        const key = `${phrase}::${jid}`;
        phraseSeen.set(key, { phrase, job_item_id: jid });
    }
    const phrases = [...phraseSeen.values()];

    const handymanTiers: MatrixV2HandymanTier[] = [];
    const cleaningTiers: MatrixV2CleaningTier[] = [];
    const tierRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(tierSheet);
    for (const row of tierRows) {
        const tier = String(row.tier || '').trim();
        const mmRaw = row.max_minutes;
        const price = Number(row.price_gbp) || 0;
        if (!tier) continue;
        if (typeof mmRaw === 'number' || /^\s*\d+\s*$/.test(String(mmRaw))) {
            handymanTiers.push({
                tier,
                max_minutes: Number(mmRaw),
                price_gbp: price,
            });
        } else {
            cleaningTiers.push({
                tier,
                label: String(mmRaw || '').trim(),
                price_gbp: price,
            });
        }
    }
    handymanTiers.sort((a, b) => a.max_minutes - b.max_minutes);

    const clarifiers = new Map<string, MatrixV2ClarifierRow>();
    const clarRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(clarSheet);
    for (const row of clarRows) {
        const id = String(row.clarifier_id || row.id || '').trim();
        if (!id) continue;
        clarifiers.set(id, {
            id,
            question: String(row.question || '').trim(),
            type: String(row.type || row.input_type || 'text').trim(),
        });
    }

    return { phrases, jobs, handymanTiers, cleaningTiers, clarifiers };
}

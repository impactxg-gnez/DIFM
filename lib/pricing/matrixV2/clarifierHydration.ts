/**
 * MATRIX V2: extract structured clarifier answers from raw user text and merge UI overrides.
 */

import type { MatrixV2Model, MatrixV2QuantityResolver } from './types';

/** Semantic keys recognized for hydration from free text */
const ITEM_KEYS = /^ITEM_COUNT|QUANTITY|NUM_ITEMS|HOW_MANY_ITEMS|HOW_MANY|COUNT$/i;

const WALL_KEYS = /^WALL_TYPE|WALL_SURFACE|INSTALL_SURFACE|SUBSTRATE$/i;

const WALL_TERMS: Array<{ canon: string; patterns: RegExp[] }> = [
    {
        canon: 'brick',
        patterns: [
            /\bbrick\s+(wall)?\b/i,
            /\b(on|against)\s+(a\s+)?brick\b/i,
            /\bbrickwork\b/i,
        ],
    },
    {
        canon: 'concrete',
        patterns: [/\bconcrete\s+(wall|block)?\b/i, /\bblock\s+wall\b/i],
    },
    {
        canon: 'tile',
        patterns: [/\btile(d)?\s+wall\b/i, /\bon\s+tiles?\b/i, /\bceramic\s+tile\b/i],
    },
    {
        canon: 'stud',
        patterns: [/\bstud\s+wall\b/i, /\bplasterboard\b/i, /\bdrywall\b/i, /\bgypsum\b/i, /\bhollow\s+wall\b/i],
    },
];

export function inferWallSurfaceFromText(normalized: string): string | undefined {
    for (const { canon, patterns } of WALL_TERMS) {
        for (const re of patterns) {
            if (re.test(normalized)) return canon;
        }
    }
    return undefined;
}

function matchesItemCountKey(clarifierId: string): boolean {
    return ITEM_KEYS.test(clarifierId.trim());
}

function matchesWallTypeKey(clarifierId: string): boolean {
    return WALL_KEYS.test(clarifierId.trim());
}

function clarifierRowType(model: MatrixV2Model, clarifierId: string): string {
    return (model.clarifiers.get(clarifierId)?.type || '').toLowerCase();
}

function ctypeIsCount(type: string, id: string): boolean {
    if (!type) return false;
    if (/number|numeric|quantity|integer|count|spinner/i.test(type)) return true;
    const low = id.toLowerCase();
    return /(^|_)(item|qty|num|quantity|count|how_many|number_of|n_)/.test(low);
}

/**
 * From parsed jobs + text, produce initial clarifier_answers (before user overrides).
 */
export function hydrateClarifiersFromText(
    model: MatrixV2Model,
    jobIds: string[],
    normalized: string,
    quantityForJob: MatrixV2QuantityResolver,
): Record<string, string | number> {
    const out: Record<string, string | number> = {};
    if (jobIds.length === 0) return out;

    const allCids = new Set<string>();
    for (const jid of jobIds) {
        const row = model.jobs.get(jid);
        if (!row) continue;
        for (const cid of row.clarifierIds) {
            if (cid) allCids.add(cid);
        }
    }

    const wallGuess = inferWallSurfaceFromText(normalized);
    if (wallGuess) {
        for (const cid of allCids) {
            const ctype = clarifierRowType(model, cid);
            if (matchesWallTypeKey(cid) || (ctype.includes('select') && /wall|surface|substrate/i.test(cid))) {
                out[cid] = wallGuess;
            }
        }
    }

    const itemCids = [...allCids].filter(
        (cid) => matchesItemCountKey(cid) || ctypeIsCount(clarifierRowType(model, cid), cid),
    );
    if (itemCids.length > 0) {
        let maxQ = 1;
        for (const jid of jobIds) {
            const row = model.jobs.get(jid);
            if (!row?.clarifierIds.some((c) => itemCids.includes(c))) continue;
            maxQ = Math.max(maxQ, quantityForJob(jid, normalized));
        }
        for (const cid of itemCids) {
            out[cid] = maxQ;
        }
    }

    return out;
}

/** Extra minutes for difficult wall substrates (handyman / mount paths). */
export function wallSurfaceMinuteBonus(surface: unknown): number {
    if (surface === undefined || surface === null) return 0;
    const s = String(surface).trim().toLowerCase();
    const map: Record<string, number> = {
        brick: 20,
        concrete: 25,
        block: 22,
        tile: 12,
        stud: 0,
        plasterboard: 0,
        drywall: 0,
    };
    return map[s] ?? 0;
}

/** Coerce client POST scalars into string | number */
export function normalizeClientClarifierAnswers(raw: unknown): Record<string, string | number> {
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!k.trim()) continue;
        if (v === undefined || v === null || v === '') continue;
        if (typeof v === 'number' && Number.isFinite(v)) out[k.trim()] = v;
        else if (typeof v === 'boolean') out[k.trim()] = v ? 1 : 0;
        else if (typeof v === 'string') {
            const t = v.trim();
            if (/^\d+$/.test(t)) out[k.trim()] = parseInt(t, 10);
            else if (/^\d*\.\d+$/.test(t)) out[k.trim()] = parseFloat(t);
            else out[k.trim()] = t;
        }
    }
    return out;
}

export function mergeClarifierAnswerLayers(
    hydrated: Record<string, string | number>,
    client: Record<string, string | number>,
): Record<string, string | number> {
    return { ...hydrated, ...client };
}

export function wallMinuteAdjustmentForJobs(
    model: MatrixV2Model,
    jobIds: string[],
    merged: Record<string, string | number>,
): number {
    const hasHm = jobIds.some((id) => model.jobs.get(id)?.category === 'HANDYMAN');
    if (!hasHm) return 0;
    const w = pickWallSurfaceAnswer(model, jobIds, merged);
    return w ? wallSurfaceMinuteBonus(w) : 0;
}

export function applyClarifierAnswersToQuantityMap(
    model: MatrixV2Model,
    jobIds: string[],
    qtyMap: Record<string, number>,
    merged: Record<string, string | number>,
): void {
    for (const jid of jobIds) {
        const row = model.jobs.get(jid);
        if (!row) continue;
        for (const cid of row.clarifierIds) {
            if (!matchesItemCountKey(cid) && !ctypeIsCount(clarifierRowType(model, cid), cid)) continue;
            const v = merged[cid];
            if (v === undefined || v === '') continue;
            const n = typeof v === 'number' ? v : parseInt(String(v).trim(), 10);
            if (Number.isFinite(n) && n >= 1) qtyMap[jid] = Math.max(1, Math.floor(n));
        }
    }
}

export function pickWallSurfaceAnswer(
    model: MatrixV2Model,
    jobIds: string[],
    merged: Record<string, string | number>,
): string | undefined {
    for (const jid of jobIds) {
        const row = model.jobs.get(jid);
        if (!row) continue;
        for (const cid of row.clarifierIds) {
            const ctype = clarifierRowType(model, cid);
            if (matchesWallTypeKey(cid) || (ctype.includes('select') && /wall|surface|substrate/i.test(cid))) {
                const v = merged[cid];
                if (v !== undefined && v !== '') return String(v).trim().toLowerCase();
            }
        }
    }
    return undefined;
}

/**
 * Keyword + synonym inference when PHRASE_MAPPING misses (ordering, fillers, sizing words).
 */

import type { MatrixV2Model } from './types';
import { buildFlexibleMatchingText, collapsedForPhraseMatch } from './flexText';

export interface KeywordInferenceResult {
    /** job_item_ids that exist on the model, highest confidence first */
    jobIds: string[];
    /** Human-readable matched signals for logs */
    keywords_matched: string[];
    scores: Record<string, number>;
}

function firstExistingId(model: MatrixV2Model, candidates: string[]): string | null {
    for (const id of candidates) {
        if (model.jobs.has(id)) return id;
    }
    return null;
}

const TV_TOKEN = /\b(tv|television|telly|flat\s*[- ]?\s*screen)\b/;
const BLIND_TOKEN = /\bblinds?\b/;
const SHELF_TOKEN = /\b(shelves|shelf)\b/;
const MIRROR_TOKEN = /\bmirrors?\b/;
const PICTURE_TOKEN = /\b(pictures|picture|photos|photo|frames|frame)\b/;
const CURTAIN_TOKEN = /\b(curtains?|curtain\s+rail|rail\s+rod|pole)\b/;
const ASSEMBLY_TOKEN = /\b(flatpack|flat\s*pack|ikea|assemble|assembly|rta)\b/;
const WASHER_TOKEN = /\b(washing\s+machine|washer)\b/;
const DW_TOKEN = /\b(dishwasher)\b/;
const CABLE_TOKEN = /\b(hide|conceal|chase|cable\s+management)\b.*\b(cables?|wires?|hdmi)\b|\b(cables?|wires?)\s+(hide|conceal)\b/;
const HOLE_TOKEN = /\b(holes?|cracks?)\b.*\b(fill|repair|patch|plug)\b|\b(fill|repair|patch)\b.*\b(holes?|wall)\b/;

/** Action verbs loosely indicating install/mount trades */
function hasInstallCue(t: string): boolean {
    return (
        /\b(mount|install|hang|hang\s+up|fit|fix|fixed|fixes|secured|secure|attached|attach|attaching|put\s+up|wall\s*-?\s*mount|onto\s+the\s+wall|on\s+the\s+wall)\b/i.test(
            t,
        ) || /\bfix\s+tv\b|\btv\s+fix\b/i.test(t)
    );
}

function inferTvMount(model: MatrixV2Model, t: string, signals: string[], scores: Record<string, number>): string | null {
    if (!TV_TOKEN.test(t)) return null;
    if (!hasInstallCue(t)) {
        const tvWall = /\btv\b.*\bwall\b|\bwall\b.*\btv\b/i.test(t);
        const tvBrick = /\btv\b.*\bbrick\b|\bbrick\b.*\btv\b/i.test(t);
        if (!tvWall && !tvBrick && !/\bbracket\b/i.test(t)) return null;
        signals.push('keyword:tv+wall_context');
    } else {
        signals.push('keyword:tv+mount');
    }
    const id =
        firstExistingId(model, ['tv_mount', 'tv_mount_standard', 'tv_wall_mount', 'wall_mount_tv']) ||
        [...model.jobs.keys()].find((k) => /tv.*mount|mount.*tv/i.test(k)) ||
        null;
    if (!id) return null;
    scores[id] = (scores[id] ?? 0) + 50;
    return id;
}

function inferBlinds(model: MatrixV2Model, t: string, signals: string[], scores: Record<string, number>): string | null {
    if (!BLIND_TOKEN.test(t)) return null;
    if (!(hasInstallCue(t) || /\b(replace|new|roller|venetian)\b/i.test(t))) return null;
    const id =
        firstExistingId(model, ['blind_install', 'blinds_install', 'window_blinds']) ||
        [...model.jobs.keys()].find((k) => /\bblind/i.test(k)) ||
        null;
    if (!id) return null;
    scores[id] = (scores[id] ?? 0) + 40;
    signals.push('keyword:blinds');
    return id;
}

function inferShelf(model: MatrixV2Model, t: string, signals: string[], scores: Record<string, number>): string | null {
    if (!SHELF_TOKEN.test(t)) return null;
    if (!(hasInstallCue(t) || /\b(fit|floating|bookshelf)\b/i.test(t))) return null;
    const id = firstExistingId(model, ['shelf_install', 'shelves_install']);
    if (!id) return null;
    scores[id] = (scores[id] ?? 0) + 35;
    signals.push('keyword:shelf');
    return id;
}

function inferMirror(model: MatrixV2Model, t: string, signals: string[], scores: Record<string, number>): string | null {
    if (!MIRROR_TOKEN.test(t)) return null;
    if (!hasInstallCue(t)) return null;
    const id = firstExistingId(model, ['mirror_hang', 'mirror_mount', 'hang_mirror']);
    if (!id) return null;
    scores[id] = (scores[id] ?? 0) + 35;
    signals.push('keyword:mirror');
    return id;
}

function inferPictures(model: MatrixV2Model, t: string, signals: string[], scores: Record<string, number>): string | null {
    if (!PICTURE_TOKEN.test(t)) return null;
    if (!hasInstallCue(t)) return null;
    const id =
        firstExistingId(model, ['picture_hang', 'picture_frame_hang']) ||
        [...model.jobs.keys()].find((k) => /\bpicture.*hang|photo.*hang/i.test(k)) ||
        null;
    if (!id) return null;
    scores[id] = (scores[id] ?? 0) + 32;
    signals.push('keyword:picture');
    return id;
}

function inferCurtain(model: MatrixV2Model, t: string, signals: string[], scores: Record<string, number>): string | null {
    if (!CURTAIN_TOKEN.test(t)) return null;
    if (!(hasInstallCue(t) || /\b(fit|pole|rod|replace)\b/i.test(t))) return null;
    const id = firstExistingId(model, ['curtain_rail', 'curtain_pole_install']);
    if (!id) return null;
    scores[id] = (scores[id] ?? 0) + 32;
    signals.push('keyword:curtain');
    return id;
}

function inferFurnitureAssembly(model: MatrixV2Model, t: string, signals: string[], scores: Record<string, number>): string | null {
    if (!ASSEMBLY_TOKEN.test(t)) return null;
    const id = firstExistingId(model, ['furniture_assembly', 'flat_pack_assembly']);
    if (!id) return null;
    scores[id] = (scores[id] ?? 0) + 30;
    signals.push('keyword:furniture_assembly');
    return id;
}

function inferAppliances(model: MatrixV2Model, t: string, signals: string[], scores: Record<string, number>): string | null {
    if (WASHER_TOKEN.test(t) && /\b(install|fit|plumb|connect)\b/i.test(t)) {
        const id = firstExistingId(model, ['washing_machine_install']);
        if (id) {
            scores[id] = (scores[id] ?? 0) + 42;
            signals.push('keyword:washing_machine');
            return id;
        }
    }
    if (DW_TOKEN.test(t) && /\b(install|fit|plumb)\b/i.test(t)) {
        const id = firstExistingId(model, ['dishwasher_install']);
        if (id) {
            scores[id] = (scores[id] ?? 0) + 42;
            signals.push('keyword:dishwasher');
            return id;
        }
    }
    return null;
}

function inferCableConceal(model: MatrixV2Model, t: string, signals: string[], scores: Record<string, number>): string | null {
    if (!CABLE_TOKEN.test(t)) return null;
    const id =
        firstExistingId(model, ['cable_concealment', 'cable_hide', 'tv_cable_hide']) ||
        [...model.jobs.keys()].find((k) => /cable|hdmi|wire/i.test(k)) ||
        null;
    if (!id) return null;
    scores[id] = (scores[id] ?? 0) + 28;
    signals.push('keyword:cable_hide');
    return id;
}

function inferWallHoleFill(model: MatrixV2Model, t: string, signals: string[], scores: Record<string, number>): string | null {
    if (!HOLE_TOKEN.test(t)) return null;
    const id = firstExistingId(model, ['wall_hole_fill', 'hole_repair']);
    if (!id) return null;
    scores[id] = (scores[id] ?? 0) + 28;
    signals.push('keyword:hole_fill');
    return id;
}

const INFERENCES: Array<{
    infer: (
        model: MatrixV2Model,
        t: string,
        signals: string[],
        scores: Record<string, number>,
    ) => string | null;
}> = [
    { infer: inferTvMount },
    { infer: inferBlinds },
    { infer: inferShelf },
    { infer: inferMirror },
    { infer: inferPictures },
    { infer: inferCurtain },
    { infer: inferAppliances },
    { infer: inferFurnitureAssembly },
    { infer: inferCableConceal },
    { infer: inferWallHoleFill },
];

/**
 * Infer zero or one primary job_item_id via keyword scaffolding; only emits IDs present on workbook.
 */
export function inferJobsByKeywords(model: MatrixV2Model, normalizedV2Input: string): KeywordInferenceResult {
    const flex = buildFlexibleMatchingText(normalizedV2Input);
    const collapsed = collapsedForPhraseMatch(normalizedV2Input.toLowerCase());
    /** Try flexible (size-stripped), then fuller collapsed originals */
    const surfaces = [...new Set([flex, collapsed, normalizedV2Input.toLowerCase().trim()].filter(Boolean))];

    const scores: Record<string, number> = {};
    const signals: string[] = [];
    const hitIds = new Set<string>();

    for (const surface of surfaces) {
        for (const { infer } of INFERENCES) {
            const id = infer(model, surface, signals, scores);
            if (id) hitIds.add(id);
        }
    }

    const jobIds = [...hitIds].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));

    return {
        jobIds,
        keywords_matched: [...new Set(signals)],
        scores,
    };
}

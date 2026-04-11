import {
    blindWindowContextMentioned,
    ceilingCurtainMountMentioned,
    curtainLengthProvidedInDescription,
    flatpackStatusMentioned,
    furnitureSizeMentioned,
    hasExplicitQuantitySignal,
    parseCurtainLengthMeters,
    parseTvDetails,
    shelfQuantityProvidedInDescription,
    wallMaterialMentioned,
} from './bookingSignals';

export type PlannedClarifierInputType = 'number' | 'select' | 'boolean' | 'text';

export interface PlannedClarifier {
    id: string;
    question: string;
    inputType: PlannedClarifierInputType;
    required: boolean;
    options: string[];
    affects_time: boolean;
    affects_safety: boolean;
    clarifier_type: 'PRICING' | 'SAFETY';
}

const WALL_OPTIONS = ['Drywall', 'Plaster', 'Brick', 'Concrete', 'Wood stud'];

function isTvJobId(id: string): boolean {
    return id.includes('tv_mount') || id.includes('mount_tv') || id.includes('install_wall_tv');
}

function isShelfJobId(id: string): boolean {
    return id.includes('shelf') || id.includes('shelves_set') || id === 'install_shelves_set';
}

function isCurtainJobId(id: string): boolean {
    return id.includes('curtain') || id.includes('fit_curtain');
}

function isBlindJobId(id: string): boolean {
    return id.includes('blind');
}

function isFurnitureJobId(id: string): boolean {
    return (
        id.includes('flatpack') ||
        id.includes('assemble') ||
        id.includes('furniture') ||
        id.includes('wardrobe')
    );
}

function isMirrorOrPicJobId(id: string): boolean {
    return id.includes('mirror_hang') || id.includes('pic_hang') || id.includes('hang_frames');
}

function isSocketJobId(id: string): boolean {
    return id.includes('socket') && id.includes('replace');
}

function addPlanned(map: Map<string, PlannedClarifier>, item: PlannedClarifier) {
    if (!map.has(item.id)) map.set(item.id, item);
}

function basePlanItem(
    id: string,
    question: string,
    inputType: PlannedClarifierInputType,
    options: string[] = [],
    required = true,
): PlannedClarifier {
    return {
        id,
        question,
        inputType,
        required,
        options,
        affects_time: true,
        affects_safety: false,
        clarifier_type: 'PRICING',
    };
}

/**
 * During extraction we know per-clause rule jobs and quantities.
 */
export function planClarifiersForExtraction(
    normalizedInput: string,
    jobs: Array<{ job: string; quantity: number; part: string }>,
): PlannedClarifier[] {
    const map = new Map<string, PlannedClarifier>();
    const tv = parseTvDetails(normalizedInput);

    const anyTv = jobs.some((j) => j.job === 'tv_mount_standard');
    const anyShelf = jobs.some((j) => j.job === 'shelf_install_single');
    const anyCurtain = jobs.some((j) => j.job === 'curtain_rail_install');
    const anyBlind = jobs.some((j) => j.job === 'install_blinds');
    const anyFurniture = jobs.some((j) => j.job === 'furniture_assembly');
    const anyMirror = jobs.some((j) => j.job === 'mirror_hang');
    const anyPic = jobs.some((j) => j.job === 'pic_hang');
    const anySocket = jobs.some((j) => j.job === 'replace_socket');

    if (anyTv) {
        if (tv.size === null) {
            addPlanned(map, basePlanItem('TV_SIZE_INCHES', 'What is the TV size in inches?', 'number'));
        }
        if (!tv.wall && !wallMaterialMentioned(normalizedInput)) {
            addPlanned(
                map,
                basePlanItem('WALL_TYPE', 'What is the wall material?', 'select', WALL_OPTIONS),
            );
        }
        if (tv.concealed === null) {
            addPlanned(
                map,
                basePlanItem('CABLE_CONCEALMENT', 'Do you need cables concealed in the wall?', 'boolean'),
            );
        }
    }

    if (anyShelf) {
        const unclearQty = jobs.some(
            (j) => j.job === 'shelf_install_single' && j.quantity <= 1 && !hasExplicitQuantitySignal(j.part),
        );
        if (unclearQty) {
            addPlanned(
                map,
                basePlanItem('SHELF_COUNT', 'How many shelves should be installed?', 'number'),
            );
        }
        if (!wallMaterialMentioned(normalizedInput)) {
            addPlanned(
                map,
                basePlanItem('WALL_TYPE', 'What is the wall material?', 'select', WALL_OPTIONS),
            );
        }
    }

    if (anyCurtain) {
        if (!curtainLengthProvidedInDescription(normalizedInput)) {
            addPlanned(
                map,
                basePlanItem(
                    'CURTAIN_RAIL_LENGTH',
                    'Approximate rail length (e.g. 2.5m, 3 meters, or 250cm)?',
                    'text',
                ),
            );
        }
        if (!wallMaterialMentioned(normalizedInput)) {
            addPlanned(
                map,
                basePlanItem('WALL_TYPE', 'What is the wall material?', 'select', WALL_OPTIONS),
            );
        }
        if (!ceilingCurtainMountMentioned(normalizedInput)) {
            addPlanned(
                map,
                basePlanItem(
                    'CURTAIN_MOUNT_LOCATION',
                    'Will the rail mount on the wall face or the ceiling?',
                    'select',
                    ['Wall', 'Ceiling'],
                ),
            );
        }
    }

    if (anyBlind) {
        if (!blindWindowContextMentioned(normalizedInput)) {
            addPlanned(
                map,
                basePlanItem(
                    'WINDOW_BLIND_SIZE',
                    'What best describes the window or blind run?',
                    'select',
                    ['Standard window', 'Large window', 'Bay window', 'Patio / French doors'],
                ),
            );
        }
    }

    if (anyFurniture) {
        if (!furnitureSizeMentioned(normalizedInput)) {
            addPlanned(
                map,
                basePlanItem(
                    'FURNITURE_SIZE_TYPE',
                    'Rough size of the furniture job?',
                    'select',
                    ['Small', 'Medium', 'Large', 'Oversized'],
                ),
            );
        }
        if (!flatpackStatusMentioned(normalizedInput)) {
            addPlanned(
                map,
                basePlanItem(
                    'FLATPACK_STATUS',
                    'What state is the furniture in?',
                    'select',
                    ['Still boxed', 'Part-built', 'Disassembled / loose pieces'],
                ),
            );
        }
    }

    if (anyMirror || anyPic) {
        if (!wallMaterialMentioned(normalizedInput)) {
            addPlanned(
                map,
                basePlanItem('WALL_TYPE', 'What is the wall material?', 'select', WALL_OPTIONS),
            );
        }
    }

    if (anySocket) {
        addPlanned(
            map,
            basePlanItem('SOCKET_TYPE', 'What type of socket work is needed?', 'text', [], false),
        );
    }

    return [...map.values()];
}

/**
 * Persisted visit: infer clarifiers from matrix job ids + full job description.
 */
export function planClarifiersForVisitJobIds(
    normalizedJobDescription: string,
    primaryJobItemId: string,
    addonJobItemIds: string[] = [],
): PlannedClarifier[] {
    const ids = [primaryJobItemId, ...(addonJobItemIds || [])].filter(Boolean);
    const text = normalizedJobDescription || '';
    const tv = parseTvDetails(text);
    const map = new Map<string, PlannedClarifier>();

    const anyTv = ids.some(isTvJobId);
    const anyShelf = ids.some(isShelfJobId);
    const anyCurtain = ids.some(isCurtainJobId);
    const anyBlind = ids.some(isBlindJobId);
    const anyFurniture = ids.some(isFurnitureJobId);
    const anyMirrorPic = ids.some(isMirrorOrPicJobId);
    const anySocket = ids.some(isSocketJobId);

    if (anyTv) {
        if (tv.size === null) {
            addPlanned(map, basePlanItem('TV_SIZE_INCHES', 'What is the TV size in inches?', 'number'));
        }
        if (!tv.wall && !wallMaterialMentioned(text)) {
            addPlanned(
                map,
                basePlanItem('WALL_TYPE', 'What is the wall material?', 'select', WALL_OPTIONS),
            );
        }
        if (tv.concealed === null) {
            addPlanned(
                map,
                basePlanItem('CABLE_CONCEALMENT', 'Do you need cables concealed in the wall?', 'boolean'),
            );
        }
    }

    if (anyShelf) {
        if (!shelfQuantityProvidedInDescription(text)) {
            addPlanned(
                map,
                basePlanItem('SHELF_COUNT', 'How many shelves should be installed?', 'number'),
            );
        }
        if (!wallMaterialMentioned(text)) {
            addPlanned(
                map,
                basePlanItem('WALL_TYPE', 'What is the wall material?', 'select', WALL_OPTIONS),
            );
        }
    }

    if (anyCurtain) {
        if (!curtainLengthProvidedInDescription(text)) {
            addPlanned(
                map,
                basePlanItem(
                    'CURTAIN_RAIL_LENGTH',
                    'Approximate rail length (e.g. 2.5m, 3 meters, or 250cm)?',
                    'text',
                ),
            );
        }
        if (!wallMaterialMentioned(text)) {
            addPlanned(
                map,
                basePlanItem('WALL_TYPE', 'What is the wall material?', 'select', WALL_OPTIONS),
            );
        }
        if (!ceilingCurtainMountMentioned(text)) {
            addPlanned(
                map,
                basePlanItem(
                    'CURTAIN_MOUNT_LOCATION',
                    'Will the rail mount on the wall face or the ceiling?',
                    'select',
                    ['Wall', 'Ceiling'],
                ),
            );
        }
    }

    if (anyBlind) {
        if (!blindWindowContextMentioned(text)) {
            addPlanned(
                map,
                basePlanItem(
                    'WINDOW_BLIND_SIZE',
                    'What best describes the window or blind run?',
                    'select',
                    ['Standard window', 'Large window', 'Bay window', 'Patio / French doors'],
                ),
            );
        }
    }

    if (anyFurniture) {
        if (!furnitureSizeMentioned(text)) {
            addPlanned(
                map,
                basePlanItem(
                    'FURNITURE_SIZE_TYPE',
                    'Rough size of the furniture job?',
                    'select',
                    ['Small', 'Medium', 'Large', 'Oversized'],
                ),
            );
        }
        if (!flatpackStatusMentioned(text)) {
            addPlanned(
                map,
                basePlanItem(
                    'FLATPACK_STATUS',
                    'What state is the furniture in?',
                    'select',
                    ['Still boxed', 'Part-built', 'Disassembled / loose pieces'],
                ),
            );
        }
    }

    if (anyMirrorPic && !wallMaterialMentioned(text)) {
        addPlanned(
            map,
            basePlanItem('WALL_TYPE', 'What is the wall material?', 'select', WALL_OPTIONS),
        );
    }

    if (anySocket) {
        addPlanned(
            map,
            basePlanItem('SOCKET_TYPE', 'What type of socket work is needed?', 'text', [], false),
        );
    }

    return [...map.values()];
}

function parseNumberAnswer(raw: unknown): number | null {
    if (raw === null || raw === undefined) return null;
    const n = Number(String(raw).replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : null;
}

function truthyConcealment(raw: unknown): boolean {
    const s = String(raw || '').toLowerCase();
    return s === 'yes' || s === 'true' || s === '1' || s.includes('conceal');
}

function includesWallHard(raw: string): boolean {
    const s = raw.toLowerCase();
    return s.includes('brick') || s.includes('concrete');
}

export interface ClarifierPricingEffects {
    extraMinutes: number;
    tierStepDelta: number;
}

/**
 * Maps clarifier answers to extra minutes and tier steps (applied at scope lock on top of visit base_minutes).
 */
export function computeClarifierPricingEffects(
    primaryJobItemId: string,
    addonJobItemIds: string[],
    answers: Record<string, unknown>,
): ClarifierPricingEffects {
    const ids = [primaryJobItemId, ...(addonJobItemIds || [])].filter(Boolean);
    let extraMinutes = 0;
    let tierStepDelta = 0;

    const bumpTier = (n: number) => {
        tierStepDelta = Math.min(2, tierStepDelta + n);
    };

    const anyTv = ids.some(isTvJobId);
    const anyShelf = ids.some(isShelfJobId);
    const anyCurtain = ids.some(isCurtainJobId);
    const anyBlind = ids.some(isBlindJobId);
    const anyFurniture = ids.some(isFurnitureJobId);
    const anyMirrorPic = ids.some(isMirrorOrPicJobId);

    const tvSize =
        parseNumberAnswer(answers.TV_SIZE_INCHES ?? answers.tv_size ?? answers.tv_size_inches) ?? null;
    const wallRaw = String(answers.WALL_TYPE ?? answers.wall_type ?? '');
    const concealRaw = answers.CABLE_CONCEALMENT ?? answers.cable_concealment;

    if (anyTv) {
        if (tvSize !== null) {
            if (tvSize > 85) {
                extraMinutes += 60;
                bumpTier(1);
            } else if (tvSize >= 65) {
                extraMinutes += 30;
                bumpTier(1);
            }
        }
        if (truthyConcealment(concealRaw)) {
            extraMinutes += 35;
            bumpTier(1);
            if (tvSize !== null && tvSize > 65) bumpTier(1);
        }
        if (tvSize !== null && tvSize > 85 && wallRaw && includesWallHard(wallRaw) && truthyConcealment(concealRaw)) {
            bumpTier(1);
        }
    }

    /** One wall-difficulty surcharge per visit (avoids double charge when TV + shelves share a wall). */
    const needsWallDifficulty = anyTv || anyShelf || anyMirrorPic || anyCurtain;
    if (needsWallDifficulty && wallRaw && includesWallHard(wallRaw)) {
        extraMinutes += wallRaw.toLowerCase().includes('concrete') ? 45 : 30;
        bumpTier(1);
    }

    const shelfExtra = parseNumberAnswer(answers.SHELF_COUNT ?? answers.shelf_count);
    if (anyShelf && shelfExtra !== null && shelfExtra > 1) {
        if (shelfExtra >= 10) {
            extraMinutes += 90;
            bumpTier(1);
        } else if (shelfExtra >= 6) {
            extraMinutes += 50;
        } else if (shelfExtra >= 4) {
            extraMinutes += 30;
        } else if (shelfExtra >= 2) {
            extraMinutes += 15;
        }
    }

    if (anyCurtain) {
        const lenStr = String(answers.CURTAIN_RAIL_LENGTH ?? answers.curtain_length ?? '');
        const lenM = parseCurtainLengthMeters(lenStr);
        if (lenM !== null) {
            if (lenM > 4) {
                extraMinutes += 35;
                bumpTier(1);
            } else if (lenM > 3) {
                extraMinutes += 25;
                bumpTier(1);
            } else if (lenM > 2.5) {
                extraMinutes += 15;
            }
        }
        const mountLoc = String(answers.CURTAIN_MOUNT_LOCATION ?? '').toLowerCase();
        if (mountLoc.includes('ceiling')) {
            extraMinutes += 25;
            bumpTier(1);
        }
    }

    if (anyBlind) {
        const win = String(answers.WINDOW_BLIND_SIZE ?? '').toLowerCase();
        if (win.includes('bay') || win.includes('patio') || win.includes('french')) {
            extraMinutes += 35;
            bumpTier(1);
        } else if (win.includes('large')) {
            extraMinutes += 20;
        }
    }

    if (anyFurniture) {
        const sz = String(answers.FURNITURE_SIZE_TYPE ?? '').toLowerCase();
        if (sz.includes('oversized') || sz.includes('large')) {
            extraMinutes += 45;
            bumpTier(1);
        } else if (sz.includes('medium')) {
            extraMinutes += 20;
        }
        const flat = String(answers.FLATPACK_STATUS ?? '').toLowerCase();
        if (flat.includes('boxed') || flat.includes('still')) {
            extraMinutes += 15;
        } else if (flat.includes('part')) {
            extraMinutes += 8;
        }
    }

    return { extraMinutes, tierStepDelta };
}

/**
 * Universal quantity → classification + matrix SKU resolution.
 * Thresholds and labels are data-driven per ruleJob (mapPartToJob output).
 */

export interface QuantityBandDefinition {
    min: number;
    max: number;
    /** Emitted in final_jobs / quantities / reporting */
    classificationId: string;
    /** Excel matrix job_item_id candidates (first allowed wins) */
    pricingJobIdCandidates: string[];
    /**
     * Rows used for per-unit duration before applyBulkEfficiency.
     * If omitted, uses profile.defaultDurationBasisCandidates then pricing id.
     */
    durationBasisCandidates?: string[];
}

export interface JobQuantityProfile {
    /** Must match RULES / mapPartToJob `job` */
    ruleJob: string;
    defaultDurationBasisCandidates: string[];
    bands: QuantityBandDefinition[];
}

function pickFirstAllowed(candidates: string[], allowedSet: Set<string>): string | null {
    for (const id of candidates) {
        if (allowedSet.has(id)) return id;
    }
    return null;
}

/** Resolver gave a SKU more specific than generic quantity-band defaults (e.g. faceplate). */
function shouldPreferResolverPricing(ruleJob: string, baseResolved: string): boolean {
    if (baseResolved.includes('faceplate')) return true;
    if (ruleJob === 'tv_mount_standard' && baseResolved === 'mount_tv_custom') return true;
    return false;
}

/**
 * All quantity-sensitive families. Jobs not listed fall back to ruleJob as classification.
 */
export const JOB_QUANTITY_PROFILES: JobQuantityProfile[] = [
    {
        ruleJob: 'shelf_install_single',
        defaultDurationBasisCandidates: ['shelf_install_single'],
        bands: [
            {
                min: 1,
                max: 1,
                classificationId: 'shelf_install_single',
                pricingJobIdCandidates: ['shelf_install_single'],
            },
            {
                min: 2,
                max: 5,
                classificationId: 'shelf_install_multi',
                pricingJobIdCandidates: ['install_shelves_set', 'shelf_install_single'],
            },
            {
                min: 6,
                max: Number.MAX_SAFE_INTEGER,
                classificationId: 'shelf_install_bulk',
                pricingJobIdCandidates: ['install_shelves_set', 'shelf_install_single'],
            },
        ],
    },
    {
        ruleJob: 'tv_mount_standard',
        defaultDurationBasisCandidates: ['tv_mount_standard'],
        bands: [
            {
                min: 1,
                max: 1,
                classificationId: 'tv_mount_residential_single',
                pricingJobIdCandidates: ['tv_mount_standard'],
            },
            {
                min: 2,
                max: 3,
                classificationId: 'tv_mount_multi_room',
                pricingJobIdCandidates: ['tv_mount_standard'],
            },
            {
                min: 4,
                max: Number.MAX_SAFE_INTEGER,
                classificationId: 'tv_mount_commercial_bulk',
                pricingJobIdCandidates: ['mount_tv_custom', 'tv_mount_standard'],
            },
        ],
    },
    {
        ruleJob: 'curtain_rail_install',
        defaultDurationBasisCandidates: ['curtain_rail_standard'],
        bands: [
            {
                min: 1,
                max: 1,
                classificationId: 'curtain_rail_single',
                pricingJobIdCandidates: ['curtain_rail_install', 'curtain_rail_standard', 'fit_curtain_rail'],
            },
            {
                min: 2,
                max: 4,
                classificationId: 'curtain_rail_multi',
                pricingJobIdCandidates: ['fit_curtain_rail', 'curtain_rail_standard', 'curtain_rail_install'],
            },
            {
                min: 5,
                max: Number.MAX_SAFE_INTEGER,
                classificationId: 'curtain_rail_bulk',
                pricingJobIdCandidates: ['fit_curtain_rail', 'curtain_rail_standard', 'curtain_rail_install'],
            },
        ],
    },
    {
        ruleJob: 'pic_hang',
        defaultDurationBasisCandidates: ['pic_hang'],
        bands: [
            {
                min: 1,
                max: 1,
                classificationId: 'pic_hang_single',
                pricingJobIdCandidates: ['pic_hang'],
            },
            {
                min: 2,
                max: 2,
                classificationId: 'pic_hang_multi',
                pricingJobIdCandidates: ['pic_hang'],
            },
            {
                min: 3,
                max: Number.MAX_SAFE_INTEGER,
                classificationId: 'pic_hang_bulk',
                pricingJobIdCandidates: ['hang_frames_set', 'pic_hang'],
            },
        ],
    },
    {
        ruleJob: 'install_light_fitting',
        defaultDurationBasisCandidates: ['install_light_fitting'],
        bands: [
            {
                min: 1,
                max: 1,
                classificationId: 'light_fitting_single',
                pricingJobIdCandidates: ['install_light_fitting', 'install_light_fitting_standard'],
            },
            {
                min: 2,
                max: 4,
                classificationId: 'light_fitting_multi',
                pricingJobIdCandidates: ['install_light_fitting_standard', 'install_light_fitting'],
            },
            {
                min: 5,
                max: Number.MAX_SAFE_INTEGER,
                classificationId: 'light_fitting_bulk',
                pricingJobIdCandidates: ['install_light_fitting_standard', 'install_light_fitting'],
            },
        ],
    },
    {
        ruleJob: 'mirror_hang',
        defaultDurationBasisCandidates: ['mirror_hang'],
        bands: [
            {
                min: 1,
                max: 1,
                classificationId: 'mirror_hang_single',
                pricingJobIdCandidates: ['mirror_hang'],
            },
            {
                min: 2,
                max: Number.MAX_SAFE_INTEGER,
                classificationId: 'mirror_hang_multi',
                pricingJobIdCandidates: ['mirror_hang'],
            },
        ],
    },
    {
        ruleJob: 'install_blinds',
        defaultDurationBasisCandidates: ['install_blinds'],
        bands: [
            {
                min: 1,
                max: 1,
                classificationId: 'blind_install_single',
                pricingJobIdCandidates: ['install_blinds'],
            },
            {
                min: 2,
                max: Number.MAX_SAFE_INTEGER,
                classificationId: 'blind_install_multi',
                pricingJobIdCandidates: ['install_blinds'],
            },
        ],
    },
    {
        ruleJob: 'replace_socket',
        defaultDurationBasisCandidates: ['replace_socket', 'socket_replace'],
        bands: [
            {
                min: 1,
                max: 1,
                classificationId: 'replace_socket_single',
                pricingJobIdCandidates: ['replace_socket', 'socket_replace', 'replace_socket_faceplate'],
            },
            {
                min: 2,
                max: 3,
                classificationId: 'replace_socket_multi',
                pricingJobIdCandidates: ['replace_socket', 'socket_replace', 'replace_socket_faceplate'],
            },
            {
                min: 4,
                max: Number.MAX_SAFE_INTEGER,
                classificationId: 'replace_socket_bulk',
                pricingJobIdCandidates: ['replace_socket', 'socket_replace', 'replace_socket_faceplate'],
            },
        ],
    },
];

export function resolveQuantityClassification(
    ruleJob: string,
    quantity: number,
    baseResolved: string,
    allowedSet: Set<string>,
): { classificationId: string; pricingJobId: string; durationMatrixId: string } {
    const profile = JOB_QUANTITY_PROFILES.find((p) => p.ruleJob === ruleJob);
    if (!profile) {
        return { classificationId: ruleJob, pricingJobId: baseResolved, durationMatrixId: baseResolved };
    }
    const band =
        profile.bands.find((b) => quantity >= b.min && quantity <= b.max) ?? profile.bands[profile.bands.length - 1];
    const pricingJobId = shouldPreferResolverPricing(ruleJob, baseResolved)
        ? pickFirstAllowed([baseResolved, ...band.pricingJobIdCandidates], allowedSet) ?? baseResolved
        : pickFirstAllowed(band.pricingJobIdCandidates, allowedSet) ??
          pickFirstAllowed([baseResolved], allowedSet) ??
          baseResolved;
    const durationCandidates = band.durationBasisCandidates ?? profile.defaultDurationBasisCandidates;
    const durationMatrixId =
        pickFirstAllowed(durationCandidates, allowedSet) ?? pricingJobId;
    return { classificationId: band.classificationId, pricingJobId, durationMatrixId };
}

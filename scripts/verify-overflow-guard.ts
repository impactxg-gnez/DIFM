import { excelSource } from '../lib/pricing/excelLoader';
import { computeScopePricing } from '../lib/pricing/scopeLockEngine';

function findTvMountItemId(): string {
    const entries = Array.from(excelSource.jobItems.entries());
    const match = entries.find(([id]) =>
        id.includes('tv_mount') || id.includes('mount_tv') || id.includes('install_wall_tv_cabling_hide')
    );
    if (!match) {
        throw new Error('No TV mount item found in matrix');
    }
    return match[0];
}

async function main() {
    const tvItemId = findTvMountItemId();
    const tvItem = excelSource.jobItems.get(tvItemId);
    if (!tvItem) throw new Error(`TV mount item ${tvItemId} not found`);

    const mockVisit = {
        item_class: 'STANDARD',
        primary_job_item_id: tvItemId,
        addon_job_item_ids: [],
        required_capability_tags_union: [tvItem.capability_tag || 'HANDYMAN'],
        base_minutes: tvItem.default_time_weight_minutes,
    };

    // Complexity clarifiers designed to push total above top ladder max.
    const answers = {
        TV_SIZE_INCHES: '90',
        WALL_TYPE: 'Concrete',
        CABLE_CONCEALMENT: 'yes',
    };

    const result = computeScopePricing(mockVisit, answers);
    console.log('[Overflow Guard Verification]');
    console.log({
        job_item_id: tvItemId,
        base_minutes: mockVisit.base_minutes,
        answers,
        result,
    });

    if (result.status !== 'OVERFLOW') {
        throw new Error(`Expected OVERFLOW but got ${result.status}`);
    }
    if (result.reason !== 'EXCEEDS_MAX_LADDER_TIME') {
        throw new Error(`Expected EXCEEDS_MAX_LADDER_TIME but got ${result.reason}`);
    }
    if (!(result.overflowDelta > 0)) {
        throw new Error(`Expected overflowDelta > 0 but got ${result.overflowDelta}`);
    }

    console.log('SUCCESS: OVERFLOW rule triggered and routed to REVIEW.');
}

main().catch((error) => {
    console.error('Overflow verification failed:', error);
    process.exit(1);
});

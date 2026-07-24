/**
 * Scope-lock quantity repricing: minutes and tier/price must stay in sync.
 * Run: npx tsx scripts/verify-scope-qty-pricing.ts
 */

import { excelSource } from '@/lib/pricing/excelLoader';
import { computeScopePricing } from '@/lib/pricing/scopeLockEngine';

function findJobItemId(match: (id: string) => boolean): string {
    for (const [id] of excelSource.jobItems.entries()) {
        if (match(id)) return id;
    }
    throw new Error('Job item not found in matrix');
}

async function main() {
    excelSource.reload();

    const pictureId = findJobItemId((id) => id === 'picture_hang' || id.includes('picture'));
    const pictureItem = excelSource.jobItems.get(pictureId);
    if (!pictureItem) throw new Error(`Missing job item ${pictureId}`);

    const baseMinutes = Number(pictureItem.default_time_weight_minutes || 25);
    const mockVisit = {
        item_class: 'STANDARD',
        primary_job_item_id: pictureId,
        addon_job_item_ids: [],
        required_capability_tags_union: [pictureItem.capability_tag || 'HANDYMAN'],
        base_minutes: baseMinutes,
    };

    const qty1 = computeScopePricing(mockVisit, { ITEM_COUNT: '1' });
    const qty9 = computeScopePricing(mockVisit, { ITEM_COUNT: '9' });

    if (qty1.status !== 'OK' || qty9.status !== 'OK') {
        throw new Error(`Expected OK status — qty1=${qty1.status}, qty9=${qty9.status}`);
    }

    if (qty9.effectiveMinutes !== baseMinutes * 9) {
        throw new Error(`Expected ${baseMinutes * 9} min at qty 9 — got ${qty9.effectiveMinutes}`);
    }

    if (qty9.finalPrice <= qty1.finalPrice) {
        throw new Error(
            `Qty 9 price must exceed qty 1 — got £${qty9.finalPrice} vs £${qty1.finalPrice}`,
        );
    }

    if (qty9.finalTier === qty1.finalTier && qty9.effectiveMinutes > baseMinutes * 2) {
        throw new Error(
            `Tier should escalate with minutes — qty1=${qty1.finalTier}/£${qty1.finalPrice}, qty9=${qty9.finalTier}/£${qty9.finalPrice}`,
        );
    }

    console.log('[Scope qty pricing]', {
        pictureId,
        baseMinutes,
        qty1: { minutes: qty1.effectiveMinutes, tier: qty1.finalTier, price: qty1.finalPrice },
        qty9: { minutes: qty9.effectiveMinutes, tier: qty9.finalTier, price: qty9.finalPrice },
    });
    console.log('Scope-lock quantity pricing: OK');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

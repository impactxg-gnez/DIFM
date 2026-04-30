/**
 * Validates MATRIX V2 routing against required acceptance scenarios.
 * Run from repo root: npm run validate:v2
 */

import { excelSource } from '@/lib/pricing/excelLoader';
import { calculateV1Pricing } from '@/lib/pricing/v1Pricing';

async function assertFixed(description: string) {
    const p = await calculateV1Pricing(description);
    if (p.routing !== 'FIXED_PRICE') {
        throw new Error(`Expected FIXED for "${description}" — got ${p.routing}, warnings=${(p.warnings || []).join(',')}`);
    }
}

async function assertReview(description: string) {
    const p = await calculateV1Pricing(description);
    if (p.routing !== 'REVIEW_QUOTE') {
        throw new Error(`Expected REVIEW_QUOTE for "${description}" — got ${p.routing}, warnings=${(p.warnings || []).join(',')}`);
    }
}

async function assertQuantity(description: string, jobId: string, expectedQty: number) {
    const p = await calculateV1Pricing(description);
    const qb = p.quantitiesByJob?.[jobId];
    if (qb !== expectedQty) {
        throw new Error(`Expected qty ${expectedQty} for ${jobId} on "${description}" — got ${qb}, pipeline=${p.pipeline}`);
    }
}

async function assertClarifierCount(description: string, min: number) {
    const p = await calculateV1Pricing(description);
    const n = p.clarifiers?.length ?? 0;
    if (n < min) {
        throw new Error(`Expected >=${min} clarifiers for "${description}" — got ${n}`);
    }
}

async function main() {
    excelSource.reload();
    if (!excelSource.isMatrixV2()) {
        throw new Error(
            'MATRIX V2 not loaded — place DIFM_PRICING_MATRIX_V2-30042026.xlsx in the project root or check file priority in excelLoader.',
        );
    }

    await assertFixed('mount tv');
    await assertClarifierCount('mount tv', 1);
    await assertFixed('install blinds');
    await assertFixed('clean apartment');
    await assertFixed('clean my apartment');
    await assertQuantity('install 2 blinds', 'blind_install', 2);
    await assertFixed('mount tv and install shelf');
    await assertFixed('install blinds and install curtain rail');
    await assertReview('install 50 desks');
    await assertReview('mount 20 tv');
    await assertReview('clean office');

    console.log('MATRIX V2 validation: all assertions passed.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

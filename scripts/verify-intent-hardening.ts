import { runExtractionPipeline } from '../lib/pricing/extractionEngine';

interface VerificationCase {
    input: string;
    expectedJob: string;
    expectedQuantity?: number;
    expectedTier?: string;
    expectedPrice?: number;
}

const CASES: VerificationCase[] = [
    { input: 'cabinet hang fix', expectedJob: 'handyman_small_repair', expectedQuantity: 1 },
    { input: 'tighten hinge', expectedJob: 'handyman_small_repair', expectedQuantity: 1 },
    { input: 'replace five sockets', expectedJob: 'replace_socket_bulk', expectedQuantity: 5 },
    { input: 'replace 2 sockets', expectedJob: 'replace_socket_multi', expectedQuantity: 2 },
    {
        input: 'mount 55 inch tv',
        expectedJob: 'tv_mount_residential_single',
        expectedQuantity: 1,
        expectedTier: 'H1',
        expectedPrice: 59,
    },
    { input: 'mount 3 tvs on wall', expectedJob: 'tv_mount_multi_room', expectedQuantity: 3 },
    { input: 'hang 2 mirrors', expectedJob: 'mirror_hang_multi', expectedQuantity: 2 },
    { input: 'install 10 shelves', expectedJob: 'shelf_install_bulk', expectedQuantity: 10 },
    { input: 'put up four shelves', expectedJob: 'shelf_install_multi', expectedQuantity: 4 },
    { input: 'put up twenty four shelves', expectedJob: 'shelf_install_bulk', expectedQuantity: 24 },
    { input: 'hang mirror', expectedJob: 'mirror_hang_single', expectedQuantity: 1 },
    { input: 'put up 50shelves', expectedJob: 'shelf_install_bulk', expectedQuantity: 50 },
    { input: 'put up 24hs', expectedJob: 'shelf_install_bulk', expectedQuantity: 24 },
    { input: 'build a chair', expectedJob: 'furniture_assembly', expectedQuantity: 1 },
];

async function verifyMappedCases() {
    for (const testCase of CASES) {
        const result = await runExtractionPipeline(testCase.input);
        const hasJob = result.jobs.includes(testCase.expectedJob);
        const quantity = result.quantities[testCase.expectedJob] || 0;
        const quantityPass = testCase.expectedQuantity === undefined || quantity === testCase.expectedQuantity;
        const tierPass = testCase.expectedTier === undefined || result.tier === testCase.expectedTier;
        const pricePass = testCase.expectedPrice === undefined || result.price === testCase.expectedPrice;
        console.log('[IntentHardeningCase]', {
            input: testCase.input,
            expectedJob: testCase.expectedJob,
            expectedQuantity: testCase.expectedQuantity,
            actualJobs: result.jobs,
            actualQuantity: quantity,
            actualTier: result.tier,
            actualPrice: result.price,
            pass: hasJob && quantityPass && tierPass && pricePass,
        });
        if (!hasJob || !quantityPass || !tierPass || !pricePass) {
            throw new Error(`Failed for "${testCase.input}"`);
        }
    }
}

async function verifyClarifyCase() {
    const result = await runExtractionPipeline('full house handyman');
    const isClarify = result.jobs.length === 0 && !!result.message;
    console.log('[IntentHardeningClarify]', {
        input: 'full house handyman',
        jobs: result.jobs,
        message: result.message,
        pass: isClarify
    });
    if (!isClarify) {
        throw new Error('Expected CLARIFY behavior for vague input');
    }
}

async function verifyQuantityPricingSku() {
    const four = await runExtractionPipeline('put up 4 shelves');
    const j4 = four.jobDetails[0];
    const ok =
        j4?.job === 'shelf_install_multi' &&
        j4?.pricingJobId === 'install_shelves_set' &&
        j4?.ruleJob === 'shelf_install_single';
    console.log('[QuantitySku]', { job: j4?.job, pricingJobId: j4?.pricingJobId, ruleJob: j4?.ruleJob, pass: ok });
    if (!ok) {
        throw new Error('Expected shelf_install_multi + install_shelves_set for four shelves');
    }
    const twentyFour = await runExtractionPipeline('put up 24 shelves');
    const j24 = twentyFour.jobDetails[0];
    const okBulk =
        j24?.job === 'shelf_install_bulk' &&
        j24?.pricingJobId === 'install_shelves_set' &&
        j24?.ruleJob === 'shelf_install_single';
    console.log('[QuantitySkuBulk]', { job: j24?.job, pricingJobId: j24?.pricingJobId, pass: okBulk });
    if (!okBulk) {
        throw new Error('Expected shelf_install_bulk + install_shelves_set for 24 shelves');
    }
    const single = await runExtractionPipeline('install one shelf');
    const j1 = single.jobDetails[0];
    const okSingle = j1?.job === 'shelf_install_single' && j1?.pricingJobId === 'shelf_install_single';
    console.log('[QuantitySkuSingle]', { job: j1?.job, pricingJobId: j1?.pricingJobId, pass: okSingle });
    if (!okSingle) {
        throw new Error('Expected shelf_install_single for single shelf');
    }
}

async function verifyMultiJobCase() {
    const result = await runExtractionPipeline('hang 2 mirrors and a shelf');
    const mirrorOk = result.jobs.includes('mirror_hang_multi') && (result.quantities.mirror_hang_multi || 0) === 2;
    const shelfOk = result.jobs.includes('shelf_install_single') && (result.quantities.shelf_install_single || 0) === 1;
    console.log('[IntentHardeningMultiJob]', {
        input: 'hang 2 mirrors and a shelf',
        jobs: result.jobs,
        quantities: result.quantities,
        pass: mirrorOk && shelfOk
    });
    if (!mirrorOk || !shelfOk) {
        throw new Error('Expected mirror_hang_multi x2 and shelf_install_single x1');
    }
}

async function verifyClarifierGating() {
    const fourShelves = await runExtractionPipeline('put up 4 shelves');
    const tags4 = fourShelves.clarifiers.map((c: { tag: string }) => c.tag);
    if (tags4.includes('SHELF_COUNT')) {
        throw new Error('SHELF_COUNT should not trigger when quantity is explicit (4 shelves)');
    }
    if (!tags4.includes('WALL_TYPE')) {
        throw new Error('WALL_TYPE should still be asked when wall material not in text');
    }
    const vagueShelf = await runExtractionPipeline('put up some shelves');
    const tagsV = vagueShelf.clarifiers.map((c: { tag: string }) => c.tag);
    if (!tagsV.includes('SHELF_COUNT')) {
        throw new Error('SHELF_COUNT should trigger when shelf quantity is missing');
    }
}

async function main() {
    // Keep deterministic behavior while verifying mapping hardening.
    delete process.env.OPENAI_API_KEY;
    await verifyMappedCases();
    await verifyQuantityPricingSku();
    await verifyMultiJobCase();
    await verifyClarifyCase();
    await verifyClarifierGating();
    console.log('SUCCESS: Intent hardening verification checks passed.');
}

main().catch((error) => {
    console.error('Intent hardening verification failed:', error);
    process.exit(1);
});
